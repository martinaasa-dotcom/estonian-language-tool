import { prisma } from "@/lib/db";
import { computeStreak } from "@/lib/stats/streak";
import { caseAccuracy } from "@/lib/stats/history";
import { dayClock } from "@/lib/time/day";
import { SETTING_KEYS } from "@/lib/settings/store";
import { assessReadiness, type PastAttempt, type ReadinessSignals } from "@/lib/exam/readiness";
import { EXAM_LEVELS, type ExamLevel } from "@/lib/exam/spec";
import {
  ATTEMPT_WINDOW, MATURE_STATE, partPercentages, skillEvidenceFrom,
} from "@/lib/progress/exam";
import { knownLemmasFrom } from "@/lib/progress/summary";
import { gradedLemmas, lemmaCountsByLevel } from "@/lib/dict/facts";
import { summariseCohort, type CohortInput, type CohortSummary } from "./cohort";

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
    weekCount: number;
    caseReviews: { targetCase: string | null; rating: number }[];
  }>();
  for (const id of ids) byOwner.set(id, { dates: [], weekCount: 0, caseReviews: [] });

  for (const review of reviews) {
    const entry = byOwner.get(review.ownerId);
    if (!entry) continue;
    entry.dates.push(review.reviewedAt);
    entry.caseReviews.push({ targetCase: review.targetCase, rating: review.rating });
    if (review.reviewedAt >= weekAgo) entry.weekCount++;
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
      reviewsThisWeek: stats.weekCount,
      streak: computeStreak(stats.dates, now, dayClock(zoneByOwner.get(member.ownerId))),
      wordsKnown: knownByOwner.get(member.ownerId) ?? 0,
      daysSinceLastReview: last
        ? Math.floor((now.getTime() - last.getTime()) / 86_400_000)
        : null,
      weakestCase: weakest ?? null,
    };
  });

  /*
    Ordered by what somebody did this week, which is what this board was
    counting all along. It used to be a weekly XP total, and XP was that same
    count with a rating weighting over it, so the order barely moves and the
    number now says what it is: answers given, in a week.
  */
  entries.sort((a, b) => b.reviewsThisWeek - a.reviewsThisWeek || a.displayName.localeCompare(b.displayName));

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

// ── The same group, seen by whoever is paying for it ─────────────────────────

/**
 * How far back a cohort's accuracy and skill figures are read.
 *
 * `readinessSignals` bounds one learner's own history with a row cap, the most
 * recent twenty thousand. A cap cannot be applied per member in one query, and
 * a single cap across the group would be worse than useless: it would be spent
 * on whoever reviews most, so a quiet member's figures would be computed from
 * nothing while a busy one's used a year. A window is the same for everybody,
 * which is the property a figure needs before it can be printed down a column
 * beside several names.
 *
 * A year, because that is longer than any sponsorship this is built for and
 * short enough that somebody's first fortnight two years ago is not still
 * counting against them.
 */
export const COHORT_WINDOW_DAYS = 365;

/**
 * What a sponsor sees, in a fixed number of queries whatever the cohort size.
 *
 * Eight queries for eight people or for eighty. The per-member alternative is
 * `readinessSignals` in a loop, which is nine queries each and several of them
 * over the review log: the shape this repository has already measured at 330
 * queries where five would do.
 *
 * IT NEVER READS A CASE. `classRoster` above selects `targetCase` because a
 * teacher is shown which case each student keeps missing. Nothing here selects
 * it, `cases` goes to `assessReadiness` empty, and the summary it feeds has
 * nowhere to put one. That is the boundary between the two seats, and it is a
 * query rather than a rendering choice so that a later screen cannot undo it by
 * printing a field it happens to find. The cost is that this group's readiness
 * carries no case advice, which is correct: an employer has no lesson to plan.
 */
export async function workplaceRoster(
  classroomId: string,
  level: ExamLevel,
  now = new Date(),
): Promise<CohortSummary> {
  const members = await prisma.classroomMember.findMany({
    where: { classroomId },
    orderBy: [{ joinedAt: "asc" }, { ownerId: "asc" }],
    select: { ownerId: true, displayName: true },
  });
  if (members.length === 0) return summariseCohort([], level);

  const ids = members.map((m) => m.ownerId);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const windowStart = new Date(now.getTime() - COHORT_WINDOW_DAYS * 86_400_000);

  const [cards, available, lexemeLevels, reviews, totals, attemptRows, placements] =
    await Promise.all([
      prisma.card.findMany({
        where: { ownerId: { in: ids } },
        select: { id: true, ownerId: true, cardType: true, state: true, lexeme: { select: { lemma: true } } },
      }),
      /*
        Both of these are facts about the shared dictionary rather than about
        anybody in this group, so they come from the same cache
        `readinessSignals` reads them through. Asking here directly would be
        the whole lemma table again, once per render of a screen a sponsor
        opens as often as a learner opens Today.
      */
      lemmaCountsByLevel(),
      gradedLemmas(),
      prisma.review.findMany({
        where: { ownerId: { in: ids }, reviewedAt: { gte: windowStart } },
        // No `targetCase`. See the header: the boundary is what this selects.
        select: { ownerId: true, rating: true, stateBefore: true, cardId: true, reviewedAt: true },
      }),
      /*
        All-time count and last review, in one grouped read.

        The count has to be all-time rather than windowed because it is what
        `evidenceFrom` turns into a tier, and a learner whose own examination
        hub says "good evidence" being called "too early to say" on a
        colleague's screen is the two-answers-to-one-question fault this
        repository keeps finding. The last review is here for the same reason:
        somebody who stopped thirteen months ago has a real last-seen date and
        the window would report them as never having reviewed at all.
      */
      prisma.review.groupBy({
        by: ["ownerId"],
        where: { ownerId: { in: ids } },
        _count: true,
        _max: { reviewedAt: true },
      }),
      prisma.examAttempt.findMany({
        where: { ownerId: { in: ids } },
        orderBy: [{ finishedAt: "desc" }, { id: "asc" }],
        select: { ownerId: true, level: true, pct: true, passed: true, finishedAt: true, result: true },
      }),
      prisma.assessment.findMany({
        where: { ownerId: { in: ids } },
        orderBy: [{ takenAt: "desc" }, { id: "asc" }],
        select: {
          ownerId: true, takenAt: true, answered: true,
          reading: true, listening: true, writing: true,
        },
      }),
    ]);

  const cardsBy = groupBy(cards, (c) => c.ownerId);
  const reviewsBy = groupBy(reviews, (r) => r.ownerId);
  const attemptsBy = groupBy(attemptRows, (a) => a.ownerId);
  const countBy = new Map(totals.map((t) => [t.ownerId, t._count]));
  const lastBy = new Map(totals.map((t) => [t.ownerId, t._max.reviewedAt]));
  const placementBy = new Map<string, (typeof placements)[number]>();
  // Ordered most recent first above, so the first one seen per owner is theirs.
  for (const row of placements) if (!placementBy.has(row.ownerId)) placementBy.set(row.ownerId, row);

  const availableBy = available;

  const input: CohortInput[] = members.map((member) => {
    const own = cardsBy.get(member.ownerId) ?? [];
    const ownReviews = reviewsBy.get(member.ownerId) ?? [];
    const attempts: PastAttempt[] = (attemptsBy.get(member.ownerId) ?? [])
      .slice(0, ATTEMPT_WINDOW)
      .map((row) => ({
        level: row.level as ExamLevel,
        pct: row.pct,
        passed: row.passed,
        at: row.finishedAt.toISOString(),
        parts: partPercentages(row.result),
      }));

    const known = knownLemmasFrom(
      own.map((card) => ({ state: card.state, lemma: card.lexeme?.lemma ?? null })),
    );
    const vocabulary = {} as ReadinessSignals["vocabulary"];
    for (const band of EXAM_LEVELS) {
      vocabulary[band] = { known: 0, available: availableBy.get(band) ?? 0 };
    }
    for (const row of lexemeLevels) {
      if (!row.cefr || !(row.cefr in vocabulary)) continue;
      if (known.has(row.lemma)) vocabulary[row.cefr as ExamLevel].known += 1;
    }

    const mature = ownReviews.filter((r) => r.stateBefore >= MATURE_STATE);
    const recalled = mature.filter((r) => r.rating >= 3).length;
    const placement = placementBy.get(member.ownerId);
    const last = lastBy.get(member.ownerId) ?? null;

    const signals: ReadinessSignals = {
      vocabulary,
      accuracy: {
        pct: mature.length === 0 ? 0 : Math.round((recalled / mature.length) * 100),
        reviews: mature.length,
      },
      // Empty, and not because there is nothing to put here. See the header.
      cases: [],
      skills: skillEvidenceFrom(own, ownReviews, attempts),
      attempts,
      placement: placement
        ? {
            at: placement.takenAt.toISOString(),
            skills: {
              reading: placement.reading,
              listening: placement.listening,
              writing: placement.writing,
              // The check's speaking figure is the learner's own rating and is
              // never read as a level of ours (ADR-018).
              speaking: null,
            },
            answered: placement.answered,
          }
        : null,
      totalReviews: countBy.get(member.ownerId) ?? 0,
    };

    return {
      ownerId: member.ownerId,
      displayName: member.displayName,
      readiness: signals.totalReviews === 0 ? null : assessReadiness(signals),
      reviewsThisWeek: ownReviews.filter((r) => r.reviewedAt >= weekAgo).length,
      daysSinceLastReview: last === null
        ? null
        : Math.floor((now.getTime() - last.getTime()) / 86_400_000),
    };
  });

  return summariseCohort(input, level);
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const at = key(row);
    const bucket = out.get(at);
    if (bucket) bucket.push(row);
    else out.set(at, [row]);
  }
  return out;
}
