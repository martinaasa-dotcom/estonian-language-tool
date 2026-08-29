import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import {
  MILESTONES, MIN_COHORT, activitySummary, cohortRetention, type LearnerActivity,
} from "@/lib/stats/retention";

/**
 * Whether people come back, computed from the review log.
 *
 * There is no analytics vendor here and no tracking to add one. `Review` is
 * append-only and every row already carries an owner and a timestamp, so
 * retention is a derivation over data the app keeps anyway, in the same way XP
 * and streaks are (ADR-014). Nothing new is collected about anybody to produce
 * these numbers.
 *
 * Everything that leaves this route is an aggregate. No owner id, no email, no
 * word anyone searched, no answer anyone gave, and cohorts below MIN_COHORT
 * report their size but not their rates, because "one of two people came back"
 * is a fact about a person rather than a statistic.
 *
 * A route rather than a page, so none of it can be pulled into a client bundle,
 * and behind a token so it is not a public description of how the product is
 * doing. With no token configured it does not exist: a 404 rather than a 401,
 * because an unconfigured deployment should not advertise the endpoint.
 */
export const dynamic = "force-dynamic";

function authorised(request: NextRequest): boolean {
  const expected = process.env.METRICS_TOKEN;
  if (!expected) return false;

  const header = request.headers.get("authorization") ?? "";
  const offered = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!offered) return false;

  // Same length before comparing, because timingSafeEqual throws on a mismatch
  // and the throw itself would leak the length.
  const a = Buffer.from(offered);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const DAY_MS = 86_400_000;

export async function GET(request: NextRequest) {
  if (!process.env.METRICS_TOKEN || !authorised(request)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const now = new Date();
  // A year and a bit of history: enough for a D30 curve with room to see a
  // trend, and bounded so this stays one indexed range scan.
  const since = new Date(now.getTime() - 400 * DAY_MS);

  /*
    One row per learner per day they reviewed. Grouping in Postgres rather than
    streaming every review into Node keeps this proportional to active days
    rather than to the size of the log, and it never materialises an individual
    review here.
  */
  const rows = await prisma.$queryRaw<{ ownerId: string; day: string }[]>`
    SELECT DISTINCT "ownerId",
           TO_CHAR("reviewedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day
    FROM "Review"
    WHERE "reviewedAt" >= ${since}
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

  const [words, cards] = await Promise.all([
    prisma.lexeme.count(),
    // "Known" is the scheduler's own opinion: a card it has stopped treating as
    // new and is not relearning. Derived, never stored (ADR-014).
    prisma.card.count({ where: { state: 2 } }),
  ]);

  return NextResponse.json(
    {
      generatedAt: now.toISOString(),
      definitions: {
        retention:
          "Weekly cohorts by first review. A learner counts as returning if they " +
          "reviewed inside the bracket, which widens with distance.",
        milestones: MILESTONES,
        minimumCohort: MIN_COHORT,
        note:
          "A null rate means unanswerable, never zero: the cohort is either too " +
          "small to report or too young to have reached the milestone.",
      },
      learners: learners.length,
      activity: activitySummary(learners, now),
      cohorts: cohortRetention(learners, now),
      dictionary: { words, cardsKnown: cards },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
