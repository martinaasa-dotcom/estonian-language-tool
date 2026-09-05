import { prisma } from "@/lib/db";
import { dictionaryLemmas, gradedLemmas, lemmasByCardLexeme } from "@/lib/dict/facts";
import { PATH, unitProgress, type PathUnit, type UnitProgress } from "@/lib/collections/syllabus";
import { computeStreakWithShields } from "@/lib/stats/streak";
import {
  dailyGoalFrom, numberSetting, readSettings, SETTING_KEYS, writeSetting,
} from "@/lib/settings/store";
import { dayClock, type DayClock } from "@/lib/time/day";
import { isLearningWord, LADDER_CARD_TYPE } from "@/lib/learn/ladder";

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
  /**
   * Cards Practice will actually serve: due, seen before, and not a word Learn
   * still has hold of.
   *
   * The last clause is why this is not simply `due <= now && state !== 0`. The
   * ladder walks a new word on its recognition card and the scheduler puts
   * that card ten minutes out between rungs, so a word being learned this
   * evening is technically due. Counting it here would put a number on Today
   * that the review queue then refuses to fill, which is the worst kind of
   * wrong: it looks like a counting fault in the app rather than a rule.
   */
  dueCount: number;
  /**
   * Unseen cards Practice will introduce: the ones belonging to words the
   * ladder has finished with.
   *
   * Every card of a word arrives unseen in one insert, so a deck of fifty words
   * holds hundreds of these and almost all of them are Learn's. Counting the
   * lot would put a number on Today that the review queue refuses to fill,
   * which is the fault `dueCount` is written the way it is to avoid.
   */
  newForPractice: number;
  /**
   * Words waiting on the Learn ladder, counted as words rather than cards.
   *
   * `newCount` below is cards, which is the right unit for "how much is in
   * this deck" and the wrong one for a screen offering to teach five things:
   * one word is a recognition card, a production card and up to eight more, so
   * a card count reads as ten times the work.
   */
  learnCount: number;
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
      // `cardType` rides along for the ladder count: which card a word is
      // being learned on is a fact about the card type (lib/learn/ladder.ts),
      // and asking for it separately would be a second read of the same rows.
      select: { state: true, due: true, suspended: true, lexemeId: true, cardType: true },
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
  let newForPractice = 0;
  let learnCount = 0;
  let knownCards = 0;

  /*
    Which words the ladder still has hold of, read off the rows already
    fetched. The review queue asks the database the same question with a `none`
    clause; here the whole deck is in hand, so it is one pass over it.
  */
  const onLadder = new Set<string>();
  for (const card of cards) {
    if (card.cardType === LADDER_CARD_TYPE && isLearningWord(card.state) && card.lexemeId) {
      onLadder.add(card.lexemeId);
    }
  }

  for (const card of cards) {
    if (card.state === KNOWN_STATE) knownCards++;
    if (!card.suspended) {
      const ladderCard = card.cardType === LADDER_CARD_TYPE && isLearningWord(card.state);
      if (ladderCard) learnCount++;
      if (card.state === 0) {
        newCount++;
        if (!onLadder.has(card.lexemeId ?? "")) newForPractice++;
      // The same line the review queue draws, for the reason `dueCount` gives.
      } else if (card.due <= now && !ladderCard) dueCount++;
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
    newForPractice,
    learnCount,
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
  /**
   * Every review this learner has ever graded.
   *
   * One aggregate rather than a query of its own: `lib/ux/disclosure.ts`
   * decides how much of the app a screen leads with from it, and a second
   * query to answer "has this person started yet" would be a query on every
   * render of the busiest page in the app.
   */
  reviewsAllTime: number;
  goalPct: number;
  goalMet: boolean;
}

/**
 * Everything the Today screen leads with, derived from the append-only review
 * log on every request rather than counted into a column (ADR-014).
 */
export async function dailySummary(
  ownerId: string,
  now = new Date(),
  clock: DayClock = dayClock(),
): Promise<DailySummary> {
  const startToday = clock.startOfDay(now);

  /*
    Four counts where there used to be seven reads.

    Two of the old queries loaded every rating this learner has ever given,
    grouped, so XP could be summed from them, and two more counted the cards
    added and the tasks finished today for the three daily quests. XP and the
    quests are gone, and what is left of them is a number of rows, which
    Postgres counts without sending any.
  */
  const [reviewsAllTime, reviewsToday, settings, streakInfo] = await Promise.all([
    prisma.review.count({ where: { ownerId } }),
    prisma.review.count({ where: { ownerId, reviewedAt: { gte: startToday } } }),
    readSettings(ownerId, [SETTING_KEYS.dailyGoal]),
    resolveStreakFor(ownerId, now, clock),
  ]);

  const dailyGoal = dailyGoalFrom(settings[SETTING_KEYS.dailyGoal]);

  return {
    dayKey: clock.dayKey(now),
    streak: streakInfo.streak,
    shieldsAvailable: streakInfo.shieldsAvailable,
    dailyGoal,
    reviewsToday,
    reviewsAllTime,
    goalPct: Math.min(100, Math.round((reviewsToday / dailyGoal) * 100)),
    goalMet: reviewsToday >= dailyGoal,
  };
}

/**
 * The streak lengths that bank a shield, one each, once.
 *
 * The same three the badges paid out on, kept where the streak is resolved
 * rather than where a shelf was drawn.
 */
export const SHIELD_MILESTONES = [7, 30, 100] as const;

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
    readSettings(ownerId, [
      SETTING_KEYS.streakShields, SETTING_KEYS.streakShieldDates, SETTING_KEYS.streakShieldsAwarded,
    ]),
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

  /*
    A SHIELD IS BANKED BY THE STREAK ITSELF NOW.

    It used to arrive on the side of a badge: `awardBadges` saw `streak_7`,
    `streak_30` or `streak_100` become true and paid one out, and the
    `Achievement` row it had just written was what stopped it being paid again
    on the next render. The badges were withdrawn and the shields were not, so
    without this the one thing that protects a streak could no longer be
    earned, which is the shape of dead feature nothing reports: the panel
    would go on saying "0 banked" for ever and read as somebody's own fault.

    The high-water mark replaces the row and is a number rather than a set,
    because the milestones are a ladder: reaching 30 means 7 was passed on the
    way, so one comparison says how many are owed even to somebody who first
    opened the app after a fortnight of reviews landed in a restore.
  */
  const awardedTo = numberSetting(settings[SETTING_KEYS.streakShieldsAwarded], 0);
  const earned = SHIELD_MILESTONES.filter((m) => m > awardedTo && result.streak >= m);
  const shields = result.shieldsRemaining + earned.length;

  const writes: Promise<unknown>[] = [];
  if (result.newlyShieldedDates.length > 0) {
    writes.push(writeSetting(
      ownerId,
      SETTING_KEYS.streakShieldDates,
      JSON.stringify([...shieldedDates, ...result.newlyShieldedDates]),
    ));
  }
  if (result.newlyShieldedDates.length > 0 || earned.length > 0) {
    writes.push(writeSetting(ownerId, SETTING_KEYS.streakShields, String(shields)));
  }
  if (earned.length > 0) {
    writes.push(writeSetting(
      ownerId,
      SETTING_KEYS.streakShieldsAwarded,
      String(earned[earned.length - 1]),
    ));
  }
  if (writes.length > 0) await Promise.all(writes);

  return { streak: result.streak, shieldsAvailable: shields };
}
