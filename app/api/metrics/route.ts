import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { HISTORY_DAYS, gatherImpact, learnerDays } from "@/lib/progress/impact";
import { MAX_LEARNER_SHARE, MIN_LEARNERS, MIN_REVIEWS } from "@/lib/research/corpus";
import {
  MILESTONES, MIN_COHORT, activitySummary, cohortRetention,
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
 * The impact block is the same rows read for a different reader. Retention,
 * study time and the conversations people report having outside the app are
 * what a grant application asks for, and `lib/research/impact.ts` puts them
 * under the disclosure floors the research export already uses, so a figure
 * small enough to be about a person is absent rather than small. That block
 * honors the research opt-out and the rest of this route does not, which is the
 * difference between a figure an operator reads about their own deployment and
 * a figure that leaves the building. `docs/23-impact.md` is how to quote it.
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

export async function GET(request: NextRequest) {
  if (!process.env.METRICS_TOKEN || !authorised(request)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const now = new Date();
  const since = new Date(now.getTime() - HISTORY_DAYS * 86_400_000);

  /*
    The operator's own block reads everybody, because it is this deployment
    looking at itself. The impact block is the one meant to be quoted outside,
    so it honors the research opt-out and reads the list first.
  */
  const learners = await learnerDays(since, []);

  const [words, cards] = await Promise.all([
    prisma.lexeme.count(),
    // "Known" is the scheduler's own opinion: a card it has stopped treating as
    // new and is not relearning. Derived, never stored (ADR-014).
    prisma.card.count({ where: { state: 2 } }),
  ]);

  const impact = await gatherImpact(now, learners);

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
      impact: {
        ...impact,
        note:
          `Every figure here rests on at least ${MIN_LEARNERS} people and at least ` +
          `${MIN_REVIEWS} records, with no one person supplying more than ` +
          `${Math.round(MAX_LEARNER_SHARE * 100)}% of it. A figure below that is a word ` +
          "saying why, never a number. Head counts are bands. Anyone can leave their own " +
          "rows out of this in Settings, and those rows are not read rather than subtracted.",
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
