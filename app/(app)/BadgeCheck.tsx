import { awardBadges, buildBadgeStats } from "@/lib/progress/achievements";
import type { DailySummary, DeckSnapshot, UnitView } from "@/lib/progress/summary";
import { AchievementToasts } from "@/components/achievements/AchievementToasts";

/**
 * THE BADGE CHECK, OFF THE CRITICAL PATH OF THE PAGE IT RUNS ON.
 *
 * Streak and deck-size badges can be earned just by reaching a milestone, so
 * Today checks on every load. That is right and it is idempotent. What was
 * wrong is where it sat: at the end of the page function, after everything
 * else had resolved, as two more `await`s in a row. Four queries to gather the
 * stats, one to read what has already been awarded, sometimes two to write —
 * three round trips, in front of the first byte of a page whose whole job is
 * to put a button on a screen.
 *
 * Nothing on this page depends on the answer. A toast is drawn over the top of
 * the dashboard by a client component that has to hydrate before it can show
 * anything anyway, so it can arrive whenever it is ready. Wrapped in a
 * `Suspense` with a `null` fallback, the shell and every panel flush while
 * this is still running and the toast streams in behind them.
 *
 * It reuses what the page already loaded rather than asking again, which is
 * why the three of them are props rather than a fresh read: `checkAchievements`
 * exists for callers that hold none of that context, and this is not one.
 */
export async function BadgeCheck({ ownerId, snapshot, summary, units }: {
  ownerId: string;
  snapshot: DeckSnapshot;
  summary: DailySummary;
  units: UnitView[];
}) {
  const badges = await awardBadges(
    ownerId,
    await buildBadgeStats(ownerId, { snapshot, summary, units }),
  );
  return <AchievementToasts badges={badges} />;
}
