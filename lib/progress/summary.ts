import { prisma } from "@/lib/db";
import { PATH, unitProgress, type PathUnit, type UnitProgress } from "@/lib/collections/syllabus";
import { computeStreakWithShields } from "@/lib/achievements/badges";
import { levelFromXp, xpFromRatingCounts, type LevelInfo } from "@/lib/gamification/xp";
import { questsForDay, type Quest, type QuestStats } from "@/lib/gamification/quests";
import {
  dailyGoalFrom, numberSetting, readSettings, SETTING_KEYS, writeSetting,
} from "@/lib/settings/store";
import { dayKey, startOfDay } from "@/lib/time/day";

/**
 * One read of "where is this learner", shared by Today, the path, the progress
 * page and the achievement check.
 *
 * Written as a handful of small queries rather than one clever join because the
 * numbers are needed in different combinations on different pages, and because
 * every figure here has to be derivable from the review log and the card rows
 * alone — nothing about progress is stored, so nothing about it can go stale or
 * be lost in a restore.
 */

/** How far the FSRS state has to get before a card counts as "known". */
const KNOWN_STATE = 2;

export interface DeckSnapshot {
  totalCards: number;
  dueCount: number;
  newCount: number;
  knownCards: number;
  /** Lemmas with at least one card in the deck. */
  startedLemmas: Set<string>;
  /** Lemmas whose every card has reached the Known state. */
  knownLemmas: Set<string>;
}

export async function deckSnapshot(ownerId: string, now = new Date()): Promise<DeckSnapshot> {
  const cards = await prisma.card.findMany({
    where: { ownerId },
    select: { state: true, due: true, suspended: true, lexeme: { select: { lemma: true } } },
  });

  const perLemma = new Map<string, { total: number; known: number }>();
  let dueCount = 0;
  let newCount = 0;
  let knownCards = 0;

  for (const card of cards) {
    if (card.state === KNOWN_STATE) knownCards++;
    if (!card.suspended) {
      if (card.state === 0) newCount++;
      else if (card.due <= now) dueCount++;
    }
    const lemma = card.lexeme?.lemma;
    if (!lemma) continue;
    const entry = perLemma.get(lemma) ?? { total: 0, known: 0 };
    entry.total++;
    if (card.state === KNOWN_STATE) entry.known++;
    perLemma.set(lemma, entry);
  }

  const knownLemmas = new Set<string>();
  for (const [lemma, entry] of perLemma) {
    if (entry.total > 0 && entry.known === entry.total) knownLemmas.add(lemma);
  }

  return {
    totalCards: cards.length,
    dueCount,
    newCount,
    knownCards,
    startedLemmas: new Set(perLemma.keys()),
    knownLemmas,
  };
}

export interface UnitView extends UnitProgress {
  unit: PathUnit;
  /** Unit words the dictionary actually has, in the unit's own order. */
  lemmas: string[];
}

/**
 * The whole path with progress attached.
 *
 * A unit's words are looked up once, in one query, rather than per unit: 18
 * units × a query each is the kind of thing that quietly makes a page take a
 * second to load.
 */
export async function pathWithProgress(ownerId: string, snapshot?: DeckSnapshot): Promise<UnitView[]> {
  const snap = snapshot ?? await deckSnapshot(ownerId);
  const allLemmas = [...new Set(PATH.flatMap((u) => u.lemmas))];
  const present = await prisma.lexeme.findMany({
    where: { lemma: { in: allLemmas } },
    select: { lemma: true },
  });
  const available = new Set(present.map((l) => l.lemma));

  return PATH.map((unit) => {
    const lemmas = unit.lemmas.filter((l) => available.has(l));
    return {
      unit,
      lemmas,
      ...unitProgress({
        availableLemmas: lemmas,
        startedLemmas: [...snap.startedLemmas],
        knownLemmas: [...snap.knownLemmas],
      }),
    };
  });
}

export function unitsCompleted(units: UnitView[]): number {
  return units.filter((u) => u.state === "done").length;
}

export interface DailySummary {
  dayKey: string;
  streak: number;
  shieldsAvailable: number;
  dailyGoal: number;
  reviewsToday: number;
  xpToday: number;
  totalXp: number;
  /**
   * Every review this learner has ever graded.
   *
   * Free: it is the sum of the rating counts already loaded for XP. It is here
   * because `lib/ux/disclosure.ts` decides how much of the app a screen leads
   * with from it, and a second query to answer "has this person started yet"
   * would be a query on every render of the busiest page in the app.
   */
  reviewsAllTime: number;
  level: LevelInfo;
  quests: Quest[];
  questsDone: number;
  goalPct: number;
  goalMet: boolean;
}

/**
 * Everything the Today screen leads with.
 *
 * XP is recomputed from the review log every time rather than stored — see
 * lib/gamification/xp.ts for why that matters.
 */
export async function dailySummary(
  ownerId: string,
  snapshot: DeckSnapshot,
  now = new Date(),
): Promise<DailySummary> {
  const startToday = startOfDay(now);

  const [allRatings, todayRatings, todayReviews, cardsAddedToday, tasksDoneToday, settings, streakInfo] =
    await Promise.all([
      prisma.review.groupBy({ by: ["rating"], where: { ownerId }, _count: true }),
      prisma.review.groupBy({
        by: ["rating"],
        where: { ownerId, reviewedAt: { gte: startToday } },
        _count: true,
      }),
      prisma.review.findMany({
        where: { ownerId, reviewedAt: { gte: startToday } },
        select: { rating: true, stateBefore: true },
      }),
      prisma.card.count({ where: { ownerId, createdAt: { gte: startToday } } }),
      prisma.task.count({ where: { ownerId, completedAt: { gte: startToday } } }),
      readSettings(ownerId, [SETTING_KEYS.dailyGoal]),
      resolveStreakFor(ownerId, now),
    ]);

  const toCounts = (rows: { rating: number; _count: number }[]) =>
    Object.fromEntries(rows.map((r) => [r.rating, r._count]));

  const totalXp = xpFromRatingCounts(toCounts(allRatings));
  const reviewsAllTime = allRatings.reduce((sum, row) => sum + row._count, 0);
  const xpToday = xpFromRatingCounts(toCounts(todayRatings));
  const dailyGoal = dailyGoalFrom(settings[SETTING_KEYS.dailyGoal]);

  const questStats: QuestStats = {
    reviewsToday: todayReviews.length,
    xpToday,
    newCardsToday: todayReviews.filter((r) => r.stateBefore === 0).length,
    recalledToday: todayReviews.filter((r) => r.rating >= 3).length,
    cardsAddedToday,
    tasksDoneToday,
    dueRemaining: snapshot.dueCount,
    dailyGoal,
  };

  const key = dayKey(now);
  const quests = questsForDay(key, questStats);

  return {
    dayKey: key,
    streak: streakInfo.streak,
    shieldsAvailable: streakInfo.shieldsAvailable,
    dailyGoal,
    reviewsToday: questStats.reviewsToday,
    xpToday,
    totalXp,
    reviewsAllTime,
    level: levelFromXp(totalXp),
    quests,
    questsDone: quests.filter((q) => q.done).length,
    goalPct: Math.min(100, Math.round((questStats.reviewsToday / dailyGoal) * 100)),
    goalMet: questStats.reviewsToday >= dailyGoal,
  };
}

/**
 * Current streak, spending banked shields on any missed days.
 *
 * Lives here rather than in app/actions.ts so a Server Component can call it
 * without importing the whole action module; `resolveStreak` in actions.ts is
 * now a thin wrapper over it.
 */
export async function resolveStreakFor(ownerId: string, now = new Date()) {
  // Distinct *days*, not every review. The streak only cares whether a day had
  // any activity, and loading a year of rows to answer that meant somebody doing
  // sixty reviews a day pulled twenty thousand rows into memory on every render
  // — a query that gets slower the more the app is used, which is the worst
  // shape a query can have. At most 400 rows come back now.
  //
  // Returned as text, not as a date: the driver parses a Postgres `date` at
  // *local* midnight, so `toISOString()` on it reports the previous day anywhere
  // east of UTC, silently breaking the streak for a learner in Tallinn.
  const [days, settings] = await Promise.all([
    prisma.$queryRaw<{ day: string }[]>`
      SELECT DISTINCT TO_CHAR("reviewedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day
      FROM "Review"
      WHERE "ownerId" = ${ownerId}
        AND "reviewedAt" >= ${new Date(now.getTime() - 400 * 86_400_000)}
      ORDER BY day DESC
    `,
    readSettings(ownerId, [SETTING_KEYS.streakShields, SETTING_KEYS.streakShieldDates]),
  ]);

  const shieldsAvailable = numberSetting(settings[SETTING_KEYS.streakShields], 0);
  let shieldedDates: string[] = [];
  const raw = settings[SETTING_KEYS.streakShieldDates];
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) shieldedDates = parsed.filter((d): d is string => typeof d === "string");
    } catch {
      shieldedDates = [];
    }
  }

  const result = computeStreakWithShields(
    days.map((d) => new Date(`${d.day}T00:00:00.000Z`)), shieldsAvailable, shieldedDates, now,
  );

  if (result.newlyShieldedDates.length > 0) {
    await Promise.all([
      writeSetting(ownerId, SETTING_KEYS.streakShields, String(result.shieldsRemaining)),
      writeSetting(
        ownerId,
        SETTING_KEYS.streakShieldDates,
        JSON.stringify([...shieldedDates, ...result.newlyShieldedDates]),
      ),
    ]);
  }

  return { streak: result.streak, shieldsAvailable: result.shieldsRemaining };
}
