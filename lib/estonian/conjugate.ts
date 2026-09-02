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
