import { prisma } from "@/lib/db";
import { measuredPace, PACE_WINDOW_DAYS } from "@/lib/stats/pace";
import type { MeasuredPace, Standing } from "@/lib/assessment/plan";
import { PRE_A1 } from "@/lib/assessment/types";
import { learnerDayClock } from "./dayClock";
import { currentLevelAnswer } from "./level";

/**
 * The database half of the plan: what this learner has actually done, and
 * how the app knows where they stand.
 *
 * `lib/assessment/plan.ts` is pure and quotes whatever it is handed. This is
 * the file that goes and gets the two things about a person the log can
 * answer: their pace, off the timestamps and durations of real reviews, and
 * whether the level the plan is built on was measured or guessed.
 */

/**
 * As many rows as four weeks could hold. A heavy learner is two hundred
 * reviews a day, which is under six thousand; the cap is a bound on the work
 * and, being ordered, not on the meaning.
 */
const PACE_ROWS = 20_000;

/** The learner's real pace over the last four weeks, or null before any review. */
export async function measuredPaceFor(ownerId: string, now = new Date()): Promise<MeasuredPace | null> {
  const since = new Date(now.getTime() - PACE_WINDOW_DAYS * 86_400_000);
  const [first, rows, clock] = await Promise.all([
    prisma.review.findFirst({
      where: { ownerId },
      orderBy: [{ reviewedAt: "asc" }, { id: "asc" }],
      select: { reviewedAt: true },
    }),
    prisma.review.findMany({
      where: { ownerId, reviewedAt: { gte: since, lte: now } },
      select: { reviewedAt: true, durationMs: true },
      orderBy: [{ reviewedAt: "asc" }, { id: "asc" }],
      take: PACE_ROWS,
    }),
    learnerDayClock(ownerId),
  ]);
  return measuredPace(rows, { now, firstReviewAt: first?.reviewedAt ?? null, clock });
}

/**
 * Where the learner stands, for the plan: the answer the course already goes
 * on, with how it was arrived at kept rather than dropped.
 *
 * A learner with nothing measured and nothing declared is below A1 as far as
 * the app can tell, and that is a guess of the app's rather than theirs, which
 * is why it is `estimated` and not a third kind.
 */
export async function standingFor(ownerId: string): Promise<Standing> {
  const answer = await currentLevelAnswer(ownerId);
  if (!answer) return { level: PRE_A1, source: "estimated" };
  if (answer.kind === "measured") return { level: answer.level, source: "measured", skills: answer.skills };
  return { level: answer.level, source: "estimated" };
}
