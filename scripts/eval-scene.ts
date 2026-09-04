/**
 * The second half of Phase 0: is a composed line safe to show?
 *
 *   npm run eval:scene                  # both halves
 *   npm run eval:scene -- --lines 5     # more samples per beat
 *   npm run eval:scene -- --scene arsti-aeg
 *
 * `measure:scenes` answered the first half and the answer decided the shape of
 * the module: retrieval fills the moves every conversation shares and fills the
 * content beats at zero, because a lexicographer records a sentence to
 * illustrate a word rather than to ask a question about it. So the composer is
 * load-bearing rather than a fallback, and everything now rests on the gate.
 *
 * §6 of the design sets the number this has to produce and the line it has to
 * clear: "above one line in twenty withheld, either the word list is too small
 * or the model is the wrong one for this, and the answer is not to loosen the
 * gate." That is a decision somebody makes before Phase 1 is built, not a
 * dashboard watched afterwards.
 *
 * TWO HALVES, AND ONLY ONE OF THEM NEEDS A KEY.
 *
 * The gate rejection rate needs a real model saying real things, so it needs a
 * provider. The government check does not: §2 proposes it and marks it
 * "unmeasured", and the labelled set it wants can be built out of the shipped
 * dictionary alone, because Ekilex recorded both the government and the
 * sentences. So this runs its second half on any machine and says what it could
 * not do rather than refusing to start.
 *
 * IT TALKS TO OPENROUTER DIRECTLY, like `scripts/eval-anu.mjs` beside it, and
 * it does not go through `lib/usage/ledger.ts`. That is not the rule being
 * bent: the ledger rations one learner's share of a deployment's budget, and
 * nobody's allowance is involved when a developer runs a measurement against
 * their own key. It imports the model chain rather than naming one, for the
 * reason `PROVIDER_KEY_ENV` is imported and not retyped: a list that lives in
 * a script measures the script.
 */
import { CASES } from "../lib/estonian/cases";
import { caseAnswer, stemsFrom } from "../lib/estonian/derive";
import { parseGovernment } from "../lib/estonian/government";
import type { CaseKey } from "../lib/estonian/types";
import { SCENES } from "../lib/scenes/catalogue";
import { formsOf, words, type Lexicon } from "../lib/scenes/lexicon";
import { governmentSuspect, runGate, type Check } from "../lib/scenes/gate";
import { SYLLABUS } from "../lib/collections/syllabus";
import {
  ANSWERED, CASE_OF, POOL, REFUSALS, SHIPPED, chain, compose, gateContext, sceneLemmas, sceneLexicon,
  wrongRegisterForms, type Allowlist,
} from "./lib/sceneDraft";

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
};
const LINES = arg("lines", 3);
const sceneArg = process.argv.indexOf("--scene");
const onlyScene = sceneArg >= 0 ? process.argv[sceneArg + 1] : undefined;
/*
  What the gate vouches against.

  `units` is the design's own answer, the lemmas of the units a scene declares,
  and `course` is every word the syllabus teaches up to the scene's level. The
  argument for the narrow one is that it is what makes the model choose inside a
  box rather than reach for any Estonian word there is. The argument for
  measuring the wide one is that a box can be too small, and §6 names that as
  the first thing to suspect when the rejection rate is high.
*/
const ALLOWLIST: Allowlist = process.argv.includes("--allowlist")
  ? (process.argv[process.argv.indexOf("--allowlist") + 1] as Allowlist) : "units";

/*
  The chain, the prompt, the context builders and the composer live in
  `scripts/lib/sceneDraft.ts` now, shared with `draft-lines.ts`: a rejection
  rate measured with one prompt and a bank drafted with another would be a
  rate for nothing. The checks themselves are still `lib/scenes/gate.ts`'s,
  imported and never copied.
*/
const shipped = SHIPPED;
const pool = POOL;
const CHAIN = chain();

/** The one government check, so Part B measures what a learner would meet. */
function suspect(tokens: readonly string[]): boolean {
  return governmentSuspect(tokens, gateContext(EMPTY_LEXICON, new Set()));
}

const EMPTY_LEXICON: Lexicon = { forms: new Set(), byLemma: new Map(), byCase: new Map() };

async function partA() {
  console.log("\n=== Part A: the gate, against a real model ===\n");
  if (CHAIN.length === 0) {
    console.log("  No provider key is set, so no line can be composed and no rate measured.");
    console.log("  Set OPENROUTER_API_KEY or GROQ_API_KEY. Part B below needs no key and runs anyway.");
    return;
  }
  console.log(`  ${LINES} lines per beat, vouching against the ${ALLOWLIST === "course" ? "whole course to the scene\u2019s level" : "scene\u2019s own units"}, over ${CHAIN.length} free models: ${CHAIN.map((l) => l.model).join(", ")}\n`);

  const tally = new Map<Check, number>();
  let asked = 0, refused = 0, withheld = 0, firstPass = 0, rescued = 0;
  const examples: string[] = [];
  /*
    The words the model reached for that the scene could not vouch for, ranked.

    The rate says the gate is withholding most of what it is handed; this says
    what for, and it is the same instrument `measure:scenes` used to find the
    missing connectives unit. A word here is one of two things: a word the
    course teaches that this scene did not declare the unit for, which is a
    scene fixing itself, or a word the course does not teach at all, which is a
    gap in the syllabus that no gate can close.
  */
  const reached = new Map<string, number>();

  for (const scene of SCENES) {
    if (onlyScene && scene.id !== onlyScene) continue;
    const lexicon = sceneLexicon(scene, ALLOWLIST);
    const lemmas = sceneLemmas(scene, ALLOWLIST);
    const wrongRegister = wrongRegisterForms(scene);
    let sceneAsked = 0, sceneWithheld = 0;

    for (const beat of scene.beats) {
      for (let i = 0; i < LINES; i++) {
        const line = (await compose(scene, beat, lemmas))?.text;
        if (!line) { refused++; continue; }
        asked++; sceneAsked++;
        const gate = gateContext(lexicon, wrongRegister);
        const first = runGate(line, beat, gate);
        for (const word of first.unknown) reached.set(word, (reached.get(word) ?? 0) + 1);
        if (first.failed.length === 0) { firstPass++; continue; }

        // The one retry, with the words that failed named. §6.
        const second = (await compose(scene, beat, lemmas, first.unknown))?.text;
        const after = second ? runGate(second, beat, gate) : null;
        if (after && after.failed.length === 0) { rescued++; continue; }

        withheld++; sceneWithheld++;
        const shown = second ?? line;
        const why = after ?? first;
        for (const check of why.failed) tally.set(check, (tally.get(check) ?? 0) + 1);
        if (examples.length < 12) {
          const reason = why.failed.join(", ")
            + (why.unknown.length ? ` [${why.unknown.slice(0, 4).join(" ")}]` : "");
          examples.push(`    ${scene.id}/${beat.id}: ${shown}\n      withheld after a retry: ${reason}`);
        }
      }
    }
    const pct = sceneAsked ? Math.round((sceneWithheld / sceneAsked) * 100) : 0;
    console.log(`  ${scene.id.padEnd(14)} ${sceneWithheld}/${sceneAsked} withheld (${pct}%), ${lemmas.length} lemmas in its list`);
  }

  console.log(`\n  ${withheld} of ${asked} lines withheld${refused ? `, and ${refused} nobody in the chain would compose` : ""}.`);
  if (ANSWERED.size > 0) {
    console.log("  Who answered: " + [...ANSWERED].map(([m, n]) => `${m} ${n}`).join(", "));
  }
  if (REFUSALS.size > 0) {
    console.log("  Who would not, and with what status: " + [...REFUSALS].map(([m, n]) => `${m} x${n}`).join(", "));
  }
  /*
    A run that composed nothing measured a rate limit, not a gate, and saying
    "0 of 0 withheld (0%)" about it would be the clean-looking failure this
    script exists to avoid.
  */
  if (asked === 0) {
    console.log("\n  NOTHING WAS COMPOSED, so this says nothing about the gate. Free models are");
    console.log("  limited per day and per model; the statuses above say which wall was hit.");
    return;
  }
  if (asked > 0) {
    const rate = (withheld / asked) * 100;
    const firstRate = ((asked - firstPass) / asked) * 100;
    console.log(`  First attempt withheld: ${firstRate.toFixed(1)}%. The retry rescued ${rescued}.`);
    console.log(`  Gate rejection rate, which is what a learner never sees: ${rate.toFixed(1)}%.`);
    console.log(`  The design's line is 5%: above one in twenty, the word list is too small or the`);
    console.log(`  model is the wrong one, and the answer is not to loosen the gate.`);
    console.log(`  ${rate <= 5 ? "AT OR UNDER" : "OVER"} the line on this run.`);
  }
  console.log("\n  Which check withheld a line (a line can fail more than one):");
  for (const check of ["shape", "vouching", "register", "government"] as Check[]) {
    console.log(`    ${check.padEnd(12)} ${tally.get(check) ?? 0}`);
  }
  if (examples.length) {
    console.log("\n  What a withheld line looks like:");
    console.log(examples.join("\n"));
  }

  if (reached.size > 0) {
    const ranked = [...reached].sort((a, b) => b[1] - a[1]).slice(0, 30);
    /*
      Every FORM the course can vouch for, not every lemma it names. The first
      version compared an inflected word against the lemma list and starred
      `arsti`, `korteris` and `olen` as words the course does not teach, which
      are the genitive of `arst`, the inessive of `korter` and the first person
      of `olema`. A star has to mean what it says or the list is worse than no
      list, because it is the half that says whose job the gap is.
    */
    const inCourse = new Set<string>();
    const taught = new Set<string>();
    for (const unit of SYLLABUS) for (const spec of unit.words) taught.add(spec[0]);
    for (const entry of pool) {
      if (!taught.has(entry.lemma)) continue;
      for (const form of formsOf(entry)) inCourse.add(form);
    }
    console.log("\n  Words the model reached for that the scene could not vouch for.");
    console.log("  A star means the course does not teach the word at all, at any level, so no");
    console.log("  scene could declare a unit for it and the gap is in the syllabus.");
    console.log("    " + ranked.map(([w, n]) => `${inCourse.has(w) ? "" : "*"}${w} ${n}`).join("  "));
  }
}

/* ------------------------------------------------------------------ *
 * Part B: does the government check reject more real errors than good
 * lines? §2 proposes it and says it ships only if this says yes.
 * ------------------------------------------------------------------ */

/**
 * A labelled set built out of what Ekilex already recorded.
 *
 * The good lines are attested usages of a governed verb: real Estonian nobody
 * here wrote. The bad ones are the same sentence with one nominal moved into a
 * case the verb does not govern, which is a derivation over a stored stem and
 * exactly the error a composed line would make. Nothing is invented and
 * nothing is shown to anybody: this is a measurement input, and the corrupted
 * line exists for the length of a comparison.
 */
function labelledSet(): { good: string[]; bad: string[] } {
  const good: string[] = [];
  const bad: string[] = [];

  for (const entry of shipped) {
    if (entry.pos !== "VERB" || entry.usages.length === 0) continue;
    const government = parseGovernment(entry.government ?? null);
    if (!government) continue;
    const governs = new Set<CaseKey>([government.caseKey, ...government.alsoGoverned]);
    const wrong = CASES.find((c) => !c.principal && !governs.has(c.key));
    if (!wrong) continue;

    for (const usage of entry.usages) {
      const tokens = words(usage);
      // A nominal in the sentence that is in a case this verb governs: the
      // complement, as near as anything without a parser can name it.
      let swapped: { from: string; to: string } | null = null;
      for (const token of tokens) {
        const cases = CASE_OF.get(token.toLowerCase());
        if (!cases || ![...cases].some((c) => governs.has(c))) continue;
        const owner = shipped.find(
          (e) => e.parts.GEN_SG && (e.pos === "NOUN" || e.pos === "PRONOUN")
            && formsOf({ lemma: e.lemma, pos: e.pos, cefr: e.cefr, parts: e.parts, extraForms: e.extraForms, usages: [] })
              .includes(token.toLowerCase()),
        );
        if (!owner) continue;
        /*
          `stemsFrom` with the attested rows rather than the parts alone, for
          the reason the case index above gives: the corrupted line should carry
          the spelling a lexicographer recorded for the wrong case, not the
          rule's answer where the two differ.
        */
        const other = caseAnswer(stemsFrom([
          ...Object.entries(owner.parts).map(([formType, value]) => ({ formType, value })),
          ...(owner.extraForms ?? []).map((f) => ({ formType: `EKILEX:${f.code}`, value: f.value })),
        ]), wrong.key);
        if (!other || other.value.toLowerCase() === token.toLowerCase()) continue;
        swapped = { from: token, to: other.value };
        break;
      }
      if (!swapped) continue;
      good.push(usage);
      bad.push(usage.replace(swapped.from, swapped.to));
    }
  }
  return { good, bad };
}

function partB() {
  console.log("\n=== Part B: the government check, on a set built from attested lines ===\n");
  const { good, bad } = labelledSet();
  if (good.length === 0) {
    console.log("  No labelled pair could be built, so this says nothing.");
    return;
  }
  const flaggedGood = good.filter((l) => suspect(words(l))).length;
  const flaggedBad = bad.filter((l) => suspect(words(l))).length;

  console.log(`  ${good.length} attested lines of a governed verb, and the same ${bad.length} with one`);
  console.log("  nominal moved into a case the verb does not govern.\n");
  console.log(`    withheld, and should not have been:  ${flaggedGood}  (${((flaggedGood / good.length) * 100).toFixed(1)}% of good lines)`);
  console.log(`    withheld, and should have been:      ${flaggedBad}  (${((flaggedBad / bad.length) * 100).toFixed(1)}% of real errors)`);
  console.log("\n  §2: this check ships only if it rejects more real errors than good lines,");
  console.log("  because a check that fires on honest output is a check somebody waives.");
  console.log(`  On this set it ${flaggedBad > flaggedGood ? "DOES" : "DOES NOT"}.`);
  const net = flaggedBad - flaggedGood;
  console.log(`  Net: ${net >= 0 ? "+" : ""}${net} lines.`);
}

async function main() {
  await partA();
  partB();
  console.log("");
}

main();
