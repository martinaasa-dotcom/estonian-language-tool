import { prisma } from "@/lib/db";
import { dictionaryLemmas, gradedLemmas, lemmasByCardLexeme } from "@/lib/dict/facts";
import { PATH, unitProgress, type PathUnit, type UnitProgress } from "@/lib/collections/syllabus";
import { computeStreakWithShields } from "@/lib/achievements/badges";
import { levelFromXp, xpFromRatingCounts, type LevelInfo } from "@/lib/gamification/xp";
import { questsForDay, type Quest, type QuestStats } from "@/lib/gamification/quests";
import {
  dailyGoalFrom, numberSetting, readSettings, SETTING_KEYS, writeSetting,
} from "@/lib/settings/store";
import { dayClock, type DayClock } from "@/lib/time/day";

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

/**
 * Which lemmas count as known, out of cards already loaded.
 *
 * A lemma is known when *every* card of it has reached the Known state, which
 * is a stricter rule than it looks: a word whose recognition card has stuck and
 * whose production card has not is a word you can read and cannot write, and
 * counting it would overstate the deck.
 *
 * Split out of `deckSnapshot` because the cohort roster needs the same answer
 * for several learners at once and gets its cards from one batched query
 * (lib/classroom/roster.ts). Two readings of "known" would be two vocabulary
 * figures for one deck, and the one on a colleague's screen would be the one
 * nobody could check.
 */
export function knownLemmasFrom(cards: { state: number; lemma: string | null }[]): Set<string> {
  const perLemma = new Map<string, { total: number; known: number }>();
  for (const card of cards) {
    if (!card.lemma) continue;
    const entry = perLemma.get(card.lemma) ?? { total: 0, known: 0 };
    entry.total++;
    if (card.state === KNOWN_STATE) entry.known++;
    perLemma.set(card.lemma, entry);
  }
  const out = new Set<string>();
  for (const [lemma, entry] of perLemma) {
    if (entry.total > 0 && entry.known === entry.total) out.add(lemma);
  }
  return out;
}

export async function deckSnapshot(ownerId: string, now = new Date()): Promise<DeckSnapshot> {
  /*
    `lexemeId` and a lookup, not `lexeme: { select: { lemma: true } }`.

    That relation reads as part of this query and is a second one: Prisma
    fetches the cards, collects their lexeme ids and sends them all back to
    ask for the lemmas. Two round trips and a deck's worth of uuids on the
    wire, on the five screens that call this. `lemmasByCardLexeme` answers out
    of the dictionary every request already shares, and asks only about what
    it does not know. See lib/dict/facts.ts.
  */
  const [cards] = await Promise.all([
    prisma.card.findMany({
      where: { ownerId },
      select: { state: true, due: true, suspended: true, lexemeId: true },
    }),
    // Beside the deck rather than after it. On a warm instance this is free;
    // on a cold one it is the query that fills the cache, and paying for it
    // here rather than on the line below keeps the round trips at one.
    gradedLemmas(),
  ]);
  const entries = await lemmasByCardLexeme(cards.map((card) => card.lexemeId));

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
    const lemma = card.lexemeId === null ? undefined : entries.get(card.lexemeId)?.lemma;
    if (!lemma) continue;
    const entry = perLemma.get(lemma) ?? { total: 0, known: 0 };
    entry.total++;
    if (card.state === KNOWN_STATE) entry.known++;
    perLemma.set(lemma, entry);
  }

  return {
    totalCards: cards.length,
    dueCount,
    newCount,
    knownCards,
    startedLemmas: new Set(perLemma.keys()),
    // Through the shared rule rather than a second copy of it, for the reason
    // written above `knownLemmasFrom`. The lemma comes from the same lookup the
    // loop above uses, since the card rows carry an id rather than a relation.
    knownLemmas: knownLemmasFrom(
      cards.map((card) => ({
        state: card.state,
        lemma: card.lexemeId === null ? null : entries.get(card.lexemeId)?.lemma ?? null,
      })),
    ),
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
  /*
    Which of the course's words the dictionary holds is a fact about the
    dictionary, not about this learner, and it was an `IN` of every lemma in
    the course on every render of every course screen. Today ran it three
    times in one pass. It is a membership test against a set the whole
    deployment shares now: lib/dict/facts.ts.
  */
  const [snap, available] = await Promise.all([
    snapshot ?? deckSnapshot(ownerId),
    dictionaryLemmas(),
  ]);

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
  clock: DayClock = dayClock(),
): Promise<DailySummary> {
  const startToday = clock.startOfDay(now);

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
      resolveStreakFor(ownerId, now, clock),
    ]);

  const toCounts = (rows: { rating: number; _count: number }[]) =>
    Object.fromEntries(rows.map((r) => [r.rating, r._count]));

  const totalXp = xpFromRatingCounts(toCounts(allRatings));
  const reviewsAllTime = allRatings.reduce((sum, row) => sum + row._count, 0);
  const xpToday = xpFromRatingCounts(toCounts(todayRatings));
  const dailyGoal = dailyGoalFrom(settings[SETTING_KEYS.dailyGoal]);

  const questStats: QuestStats = {
    reviewsToday: todayReviews.length,
    newCardsToday: todayReviews.filter((r) => r.stateBefore === 0).length,
    recalledToday: todayReviews.filter((r) => r.rating >= 3).length,
    cardsAddedToday,
    tasksDoneToday,
    dueRemaining: snapshot.dueCount,
    dailyGoal,
  };

  const key = clock.dayKey(now);
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
export async function resolveStreakFor(
  ownerId: string,
  now = new Date(),
  clock: DayClock = dayClock(),
) {
  // Distinct *days*, not every review. The streak only cares whether a day had
  // any activity, and loading a year of rows to answer that meant somebody doing
  // sixty reviews a day pulled twenty thousand rows into memory on every render
  // — a query that gets slower the more the app is used, which is the worst
  // shape a query can have. At most 400 rows come back now.
  //
  // Returned as text, not as a date: the driver parses a Postgres `date` at
  // *local* midnight, so `toISOString()` on it reports the previous day anywhere
  // east of UTC, silently breaking the streak for a learner in Tallinn.
  //
  // And bucketed in the learner's zone rather than in UTC, which is the same
  // fault one layer along. Somebody in Tallinn who studied on Monday morning,
  // at one on Tuesday morning and again on Wednesday morning kept a three-day
  // streak; in UTC days that reads as Monday, Monday and Wednesday, so the app
  // reported a streak of 1 and spent a banked shield bridging a Tuesday they
  // had not missed. Postgres knows the same IANA names `Intl` does, so the
  // keys it come back with and the ones `clock` derives are the same keys —
  // which is why they go straight into the streak rather than back through a
  // Date.
  //
  // TWO `AT TIME ZONE`s, AND THE FIRST ONE IS NOT DECORATION. Prisma maps
  // `DateTime` to `timestamp without time zone`, so this column holds a UTC
  // wall clock with nothing recording that it is one. On a naive timestamp
  // `AT TIME ZONE z` *interprets* the value as being in `z` rather than
  // converting it into `z`, which is the opposite direction: one alone read
  // 22:00 UTC as 22:00 in Tallinn and filed it under the wrong day. So the
  // first labels the column as the UTC it actually is, and the second converts
  // that instant into the learner's zone.
  //
  // The single `AT TIME ZONE 'UTC'` this replaces was the same mistake in a
  // shape that hid: it returns a `timestamptz`, which `TO_CHAR` then renders
  // in the *session's* TimeZone, so the streak's day boundary was a property
  // of how the database happened to be configured. Correct on a UTC session
  // and silently a day out on any other.
  const [days, settings] = await Promise.all([
    prisma.$queryRaw<{ day: string }[]>`
      SELECT DISTINCT
        TO_CHAR(("reviewedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${clock.zoneName}, 'YYYY-MM-DD') AS day
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
    days.map((d) => d.day), shieldsAvailable, shieldedDates, now, clock,
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
