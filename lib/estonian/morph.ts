import { caseByKey } from "./cases";
import type { CaseKey } from "./types";

/**
 * Ekilex's morph codes, decoded.
 *
 * Ekilex labels every retrieved form with a code (`SgIn`, `IndPrSg1`) and an
 * Estonian name ("ainsuse seesütlev"). Both are correct and neither is much use
 * to an English speaker mid-exercise, so this is the one place that turns a code
 * into something a learner can read — and into the case key the rest of the app
 * already reasons about, which is what lets a cloze built from a real sentence
 * count towards the weak-case breakdown.
 *
 * Pure data. Codes we do not recognise fall through as `null` rather than being
 * guessed at.
 */

/** Noun and adjective codes → the case, ignoring number. */
const CASE_BY_MORPH: Record<string, CaseKey> = {
  SgN: "NOMINATIVE", PlN: "NOMINATIVE",
  SgG: "GENITIVE", PlG: "GENITIVE",
  SgP: "PARTITIVE", PlP: "PARTITIVE",
  SgIll: "ILLATIVE", PlIll: "ILLATIVE", SgAdt: "ILLATIVE",
  SgIn: "INESSIVE", PlIn: "INESSIVE",
  SgEl: "ELATIVE", PlEl: "ELATIVE",
  SgAll: "ALLATIVE", PlAll: "ALLATIVE",
  SgAd: "ADESSIVE", PlAd: "ADESSIVE",
  SgAbl: "ABLATIVE", PlAbl: "ABLATIVE",
  SgTr: "TRANSLATIVE", PlTr: "TRANSLATIVE",
  SgTer: "TERMINATIVE", PlTer: "TERMINATIVE",
  SgEs: "ESSIVE", PlEs: "ESSIVE",
  SgAb: "ABESSIVE", PlAb: "ABESSIVE",
  SgKom: "COMITATIVE", PlKom: "COMITATIVE",
};

export function caseFromMorphCode(code: string | null | undefined): CaseKey | null {
  if (!code) return null;
  return CASE_BY_MORPH[code] ?? null;
}

export type MorphNumber = "SINGULAR" | "PLURAL" | null;

export function numberFromMorphCode(code: string | null | undefined): MorphNumber {
  if (!code) return null;
  if (code.startsWith("Sg")) return "SINGULAR";
  if (code.startsWith("Pl")) return "PLURAL";
  return null;
}

export interface VerbSlot {
  /** English label a learner can act on. */
  en: string;
  /** Which block of the conjugation table this belongs in. */
  group: "PRESENT" | "PAST" | "CONDITIONAL" | "IMPERATIVE" | "NON_FINITE" | "OTHER";
  /** Position within the block — 1sg, 2sg, 3sg, 1pl, 2pl, 3pl. */
  order: number;
}

/**
 * The verb forms worth putting in a table.
 *
 * Estonian's full paradigm as Ekilex returns it runs to sixty-odd forms
 * including the quotative and four participles, which is a wall, not a table.
 * These are the ones a learner conjugates out loud: the present and simple past
 * in all six persons, the conditional, the imperative, and the non-finite forms
 * that are principal parts. Everything else still appears in the full paradigm
 * list on the entry — it is just not pretending to be a lesson.
 */
export const VERB_SLOTS: Record<string, VerbSlot> = {
  IndPrSg1: { en: "ma", group: "PRESENT", order: 1 },
  IndPrSg2: { en: "sa", group: "PRESENT", order: 2 },
  IndPrSg3: { en: "ta", group: "PRESENT", order: 3 },
  IndPrPl1: { en: "me", group: "PRESENT", order: 4 },
  IndPrPl2: { en: "te", group: "PRESENT", order: 5 },
  IndPrPl3: { en: "nad", group: "PRESENT", order: 6 },

  IndIpfSg1: { en: "ma", group: "PAST", order: 1 },
  IndIpfSg2: { en: "sa", group: "PAST", order: 2 },
  IndIpfSg3: { en: "ta", group: "PAST", order: 3 },
  IndIpfPl1: { en: "me", group: "PAST", order: 4 },
  IndIpfPl2: { en: "te", group: "PAST", order: 5 },
  IndIpfPl3: { en: "nad", group: "PAST", order: 6 },

  // Ekilex codes the conditional `Knd` (tingiv), not `Cond`. Estonian has no
  // separate 3sg here — "ta jooks" is the impersonal-looking `KndPrPs` form,
  // which is what belongs in the third-person row of a table people recite.
  KndPrSg1: { en: "ma", group: "CONDITIONAL", order: 1 },
  KndPrSg2: { en: "sa", group: "CONDITIONAL", order: 2 },
  KndPrPs: { en: "ta", group: "CONDITIONAL", order: 3 },
  KndPrPl1: { en: "me", group: "CONDITIONAL", order: 4 },
  KndPrPl2: { en: "te", group: "CONDITIONAL", order: 5 },
  KndPrPl3: { en: "nad", group: "CONDITIONAL", order: 6 },

  ImpPrSg2: { en: "sa!", group: "IMPERATIVE", order: 2 },
  ImpPrPl1: { en: "me!", group: "IMPERATIVE", order: 4 },
  ImpPrPl2: { en: "te!", group: "IMPERATIVE", order: 5 },

  Sup: { en: "ma-infinitive", group: "NON_FINITE", order: 1 },
  Inf: { en: "da-infinitive", group: "NON_FINITE", order: 2 },
  PtsPtPs: { en: "nud-participle", group: "NON_FINITE", order: 3 },
  PtsPtIps: { en: "tud-participle", group: "NON_FINITE", order: 4 },
  IndPrIps: { en: "impersonal present", group: "NON_FINITE", order: 5 },
};

export const VERB_GROUP_LABELS: Record<VerbSlot["group"], { en: string; et: string }> = {
  PRESENT: { en: "Present", et: "olevik" },
  PAST: { en: "Simple past", et: "lihtminevik" },
  CONDITIONAL: { en: "Conditional", et: "tingiv kõneviis" },
  IMPERATIVE: { en: "Imperative", et: "käskiv kõneviis" },
  NON_FINITE: { en: "Infinitives and participles", et: "tegevusnimed" },
  OTHER: { en: "Other forms", et: "muud vormid" },
};

export function verbSlot(code: string | null | undefined): VerbSlot | null {
  if (!code) return null;
  return VERB_SLOTS[code] ?? null;
}

/**
 * What to call one slot of a paradigm, in front of a learner.
 *
 * Three copies of a hand-typed English table used to answer this question, in
 * the dictionary's "you typed the X of Y" note, in the pasted-passage gap fill
 * and in the minimal pairs round. All three said "inessive" and "present 1sg",
 * which are names no Estonian course uses: a learner who searches `toas` and is
 * told it is the inessive has been handed a word their own teacher will not
 * say. One table now, derived from the case list and the verb slots rather than
 * retyped, and the Estonian name leads with the English one after it, because
 * that is the pair that is useful to somebody reading in both places.
 */
export interface FormName {
  readonly et: string;
  readonly en: string;
}

/** The slots the seed stores by `formType`, which carry no morph code. */
const STORED_NAMES: Record<string, FormName> = {
  NOM_SG: { et: "nimetav", en: "nominative" },
  GEN_SG: { et: "omastav", en: "genitive" },
  PART_SG: { et: "osastav", en: "partitive" },
  ILL_SG_SHORT: { et: "lühike sisseütlev", en: "short illative" },
  PART_PL: { et: "mitmuse osastav", en: "partitive plural" },
  GEN_PL: { et: "mitmuse omastav", en: "genitive plural" },
  INF_MA: { et: "ma-tegevusnimi", en: "ma-infinitive" },
  INF_DA: { et: "da-tegevusnimi", en: "da-infinitive" },
  // Worded exactly as the derived verb-slot names below, so that one word
  // resolving from a stored principal part and another from an Ekilex morph
  // code do not read as two different grammatical categories.
  PRES_1SG: { et: "olevik ma", en: "present ma" },
  PAST_1SG: { et: "lihtminevik ma", en: "simple past ma" },
  PART_TUD: { et: "tud-kesksõna", en: "tud-participle" },
};

/** The non-finite verb codes, which have a name rather than a person. */
const NON_FINITE_NAMES: Record<string, FormName> = {
  Sup: { et: "ma-tegevusnimi", en: "ma-infinitive" },
  Inf: { et: "da-tegevusnimi", en: "da-infinitive" },
  PtsPtPs: { et: "nud-kesksõna", en: "nud-participle" },
  PtsPtIps: { et: "tud-kesksõna", en: "tud-participle" },
  IndPrIps: { et: "umbisikuline olevik", en: "impersonal present" },
};

/** Name for a noun or adjective form code, or null when it is not one. */
function caseName(code: string): FormName | null {
  if (code === "SgAdt") return { et: "lühike sisseütlev", en: "short illative" };
  const key = caseFromMorphCode(code);
  if (!key) return null;
  const spec = caseByKey(key);
  if (!spec) return null;
  const plural = numberFromMorphCode(code) === "PLURAL";
  return {
    et: plural ? `mitmuse ${spec.et}` : spec.et,
    en: plural ? `${spec.en.toLowerCase()} plural` : spec.en.toLowerCase(),
  };
}

/**
 * The name of a form, from whichever of the three things we know about it.
 *
 * Never falls through to an internal `formType`: that leaked as "EKILEX:SgIn"
 * once. Ekilex's own `morphName` is Estonian already, so it stands alone.
 */
export function formName(form: {
  formType?: string | null;
  morphCode?: string | null;
  morphName?: string | null;
}): FormName | null {
  const code = form.morphCode;
  if (code) {
    const nonFinite = NON_FINITE_NAMES[code];
    if (nonFinite) return nonFinite;
    const cased = caseName(code);
    if (cased) return cased;
    const slot = VERB_SLOTS[code];
    if (slot && slot.group !== "NON_FINITE") {
      const group = VERB_GROUP_LABELS[slot.group];
      return { et: `${group.et} ${slot.en}`, en: `${group.en.toLowerCase()} ${slot.en}` };
    }
  }
  if (form.formType && STORED_NAMES[form.formType]) return STORED_NAMES[form.formType]!;
  if (form.morphName) return { et: form.morphName, en: form.morphName };
  return null;
}

/**
 * The one string to print: the name a class uses, with the English one after it
 * where the two differ. Falls back to the raw slot only when nothing else is
 * known, and never to an internal code.
 */
export function formLabel(form: {
  formType?: string | null;
  morphCode?: string | null;
  morphName?: string | null;
}): string {
  const name = formName(form);
  if (!name) return (form.formType ?? form.morphCode ?? "").replace(/^EKILEX:/, "");
  return name.et === name.en ? name.et : `${name.et} (${name.en})`;
}
