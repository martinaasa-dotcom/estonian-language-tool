import type { CaseSpec } from "./cases";
import { INSIDE_CASES, OUTSIDE_CASES, bothSetsOrdinary, takesOutsideCases } from "./place";
import { bothLocalSetsOrdinary, isAnimate } from "./semantics";
import type { CaseKey } from "./types";

/**
 * WHICH CASES ARE WORTH ASKING A WORD ABOUT, AND HOW TO WORD THE QUESTION.
 *
 * Two facts decide both, and neither is in the spelling. Estonian has two sets
 * of local cases and two interrogative pronouns, and a word takes one of each:
 * a room is somewhere you are inside and is a `mis`, a horse is neither.
 *
 *   tuba      toas, toast, tuppa      milles? millest? millesse?
 *   hobune    hobusel, hobuselt, hobusele    kellel? kellelt? kellele?
 *
 * The app had half of the first rule, in `lib/estonian/place.ts`, which reads
 * the ending `-maa` so that `Saksamaa` is drilled on `Saksamaal` rather than on
 * `Saksamaas`. It had none of the second, and `place.ts` says in its own header
 * why it could not have: an ending is all a spelling can tell you, and nothing
 * about the letters in `hobune` says it is an animal.
 *
 * So every animate noun in the dictionary was drilled on the wrong trio, under
 * the wrong question word: `hobune → millesse? kuhu?` wanting `hobusesse`,
 * `koer → milles? kus?` wanting `koeras`, `ema → millesse?` wanting `emasse`.
 * A learner who passes those cards has learned to say `ma annan raamatu
 * õpetajasse`, and a learner who asks their teacher about it is told the app
 * is wrong. `lib/estonian/semantics.ts` is where the missing fact comes from,
 * and it comes from the Institute rather than from a list written here.
 *
 * ONE PREDICATE RATHER THAN ONE LIST, because the generators legitimately ask
 * about different numbers of cases and only the *fit* is shared. A flashcard
 * drills five cases, the lesson planner seven, the writing exercise ten and the
 * daily quest all eleven, and each of those is a decision about how much to
 * ask. Which of them make sense for the word in front of you is not.
 *
 * That distinction is what let the fault spread. `localCasesFor` was written to
 * fix the `-maa` words and only two of the eight places that pick a case ever
 * called it, so the lesson planner, the writing exercise, the daily quest and
 * the picture round all went on asking `Saksamaa → milles? kus?` after it was
 * fixed. `caseFits` is what they all read now, and an invariant fails on a
 * ninth that picks a local case without asking.
 */

/**
 * What has to be known about a word before a case question can be asked of it.
 *
 * `semanticTypes` is required rather than optional, which is the whole of what
 * makes this stick: `null` says the dictionary was asked and holds no
 * classification, and a caller that never asked cannot satisfy the type. It is
 * the shape `NounStems.illSgShort` and `buildOptions`'s `Government` already
 * take, and for the same reason — a rule nobody can forget beats a rule
 * everybody is told about.
 */
export interface CaseSubject {
  readonly lemma: string;
  /** Ekilex's own semantic type codes, space separated, or `null`. */
  readonly semanticTypes: string | null;
  /**
   * The word's nominative singular, or `null` where the dictionary holds none.
   *
   * Required for the reason the field above is, and it answers a different
   * question: whether the word has a singular for a card to ask about at all.
   * Nineteen entries in the shipped dictionary are headed by a plural, because
   * that is the only number the word has: `prillid`, `teksad`, `käärid`,
   * `jõulud`, `aluspüksid`, `kõrvaklapid`. Ekilex still records the singular
   * paradigm of the word underneath (`prill`, `teksa`, `käär`), so the card
   * came out as `prillid → milles?` wanting `prillis`, which is a form of a
   * headword the learner was not shown, in a number the word does not have.
   * It is `prillides`, and the entry's plural column has said so all along.
   */
  readonly nomSg: string | null;
}

/**
 * Is the word on the card the singular the card is about to ask for?
 *
 * A nominal's lemma is its nominative singular, except where the word has no
 * singular: those are headed by the plural and the dictionary stores the
 * singular of something else beside them. Compared rather than assumed,
 * because the dictionary already holds both and the mismatch is exact.
 */
function hasSingular(subject: CaseSubject): boolean {
  if (!subject.nomSg) return true;
  return subject.nomSg.trim().toLocaleLowerCase("et") === subject.lemma.trim().toLocaleLowerCase("et");
}

/**
 * The local cases worth drilling for one word.
 *
 * The outside trio for a person, an animal or a place in `-maa`; the inside
 * trio for everything else; and neither where both sets are ordinary Estonian
 * and a card cannot ask which of two right answers a learner meant. That last
 * is `maa` itself (`maal` in the countryside, `maas` on the ground) and the
 * words the Institute called a being and a place at once, `politsei` and
 * `grupp` among them: see `bothLocalSetsOrdinary`.
 *
 * A word the dictionary has no classification for keeps the inside trio, which
 * is what it had before this existed. That is the safe end: an unclassified
 * word is one somebody added by hand, confirmed off a photograph or pasted in,
 * and reading "we do not know" as "it is a person" would break cards that are
 * currently right.
 */
export function localCasesFor(subject: CaseSubject): readonly CaseKey[] {
  if (bothSetsOrdinary(subject.lemma) || bothLocalSetsOrdinary(subject.semanticTypes)) return [];
  if (takesOutsideCases(subject.lemma) || isAnimate(subject.semanticTypes)) return OUTSIDE_CASES;
  return INSIDE_CASES;
}

/** Every local case, either set. */
const LOCAL: readonly CaseKey[] = [...INSIDE_CASES, ...OUTSIDE_CASES];

/**
 * Is this a case worth asking this word about?
 *
 * Only the six local cases are ever refused, and only in favour of their
 * opposite number: the other eight are asked of every word exactly as before.
 * `hobusena` and `hobuseta` are ordinary Estonian and so is `õpetajaks`, so
 * nothing here narrows a word to the trio it takes.
 */
export function caseFits(key: CaseKey, subject: CaseSubject): boolean {
  /*
    A WORD WITH NO SINGULAR FAILS EVERY CASE, NOT ONLY THE LOCAL ONES.
    `jõuludega` is how you say it and `jõuluga` is a form of `jõul`, so the
    comitative is as wrong as the seesütlev. Nothing here narrows what the
    dictionary *shows*: the entry prints the whole table and its plural column
    is right, which is what a reference is for.
  */
  if (!hasSingular(subject)) return false;
  if (!LOCAL.includes(key)) return true;
  return localCasesFor(subject).includes(key);
}

/**
 * The question to print on a card about this word.
 *
 * THE DECLINING PRONOUN ALONE, NOT THE PLACE ADVERB. `kus?` is answered by the
 * seesütlev and by the alalütlev, so on a card wanting one particular form it
 * is not the question being asked: a learner reading `tuba → milles? kus?` who
 * writes `toal` has answered what was printed and is marked wrong. The adverb
 * stays in the case's own name, where naming the pair is the point, and
 * `CaseSpec.question` is still that name.
 *
 * Both pronouns where the dictionary does not know which the word is, because
 * that is the case's name and is never wrong about anything. It is also rare:
 * the Institute classifies nearly every word the course teaches.
 */
export function caseQuestionFor(spec: CaseSpec, subject: CaseSubject): string {
  if (isAnimate(subject.semanticTypes)) return spec.asksPerson;
  if (subject.semanticTypes === null || subject.semanticTypes.trim() === "") {
    return `${spec.asksPerson} ${spec.asksThing}`;
  }
  return spec.asksThing;
}

/** The Estonian case name and the question this word answers with it. */
export function caseLabelFor(spec: CaseSpec, subject: CaseSubject): string {
  return `${spec.et} · ${caseQuestionFor(spec, subject)}`;
}
