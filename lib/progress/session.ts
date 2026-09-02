import { prisma } from "@/lib/db";

/**
 * THE SESSION THAT JUST ENDED, READ OFF THE LOG RATHER THAN TAKEN ON TRUST.
 *
 * `perfect_session` is awarded for finishing a run of ten or more cards with
 * everything recalled, and the count and the accuracy behind it arrived as
 * arguments to `checkAchievements`, which is an export of a `"use server"`
 * file and therefore a public endpoint. `checkAchievements({ count: 10,
 * accuracy: 100 })` from a console earned the badge with no card answered, and
 * `Achievement` is a stored table that is never re-awarded and never removed:
 * exactly the "awarded for something that never happened" ADR-014 forbids.
 * Nobody but the learner is cheated by it, which is why it is worth fixing
 * rather than worth panicking about: a badge shelf you know is a lie is not a
 * badge shelf.
 *
 * So the session is derived, like every other figure in `lib/progress/`. A
 * session is the run of reviews ending now with no gap longer than
 * `SESSION_GAP_MS` in it, which is what a sitting actually is: cards answered
 * one after another, ending when the person stops. Ten minutes rather than
 * five, because a learner who reads the correction on a card they missed and
 * thinks about it is still in the session, and rather than thirty, because
 * coming back after lunch is a new one.
 *
 * `Review` has no column saying which mode wrote a row and deliberately never
 * will, so this cannot tell a sprint from a dictation. It does not need to:
 * the badge is about a run of answers going well, and every mode grades
 * through the same log (ADR-016).
 */

/** The longest pause that still counts as the same sitting. */
export const SESSION_GAP_MS = 10 * 60 * 1000;

/**
 * How far back to look at all.
 *
 * A bound on the query rather than on the session: a run with no ten-minute
 * gap in it that is longer than this is somebody who has been reviewing for
 * three hours, and the first ten cards of that are not what the badge is
 * about either.
 */
const WINDOW_MS = 3 * 60 * 60 * 1000;

/** As many rows as a session could hold, which is far more than one does. */
const MAX_ROWS = 500;

export interface SessionSummary {
  /** Cards answered in the run ending now. */
  count: number;
  /** Percentage recalled, 0 to 100, of those. */
  accuracy: number;
}

/**
 * The run of reviews ending at `now`, counted and scored.
 *
 * Ordered by time and then by id: two grades can share a millisecond, and a
 * truncated read that does not say how to break that tie is the plan choosing
 * which rows a badge is decided from.
 */
export async function lastSession(ownerId: string, now = new Date()): Promise<SessionSummary> {
  const rows = await prisma.review.findMany({
    where: { ownerId, reviewedAt: { gte: new Date(now.getTime() - WINDOW_MS), lte: now } },
    orderBy: [{ reviewedAt: "desc" }, { id: "desc" }],
    take: MAX_ROWS,
    select: { reviewedAt: true, rating: true },
  });

  let previous = now.getTime();
  let count = 0;
  let recalled = 0;
  for (const row of rows) {
    const at = row.reviewedAt.getTime();
    if (previous - at > SESSION_GAP_MS) break;
    previous = at;
    count += 1;
    // The same threshold the rest of the app calls a recall: Good and Easy.
    if (row.rating >= 3) recalled += 1;
  }

  return {
    count,
    accuracy: count === 0 ? 0 : Math.round((recalled / count) * 100),
  };
}
