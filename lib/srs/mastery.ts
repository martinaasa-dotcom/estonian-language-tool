/**
 * WHEN A WORD COUNTS AS KNOWN.
 *
 * The deck could say a word was due or not due and nothing else. A learner
 * asked for the other reading: which words are *mastered*, which are nearly
 * there, and which keep going wrong, and the standard they asked for is the
 * right one. A word is mastered "only after it is successfully used correctly
 * at least 5 times", "tested using a huge variety of case endings and grammar",
 * and the app should "feel confident that the user has actually mastered this
 * word" before it stops asking.
 *
 * That is two thresholds and they do different jobs. **Five correct answers**
 * is the count. **Three distinct slots** is the variety, and it is the half
 * that makes the claim mean anything: five correct answers to the same
 * recognition card is five reads of one flashcard, and a learner who can do
 * that and cannot put the word in the seesütlev has not mastered it. `tuba`
 * answered right as a meaning, as a partitive and as a short illative is a
 * different kind of evidence from `tuba` answered right five times as a
 * meaning.
 *
 * WHAT A SLOT IS, AND WHY THE FIRST ANSWER WAS WRONG. This read `targetCase`,
 * which is the case a *card* is about and null on every card that is not about
 * a case, so every other answer landed in one shared slot. That was written
 * down as undercounting in the safe direction, and it was not undercounting, it
 * was a counter nothing could satisfy: a verb has no case cards at all, so its
 * recognition, production, gap-fill and eight conjugation cards were one slot
 * between them and no verb in any deck could ever reach three. A word added
 * from the dictionary has recognition, production and a gap-fill, which is two
 * slots at best. The round built on this draws the words that are *not*
 * mastered, so the two faults compounded and it kept asking about words it was
 * never going to let go of.
 *
 * `Review.slot` is the fix and `lib/srs/slots.ts` is the one table of what may
 * go in it: a case, a named part of a verb, or the card's own type, because
 * "what does this word mean" and "how do you say it" are two questions about
 * one word and always were. A row written before that column reads
 * `targetCase ?? ""`, exactly as it always did, so nobody's history is
 * reinterpreted and the count only gets better from here.
 *
 * AND THE BAR IS WHAT THE WORD CAN CARRY. Three slots is right for a noun with
 * eleven cases behind it and impossible for `Tere hommikust!`, which is a
 * phrase with no forms to ask for, or for an adverb, which does not inflect.
 * Asking a word for more variety than it has is the same fault in a smaller
 * room, so the threshold is `min(MASTERY_SLOTS, askable)`: three where three
 * can be asked, and everything there is otherwise. `askable` is counted from
 * the learner's own cards by `lib/progress/mastery.ts`, since those are the
 * questions this app can actually put to them.
 *
 * THE LAST ANSWER MATTERS. A word answered right five times last month and
 * wrong this morning is not mastered, and saying so would be the app telling
 * somebody they know something they had just got wrong. So a wrong most recent
 * answer holds a word out of `mastered` however good its history is. It does
 * not throw the history away: the word sits in `almost`, which is where it
 * belongs, and one correct answer puts it back.
 *
 * NOTHING HERE IS STORED. This is computed from the append-only review log on
 * every request, like XP, levels and streaks (ADR-014). A stored "mastered"
 * flag is a second source of truth that drifts, and it can be awarded for
 * something that never happened.
 *
 * Pure: no React, no Prisma, no Estonian. The rows come from
 * `lib/progress/mastery.ts`.
 */

/** Correct answers a word needs before it can be called mastered. */
export const MASTERY_CORRECT = 5;

/**
 * Distinct slots those answers have to span.
 *
 * Three rather than two because two is met by "the word, and the word in one
 * case", which is the pair almost every word in a deck has; and rather than
 * four because a word the dictionary can only build two case cards for would
 * then be unmasterable, which is a fact about the dictionary rather than about
 * the learner.
 */
export const MASTERY_SLOTS = 3;

/** Correct answers a word needs before it stops being called new. */
const ALMOST_CORRECT = 3;

/** Below this accuracy, with enough answers to mean it, a word is going wrong. */
const STRUGGLING_ACCURACY = 0.6;

/** Answers before accuracy is worth reading at all. Two wrong is not a pattern. */
const ENOUGH_TO_JUDGE = 4;

/** A graded answer, as `Review` records one. */
export interface WordReview {
  /** 1 Again, 2 Hard, 3 Good, 4 Easy. Three and up counts as correct. */
  rating: number;
  /** The case the card was about, or null when it was not about a case. */
  targetCase: string | null;
  /** What was actually asked. Null on a row written before the column existed. */
  slot: string | null;
  reviewedAt: Date;
}

/**
 * The slot one answer counts towards.
 *
 * The column where there is one, and the old reading where there is not, which
 * is what keeps a deck full of history reading the way it always did.
 */
export function slotOfReview(review: WordReview): string {
  return review.slot ?? review.targetCase ?? "";
}

export type Mastery = "mastered" | "almost" | "struggling" | "learning";

export interface Verdict {
  mastery: Mastery;
  /** Answers graded Good or Easy. */
  correct: number;
  total: number;
  /** Distinct slots answered correctly. The variety half of the claim. */
  slots: number;
  /** How many this word has to span, which is three or everything it has. */
  slotsNeeded: number;
  /** The slots already answered correctly, so a round can ask for another. */
  filled: readonly string[];
  /** 0 to 1, or null with too few answers to read. */
  accuracy: number | null;
  /** How far to mastered, 0 to 1, for a bar. 1 means there. */
  progress: number;
}

/** Three and up is correct: Hard is a near miss the learner still produced. */
const isCorrect = (r: WordReview) => r.rating >= 3;

/**
 * Where a word stands, from its own answers.
 *
 * The order the tiers are tested in is the whole of the logic. `struggling` is
 * asked before `almost` on purpose: a word with four correct answers and eight
 * wrong ones has met the `almost` count and is plainly not almost anything, and
 * the list a learner opens to find what to work on is the one that must not
 * quietly lose it.
 */
export function masteryOf(reviews: readonly WordReview[], askable = MASTERY_SLOTS): Verdict {
  /*
    The bar for this word: three, or everything it can be asked, whichever is
    smaller. Floored at one, because a word with nothing askable at all is not
    a word this app can put a question to, and dividing by zero to say so would
    report every such word as finished.
  */
  const slotsNeeded = Math.max(1, Math.min(MASTERY_SLOTS, askable));

  const total = reviews.length;
  if (total === 0) {
    return {
      mastery: "learning", correct: 0, total: 0, slots: 0, slotsNeeded,
      filled: [], accuracy: null, progress: 0,
    };
  }

  const right = reviews.filter(isCorrect);
  const correct = right.length;
  const filled = [...new Set(right.map(slotOfReview))];
  const slots = filled.length;
  const accuracy = total >= ENOUGH_TO_JUDGE ? correct / total : null;

  // Sorted rather than assumed: a caller reading the log in any order, or an
  // offline replay landing an older grade after a newer one, must not change
  // the verdict. `Review` is append-only and `reviewedAt` is when the learner
  // actually answered, which is the field the outbox preserves.
  const last = [...reviews].sort((a, b) => a.reviewedAt.getTime() - b.reviewedAt.getTime()).at(-1)!;

  // Two thresholds, and the smaller share of the two is the honest reading of
  // how far along a word is: five correct answers in one slot is not
  // five-sixths of the way to mastered.
  const progress = Math.min(1, Math.min(correct / MASTERY_CORRECT, slots / slotsNeeded));

  const mastery = verdict({
    correct, slots, slotsNeeded, accuracy, lastWasRight: isCorrect(last),
  });
  return { mastery, correct, total, slots, slotsNeeded, filled, accuracy, progress };
}

function verdict(input: {
  correct: number; slots: number; slotsNeeded: number;
  accuracy: number | null; lastWasRight: boolean;
}): Mastery {
  const { correct, slots, slotsNeeded, accuracy, lastWasRight } = input;

  if (accuracy !== null && accuracy < STRUGGLING_ACCURACY) return "struggling";
  if (correct >= MASTERY_CORRECT && slots >= slotsNeeded && lastWasRight) return "mastered";
  if (correct >= ALMOST_CORRECT) return "almost";
  return "learning";
}

/** What each tier is called on a screen, and what it means, in one place. */
export const MASTERY_LABEL: Record<Mastery, string> = {
  mastered: "Mastered",
  almost: "Almost there",
  struggling: "Needs work",
  learning: "Still learning",
};

/**
 * The order the lists are worth reading in.
 *
 * What is going wrong leads, because that is the list somebody opens this page
 * to act on. Mastered is last and is the one you read for the pleasure of it.
 */
export const MASTERY_ORDER: readonly Mastery[] = ["struggling", "almost", "learning", "mastered"];
