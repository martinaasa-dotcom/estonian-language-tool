/**
 * THE DATABASE HALF OF THE IMPACT REPORT.
 *
 * `lib/research/impact.ts` is pure and decides what may be published;
 * everything here is the reading that feeds it. It lives in `lib/progress/`
 * for the reason that directory exists at all: `lib/research/` promises to
 * import no Prisma, and the two readers of these figures are a Route Handler
 * (`/api/metrics`) and a command (`npm run report:impact`), which would
 * otherwise hold two copies of the same six queries and drift apart on the
 * first one somebody corrected.
 *
 * GROUPED IN POSTGRES, NEVER IN NODE. Each query returns one row per learner,
 * which is proportional to how many people there are rather than to the size of
 * the review log, and is also the finest thing the dominance rule can be
 * answered from. No individual review is materialized in this process. That is
 * `/api/research`'s rule and it is this file's rule too, because `Review` is the
 * largest table in the schema and there is no version of this report worth
 * reading every row for.
 *
 * THE OPT-OUT IS IN THE QUERIES. Settings lets anybody keep their own rows out
 * of research, and the rule is that the rows are never read rather than
 * subtracted afterwards. So the exclusion is spliced into every query here
 * separately, including the retention scan, and `gatherImpact` reads the list
 * before it reads anything else.
 */
import { Prisma } from "@prisma/client";

import { OUTCOMES, isConversation } from "@/lib/collections/errands";
import { prisma } from "@/lib/db";
import {
  summariseImpact, type EncounterTotals, type Impact, type LearnerTotals,
} from "@/lib/research/impact";
import { SETTING_KEYS } from "@/lib/settings/store";
import { MAX_CARD_MS, SESSION_GAP_MS } from "@/lib/stats/pace";
import { cohortRetention, type LearnerActivity } from "@/lib/stats/retention";

const DAY_MS = 86_400_000;

/**
 * How much history a cohort table is drawn over.
 *
 * A year and a bit: enough for a D30 curve with room to see a trend, and
 * bounded so the read stays one indexed range scan.
 */
export const HISTORY_DAYS = 400;

/**
 * How far back "active" reaches.
 *
 * Thirty days, which is the window the activity summary already calls MAU, so
 * somebody reading both figures is reading one population.
 */
export const IMPACT_WINDOW_DAYS = 30;

/** The outcomes that are a conversation, decided by `isConversation` and nowhere else. */
const CONVERSATION_OUTCOMES = OUTCOMES.filter(isConversation);

/** A `NOT IN` over the opt-out list, or nothing at all when nobody opted out. */
function excluding(column: Prisma.Sql, excluded: readonly string[]): Prisma.Sql {
  return excluded.length > 0
    ? Prisma.sql`AND ${column} NOT IN (${Prisma.join([...excluded])})`
    : Prisma.empty;
}

/**
 * One row per learner per day they reviewed.
 *
 * The order is stated rather than left to the planner, because the first day of
 * each list is read as that person's first review ever and a list that came
 * back in another order would put somebody in the wrong cohort for good.
 */
export async function learnerDays(
  since: Date,
  excluded: readonly string[],
): Promise<LearnerActivity[]> {
  const rows = await prisma.$queryRaw<{ ownerId: string; day: string }[]>`
    SELECT DISTINCT r."ownerId" AS "ownerId",
           TO_CHAR(r."reviewedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day
    FROM "Review" r
    WHERE r."reviewedAt" >= ${since}
    ${excluding(Prisma.sql`r."ownerId"`, excluded)}
    ORDER BY "ownerId", day
  `;

  const byOwner = new Map<string, string[]>();
  for (const row of rows) {
    const days = byOwner.get(row.ownerId);
    if (days) days.push(row.day);
    else byOwner.set(row.ownerId, [row.day]);
  }

  const learners: LearnerActivity[] = [];
  for (const days of byOwner.values()) {
    const firstDay = days[0];
    if (!firstDay) continue;
    learners.push({ firstDay, activeDays: days });
  }
  return learners;
}

/** Who asked to be left out of research. Read before anything else is read. */
export async function researchExcluded(): Promise<string[]> {
  const rows = await prisma.setting.findMany({
    where: { key: SETTING_KEYS.researchOptOut, value: "1" },
    select: { ownerId: true },
  });
  return rows.map((row) => row.ownerId);
}

/**
 * The figures a grant application asks for.
 *
 * `cohortSource` is an optimization and nothing else: `/api/metrics` has
 * already read the learner-day list for its own retention block, and where
 * nobody has opted out that read is the same read this one would make. With
 * anybody on the list it is not, so the query runs again carrying the
 * exclusion. The caller cannot use it to widen anything: a source handed in
 * while somebody is opted out is ignored.
 */
export async function gatherImpact(
  now: Date,
  cohortSource: LearnerActivity[] | null = null,
): Promise<Impact> {
  const excluded = await researchExcluded();
  const since = new Date(now.getTime() - HISTORY_DAYS * DAY_MS);
  const windowStart = new Date(now.getTime() - IMPACT_WINDOW_DAYS * DAY_MS);

  /*
    Study time the way `lib/stats/pace.ts` reads it: the run of answers with no
    gap longer than `SESSION_GAP_MS`, counted from the first card to the last
    plus the first card's own time. Summing card durations alone calls a forty
    minute evening twelve minutes, which is the figure a funder would be handed.
    The window function does that per learner in one pass, so the gaps never
    leave Postgres.
  */
  const totals = await prisma.$queryRaw<
    { learner: string; reviews: number; recentReviews: number; studyMs: number }[]
  >`
    SELECT s."ownerId" AS "learner",
           COUNT(*)::int AS "reviews",
           COUNT(*) FILTER (WHERE s."reviewedAt" >= ${windowStart})::int AS "recentReviews",
           (
             SUM(CASE WHEN s.gap IS NOT NULL AND s.gap <= ${SESSION_GAP_MS} THEN s.gap ELSE 0 END)
             + SUM(CASE WHEN s.gap IS NULL OR s.gap > ${SESSION_GAP_MS}
                        THEN LEAST(GREATEST(s."durationMs", 0), ${MAX_CARD_MS}) ELSE 0 END)
           )::float8 AS "studyMs"
    FROM (
      SELECT r."ownerId", r."reviewedAt", r."durationMs",
             EXTRACT(EPOCH FROM (
               r."reviewedAt"
               - LAG(r."reviewedAt") OVER (PARTITION BY r."ownerId" ORDER BY r."reviewedAt", r."id")
             )) * 1000 AS gap
      FROM "Review" r
      WHERE TRUE
      ${excluding(Prisma.sql`r."ownerId"`, excluded)}
    ) s
    GROUP BY s."ownerId"
  `;

  /*
    Words known is the scheduler's own opinion, a card it has stopped treating
    as new, counted as distinct entries rather than as cards: one word carries a
    recognition card, a production card and up to eleven case cards, so counting
    rows would report the machinery. `COUNT(DISTINCT)` in Postgres rather than
    Prisma's `distinct`, which deduplicates in the client and would read every
    matching card into this process.
  */
  const known = await prisma.$queryRaw<{ learner: string; words: number }[]>`
    SELECT c."ownerId" AS "learner",
           COUNT(DISTINCT c."lexemeId")::int AS "words"
    FROM "Card" c
    WHERE c."state" = 2 AND c."lexemeId" IS NOT NULL
    ${excluding(Prisma.sql`c."ownerId"`, excluded)}
    GROUP BY c."ownerId"
  `;

  /*
    And the one this app says it is measured by. A day that was answered is not
    a day that held a conversation, so the two columns are counted apart: the
    reports are every day somebody answered the question, and the conversations
    are the answers `isConversation` reads as one.
  */
  const encounters = await prisma.$queryRaw<
    { learner: string; reports: number; conversations: number }[]
  >`
    SELECT e."ownerId" AS "learner",
           COUNT(*)::int AS "reports",
           COUNT(*) FILTER (
             WHERE e."outcome" IN (${Prisma.join([...CONVERSATION_OUTCOMES])})
           )::int AS "conversations"
    FROM "Encounter" e
    WHERE TRUE
    ${excluding(Prisma.sql`e."ownerId"`, excluded)}
    GROUP BY e."ownerId"
  `;

  const wordsBy = new Map(known.map((row) => [row.learner, row.words]));
  const learners: LearnerTotals[] = totals.map((row) => ({
    learner: row.learner,
    reviews: row.reviews,
    recentReviews: row.recentReviews,
    studyHours: Number(row.studyMs) / 3_600_000,
    wordsKnown: wordsBy.get(row.learner) ?? 0,
  }));
  const reported: EncounterTotals[] = encounters.map((row) => ({
    learner: row.learner,
    reports: row.reports,
    conversations: row.conversations,
  }));

  const days =
    excluded.length === 0 && cohortSource ? cohortSource : await learnerDays(since, excluded);

  return summariseImpact({
    generatedAt: now,
    windowDays: IMPACT_WINDOW_DAYS,
    learners,
    encounters: reported,
    cohorts: cohortRetention(days, now),
  });
}
