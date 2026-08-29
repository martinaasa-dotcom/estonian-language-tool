/**
 * The cards that are fighting you.
 *
 * Every spaced-repetition deck grows a handful of cards that never stick: you
 * learn them, forget them, learn them again, forget them again. Anki calls them
 * leeches and its answer is to suspend them after eight lapses. That is the
 * right instinct and the wrong number for a language course — by the eighth
 * lapse the learner has spent twenty minutes on one word and drawn the
 * conclusion that they are bad at Estonian.
 *
 * So this names them earlier, and names *why*: a card that keeps lapsing after
 * being learned is usually not a memory problem, it is a grammar problem. The
 * word is fine and the case is not, or the English gloss is doing two jobs. The
 * view that renders this offers the explanation and the dictionary entry before
 * it offers the suspend button.
 *
 * Derived, never stored (ADR-014): lapses come off the card's own FSRS state
 * and accuracy off the append-only review log, so nothing here can drift and
 * nothing needs backfilling when the rule changes.
 */

export interface StickingInput {
  id: string;
  lemma: string | null;
  front: string;
  back: string;
  cardType: string;
  targetCase: string | null;
  /** FSRS lapses: times this card was forgotten *after* being learned. */
  lapses: number;
  reps: number;
  suspended: boolean;
}

export interface StickingPoint extends StickingInput {
  /** Reviews in the log for this card. */
  reviews: number;
  recalled: number;
  /** Percent recalled, 0–100. */
  accuracy: number;
  /** Which rule flagged it — the view says this out loud rather than scoring. */
  reason: "lapses" | "accuracy";
  /** Other stuck cards for the same word, which this row stands in for. */
  siblings: number;
}

/**
 * Forgotten this many times after being learned and it is not a memory problem
 * any more. Four, not Anki's eight: by eight the learner has drawn a conclusion
 * about themselves rather than about the card.
 */
export const LAPSE_THRESHOLD = 4;

/** Enough answers that a bad run is a pattern rather than one tired evening. */
export const MIN_REVIEWS_FOR_ACCURACY = 6;
export const POOR_ACCURACY = 50;

/** Below this many repetitions a card is simply new, not stuck. */
const MIN_REPS = 3;

export function stickingPoints(
  cards: readonly StickingInput[],
  reviews: readonly { cardId: string; rating: number }[],
  limit = 6,
): StickingPoint[] {
  const counts = new Map<string, { reviews: number; recalled: number }>();
  for (const review of reviews) {
    const entry = counts.get(review.cardId) ?? { reviews: 0, recalled: 0 };
    entry.reviews++;
    if (review.rating >= 3) entry.recalled++;
    counts.set(review.cardId, entry);
  }

  const out: StickingPoint[] = [];
  for (const card of cards) {
    // A suspended card is already out of the rotation: naming it as a problem
    // to solve would be telling the learner off for having solved it.
    if (card.suspended) continue;
    if (card.reps < MIN_REPS) continue;

    const tally = counts.get(card.id) ?? { reviews: 0, recalled: 0 };
    const accuracy = tally.reviews > 0 ? Math.round((tally.recalled / tally.reviews) * 100) : 100;

    const byLapses = card.lapses >= LAPSE_THRESHOLD;
    const byAccuracy = tally.reviews >= MIN_REVIEWS_FOR_ACCURACY && accuracy <= POOR_ACCURACY;
    if (!byLapses && !byAccuracy) continue;

    out.push({
      ...card,
      reviews: tally.reviews,
      recalled: tally.recalled,
      accuracy,
      reason: byLapses ? "lapses" : "accuracy",
      siblings: 0,
    });
  }

  // Worst first: most lapses, then least recalled, then most time spent. The id
  // breaks the last tie so the list does not reshuffle between page loads.
  out.sort((a, b) =>
    b.lapses - a.lapses ||
    a.accuracy - b.accuracy ||
    b.reviews - a.reviews ||
    a.id.localeCompare(b.id));

  // One row per word. A word with four card types can produce four rows, which
  // buries every other word behind the one the learner already knows they are
  // stuck on — so the worst of them stands for the rest and says how many.
  const byWord = new Map<string, StickingPoint>();
  for (const point of out) {
    const key = (point.lemma ?? point.front).toLocaleLowerCase("et");
    const held = byWord.get(key);
    if (held) held.siblings++;
    else byWord.set(key, point);
  }

  return [...byWord.values()].slice(0, limit);
}

/** One line naming what is wrong, for the card that was flagged. */
export function stickingNote(point: StickingPoint): string {
  const also = point.siblings > 0
    ? ` Another ${point.siblings} card${point.siblings === 1 ? "" : "s"} for this word ${point.siblings === 1 ? "is" : "are"} stuck too.`
    : "";

  if (point.reason === "lapses") {
    return `Learned and forgotten ${point.lapses} times — ${point.accuracy}% recalled over ${point.reviews} reviews.${also}`;
  }
  return `${point.accuracy}% recalled over ${point.reviews} reviews — it has never really settled.${also}`;
}
