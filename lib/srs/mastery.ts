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
 * WHAT A SLOT IS. `Review` carries `targetCase` and, deliberately, no card
 * type: it has no foreign key to `Card` at all, because it must survive a card
 * being deleted or a backup being restored over a deck. So the variety this can
 * see is the case a review was about, with one shared slot for every review
 * that was not about a case. That undercounts rather than overcounts, which is
 * the safe direction for a claim like this: a recognition card and a production
 * card of one word land in the same slot and count once, so the app is harder
 * to convince than it looks rather than easier.
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
  reviewedAt: Date;
}

export type Mastery = "mastered" | "almost" | "struggling" | "learning";

export interface Verdict {
  mastery: Mastery;
  /** Answers graded Good or Easy. */
  correct: number;
  total: number;
  /** Distinct case slots answered correctly. The variety half of the claim. */
  slots: number;
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
export function masteryOf(reviews: readonly WordReview[]): Verdict {
  const total = reviews.length;
  if (total === 0) {
    return { mastery: "learning", correct: 0, total: 0, slots: 0, accuracy: null, progress: 0 };
  }

  const right = reviews.filter(isCorrect);
  const correct = right.length;
  const slots = new Set(right.map((r) => r.targetCase ?? "")).size;
  const accuracy = total >= ENOUGH_TO_JUDGE ? correct / total : null;

  // Sorted rather than assumed: a caller reading the log in any order, or an
  // offline replay landing an older grade after a newer one, must not change
  // the verdict. `Review` is append-only and `reviewedAt` is when the learner
  // actually answered, which is the field the outbox preserves.
  const last = [...reviews].sort((a, b) => a.reviewedAt.getTime() - b.reviewedAt.getTime()).at(-1)!;

  // Two thresholds, and the smaller share of the two is the honest reading of
  // how far along a word is: five correct answers in one slot is not
  // five-sixths of the way to mastered.
  const progress = Math.min(1, Math.min(correct / MASTERY_CORRECT, slots / MASTERY_SLOTS));

  const mastery = verdict({ correct, slots, accuracy, lastWasRight: isCorrect(last) });
  return { mastery, correct, total, slots, accuracy, progress };
}

function verdict(input: {
  correct: number; slots: number; accuracy: number | null; lastWasRight: boolean;
}): Mastery {
  const { correct, slots, accuracy, lastWasRight } = input;

  if (accuracy !== null && accuracy < STRUGGLING_ACCURACY) return "struggling";
  if (correct >= MASTERY_CORRECT && slots >= MASTERY_SLOTS && lastWasRight) return "mastered";
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

/**
 * ONE CARD PER WORD, IN THE SLOT THE LEARNER HAS PRACTISED LEAST.
 *
 * The half of "asked in a way you have not" that a query cannot express. A word
 * short of `MASTERY_SLOTS` has room in some slot it has not been asked in, and
 * this cannot see *which* from a verdict alone, so it works the other way
 * round: walk the cards in the order the caller asked for them, keep the first
 * card of each word, and let a later card take that place only when it opens a
 * slot the word has not been asked in yet.
 *
 * The caller's order is the whole of the tie break, which is why it takes the
 * rows already sorted rather than sorting them itself: both callers ask for
 * `lapses` first, so among cards of equal novelty the one that keeps going
 * wrong leads.
 *
 * An untyped `targetCase` (a recognition or a production card) is one shared
 * slot, exactly as `masteryOf` counts it, so the round and the verdict cannot
 * disagree about what variety means.
 *
 * Generic over the row rather than typed to Prisma's, because `lib/srs/` is
 * pure and both callers hand in a different select. Two routes render the Flash
 * cards session now, the whole deck and one frequency list, and a second copy
 * of this is two answers to "what should this word be asked as" that drift.
 */
export function leastPractisedSlot<
  T extends { lexemeId: string | null; targetCase: string | null },
>(cards: readonly T[], wanted: ReadonlySet<string>): T[] {
  const chosen = new Map<string, T>();
  const slotsSeen = new Map<string, Set<string>>();

  for (const card of cards) {
    const lexemeId = card.lexemeId;
    if (!lexemeId || !wanted.has(lexemeId)) continue;

    const slot = card.targetCase ?? "";
    const seen = slotsSeen.get(lexemeId) ?? new Set<string>();
    const held = chosen.get(lexemeId);

    if (!held || !seen.has(slot)) {
      if (!held) chosen.set(lexemeId, card);
      else if (seen.size < MASTERY_SLOTS) chosen.set(lexemeId, card);
    }
    seen.add(slot);
    slotsSeen.set(lexemeId, seen);
  }
  return [...chosen.values()];
}
