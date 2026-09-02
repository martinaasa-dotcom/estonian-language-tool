/**
 * The present tense, the conditional and the negative, from the one form the
 * dictionary stores for them.
 *
 * WHAT THIS DERIVES, AND WHY THAT IS ALLOWED.
 *
 * A seeded verb carries five principal parts and nothing else, so on a
 * deployment without an Ekilex key every one of the 799 verbs in the built
 * dictionary showed `loen` and stopped: no `loed`, no `loeb`, no `ei loe`,
 * and a conjugation card for `olevik · ta` could not be built at all. A
 * learner met `lugema` as "to read" and the present tense of it as one
 * person, which is a verb taught as a noun.
 *
 * The present indicative is the one part of the Estonian verb that really is
 * a suffix on a stored stem for every verb in the language but one. Take the
 * `n` off the first person and the other five are `d`, `b`, `me`, `te`,
 * `vad`; the negative is the bare stem after `ei`; the conditional is the
 * same stem with `ksin`, `ksid`, `ks`, `ksime`, `ksite`, `ksid`; and the
 * singular imperative is the stem again. That is ADR-005 amendment 1 exactly:
 * a deterministic rule over a form already stored, wrong the same way for
 * every word that takes the ending, which is one bug found once. It is the
 * same licence `derive.ts` takes for the ten regular cases on the genitive.
 *
 * WHAT IT DOES NOT DERIVE. The simple past has to be stored per verb, because
 * the third person is not readable from the first: `lugesin` goes to `luges`
 * and `tahtsin` to `tahtis` and `võtsin` to `võttis`, with the grade changing
 * on the way. The impersonal and the plural imperative are built on stems this
 * module does not hold. And `olema` is the one exception in the present: its
 * third person is `on`, which no rule reaches, so it gets nothing from here
 * and its forms come from Ekilex, where every verb's do the moment an entry is
 * opened on a deployment with a key. `minema` is the one exception in the
 * imperative for the same reason.
 *
 * CHECKED, NOT REASONED ABOUT. `scripts/audit-verbs.ts` derives every form
 * below for every verb in the shipped dictionary and compares it against the
 * paradigm Ekilex records for the same word. The exceptions named here are
 * the ones that audit found, and it is the thing to re-run before widening
 * this table.
 *
 * Every form carries `origin: "DERIVED"`, and every screen that prints one
 * says so, the way the case table does.
 */

/** Ekilex's own codes, so a derived form and a retrieved one fill the same slot. */
export type PresentCode =
  | "IndPrSg1" | "IndPrSg2" | "IndPrSg3" | "IndPrPl1" | "IndPrPl2" | "IndPrPl3";
export type ConditionalCode =
  | "KndPrSg1" | "KndPrSg2" | "KndPrPs" | "KndPrPl1" | "KndPrPl2" | "KndPrPl3";
export type NegativeCode = "IndPrPs_";
export type ImperativeCode = "ImpPrSg2";
export type DerivedVerbCode = PresentCode | ConditionalCode | NegativeCode | ImperativeCode;

export interface DerivedVerbForm {
  readonly morphCode: DerivedVerbCode;
  readonly value: string;
  /** STORED for the first person, which is the principal part; DERIVED otherwise. */
  readonly origin: "STORED" | "DERIVED";
}

const PRESENT: readonly (readonly [PresentCode, string])[] = [
  ["IndPrSg1", "n"], ["IndPrSg2", "d"], ["IndPrSg3", "b"],
  ["IndPrPl1", "me"], ["IndPrPl2", "te"], ["IndPrPl3", "vad"],
];

const CONDITIONAL: readonly (readonly [ConditionalCode, string])[] = [
  ["KndPrSg1", "ksin"], ["KndPrSg2", "ksid"], ["KndPrPs", "ks"],
  ["KndPrPl1", "ksime"], ["KndPrPl2", "ksite"], ["KndPrPl3", "ksid"],
];

/**
 * Verbs whose present tense the rule does not reach, by lemma.
 *
 * A lemma is a name, not a form. `olema` is here because its third person is
 * `on` and nothing about `olen` predicts that; every other verb in the shipped
 * dictionary was checked against Ekilex and follows the rule.
 */
const IRREGULAR_PRESENT: ReadonlySet<string> = new Set(["olema"]);

/**
 * Verbs whose singular imperative the rule may not produce.
 *
 * `minema` says `mine`, off the infinitive, where its present runs on `lähe-`,
 * so the rule would give `lähe`. `pidama` in the sense the course teaches, the
 * one a learner needs for "ma pidin minema", has no imperative at all: Ekilex
 * records the slot as absent, and the rule would offer `pea`, which is the
 * imperative of a different verb and also the word for a head. That is the
 * one thing this module must not do, since a derived form appears beside
 * attested ones and looks exactly like them.
 *
 * Found by `npm run audit:verbs`, which derives every slot for all 797 verbs
 * and compares them with what Ekilex records: this was its one disagreement
 * after the course pinned `pidama` to the right homonym.
 */
const IRREGULAR_IMPERATIVE: ReadonlySet<string> = new Set(["minema", "pidama"]);

/**
 * Every slot of the verb a learner is shown on an entry or asked on a card.
 *
 * The union of what `conjugatedForms` prints and what `CONJUGATION_SLOTS`
 * asks, which is the same question from two directions: what has to come from
 * somewhere. `IndIpfSg1` is the stored past first person, and `IndIpfSg3` is
 * the one slot in this list no rule reaches for any verb in the language.
 */
export const VERB_SLOTS: readonly string[] = [
  "IndPrSg1", "IndPrSg2", "IndPrSg3", "IndPrPl1", "IndPrPl2", "IndPrPl3", "IndPrPs_",
  "KndPrSg1", "KndPrSg2", "KndPrPs", "KndPrPl1", "KndPrPl2", "KndPrPl3", "ImpPrSg2",
  "IndIpfSg1", "IndIpfSg3",
];

/**
 * The slots the rule cannot fill for this verb, so the dictionary has to.
 *
 * Asked of the rule itself rather than listed beside it, because a list of
 * exceptions kept next to the exceptions is two copies of one fact. What comes
 * back is `IndIpfSg3` for every verb, since the simple past is never derived
 * and may not be; the whole present for `olema`, whose third person is `on`;
 * and the imperative for `minema`, which says `mine`. `pidama` has no
 * imperative at all and Ekilex records none, so asking for it costs nothing
 * and stores nothing, which is the right shape for a form that does not exist.
 *
 * `IndIpfSg1` is excluded because it is a principal part the dictionary already
 * holds under its own name, not because the rule reaches it.
 */
export function unreachableSlots(verb: VerbStems): readonly string[] {
  const reached = new Set(derivedVerbForms(verb).map((f) => f.morphCode as string));
  reached.add("IndIpfSg1");
  return VERB_SLOTS.filter((code) => !reached.has(code));
}

/**
 * The first persons a written verb form could have been derived from.
 *
 * THE DICTIONARY KNEW `helistab` AND COULD NOT FIND IT.
 *
 * The search strips a case ending to look for a genitive stem, which is how
 * `toas` finds `tuba`, and it knew nothing at all about a person ending. So a
 * verb was findable by its lemma, by its `ma`- and `da`-infinitives, by its
 * stored first person and its stored simple past, and by nothing else: not
 * `helistad`, not `helistab`, not `helistame`. `ta helistab` is the shape a
 * beginner meets in every sentence they read, and the app derives it, prints
 * it on the entry and drills it on a card. Measured over sixty graded words
 * and six forms each, that one gap was every miss the search had.
 *
 * This is the table above read backwards, and it lives here for the reason the
 * table does: an ending stripped in another module is an ending that stops
 * agreeing with the one this module adds.
 *
 * Candidates, not answers. What comes back is fed to the database as "is any
 * of these a stored first person", and `derivedVerbForms` decides afterwards
 * whether the word really is that verb's, so a wrong strip costs a lookup and
 * never a wrong answer. The bare word plus `n` is in the set because the
 * negative after `ei` and the singular imperative are the stem on its own.
 */
export function possibleFirstPersons(word: string): string[] {
  const head = word.trim().toLowerCase().split(/\s+/)[0] ?? "";
  if (head.length < 2) return [];
  const out = new Set<string>([`${head}n`]);
  for (const [, ending] of [...PRESENT, ...CONDITIONAL]) {
    if (head.length > ending.length && head.endsWith(ending)) {
      out.add(`${head.slice(0, head.length - ending.length)}n`);
    }
  }
  return [...out];
}

/**
 * The present stem, or null where there is no honest one.
 *
 * A particle verb stores its first person as two words, `loen läbi`, and the
 * verb is the first of them: the particle rides along unchanged behind every
 * form. A first person that does not end in `n`, or has nothing before it, is
 * not one this rule can read.
 */
function split(pres1sg: string): { stem: string; tail: string } | null {
  const trimmed = pres1sg.trim();
  const [head, ...rest] = trimmed.split(/\s+/);
  if (!head || !head.endsWith("n") || head.length < 2) return null;
  return { stem: head.slice(0, -1), tail: rest.length ? ` ${rest.join(" ")}` : "" };
}

export interface VerbStems {
  readonly lemma: string;
  readonly pres1sg: string | null | undefined;
}

/** The six persons of the present indicative, first person first. Null for `olema`. */
export function presentTense(verb: VerbStems): DerivedVerbForm[] | null {
  if (!verb.pres1sg || IRREGULAR_PRESENT.has(verb.lemma)) return null;
  const parts = split(verb.pres1sg);
  if (!parts) return null;
  return PRESENT.map(([morphCode, ending]) => ({
    morphCode,
    value: parts.stem + ending + parts.tail,
    origin: morphCode === "IndPrSg1" ? "STORED" : "DERIVED",
  }));
}

/** The six persons of the present conditional. Regular for every verb, `olema` included. */
export function conditional(verb: VerbStems): DerivedVerbForm[] | null {
  if (!verb.pres1sg) return null;
  const parts = split(verb.pres1sg);
  if (!parts) return null;
  return CONDITIONAL.map(([morphCode, ending]) => ({
    morphCode,
    value: parts.stem + ending + parts.tail,
    origin: "DERIVED",
  }));
}

/**
 * The verb as it stands after `ei`, which is the same for every person.
 *
 * The particle of a particle verb stays: `ei loe läbi`. Returned without the
 * `ei` itself, since that is a separate word and the slot Ekilex records is
 * the verb's own form.
 */
export function negativePresent(verb: VerbStems): DerivedVerbForm | null {
  if (!verb.pres1sg || IRREGULAR_PRESENT.has(verb.lemma)) return null;
  const parts = split(verb.pres1sg);
  if (!parts) return null;
  return { morphCode: "IndPrPs_", value: parts.stem + parts.tail, origin: "DERIVED" };
}

/** The imperative for one person, which is the bare present stem. Null for `minema`. */
export function imperativeSingular(verb: VerbStems): DerivedVerbForm | null {
  if (!verb.pres1sg || IRREGULAR_IMPERATIVE.has(verb.lemma) || IRREGULAR_PRESENT.has(verb.lemma)) return null;
  const parts = split(verb.pres1sg);
  if (!parts) return null;
  return { morphCode: "ImpPrSg2", value: parts.stem + parts.tail, origin: "DERIVED" };
}

/**
 * Every form this module can derive for one verb, in one list.
 *
 * What a dictionary entry and a card builder both want: the stored first
 * person, then everything the rule reaches from it. Empty for a verb the rule
 * does not cover, so a caller that only prints what it is given prints
 * nothing wrong.
 */
export function derivedVerbForms(verb: VerbStems): DerivedVerbForm[] {
  const out: DerivedVerbForm[] = [];
  const present = presentTense(verb);
  if (present) out.push(...present);
  const negative = negativePresent(verb);
  if (negative) out.push(negative);
  const cond = conditional(verb);
  if (cond) out.push(...cond);
  const imp = imperativeSingular(verb);
  if (imp) out.push(imp);
  return out;
}

/**
 * The stored first person off a form list, whichever shape the caller holds.
 *
 * The seed writes it as `PRES_1SG`; a live Ekilex fetch writes it under the
 * morph code. Reading both here is what keeps a third reader from choosing.
 */
export function pres1sgFrom(
  forms: readonly { formType?: string | null; morphCode?: string | null; value: string }[],
): string | null {
  const stored = forms.find((f) => f.formType === "PRES_1SG")?.value;
  if (stored) return stored;
  const retrieved = forms.find(
    (f) => f.morphCode === "IndPrSg1" || f.formType === "EKILEX:IndPrSg1",
  )?.value;
  return retrieved ?? null;
}
