/**
 * What a script needs to ask a model for a scene line and judge it, keyless
 * context included, shared between the measurement and the drafting.
 *
 * `scripts/eval-scene.ts` built all of this inline to measure the gate, and
 * `scripts/draft-lines.ts` needs exactly the same chain, the same prompt and
 * the same context to draft lines the gate will then judge. Two copies of the
 * prompt are two prompts the day one is edited, and a rejection rate measured
 * on one and a bank drafted with the other would be a rate for nothing. So it
 * lives here once.
 *
 * THIS TALKS TO A PROVIDER DIRECTLY, like `scripts/eval-anu.mjs`, and goes
 * nowhere near `lib/usage/ledger.ts`: the ledger rations one learner's share
 * of a deployment's budget, and nobody's allowance is involved when a
 * developer runs a script against their own key. It imports the model chain
 * rather than naming one, for the reason `PROVIDER_KEY_ENV` is imported and
 * not retyped.
 *
 * THE CONTEXT IS BUILT FROM THE SHIPPED DICTIONARY, not a database, so both
 * scripts and the bank's own test run on any checkout. Everything below is the
 * *context* the shipped checks need; the checks themselves are the ones in
 * `lib/scenes/gate.ts`, imported and never copied.
 *
 * Nothing here runs at import time: the chain reads the environment when
 * asked, so a test may import the context builders without a key in sight.
 */
import { buildCaseTable, stemsFrom } from "../../lib/estonian/derive";
import { derivedVerbForms } from "../../lib/estonian/conjugate";
import { parseGovernment } from "../../lib/estonian/government";
import type { CaseKey } from "../../lib/estonian/types";
import { FREE_GROQ_MODELS, FREE_OPENROUTER_MODELS } from "../../lib/tutor/provider";
import { buildLexicon, caseKeyFor, formsOf, words, type DictEntry, type Lexicon } from "../../lib/scenes/lexicon";
import type { GateContext, GovernedWord } from "../../lib/scenes/gate";
import { MAX_WORDS } from "../../lib/scenes/retrieval";
import { QUESTION_SHAPE, type BeatSpec, type SceneSpec } from "../../lib/scenes/types";
import { LEVELS, SYLLABUS, unitById } from "../../lib/collections/syllabus";
import { shippedDictionary } from "./dictionary";

/* ------------------------------------------------------------------ *
 * The dictionary, read once.
 * ------------------------------------------------------------------ */

/** The shipped dictionary, read once, in the seed's own shape. */
export const SHIPPED = shippedDictionary();
const shipped = SHIPPED;

/** Every shipped entry in the shape the scene modules read. */
export const POOL: DictEntry[] = shipped.map((e) => ({
  lemma: e.lemma, pos: e.pos, cefr: e.cefr, parts: e.parts,
  extraForms: e.extraForms, usages: e.usages,
}));

const byLemma = new Map(POOL.map((e) => [`${e.lemma}|${e.pos}`, e]));

export type Allowlist = "units" | "course";

/**
 * The lemmas one scene may use.
 *
 * `units` is the design's own answer, the lemmas of the units a scene
 * declares; `course` is every word the syllabus teaches up to the scene's
 * level, which the eval measures to find out whether the box is too small.
 */
export function sceneLemmas(scene: SceneSpec, allowlist: Allowlist = "units"): string[] {
  const out = new Set<string>();
  if (allowlist === "course") {
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

export function sceneLexicon(scene: SceneSpec, allowlist: Allowlist = "units"): Lexicon {
  const lemmas = new Set(sceneLemmas(scene, allowlist));
  return buildLexicon(POOL.filter((e) => lemmas.has(e.lemma)));
}

/** The pronoun forms a register forbids. One lookup, per the gate's third check. */
export function wrongRegisterForms(scene: SceneSpec): ReadonlySet<string> {
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
export const GOVERNED: GovernedWord[] = [];
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

/**
 * Ekilex's own name for a case, in either number.
 *
 * `MORPH_TO_CASE` in `lib/estonian/derive.ts` is deliberately singular only,
 * because what it feeds is a singular table. This asks whether a token is in
 * a case a verb governs, and a case is a case whether the word is singular or
 * plural: `Ma andestan teile` and `Ma andestan talle` are one government.
 */
const CASE_BY_CODE: Record<string, CaseKey | undefined> = {
  N: "NOMINATIVE", G: "GENITIVE", P: "PARTITIVE", Ill: "ILLATIVE", In: "INESSIVE",
  El: "ELATIVE", All: "ALLATIVE", Ad: "ADESSIVE", Abl: "ABLATIVE", Tr: "TRANSLATIVE",
  Ter: "TERMINATIVE", Es: "ESSIVE", Ab: "ABESSIVE", Kom: "COMITATIVE",
};

/**
 * Every case form of every nominal, so a token can be asked which case it is.
 *
 * Two sources, because a pronoun is stored with no principal parts and
 * seventeen plural forms: a table built off a genitive stem knows nothing
 * about `teile` and `teil`, which are the commonest case forms in any
 * conversation held in `teie`.
 */
export const CASE_OF = new Map<string, Set<CaseKey>>();
for (const entry of shipped) {
  if (entry.pos !== "NOUN" && entry.pos !== "ADJECTIVE" && entry.pos !== "PRONOUN") continue;
  const note = (form: string | null | undefined, key: CaseKey) => {
    if (!form) return;
    const lower = form.toLowerCase();
    const seen = CASE_OF.get(lower) ?? new Set<CaseKey>();
    seen.add(key);
    CASE_OF.set(lower, seen);
  };

  const extra = entry.extraForms ?? [];
  for (const form of extra) {
    const key = CASE_BY_CODE[form.code.replace(/^(Sg|Pl)/, "")];
    if (key) note(form.value, key);
  }
  if (!entry.parts.GEN_SG) continue;

  const rows = [
    ...Object.entries(entry.parts).map(([formType, value]) => ({ formType, value })),
    ...extra.map((f) => ({ formType: `EKILEX:${f.code}`, value: f.value })),
  ];
  for (const row of buildCaseTable(stemsFrom(rows))) {
    for (const form of [row.singular, row.plural, row.alsoRight, ...row.accepted]) {
      note(form, row.spec.key);
    }
  }
}

/**
 * Every finite form of every verb in the shipped dictionary.
 *
 * What the drafter needs it for is the fault the gate cannot see and the
 * first full run produced four times: a `ma`-infinitive standing where a
 * finite verb belongs, "Kus pood praegu olema?" for "kus pood praegu on".
 * Every word is on the list, no government is broken and it is one sentence
 * long, so all four checks pass, and it is not a sentence anybody says. The
 * retrieval rung already refuses a recorded usage with no finite verb in it
 * (`fits`, "not-spoken"); a drafted line is held to the same floor.
 *
 * A form is finite when it is a stored person (`PRES_1SG`, `PAST_1SG`) or an
 * Ekilex form in a mood: indicative, conditional, imperative or quotative.
 * The two infinitives, the participles and the supine are not.
 */
export const FINITE_VERB_FORMS: ReadonlySet<string> = new Set<string>();
for (const entry of shipped) {
  if (entry.pos !== "VERB") continue;
  const finite = FINITE_VERB_FORMS as Set<string>;
  for (const [type, value] of Object.entries(entry.parts)) {
    if (type === "PRES_1SG" || type === "PAST_1SG") finite.add(value.toLowerCase());
  }
  for (const form of entry.extraForms) {
    if (/^(Ind|Knd|Imp|Kvt)/.test(form.code)) finite.add(form.value.toLowerCase());
  }
  // The persons the dictionary derives rather than stores, off the same rule
  // the scene context and the search use: `kestab` is nowhere in `kestma`'s
  // stored forms and is the third person of it.
  for (const derived of derivedVerbForms({ lemma: entry.lemma, pres1sg: entry.parts.PRES_1SG })) {
    finite.add(derived.value.toLowerCase());
  }
}

/**
 * Whether a drafted line is missing the finite verb it should have.
 *
 * Two exemptions, and each is a kind of line people say. A greeting or a
 * farewell is a phrase and has no verb: "Head aega ja aitäh teile!" was the
 * first row the plain rule struck, and it is a good line. And a short
 * elliptical question is a question anybody asks, "Millisest päevast
 * alates?", "Neljapäev?"; the turn marker makes the same allowance for the
 * learner. So the greet and close moves are exempt, and below four words
 * nothing is asked. Four is where "Kus pood praegu olema?" sits, which is the
 * line this exists for.
 */
export const FINITE_VERB_FLOOR = 4;
export function lacksFiniteVerb(text: string, beat: BeatSpec): boolean {
  if (beat.move === "greet" || beat.move === "close") return false;
  const tokens = words(text);
  if (tokens.length < FINITE_VERB_FLOOR) return false;
  return !tokens.some((word) => FINITE_VERB_FORMS.has(word));
}

/** The gate's context for one scene, built from the shipped dictionary rather than a database. */
export function gateContext(lexicon: Lexicon, wrongRegister: ReadonlySet<string>): GateContext {
  return { lexicon, wrongRegister, governed: GOVERNED, caseOf: CASE_OF };
}

/**
 * Every spelling the beat will accept as its answer, where it asks for a form.
 *
 * What a drafted line may not contain: "Kas sa tahad piima osta?" before a
 * beat that wants `piima` is the answer printed in the question, which is the
 * fault `npm run audit:questions` hunts on every card, and a learner who
 * copies it out has retrieved nothing. Here rather than in the drafter so the
 * bank's own test can ask the same question without importing a script that
 * runs on import.
 */
export function answerForms(beat: BeatSpec, lexicon: Lexicon): ReadonlySet<string> {
  const out = new Set<string>();
  for (const need of beat.needs) {
    if (need.kind !== "case") continue;
    for (const form of lexicon.byCase.get(caseKeyFor(need.lemma, need.grammCase)) ?? []) out.add(form);
  }
  return out;
}

/** Everything the gate needs for one scene, in one call. */
export function keylessContext(scene: SceneSpec, allowlist: Allowlist = "units") {
  const lexicon = sceneLexicon(scene, allowlist);
  const lemmas = sceneLemmas(scene, allowlist);
  return { lexicon, lemmas, gate: gateContext(lexicon, wrongRegisterForms(scene)) };
}

/* ------------------------------------------------------------------ *
 * The chain, the way `resolveProviders` builds it: every free model of
 * every provider whose key is set, in order.
 * ------------------------------------------------------------------ */

export interface Link { label: string; model: string; url: string; key: string }

/**
 * Read when asked, never at import.
 *
 * A single model is what the eval asked first and it measured a rate limit
 * rather than a gate: free models are limited hard and per day, so on any
 * afternoon one of them is closed, and a run that could not compose a line
 * reported a perfect score.
 */
export function chain(): Link[] {
  const links: Link[] = [];
  const or = process.env.OPENROUTER_API_KEY;
  if (or) {
    const pinned = (process.env.OPENROUTER_MODEL ?? "").split(",").map((m) => m.trim()).filter(Boolean);
    for (const model of pinned.length ? pinned : FREE_OPENROUTER_MODELS) {
      links.push({ label: "OpenRouter", model, url: "https://openrouter.ai/api/v1/chat/completions", key: or });
    }
  }
  const groq = process.env.GROQ_API_KEY;
  if (groq) {
    const pinned = (process.env.GROQ_MODEL ?? "").split(",").map((m) => m.trim()).filter(Boolean);
    for (const model of pinned.length ? pinned : FREE_GROQ_MODELS) {
      links.push({ label: "Groq", model, url: "https://api.groq.com/openai/v1/chat/completions", key: groq });
    }
  }
  return links;
}

/** Why a line could not be composed, by status, so a thin run says so. */
export const REFUSALS = new Map<string, number>();
export const ANSWERED = new Map<string, number>();

export const SYSTEM = [
  "You are one side of a short conversation in Estonian, in a role-play for a language learner.",
  "Write exactly ONE Estonian sentence: the line this character says next. Nothing else.",
  "Use ONLY words from the list you are given. Any form of a listed word is allowed.",
  "No English, no markdown, no quotation marks, no explanation.",
].join(" ");

export interface Composed { text: string; model: string }

/**
 * Asks the chain for one line, inside the list, and says which model answered.
 *
 * The one retry the design allows is the caller's, with the failing words
 * named through `retryOver`; it is part of the design rather than a kindness
 * to the model, since what the learner never sees is a line the retry did not
 * rescue.
 */
export async function compose(
  scene: SceneSpec, beat: BeatSpec, lemmas: readonly string[], retryOver?: readonly string[],
  links: readonly Link[] = chain(),
  /**
   * Words the line may not say in any form, because the learner has to be the
   * one to say them. A beat that asks for `piima` and a prompt saying the line
   * "must be about piim" produced `piima` every time, and the drafter's
   * giveaway rule refused every one: the rule was right and the prompt was
   * fighting it. Empty for the eval, which measures the gate and not this.
   */
  withhold: readonly string[] = [],
): Promise<Composed | null> {
  const user = [
    `You are the ${scene.place}. The learner is a member of the public and you address them as "${scene.register}".`,
    `Your move now: ${beat.move}. In English, what you are doing is: ${beat.they}`,
    `The learner is then expected to: ${beat.goal}`,
    `The line must be about: ${beat.topic.filter((t) => !withhold.includes(t)).join(", ")}`,
    withhold.length > 0
      ? `Do not use ${withhold.join(" or ")} in any form. Ask so that the learner has to be the one to say it.`
      : "",
    QUESTION_SHAPE[beat.move] === "required" ? "It must be a question." : "",
    QUESTION_SHAPE[beat.move] === "forbidden" ? "It must not be a question." : "",
    `At most ${MAX_WORDS} words. Words you may use:`,
    lemmas.join(", "),
    retryOver && retryOver.length > 0
      ? `\nYour last line used words that are not on the list: ${retryOver.join(", ")}. `
        + "Write it again using only listed words."
      : "",
  ].filter(Boolean).join("\n");

  for (const link of links) {
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
      return { text: text.replace(/^["'«]|["'»]$/g, ""), model: link.model };
    }
    const why = `${link.model} ${status}`;
    REFUSALS.set(why, (REFUSALS.get(why) ?? 0) + 1);
  }
  return null;
}
