import { prisma } from "@/lib/db";

/**
 * The reviews a learner's weakest case is worked out from.
 *
 * WHY THIS IS A FUNCTION AND NOT THREE QUERIES.
 *
 * "Your weakest cases, click to drill" used to be drawn three ways on three
 * pages, and My words tallied the log with arithmetic of its own, so one
 * learner could read two different numbers for one case. That was consolidated:
 * `components/WeakestCases.tsx` is the one component and `caseAccuracy` in
 * `lib/stats/history.ts` is the one calculation.
 *
 * The *input* stayed three. Progress read the last half-year; Practice and the
 * grammar index each took an arbitrary five thousand rows of all time, with no
 * `ORDER BY` between them. A shared calculation over an unshared input is not a
 * shared answer, and the gap is not subtle: a learner who got the partitive
 * wrong three hundred times last year and right three hundred times this month
 * was told 100% on Progress and 50% on Practice, on the same day, about the
 * same case. Consolidating the component and the calculation and leaving the
 * query behind fixes only the half you can see.
 *
 * WHY A WINDOW RATHER THAN THE WHOLE LOG.
 *
 * The panel exists to answer "what should I drill now", and the two screens
 * disagreed about that as much as about the number. All-time accuracy answers a
 * different question: it holds a mistake somebody has since fixed against them
 * for ever, which is the opposite of what a drill button is for. So this keeps
 * the half-year Progress already used, which is the reading the most considered
 * of the three screens had arrived at, and brings the other two to it.
 *
 * The row cap is a bound on the work rather than on the meaning, and it is
 * ordered so that past it the rows kept are the recent ones rather than
 * whichever the plan returned. `(ownerId, reviewedAt)` is indexed, so both the
 * window and the ordering are free.
 */
const WINDOW_DAYS = 182;
const CAP = 5000;

export function caseReviewsFor(
  ownerId: string,
  now: Date = new Date(),
): Promise<{ targetCase: string | null; rating: number }[]> {
  return prisma.review.findMany({
    where: {
      ownerId,
      targetCase: { not: null },
      reviewedAt: { gte: new Date(now.getTime() - WINDOW_DAYS * 86_400_000) },
    },
    select: { targetCase: true, rating: true },
    orderBy: [{ reviewedAt: "desc" }, { id: "asc" }],
    take: CAP,
  });
}
