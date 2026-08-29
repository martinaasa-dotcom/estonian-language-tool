import { prisma } from "@/lib/db";
import { computeStreak } from "@/lib/achievements/badges";
import { xpFromRatingCounts } from "@/lib/gamification/xp";
import { caseAccuracy } from "@/lib/stats/history";

/**
 * What a teacher needs to see about a class, in three queries rather than three
 * per student.
 *
 * The shape of this is a deliberate limit on what a class exposes. A teacher
 * sees effort and progress — reviews this week, streak, words known, the case
 * the group keeps missing — and nothing else. Not what a student looked up, not
 * their deck, not their mistakes one by one. A classroom tool that turned into
 * surveillance would be a worse product and a worse thing to build.
 */

/** Streaks are computed from this window; longer than a term, short enough to stay one query. */
const HISTORY_DAYS = 120;

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

  const [reviews, known] = await Promise.all([
    prisma.review.findMany({
      where: { reviewedAt: { gte: historyStart }, ownerId: { in: ids } },
      select: { reviewedAt: true, rating: true, targetCase: true, ownerId: true },
    }),
    prisma.card.groupBy({
      by: ["ownerId"],
      where: { ownerId: { in: ids }, state: 2 },
      _count: true,
    }),
  ]);

  const knownByOwner = new Map(known.map((k) => [k.ownerId, k._count]));
  const byOwner = new Map<string, { dates: Date[]; weekRatings: Record<number, number>; weekCount: number }>();
  for (const id of ids) byOwner.set(id, { dates: [], weekRatings: {}, weekCount: 0 });

  for (const review of reviews) {
    const entry = byOwner.get(review.ownerId);
    if (!entry) continue;
    entry.dates.push(review.reviewedAt);
    if (review.reviewedAt >= weekAgo) {
      entry.weekRatings[review.rating] = (entry.weekRatings[review.rating] ?? 0) + 1;
      entry.weekCount++;
    }
  }

  const entries: RosterEntry[] = members.map((member) => {
    const stats = byOwner.get(member.ownerId)!;
    const last = stats.dates.reduce<Date | null>((a, b) => (!a || b > a ? b : a), null);
    return {
      ownerId: member.ownerId,
      displayName: member.displayName,
      role: member.role,
      joinedAt: member.joinedAt,
      weeklyXp: xpFromRatingCounts(stats.weekRatings),
      reviewsThisWeek: stats.weekCount,
      streak: computeStreak(stats.dates, now),
      wordsKnown: knownByOwner.get(member.ownerId) ?? 0,
      daysSinceLastReview: last
        ? Math.floor((now.getTime() - last.getTime()) / 86_400_000)
        : null,
    };
  });

  entries.sort((a, b) => b.weeklyXp - a.weeklyXp || a.displayName.localeCompare(b.displayName));

  return {
    entries,
    // Aggregated across the class, never attributed to one student: "the group
    // is weak on the partitive" is a lesson plan, "Kadri is" is a pillory.
    weakestCases: caseAccuracy(
      reviews.map((r) => ({ targetCase: r.targetCase, rating: r.rating })),
      10,
    ).slice(0, 5),
    totalReviewsThisWeek: entries.reduce((sum, e) => sum + e.reviewsThisWeek, 0),
    activeThisWeek: entries.filter((e) => e.reviewsThisWeek > 0).length,
  };
}
