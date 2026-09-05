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
  /**
   * Percent recalled over the reviews in hand, or null where there are none.
   *
   * NULL IS A STATE RATHER THAN A ZERO. The lapse rule reads `card.lapses`,
   * which is lifetime FSRS state, and the reviews are counted over whatever
   * window the caller read, so a card lapsed a year ago and untouched since is
   * flagged with nothing in the window to judge it by. This used to fall back
   * to 100 and the row read "Learned and forgotten again, 100% recalled over 0
   * reviews", which is a divide by nothing and a window mismatch printed as a
   * fact about the learner.
   */
  accuracy: number | null;
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

/**
 * Below this many repetitions a card is simply new, not stuck.
 *
 * Exported because Today narrows the deck in SQL before calling this rather
 * than loading every card a learner owns to show three rows. That narrowing has
 * to use this number and not one typed beside the query, or the home page and
 * Progress quietly disagree about what counts as stuck.
 */
export const MIN_REPS = 3;

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
    const accuracy = tally.reviews > 0 ? Math.round((tally.recalled / tally.reviews) * 100) : null;

    const byLapses = card.lapses >= LAPSE_THRESHOLD;
    const byAccuracy = accuracy !== null
      && tally.reviews >= MIN_REVIEWS_FOR_ACCURACY && accuracy <= POOR_ACCURACY;
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
    // A card with nothing in the window sorts as though it had been recalled
    // every time, which is the cautious end: it is here on its lapses alone.
    (a.accuracy ?? 100) - (b.accuracy ?? 100) ||
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
  /*
    "Another 1 card for this word is stuck too" is not a sentence anybody
    writes, and the row above it was saying the lapse count twice: once in the
    chip, which is where a number belongs, and again in words at the front of
    this line. So the chip keeps the count and this says what the count is not
    telling you, which is how the card has done over how many attempts.
  */
  const also = point.siblings === 0 ? ""
    : point.siblings === 1 ? " One more card for this word is stuck too."
    : ` ${point.siblings} more cards for this word are stuck too.`;

  if (point.accuracy === null) {
    // Flagged on its lapse count, which outlives the window the reviews were
    // read over. Saying nothing about the percentage is the honest half.
    return `Learned and forgotten again, and not seen lately.${also}`;
  }
  if (point.reason === "lapses") {
    return `Learned and forgotten again, ${point.accuracy}% recalled over ${point.reviews} reviews.${also}`;
  }
  return `${point.accuracy}% recalled over ${point.reviews} reviews. It has never really settled.${also}`;
}
