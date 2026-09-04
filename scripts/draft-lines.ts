/**
 * Draft the other side's lines before anybody plays, and keep only what the
 * gate lets through.
 *
 *   npm run draft:lines                    # every scriptable beat short of WANT lines
 *   npm run draft:lines -- --scene poodi-piima
 *   npm run draft:lines -- --refresh       # drop unreviewed rows first and draft again
 *
 * ADR-025 amendment 1 (`lib/scenes/scripted.ts`). This is the composer moved
 * to a different moment: the same chain, the same prompt and the same four
 * checks as a live turn, run on a developer's machine, with the survivors
 * written into `lib/scenes/bank.ts` where the pull request is the review. A
 * native speaker's pass, when there is one, edits that file and flips
 * `reviewed`; this script never touches a row somebody has reviewed.
 *
 * WHAT IS REFUSED BEFORE THE GATE IS EVEN ASKED, and each is a way a bad line
 * would otherwise look like a good one:
 *   - a beat that is not scriptable, because its line has to name a value the
 *     card draws per run (`scriptable`);
 *   - a line holding a digit, since a number in a scripted line is a number
 *     nobody was dealt, and the gate cannot vouch for digits either way;
 *   - a line holding a dash or a colon, which is a model narrating or listing
 *     rather than speaking, and which the copy rules forbid on a screen;
 *   - a line that hands over the form the beat is about to ask for. "Kas sa
 *     tahad piima osta?" before a beat that wants `piima` is the answer printed
 *     in the question, which is the fault `npm run audit:questions` hunts on
 *     every card, and a learner who copies it out has retrieved nothing;
 *   - the way out itself, because "I did not catch that" as a scripted line
 *     is the fallback wearing a better chip;
 *   - a duplicate of a line already in the bank for that beat, spelled the
 *     same or the same once lowercased.
 *
 * A run that drafts nothing says which wall it hit rather than reporting a
 * full bank, which is the rule `eval:scene` learned the expensive way.
 */
import { writeFileSync } from "node:fs";
import { runGate, passes } from "../lib/scenes/gate";
import { SCENES, FALLBACK_PHRASE } from "../lib/scenes/catalogue";
import { BANK } from "../lib/scenes/bank";
import { scriptable, type ScriptedLine } from "../lib/scenes/scripted";
import { words } from "../lib/scenes/lexicon";
import { ANSWERED, REFUSALS, answerForms, chain, compose, keylessContext } from "./lib/sceneDraft";

/** How many lines a beat is drafted up to. Three is enough variety for one run, and few enough to read. */
const WANT = 3;
/** How many attempts a beat gets before this gives up on it for today. */
const ATTEMPTS = 8;

const sceneArg = process.argv.indexOf("--scene");
const onlyScene = sceneArg >= 0 ? process.argv[sceneArg + 1] : undefined;
const refresh = process.argv.includes("--refresh");

const OUT = "lib/scenes/bank.ts";

/** A line the gate should not even be asked about. */
function refused(text: string, fallback: string, answers: ReadonlySet<string>): string | null {
  if (/\d/.test(text)) return "digit";
  if (/[\u2013\u2014:;]/.test(text)) return "dash or colon";
  if (words(text).join(" ") === words(fallback).join(" ")) return "the way out";
  if (!/[.?!]$/.test(text.trim())) return "no end";
  if (words(text).some((word) => answers.has(word))) return "gives the answer away";
  return null;
}

async function main() {
  const links = chain();
  if (links.length === 0) {
    console.log("No provider key is set, so nothing can be drafted. Set OPENROUTER_API_KEY or GROQ_API_KEY.");
    process.exit(1);
  }
  const today = new Date().toISOString().slice(0, 10);

  const kept: ScriptedLine[] = refresh ? BANK.filter((row) => row.reviewed) : [...BANK];
  const seen = new Set(kept.map((row) => `${row.scene}|${row.beat}|${row.text.toLowerCase()}`));

  let drafted = 0, asked = 0, withheld = 0, skipped = 0;
  const reasons = new Map<string, number>();
  const note = (why: string) => reasons.set(why, (reasons.get(why) ?? 0) + 1);

  for (const scene of SCENES) {
    if (onlyScene && scene.id !== onlyScene) continue;
    const { lemmas, gate, lexicon } = keylessContext(scene);
    for (const beat of scene.beats) {
      if (!scriptable(scene, beat)) { skipped++; continue; }
      const have = () => kept.filter((row) => row.scene === scene.id && row.beat === beat.id).length;
      // The lemmas the beat asks the learner for, which the line may not say.
      const withhold = beat.needs.flatMap((need) => (need.kind === "case" ? [need.lemma] : []));
      let attempts = 0;
      while (have() < WANT && attempts < ATTEMPTS) {
        attempts++;
        const first = await compose(scene, beat, lemmas, undefined, links, withhold);
        if (!first) break;
        asked++;
        let candidate = first;
        let verdict = runGate(candidate.text, beat, gate);
        if (!passes(verdict) && verdict.unknown.length > 0) {
          // The one retry, with the failing words named. The design's rule, not a kindness.
          const second = await compose(scene, beat, lemmas, verdict.unknown, links, withhold);
          if (second) { asked++; candidate = second; verdict = runGate(candidate.text, beat, gate); }
        }
        if (!passes(verdict)) { withheld++; for (const c of verdict.failed) note(`gate: ${c}`); continue; }
        const why = refused(candidate.text, FALLBACK_PHRASE, answerForms(beat, lexicon));
        if (why) { withheld++; note(why); continue; }
        const key = `${scene.id}|${beat.id}|${candidate.text.toLowerCase()}`;
        if (seen.has(key)) { note("duplicate"); continue; }
        seen.add(key);
        kept.push({
          scene: scene.id, beat: beat.id, text: candidate.text,
          model: candidate.model, draftedAt: today, reviewed: false,
        });
        drafted++;
      }
      console.log(`  ${scene.id}/${beat.id}: ${have()} of ${WANT}${attempts >= ATTEMPTS && have() < WANT ? " (gave up for today)" : ""}`);
    }
  }

  kept.sort((a, b) => a.scene.localeCompare(b.scene) || a.beat.localeCompare(b.beat) || a.text.localeCompare(b.text));
  writeFileSync(OUT, render(kept));

  console.log(`\n${drafted} new line${drafted === 1 ? "" : "s"} kept, ${withheld} withheld, ${asked} asked; ${skipped} beat${skipped === 1 ? "" : "s"} not scriptable. ${kept.length} rows in ${OUT}.`);
  if (reasons.size) console.log("  Why lines were refused: " + [...reasons].map(([w, n]) => `${w} x${n}`).join(", "));
  if (ANSWERED.size) console.log("  Who answered: " + [...ANSWERED].map(([m, n]) => `${m} ${n}`).join(", "));
  if (REFUSALS.size) console.log("  Who would not, and with what status: " + [...REFUSALS].map(([m, n]) => `${m} x${n}`).join(", "));
  if (asked === 0) {
    console.log("\n  NOTHING WAS ASKED, so the bank is exactly what it was. Free models are limited per day; the statuses above say which wall was hit.");
  }
}

/** One row per line, so a diff reads as lines added rather than a file rewritten. */
function render(rows: readonly ScriptedLine[]): string {
  const body = rows.map((row) =>
    `  { scene: ${JSON.stringify(row.scene)}, beat: ${JSON.stringify(row.beat)}, text: ${JSON.stringify(row.text)},`
    + ` model: ${JSON.stringify(row.model)}, draftedAt: ${JSON.stringify(row.draftedAt)}, reviewed: ${row.reviewed} },`,
  ).join("\n");
  return [
    "/* GENERATED by scripts/draft-lines.ts. Do not add a line by hand.",
    "",
    "   Every row was drafted by a model inside its scene's closed word list, passed",
    "   the four checks in lib/scenes/gate.ts on the day named, and was read in the",
    "   pull request that added it. The one field a person edits is `reviewed`,",
    "   which a native speaker sets to true after reading the row, and which the",
    "   chip on screen reads. Regenerate with `npm run draft:lines`; the script",
    "   keeps rows that are already here and only drafts what is missing.",
    "   (lib/scenes/scripted.ts is what reads this; ADR-025 amendment 1.) */",
    'import type { ScriptedLine } from "./scripted";',
    "",
    "export const BANK: readonly ScriptedLine[] = [",
    body,
    "];",
    "",
  ].join("\n");
}

main().catch((error) => { console.error(error); process.exit(1); });
