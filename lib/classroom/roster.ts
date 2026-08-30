import { prisma } from "@/lib/db";
import { computeStreak } from "@/lib/achievements/badges";
import { xpFromRatingCounts } from "@/lib/gamification/xp";
import { caseAccuracy } from "@/lib/stats/history";
import { dayClock } from "@/lib/time/day";
import { SETTING_KEYS } from "@/lib/settings/store";

/**
 * What a teacher needs to see about a class, in three queries rather than three
 * per student.
 *
 * The shape of this is a deliberate limit on what a class exposes. A teacher
 * sees effort and progress — reviews this week, streak, words known, which
 * grammar case a student personally keeps missing — and nothing else. Not
 * what a student looked up, not their deck, not their answers one by one. A
 * classroom tool that turned into surveillance would be a worse product and a
 * worse thing to build.
 *
 * The per-student weak case is a widening of that boundary, made deliberately
 * rather than by drift. The line was originally "aggregate across the class,
 * never attributed to one student", on the argument that "the group is weak
 * on the partitive" is a lesson plan and "Kadri is" is a pillory. That is
 * still true of a raw mistake, which is why this stays a rolled-up percentage
 * over a student's own reviews at a case, gated on `MIN_STUDENT_CASE_REVIEWS`
 * so one bad card is never enough to name somebody, and why it is still never
 * an individual answer, a search or a deck. What changed is the judgement
 * that a teacher who already sees a name, a streak and a word count is not
 * meaningfully better protected by having the one actionable fact, which case
 * to help with, withheld along with it: the aggregate alone told a teacher
 * *that* the class struggles with the partitive and nothing about *who* to
 * help, which is the harder problem in a room of twenty-five.
 */

/** Streaks are computed from this window; longer than a term, short enough to stay one query. */
const HISTORY_DAYS = 120;

/**
 * Reviews at a case, for one student, before naming it as their weak point.
 *
 * Lower than the class-wide threshold (10) on purpose: a class pools reviews
 * across everyone, an individual does not, and a threshold tuned for the pool
 * would mean this never fires for anybody. Still high enough that four wrong
 * answers in five tries is a pattern rather than an unlucky evening.
 */
const MIN_STUDENT_CASE_REVIEWS = 5;

export interface RosterEntry {
  ownerId: string;
  displayName: string;
  role: string;
  joinedAt: Date;
  /** XP earned in the last seven days. */
  weeklyXp: number;
  reviewsThisWeek: number;
  streak: number;
  wordsKnown: number;
  /** Days since their last review; null if they have never reviewed. */
  daysSinceLastReview: number | null;
  /**
   * This student's own weakest case, rolled up as a percentage over their own
   * reviews. Null below `MIN_STUDENT_CASE_REVIEWS` at every case, which is the
   * common state for anybody who joined recently. Never a specific answer.
   */
  weakestCase: { grammCase: string; accuracy: number; total: number } | null;
}

export interface ClassSummary {
  entries: RosterEntry[];
  /** Cases the class as a whole is weakest at — what to teach next week. */
  weakestCases: { grammCase: string; accuracy: number; total: number }[];
  totalReviewsThisWeek: number;
  activeThisWeek: number;
}

export async function classRoster(classroomId: string, now = new Date()): Promise<ClassSummary> {
  const members = await prisma.classroomMember.findMany({
    where: { classroomId },
    orderBy: { joinedAt: "asc" },
  });
  if (members.length === 0) {
    return { entries: [], weakestCases: [], totalReviewsThisWeek: 0, activeThisWeek: 0 };
  }

  const ids = members.map((m) => m.ownerId);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const historyStart = new Date(now.getTime() - HISTORY_DAYS * 86_400_000);

  const [reviews, known, zones] = await Promise.all([
    prisma.review.findMany({
      where: { reviewedAt: { gte: historyStart }, ownerId: { in: ids } },
      select: { reviewedAt: true, rating: true, targetCase: true, ownerId: true },
    }),
    prisma.card.groupBy({
      by: ["ownerId"],
      where: { ownerId: { in: ids }, state: 2 },
      _count: true,
    }),
    /*
      Each student's own midnight. A class is the one place where several
      people's days are counted side by side, and an exchange student sitting
      in the same room is not in the same zone as everybody else: a streak
      counted on the teacher's clock, or on the server's, is a different number
      from the one the student is looking at on their own screen. One indexed
      read for the whole roster, which is the fourth query in a function whose
      whole argument is three rather than three per student.
    */
    prisma.setting.findMany({
      where: { ownerId: { in: ids }, key: SETTING_KEYS.timeZone },
      select: { ownerId: true, value: true },
    }),
  ]);

  const knownByOwner = new Map(known.map((k) => [k.ownerId, k._count]));
  const zoneByOwner = new Map(zones.map((z) => [z.ownerId, z.value]));
  const byOwner = new Map<string, {
    dates: Date[];
    weekRatings: Record<number, number>;
    weekCount: number;
    caseReviews: { targetCase: string | null; rating: number }[];
  }>();
  for (const id of ids) byOwner.set(id, { dates: [], weekRatings: {}, weekCount: 0, caseReviews: [] });

  for (const review of reviews) {
    const entry = byOwner.get(review.ownerId);
    if (!entry) continue;
    entry.dates.push(review.reviewedAt);
    entry.caseReviews.push({ targetCase: review.targetCase, rating: review.rating });
    if (review.reviewedAt >= weekAgo) {
      entry.weekRatings[review.rating] = (entry.weekRatings[review.rating] ?? 0) + 1;
      entry.weekCount++;
    }
  }

  const entries: RosterEntry[] = members.map((member) => {
    const stats = byOwner.get(member.ownerId)!;
    const last = stats.dates.reduce<Date | null>((a, b) => (!a || b > a ? b : a), null);
    const weakest = caseAccuracy(stats.caseReviews, MIN_STUDENT_CASE_REVIEWS)[0];
    return {
      ownerId: member.ownerId,
      displayName: member.displayName,
      role: member.role,
      joinedAt: member.joinedAt,
      weeklyXp: xpFromRatingCounts(stats.weekRatings),
      reviewsThisWeek: stats.weekCount,
      streak: computeStreak(stats.dates, now, dayClock(zoneByOwner.get(member.ownerId))),
      wordsKnown: knownByOwner.get(member.ownerId) ?? 0,
      daysSinceLastReview: last
        ? Math.floor((now.getTime() - last.getTime()) / 86_400_000)
        : null,
      weakestCase: weakest ?? null,
    };
  });

  entries.sort((a, b) => b.weeklyXp - a.weeklyXp || a.displayName.localeCompare(b.displayName));

  return {
    entries,
    // The class-wide picture, for a lesson plan. entries[].weakestCase is the
    // per-student one, for who to sit next to during it.
    weakestCases: caseAccuracy(
      reviews.map((r) => ({ targetCase: r.targetCase, rating: r.rating })),
      10,
    ).slice(0, 5),
    totalReviewsThisWeek: entries.reduce((sum, e) => sum + e.reviewsThisWeek, 0),
    activeThisWeek: entries.filter((e) => e.reviewsThisWeek > 0).length,
  };
}
