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
import { caseAnswer, stemsFromParts } from "../lib/estonian/derive";
import { parseGovernment } from "../lib/estonian/government";
import { FREE_GROQ_MODELS, FREE_OPENROUTER_MODELS } from "../lib/tutor/provider";
import { SCENES } from "../lib/scenes/catalogue";
import { buildLexicon, formsOf, words, type DictEntry } from "../lib/scenes/lexicon";
import { MAX_WORDS, isQuestion } from "../lib/scenes/retrieval";
import { QUESTION_SHAPE, type BeatSpec, type SceneSpec } from "../lib/scenes/types";
import { LEVELS, SYLLABUS, unitById } from "../lib/collections/syllabus";
import { shippedDictionary } from "./lib/dictionary";
import type { CaseKey } from "../lib/estonian/types";

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
const ALLOWLIST = process.argv.includes("--allowlist")
  ? process.argv[process.argv.indexOf("--allowlist") + 1] : "units";

const shipped = shippedDictionary();
const pool: DictEntry[] = shipped.map((e) => ({
  lemma: e.lemma, pos: e.pos, cefr: e.cefr, parts: e.parts,
  extraForms: e.extraForms, usages: e.usages,
}));
const byLemma = new Map(pool.map((e) => [`${e.lemma}|${e.pos}`, e]));

/** The lemmas one scene may use: every word of every unit it declares. */
function sceneLemmas(scene: SceneSpec): string[] {
  const out = new Set<string>();
  if (ALLOWLIST === "course") {
    const upTo = LEVELS.indexOf(scene.level);
    for (const unit of SYLLABUS) {
      if (LEVELS.indexOf(unit.level) > upTo) continue;
      for (const spec of unit.words) out.add(spec[0]);
    }
    return [...out];
  }
  for (const id of scene.units) {
    for (const spec of unitById(id)?.words ?? []) out.add(spec[0]);
  }
  return [...out];
}

function sceneLexicon(scene: SceneSpec) {
  const lemmas = new Set(sceneLemmas(scene));
  return buildLexicon(pool.filter((e) => lemmas.has(e.lemma)));
}

/* ------------------------------------------------------------------ *
 * The gate. Four checks, and a line failing any of them is withheld
 * whole rather than shown with a caveat.
 * ------------------------------------------------------------------ */

type Check = "shape" | "vouching" | "register" | "government";

/** The pronoun forms a register forbids. One lookup, per §2 check 3. */
function wrongRegisterForms(scene: SceneSpec): ReadonlySet<string> {
  const forbidden = scene.register === "teie" ? ["sina"] : ["teie"];
  const out = new Set<string>();
  for (const lemma of forbidden) {
    const entry = byLemma.get(`${lemma}|PRONOUN`);
    for (const form of entry ? formsOf(entry) : []) out.add(form);
  }
  return out;
}

/**
 * Which cases a word demands of its complement, by form.
 *
 * `parseGovernment` reads the whole string rather than the primary alone,
 * because a word governs every case its entry names and marking a learner
 * wrong for one of the others is the fault `buildOptions` exists to prevent.
 */
interface Governed {
  readonly lemma: string;
  readonly forms: ReadonlySet<string>;
  readonly cases: ReadonlySet<CaseKey>;
}

const GOVERNED: Governed[] = [];
for (const entry of shipped) {
  const government = parseGovernment(entry.government ?? null);
  if (!government || entry.pos !== "VERB") continue;
  const dict = byLemma.get(`${entry.lemma}|${entry.pos}`);
  if (!dict) continue;
  GOVERNED.push({
    lemma: entry.lemma,
    forms: new Set(formsOf(dict)),
    cases: new Set([government.caseKey, ...government.alsoGoverned]),
  });
}

/** Every case form of every nominal, so a token can be asked which case it is. */
const CASE_OF = new Map<string, Set<CaseKey>>();
for (const entry of shipped) {
  if (entry.pos !== "NOUN" && entry.pos !== "ADJECTIVE" && entry.pos !== "PRONOUN") continue;
  if (!entry.parts.GEN_SG) continue;
  const stems = stemsFromParts(entry.parts);
  for (const spec of CASES) {
    const answer = spec.principal ? null : caseAnswer(stems, spec.key);
    const forms = answer ? answer.accepted : [entry.parts[principalPart(spec.key)] ?? ""];
    for (const form of forms) {
      if (!form) continue;
      const key = form.toLowerCase();
      const seen = CASE_OF.get(key) ?? new Set<CaseKey>();
      seen.add(spec.key);
      CASE_OF.set(key, seen);
    }
  }
}

function principalPart(key: CaseKey): string {
  return key === "NOMINATIVE" ? "NOM_SG" : key === "GENITIVE" ? "GEN_SG" : "PART_SG";
}

/**
 * The government check, as §2 proposes it and as generously as it can be read.
 *
 * There is no parser here, so nothing can say which noun is the verb's
 * complement. The strictest reading, that every noun must be in a governed
 * case, would fire on any sentence with an adjunct in it, which is most of
 * them. So this asks the weakest thing that is still a check: a line holding a
 * governed verb has to hold **at least one** nominal in a case that verb
 * governs. A line with no governed verb and a line with no nominal are both
 * outside what this can say, and it passes them.
 */
function governmentSuspect(tokens: readonly string[]): boolean {
  const lower = tokens.map((t) => t.toLowerCase());
  const verb = GOVERNED.find((g) => lower.some((t) => g.forms.has(t)));
  if (!verb) return false;
  const nominals = lower.filter((t) => CASE_OF.has(t) && !verb.forms.has(t));
  if (nominals.length === 0) return false;
  return !nominals.some((t) => [...(CASE_OF.get(t) ?? [])].some((c) => verb.cases.has(c)));
}

function runGate(
  text: string, beat: BeatSpec, scene: SceneSpec,
  lexicon: { forms: ReadonlySet<string> }, wrongRegister: ReadonlySet<string>,
): { failed: Check[]; unknown: string[] } {
  const failed: Check[] = [];
  const tokens = words(text);

  const shape = QUESTION_SHAPE[beat.move];
  const sentences = text.trim().split(/[.!?]+\s+/).filter(Boolean).length;
  const punctuated = /[.!?]"?$/.test(text.trim());
  const markdown = /[*_`#[\]]/.test(text);
  if (
    sentences !== 1 || !punctuated || markdown ||
    tokens.length > MAX_WORDS || tokens.length === 0 ||
    (shape === "required" && !isQuestion(text)) ||
    (shape === "forbidden" && isQuestion(text))
  ) failed.push("shape");

  const unknown = tokens.filter((t) => !lexicon.forms.has(t.toLowerCase()));
  if (unknown.length > 0) failed.push("vouching");

  if (tokens.some((t) => wrongRegister.has(t.toLowerCase()))) failed.push("register");
  if (governmentSuspect(tokens)) failed.push("government");

  void scene;
  return { failed, unknown };
}

/* ------------------------------------------------------------------ *
 * Part A: the rejection rate, against the chain a deployment gets.
 * ------------------------------------------------------------------ */

/**
 * The chain, the way `resolveProviders` builds it: every free model of every
 * provider whose key is set, in order.
 *
 * A single model is what this asked first and it measured a rate limit rather
 * than a gate. Free models are limited hard and per day, so on any afternoon
 * one of them is closed, and a run that could not compose a line reported
 * `0/0 withheld (0%)`, which reads as a perfect score. That is the shape this
 * repository has a rule about: a failure may not misname its cause.
 */
interface Link { label: string; model: string; url: string; key: string }
const CHAIN: Link[] = [];
{
  const or = process.env.OPENROUTER_API_KEY;
  if (or) {
    const pinned = (process.env.OPENROUTER_MODEL ?? "").split(",").map((m) => m.trim()).filter(Boolean);
    for (const model of pinned.length ? pinned : FREE_OPENROUTER_MODELS) {
      CHAIN.push({ label: "OpenRouter", model, url: "https://openrouter.ai/api/v1/chat/completions", key: or });
    }
  }
  const groq = process.env.GROQ_API_KEY;
  if (groq) {
    const pinned = (process.env.GROQ_MODEL ?? "").split(",").map((m) => m.trim()).filter(Boolean);
    for (const model of pinned.length ? pinned : FREE_GROQ_MODELS) {
      CHAIN.push({ label: "Groq", model, url: "https://api.groq.com/openai/v1/chat/completions", key: groq });
    }
  }
}
/** Why a line could not be composed, by status, so a thin run says so. */
const REFUSALS = new Map<string, number>();
const ANSWERED = new Map<string, number>();

const SYSTEM = [
  "You are one side of a short conversation in Estonian, in a role-play for a language learner.",
  "Write exactly ONE Estonian sentence: the line this character says next. Nothing else.",
  "Use ONLY words from the list you are given. Any form of a listed word is allowed.",
  "No English, no markdown, no quotation marks, no explanation.",
].join(" ");

async function compose(scene: SceneSpec, beat: BeatSpec, lemmas: string[]): Promise<string | null> {
  const user = [
    `You are the ${scene.place}. The learner is a member of the public and you address them as "${scene.register}".`,
    `Your move now: ${beat.move}. In English, what you are doing is: ${beat.goal}`,
    `The line must be about: ${beat.topic.join(", ")}`,
    QUESTION_SHAPE[beat.move] === "required" ? "It must be a question." : "",
    QUESTION_SHAPE[beat.move] === "forbidden" ? "It must not be a question." : "",
    `At most ${MAX_WORDS} words. Words you may use:`,
    lemmas.join(", "),
  ].filter(Boolean).join("\n");

  for (const link of CHAIN) {
    let status = 0;
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(link.url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${link.key}` },
        body: JSON.stringify({
          model: link.model, temperature: 0.8, max_tokens: 60,
          messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }],
        }),
      });
      status = res.status;
      if (res.status === 429 && attempt === 0) { await new Promise((r) => setTimeout(r, 1500)); continue; }
      if (!res.ok) break;
      const data = await res.json() as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) break;
      ANSWERED.set(link.model, (ANSWERED.get(link.model) ?? 0) + 1);
      return text.replace(/^["'«]|["'»]$/g, "");
    }
    const why = `${link.model} ${status}`;
    REFUSALS.set(why, (REFUSALS.get(why) ?? 0) + 1);
  }
  return null;
}

async function partA() {
  console.log("\n=== Part A: the gate, against a real model ===\n");
  if (CHAIN.length === 0) {
    console.log("  No provider key is set, so no line can be composed and no rate measured.");
    console.log("  Set OPENROUTER_API_KEY or GROQ_API_KEY. Part B below needs no key and runs anyway.");
    return;
  }
  console.log(`  ${LINES} lines per beat, vouching against the ${ALLOWLIST === "course" ? "whole course to the scene\u2019s level" : "scene\u2019s own units"}, over ${CHAIN.length} free models: ${CHAIN.map((l) => l.model).join(", ")}\n`);

  const tally = new Map<Check, number>();
  let asked = 0, refused = 0, withheld = 0;
  const examples: string[] = [];

  for (const scene of SCENES) {
    if (onlyScene && scene.id !== onlyScene) continue;
    const lexicon = sceneLexicon(scene);
    const lemmas = sceneLemmas(scene);
    const wrongRegister = wrongRegisterForms(scene);
    let sceneAsked = 0, sceneWithheld = 0;

    for (const beat of scene.beats) {
      for (let i = 0; i < LINES; i++) {
        const line = await compose(scene, beat, lemmas);
        if (!line) { refused++; continue; }
        asked++; sceneAsked++;
        const { failed, unknown } = runGate(line, beat, scene, lexicon, wrongRegister);
        if (failed.length === 0) continue;
        withheld++; sceneWithheld++;
        for (const check of failed) tally.set(check, (tally.get(check) ?? 0) + 1);
        if (examples.length < 12) {
          const why = failed.join(", ") + (unknown.length ? ` [${unknown.slice(0, 4).join(" ")}]` : "");
          examples.push(`    ${scene.id}/${beat.id}: ${line}\n      withheld: ${why}`);
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
    console.log(`  Gate rejection rate: ${rate.toFixed(1)}%.`);
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
        const other = caseAnswer(stemsFromParts(owner.parts), wrong.key);
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
  const flaggedGood = good.filter((l) => governmentSuspect(words(l))).length;
  const flaggedBad = bad.filter((l) => governmentSuspect(words(l))).length;

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
