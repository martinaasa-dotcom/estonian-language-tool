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

/** English name for a noun/adjective form code, for scanning a paradigm table. */
export function caseLabelFromMorphCode(code: string | null | undefined): string | null {
  const key = caseFromMorphCode(code);
  if (!key) return null;
  if (code === "SgAdt") return "Short illative";
  const label = key.charAt(0) + key.slice(1).toLowerCase();
  return label;
}
