import { lastSession } from "@/lib/progress/session";
import { prisma } from "@/lib/db";
import { BADGES, earnedBadgeKeys, type Badge, type BadgeStats } from "@/lib/achievements/badges";
import { caseAccuracy } from "@/lib/stats/history";
import { numberSetting, readSettings, SETTING_KEYS, writeSetting } from "@/lib/settings/store";
import { learnerDayClock } from "@/lib/progress/dayClock";
import {
  dailySummary, deckSnapshot, pathWithProgress, unitsCompleted,
  type DailySummary, type DeckSnapshot, type UnitView,
} from "@/lib/progress/summary";

/**
 * Awarding badges, split from the action that calls it.
 *
 * Today already knows the learner's deck, day and path progress by the time it
 * renders — recomputing all of it inside the achievement check would double the
 * page's queries for numbers it is holding in a variable. So the check takes
 * what the caller has, and only fetches what is genuinely missing.
 */

const SHIELD_AWARD_BADGES = new Set(["streak_7", "streak_30", "streak_100"]);

export interface BadgeContext {
  snapshot: DeckSnapshot;
  summary: DailySummary;
  units: UnitView[];
  session?: { count: number; accuracy: number };
  /** Local hours the session's reviews fell in, for the early-bird/night-owl pair. */
  reviewHours?: readonly number[];
}

/** Everything a badge condition can depend on, gathered for one learner. */
export async function buildBadgeStats(ownerId: string, ctx: BadgeContext): Promise<BadgeStats> {
  const [totalReviews, settings, caseReviews] = await Promise.all([
    prisma.review.count({ where: { ownerId } }),
    readSettings(ownerId, [SETTING_KEYS.sprintBest, SETTING_KEYS.matchBest]),
    /*
      Ordered, because a badge that can appear and disappear is worse than one
      that is never earned. Which five thousand rows decide somebody's best
      case was the plan's choice, and a badge awarded off an arbitrary slice
      can be taken away by the next page load. All-time rather than the recent
      window `caseReviewsFor` uses, because this is a claim about what somebody
      has done rather than about what they should drill now.
    */
    prisma.review.findMany({
      where: { targetCase: { not: null }, ownerId },
      select: { targetCase: true, rating: true },
      orderBy: [{ reviewedAt: "desc" }, { id: "asc" }],
      take: 5000,
    }),
  ]);

  const bestCase = caseAccuracy(caseReviews, 10)
    .sort((a, b) => b.accuracy - a.accuracy)[0];

  return {
    streak: ctx.summary.streak,
    totalReviews,
    cardsKnown: ctx.snapshot.knownCards,
    /*
      THE LEARNER'S OWN WORDS, WHICH IS WHAT THE BADGE SAYS.

      This read `dictionarySize()`, which is how many entries the shared
      dictionary holds: 6,050 for everybody, the same number on the first
      morning as on the four hundredth. `deck_50` and `deck_200` say "add 50
      words to your dictionary" and "add 200 words", and both were handed out
      on the first load of Today, before a card had been answered. That is
      ADR-014's "awarded for something that never happened", and `Achievement`
      is never re-awarded and never removed, so it stayed.

      `startedLemmas` is lemmas with at least one card in the deck, already
      fetched for the snapshot, so this is free as well as right.
    */
    totalWords: ctx.snapshot.startedLemmas.size,
    bestCaseAccuracy: bestCase ? { grammCase: bestCase.grammCase, accuracy: bestCase.accuracy } : null,
    sprintBest: numberSetting(settings[SETTING_KEYS.sprintBest], 0),
    matchBestSeconds: numberSetting(settings[SETTING_KEYS.matchBest], 0),
    unitsCompleted: unitsCompleted(ctx.units),
    level: ctx.summary.level.level,
    questsDoneToday: ctx.summary.questsDone,
    ...(ctx.session ? { session: ctx.session } : {}),
    ...(ctx.reviewHours?.length ? { reviewHours: ctx.reviewHours } : {}),
  };
}

/**
 * Writes any newly-earned badge and returns just the new ones.
 *
 * Idempotent: an already-earned key is never re-awarded, and no badge is ever
 * removed — losing a badge because a streak later broke would be a worse
 * surprise than never having shown it.
 */
export async function awardBadges(ownerId: string, stats: BadgeStats): Promise<Badge[]> {
  const earnedKeys = earnedBadgeKeys(stats);
  if (earnedKeys.length === 0) return [];

  const already = await prisma.achievement.findMany({
    where: { ownerId, key: { in: earnedKeys } },
    select: { key: true },
  });
  const alreadySet = new Set(already.map((a) => a.key));
  const newKeys = earnedKeys.filter((k) => !alreadySet.has(k));
  if (newKeys.length === 0) return [];

  /*
    `skipDuplicates`, because the four lines above are check-then-act and this
    runs on every render of Today.

    Read what is already earned, filter, insert the rest: two renders inside
    that gap both see a badge as unearned and both insert it, and the second
    one violates `@@id([ownerId, key])` and throws. `BadgeCheck` runs this
    behind a `Suspense`, so the throw costs the toast rather than the page,
    and that component's header calls this check idempotent. It is, now. That is not hypothetical
    and it is not rare. It is in this repository's own CI logs, twice, as
    `duplicate key value violates unique constraint "Achievement_pkey"` on
    `(local-single-user, deck_50)`, and the page it takes down is the one a
    learner opens every morning, at the exact moment they earned something.

    The ledger took an advisory lock for this shape and `addCardsFor` took one
    too, because both had a count to get right. Nothing is counted here: the
    composite primary key already says a badge is earned once, so the honest
    fix is to let the database enforce it and stop treating a duplicate as an
    error. What that costs is that two concurrent renders can each report the
    same badge as new, which is one extra congratulation rather than a 500.

    The doc comment above has always said this function is idempotent. It says
    it in the code now.
  */
  await prisma.achievement.createMany({
    data: newKeys.map((key) => ({ ownerId, key })),
    skipDuplicates: true,
  });

  // Reaching a streak milestone banks a shield: the streak worth protecting is
  // exactly the one just reached.
  const shieldsEarned = newKeys.filter((k) => SHIELD_AWARD_BADGES.has(k)).length;
  if (shieldsEarned > 0) {
    const current = await readSettings(ownerId, [SETTING_KEYS.streakShields]);
    const shields = numberSetting(current[SETTING_KEYS.streakShields], 0);
    await writeSetting(ownerId, SETTING_KEYS.streakShields, String(shields + shieldsEarned));
  }

  return BADGES.filter((b) => newKeys.includes(b.key));
}

/**
 * The whole check, for callers that hold none of the context — a review session
 * that has just finished, for instance.
 */
export async function checkAchievementsFor(
  ownerId: string,
  /**
   * Whether a review session has just ended, and nothing more.
   *
   * It used to be `{ count, accuracy }`, handed in by the browser. Every
   * export of `app/actions.ts` is a public endpoint, so those two numbers were
   * a claim: `checkAchievements({ count: 10, accuracy: 100 })` earned
   * `perfect_session` with no card answered, into a table that is never
   * re-awarded and never removed. Now the caller says only *that* a session
   * ended, which is the one thing it knows and cannot lie usefully about, and
   * the run itself is read off the review log. See `lib/progress/session.ts`.
   */
  sessionEnded = false,
  now = new Date(),
): Promise<Badge[]> {
  // The learner's clock, because two of these badges are about the hour of the
  // day and the rest are about the day: "review before 7am" was reading the
  // deployment's morning, so a Tallinn learner earned it at nine.
  const clock = await learnerDayClock(ownerId);
  const snapshot = await deckSnapshot(ownerId, now);
  const [summary, units] = await Promise.all([
    dailySummary(ownerId, snapshot, now, clock),
    pathWithProgress(ownerId, snapshot),
  ]);
  const session = sessionEnded ? await lastSession(ownerId, now) : null;
  const stats = await buildBadgeStats(ownerId, {
    snapshot,
    summary,
    units,
    // The hours the reviews actually fell in, not the hour the check ran: a
    // session that began at 06:40 and ended at 07:05 is an early bird by the
    // half of it that happened before seven.
    ...(session
      ? {
          session,
          reviewHours: [session.startedAt, session.endedAt]
            .filter((at): at is Date => at !== null)
            .map((at) => clock.hourOf(at)),
        }
      : {}),
  });
  return awardBadges(ownerId, stats);
}
