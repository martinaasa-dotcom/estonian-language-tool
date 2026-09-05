import type { DayClock } from "@/lib/time/day";
import type { MeasuredPace } from "@/lib/assessment/plan";

/**
 * HOW MUCH OF THIS APP A LEARNER ACTUALLY DOES, READ OFF THE LOG.
 *
 * The plan asked "days a week you will really practice" and built a year on
 * the answer, and the answer is a hope. Every grade a learner gives is written
 * down with the moment it landed and how long the card was on screen, so once
 * there is a fortnight of log the app knows the real figure and quoting the
 * hope instead is the app choosing not to look. Somebody who said five days
 * and does two is not told off for it; they are shown a plan built on two,
 * which is the one they can actually keep.
 *
 * Time is counted the way a sitting is: the run of reviews with no gap longer
 * than `SESSION_GAP_MS`, from the first card to the last plus the first card's
 * own thinking time, because the timestamp is when the grade landed and the
 * first card's minute sits before it. Reading a correction, opening the
 * grammar page it links to and coming back is inside the sitting; lunch is
 * not. Summing the card durations alone would miss all of that and call a
 * forty-minute evening twelve minutes.
 *
 * Pure, and hermetic: it takes rows and a clock and knows nothing of Prisma.
 * `lib/progress/plan.ts` is what reads the rows.
 */

/**
 * The longest pause that still counts as the same sitting.
 *
 * Ten minutes rather than five, because a learner who reads the correction on
 * a card they missed and thinks about it is still in the session, and rather
 * than thirty, because coming back after lunch is a new one. `perfect_session`
 * in `lib/progress/session.ts` reads the same figure, since a sitting cannot
 * be one length for a badge and another for a plan.
 */
export const SESSION_GAP_MS = 10 * 60 * 1000;

/** How far back the pace is read. Four weeks: long enough to average a holiday, short enough to be now. */
export const PACE_WINDOW_DAYS = 28;

/**
 * Cards a minute, before the log says otherwise.
 *
 * Three is the pace the typed review mode runs at here, counting the thinking,
 * and it is deliberately not generous: a plan built on an optimistic figure is
 * a plan that quietly doubles its own timeline. It was two figures for a
 * while. The plan assumed three and Today's "about N minutes" divided by six,
 * so the screen somebody opens every morning promised half the time the plan
 * was budgeting for the same cards. One figure, and the log replaces it.
 */
export const DEFAULT_CARDS_PER_MINUTE = 3;

/**
 * The slowest and fastest a measured rate is believed at.
 *
 * `Review` carries no note of which mode wrote it, deliberately, so a sitting
 * of Match or Case Sprint grades a card every couple of seconds and is
 * indistinguishable in the log from a typed review. Read raw, one evening of
 * games made the morning promise 26 cards in a minute. A rate faster than a
 * brisk flip-through is a game's rate and not a review's, and a rate slower
 * than a card a minute is a tab left open, so a measured figure outside this
 * band is read at the edge of it rather than believed.
 */
export const MIN_CARDS_PER_MINUTE = 1;
export const MAX_CARDS_PER_MINUTE = 6;

/**
 * Minutes a number of cards takes, at the learner's own rate where the log
 * has one and at the default otherwise. Never under a minute, because a
 * screen saying "about 0 minutes" is a screen saying nothing.
 */
export function minutesForCards(cards: number, cardsPerMinute: number | null = null): number {
  const rate = cardsPerMinute && cardsPerMinute > 0
    ? Math.min(MAX_CARDS_PER_MINUTE, Math.max(MIN_CARDS_PER_MINUTE, cardsPerMinute))
    : DEFAULT_CARDS_PER_MINUTE;
  return Math.max(1, Math.round(Math.max(0, cards) / rate));
}

/**
 * The most a single card may count for, matching the cap `lib/srs/grade.ts`
 * writes. A tab left open overnight is not ten hours of study.
 *
 * Exported because `/api/metrics` does this same arithmetic in Postgres, over
 * every learner at once, and a second copy of the cap is where the two stop
 * agreeing about how long an evening was.
 */
export const MAX_CARD_MS = 600_000;

const DAY_MS = 86_400_000;

export interface TimedReview {
  reviewedAt: Date;
  durationMs: number;
}

/** Hours spent in sittings, over whatever rows are handed in. */
export function studyHours(reviews: readonly TimedReview[], gapMs = SESSION_GAP_MS): number {
  const sorted = [...reviews].sort((a, b) => a.reviewedAt.getTime() - b.reviewedAt.getTime());
  let ms = 0;
  let start: TimedReview | null = null;
  let last = 0;
  for (const review of sorted) {
    const at = review.reviewedAt.getTime();
    if (start === null || at - last > gapMs) {
      if (start !== null) ms += last - start.reviewedAt.getTime() + cardMs(start);
      start = review;
    }
    last = at;
  }
  if (start !== null) ms += last - start.reviewedAt.getTime() + cardMs(start);
  return ms / 3_600_000;
}

function cardMs(review: TimedReview): number {
  return Math.min(MAX_CARD_MS, Math.max(0, review.durationMs));
}

/**
 * The learner's pace over the window, or null when there is no log at all.
 *
 * The window starts at the first review ever where that is more recent than
 * `PACE_WINDOW_DAYS` ago, so a learner in their third week is measured over
 * three weeks rather than over four with one of them empty. How many weeks
 * that is travels with the figure: the plan decides whether it is enough to
 * trust, and the screen says how long it was read over.
 */
export function measuredPace(
  reviews: readonly TimedReview[],
  opts: { now: Date; firstReviewAt: Date | null; clock: DayClock; windowDays?: number },
): MeasuredPace | null {
  if (!opts.firstReviewAt) return null;
  const windowDays = opts.windowDays ?? PACE_WINDOW_DAYS;
  const earliest = opts.now.getTime() - windowDays * DAY_MS;
  const from = Math.max(earliest, opts.firstReviewAt.getTime());
  const weeks = (opts.now.getTime() - from) / (7 * DAY_MS);
  if (weeks <= 0) return null;

  const inWindow = reviews.filter((r) => {
    const at = r.reviewedAt.getTime();
    return at >= from && at <= opts.now.getTime();
  });
  const days = new Set(inWindow.map((r) => opts.clock.dayKey(r.reviewedAt)));
  const hours = studyHours(inWindow);

  return {
    hoursPerWeek: hours / weeks,
    daysPerWeek: days.size / weeks,
    weeks,
    // Cards over sitting time, so a correction read between two cards counts
    // as time spent on them, which it is. Null until a sitting has any length.
    cardsPerMinute: hours > 0 ? inWindow.length / (hours * 60) : null,
  };
}
