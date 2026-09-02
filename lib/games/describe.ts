import { CASES } from "@/lib/estonian/cases";
import { caseFits } from "@/lib/estonian/caseQuestion";
import { caseAnswer, shownForms, stemsFromParts } from "@/lib/estonian/derive";
import { caseIndex, caseWritten, type CaseVerdict } from "@/lib/estonian/whichCase";
import { looksLikeSentence } from "@/lib/estonian/writing";
import { usesRequiredWord, type RequiredWord } from "@/lib/exam/written";
import type { CaseKey } from "@/lib/estonian/types";

/**
 * MARKING ONE SENTENCE ABOUT A SCENE.
 *
 * The scene is three things and a situation (`lib/collections/scenes.ts`); the
 * learner writes one Estonian sentence about it; this decides what can be
 * decided without a model.
 *
 * WHAT IS CERTAIN AND WHAT IS AN OPINION, which is the split `/api/write`
 * already draws and the reason this module holds no provider. Certain: whether
 * the sentence used each of the three words, whether the named one carried the
 * case the task asked for, and **which case it carried instead**. Every one of
 * those is a comparison against a form the dictionary vouches for. An opinion:
 * whether the sentence is idiomatic, which is Anu's and is labelled as hers.
 *
 * THE THIRD ONE IS THE POINT OF THE MODE. "You did not use the form we asked
 * for" is the least useful true thing this app can say, and it is what every
 * other screen says: they compare against one form and stop. A learner asked
 * for `majas` who wrote `majast` has made one specific mistake and can be told
 * so in a line, which is what `lib/estonian/whichCase.ts` is for.
 *
 * THREE RATINGS RATHER THAN TWO. The writing mode grades Good or Again,
 * because a form is either the one asked for or it is not. Here the middle
 * case is real and the app can tell it apart with certainty: using the word and
 * choosing the wrong ending is a Hard, not an Again, and the scheduler should
 * see the difference. Nothing about `RATINGS` or the scheduler changes; this
 * only decides which of the four to send (ADR-016).
 *
 * Pure. `lib/exam/written.ts` is where "did they use this word" already lives
 * and it is pure throughout, which is asserted rather than assumed, because a
 * second copy of that answer is a marker and a screen disagreeing about
 * whether `koertega` is `koer`.
 */

/** One of the three things in the scene, with what the dictionary holds for it. */
export interface SceneWord extends RequiredWord {
  readonly translation: string;
  /** A character, never artwork. See `lib/collections/emoji.ts`. */
  readonly emoji: string;
  /**
   * Which of the two sets of local cases the word takes.
   *
   * Here rather than on `RequiredWord`, which is the marker's shape and has no
   * business knowing: what counts as a word being *used* is every spelling it
   * has, and this only decides which of them a task may ask for. See
   * lib/estonian/caseQuestion.ts.
   */
  readonly semanticTypes: string | null;
}

export interface DescribeTask {
  readonly sceneId: string;
  /** What is going on, in English. */
  readonly situation: string;
  readonly words: readonly SceneWord[];
  /** Which of them has to carry a named case, as an index into `words`. */
  readonly askIndex: number;
  readonly caseKey: CaseKey;
  /**
   * The forms worth printing when the answer is shown: a pair where Estonian
   * has one, which is only ever the illative. Never sent to the browser before
   * the sentence is marked.
   */
  readonly shown: readonly string[];
  /**
   * Every spelling the marking lets through, which is deliberately wider than
   * `shown` and may not stand in for it: it holds a suffix guess sitting
   * beside a form Ekilex retrieved, and printing that pair would assert the
   * guess is a word.
   */
  readonly accepted: readonly string[];
}

export interface DescribeMark {
  /** Whether it is a sentence at all. Nothing is graded on a single word. */
  readonly isSentence: boolean;
  /** Per scene word, in the task's order, whether the sentence used it. */
  readonly used: readonly boolean[];
  /** Whether the named word carried the case the task asked for. */
  readonly rightCase: boolean;
  /** The spelling of the named word that turned up, where one did. */
  readonly written: string | null;
  /**
   * What case that spelling is, where exactly one case is spelled that way.
   * Null where the word did not appear at all.
   */
  readonly verdict: CaseVerdict | null;
  /** What to send `gradeCard`. Three, two or one; never Easy. */
  readonly rating: 1 | 2 | 3;
}

/**
 * Assembles a task for one scene, or nothing where the dictionary cannot set
 * one.
 *
 * A case is askable only where `caseAnswer` can answer it, which rules out the
 * three principal parts by construction (they are stored, not derived, and the
 * nominative is the lemma, so asking for it is asking nothing) and rules out a
 * word with no genitive stem. Returning null rather than falling back to a
 * guess is the same choice every generator in this app makes (ADR-005).
 */
export function taskFor(
  scene: { id: string; situation: string },
  words: readonly SceneWord[],
  askIndex: number,
  caseKey: CaseKey,
): DescribeTask | null {
  const word = words[askIndex];
  if (!word) return null;
  /*
    And not a local case this word does not take. The scene words are pictures,
    so a third of them are animals and people: 🐴 with "put `hobune` in the
    sisseütlev" wants `hobusesse`, which is not a sentence anybody would write
    about a picture of a horse. See lib/estonian/caseQuestion.ts.
  */
  const parts: Record<string, string> = {};
  for (const form of word.forms) parts[form.formType] = form.value;
  if (!caseFits(caseKey, {
    lemma: word.lemma, semanticTypes: word.semanticTypes, nomSg: parts.NOM_SG ?? null,
  })) return null;

  const answer = caseAnswer(stemsFromParts(parts), caseKey);
  if (!answer) return null;

  return {
    sceneId: scene.id,
    situation: scene.situation,
    words,
    askIndex,
    caseKey,
    shown: shownForms({ singular: answer.value, alsoRight: answer.alsoRight }),
    accepted: answer.accepted,
  };
}

/** Which cases a task may ask for at all. The eleven built on the genitive stem. */
export const ASKABLE_CASES: readonly CaseKey[] =
  CASES.filter((c) => !c.principal).map((c) => c.key);

export function markDescription(task: DescribeTask, sentence: string): DescribeMark {
  const used = task.words.map((word) => usesRequiredWord(word, sentence));

  const word = task.words[task.askIndex]!;
  const parts: Record<string, string> = {};
  for (const form of word.forms) parts[form.formType] = form.value;

  /*
    Two different questions, asked in this order.

    First, whether the sentence carries a spelling the task accepts, which is
    the wider list: a learner who wrote `toasse` where the entry leads with
    `tuppa` is right, and marking them wrong for the other true answer is the
    fault this app shipped twice.
  */
  const accepted = new Set(task.accepted.map((f) => f.toLocaleLowerCase("et")));
  const words = sentence.toLocaleLowerCase("et").split(/[^\p{L}\p{M}-]+/u).filter(Boolean);
  const rightCase = words.some((w) => accepted.has(w));

  /*
    Then, where it does not, which case the learner reached for instead. Only
    named where exactly one case is spelled that way; `whichCase` decides that
    and the screen prints nothing where it will not commit.
  */
  const found = caseWritten(caseIndex(stemsFromParts(parts)), sentence);

  return {
    isSentence: looksLikeSentence(sentence),
    used,
    rightCase,
    written: found?.written ?? null,
    verdict: found?.verdict ?? null,
    rating: rightCase ? 3 : used[task.askIndex] ? 2 : 1,
  };
}
