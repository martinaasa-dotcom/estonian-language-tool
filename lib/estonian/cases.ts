import type { CaseKey } from "./types";

export interface CaseSpec {
  readonly key: CaseKey;
  /** English grammatical name. */
  readonly en: string;
  /** Estonian grammatical name, as used in class. */
  readonly et: string;
  /** The question the case answers — how Estonian schoolbooks teach them. */
  readonly question: string;
  /** Suffix added to the genitive stem. Empty for the three principal parts. */
  readonly suffix: string;
  /** True when the form must be stored, not derived. */
  readonly principal: boolean;
  readonly gloss: string;
}

/**
 * The 14 Estonian cases in their traditional order.
 *
 * The first three are principal parts — unpredictable, and stored.
 * The remaining eleven are regular suffixes on the genitive stem, which is the
 * single most motivating fact for a beginner: learn the genitive, get eleven cases.
 */
export const CASES: readonly CaseSpec[] = [
  { key: "NOMINATIVE",  en: "Nominative",  et: "nimetav",      question: "kes? mis?",         suffix: "",    principal: true,  gloss: "the book" },
  { key: "GENITIVE",    en: "Genitive",    et: "omastav",      question: "kelle? mille?",     suffix: "",    principal: true,  gloss: "of the book" },
  { key: "PARTITIVE",   en: "Partitive",   et: "osastav",      question: "keda? mida?",       suffix: "",    principal: true,  gloss: "some of the book" },
  { key: "ILLATIVE",    en: "Illative",    et: "sisseütlev",   question: "millesse? kuhu?",   suffix: "sse", principal: false, gloss: "into the book" },
  { key: "INESSIVE",    en: "Inessive",    et: "seesütlev",    question: "milles? kus?",      suffix: "s",   principal: false, gloss: "in the book" },
  { key: "ELATIVE",     en: "Elative",     et: "seestütlev",   question: "millest? kust?",    suffix: "st",  principal: false, gloss: "out of the book" },
  { key: "ALLATIVE",    en: "Allative",    et: "alaleütlev",   question: "millele? kuhu?",    suffix: "le",  principal: false, gloss: "onto the book" },
  { key: "ADESSIVE",    en: "Adessive",    et: "alalütlev",    question: "millel? kus?",      suffix: "l",   principal: false, gloss: "on the book" },
  { key: "ABLATIVE",    en: "Ablative",    et: "alaltütlev",   question: "millelt? kust?",    suffix: "lt",  principal: false, gloss: "off the book" },
  { key: "TRANSLATIVE", en: "Translative", et: "saav",         question: "milleks?",          suffix: "ks",  principal: false, gloss: "becoming a book" },
  { key: "TERMINATIVE", en: "Terminative", et: "rajav",        question: "milleni?",          suffix: "ni",  principal: false, gloss: "up to the book" },
  { key: "ESSIVE",      en: "Essive",      et: "olev",         question: "millena?",          suffix: "na",  principal: false, gloss: "as a book" },
  { key: "ABESSIVE",    en: "Abessive",    et: "ilmaütlev",    question: "milleta?",          suffix: "ta",  principal: false, gloss: "without the book" },
  { key: "COMITATIVE",  en: "Comitative",  et: "kaasaütlev",   question: "millega?",          suffix: "ga",  principal: false, gloss: "with the book" },
] as const;

export const DERIVED_CASES = CASES.filter((c) => !c.principal);

export function caseByKey(key: string): CaseSpec | undefined {
  return CASES.find((c) => c.key === key);
}
