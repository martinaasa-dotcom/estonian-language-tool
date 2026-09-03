import type { CaseKey } from "./types";

export interface CaseSpec {
  readonly key: CaseKey;
  /** English grammatical name. */
  readonly en: string;
  /** Estonian grammatical name, as used in class. */
  readonly et: string;
  /**
   * The question a *person or an animal* answers with this case: `kellega?`.
   *
   * Estonian has two interrogative pronouns and they decline alike through all
   * fourteen cases: `kes` for somebody, `mis` for something. Which one a word
   * takes is a fact about the word, and the app was asking every word with the
   * `mis` one: `hobune → millega?` about an animal, `õpetaja → millesse?`
   * about a person. That is the first thing anybody learning Estonian is
   * taught to keep apart.
   */
  readonly asksPerson: string;
  /** The question a thing answers: `millega?`. */
  readonly asksThing: string;
  /**
   * The place adverb this case answers, where it has one, and `null` otherwise.
   *
   * SPLIT OFF BECAUSE IT CANNOT ASK ABOUT ONE CASE. `kus?` is answered by the
   * seesütlev and by the alalütlev, `kuhu?` by the sisseütlev and by the
   * alaleütlev, `kust?` by the seestütlev and by the alaltütlev: each covers a
   * pair, one from each of the two local sets. That is why `caseQuestionFor`
   * leaves it off a card. `tuba → milles? kus?` prints a question a learner
   * can answer correctly with `toal` and be marked wrong for, because the card
   * wanted the other case the adverb names.
   *
   * It stays part of the case's *name*, which is what a class writes on the
   * board and what `question` below joins, because there the pair is the point.
   */
  readonly asksWhere: string | null;
  /**
   * The case's own name: both interrogatives, and the adverb where it has one.
   *
   * Derived rather than typed, which is what stopped the two halves of this
   * table disagreeing. The first three rows named both pronouns (`kes? mis?`)
   * and the other eleven named only `mille-`, so a screen printing a case's
   * question said something true of every word for three cases and something
   * true of half the dictionary for the rest.
   */
  readonly question: string;
  /** Suffix added to the genitive stem. Empty for the three principal parts. */
  readonly suffix: string;
  /** True when the form must be stored, not derived. */
  readonly principal: boolean;
  readonly gloss: string;
}

/** A row of the table below: everything a case is, bar its assembled name. */
type CaseRow = Omit<CaseSpec, "question">;

/**
 * The 14 Estonian cases in their traditional order.
 *
 * The first three are principal parts — unpredictable, and stored.
 * The remaining eleven are regular suffixes on the genitive stem, which is the
 * single most motivating fact for a beginner: learn the genitive, get eleven cases.
 */
const ROWS: readonly CaseRow[] = [
  { key: "NOMINATIVE",  en: "Nominative",  et: "nimetav",    asksPerson: "kes?",      asksThing: "mis?",      asksWhere: null,    suffix: "",    principal: true,  gloss: "the book" },
  { key: "GENITIVE",    en: "Genitive",    et: "omastav",    asksPerson: "kelle?",    asksThing: "mille?",    asksWhere: null,    suffix: "",    principal: true,  gloss: "of the book" },
  { key: "PARTITIVE",   en: "Partitive",   et: "osastav",    asksPerson: "keda?",     asksThing: "mida?",     asksWhere: null,    suffix: "",    principal: true,  gloss: "some of the book" },
  { key: "ILLATIVE",    en: "Illative",    et: "sisseütlev", asksPerson: "kellesse?", asksThing: "millesse?", asksWhere: "kuhu?", suffix: "sse", principal: false, gloss: "into the book" },
  { key: "INESSIVE",    en: "Inessive",    et: "seesütlev",  asksPerson: "kelles?",   asksThing: "milles?",   asksWhere: "kus?",  suffix: "s",   principal: false, gloss: "in the book" },
  { key: "ELATIVE",     en: "Elative",     et: "seestütlev", asksPerson: "kellest?",  asksThing: "millest?",  asksWhere: "kust?", suffix: "st",  principal: false, gloss: "out of the book" },
  { key: "ALLATIVE",    en: "Allative",    et: "alaleütlev", asksPerson: "kellele?",  asksThing: "millele?",  asksWhere: "kuhu?", suffix: "le",  principal: false, gloss: "onto the book" },
  { key: "ADESSIVE",    en: "Adessive",    et: "alalütlev",  asksPerson: "kellel?",   asksThing: "millel?",   asksWhere: "kus?",  suffix: "l",   principal: false, gloss: "on the book" },
  { key: "ABLATIVE",    en: "Ablative",    et: "alaltütlev", asksPerson: "kellelt?",  asksThing: "millelt?",  asksWhere: "kust?", suffix: "lt",  principal: false, gloss: "off the book" },
  { key: "TRANSLATIVE", en: "Translative", et: "saav",       asksPerson: "kelleks?",  asksThing: "milleks?",  asksWhere: null,    suffix: "ks",  principal: false, gloss: "becoming a book" },
  { key: "TERMINATIVE", en: "Terminative", et: "rajav",      asksPerson: "kelleni?",  asksThing: "milleni?",  asksWhere: null,    suffix: "ni",  principal: false, gloss: "up to the book" },
  { key: "ESSIVE",      en: "Essive",      et: "olev",       asksPerson: "kellena?",  asksThing: "millena?",  asksWhere: null,    suffix: "na",  principal: false, gloss: "as a book" },
  { key: "ABESSIVE",    en: "Abessive",    et: "ilmaütlev",  asksPerson: "kelleta?",  asksThing: "milleta?",  asksWhere: null,    suffix: "ta",  principal: false, gloss: "without the book" },
  { key: "COMITATIVE",  en: "Comitative",  et: "kaasaütlev", asksPerson: "kellega?",  asksThing: "millega?",  asksWhere: null,    suffix: "ga",  principal: false, gloss: "with the book" },
] as const;

export const CASES: readonly CaseSpec[] = ROWS.map((row) => ({
  ...row,
  question: [row.asksPerson, row.asksThing, row.asksWhere].filter(Boolean).join(" "),
}));

/**
 * How a case is named when it is one of several to choose between.
 *
 * The Estonian name and the question, which is the pair a class hears together
 * and the pair that lets somebody actually pick. A list of Latin names asks an
 * English speaker to remember a translation of a translation; the question is
 * the thing they will hear in a shop.
 */
export function caseOptionLabel(spec: CaseSpec): string {
  return `${spec.et} · ${spec.question}`;
}

export function caseByKey(key: string): CaseSpec | undefined {
  return CASES.find((c) => c.key === key);
}
