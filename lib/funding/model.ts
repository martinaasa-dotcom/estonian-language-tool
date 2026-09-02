/**
 * What a month of this app costs, at whatever size somebody puts in.
 *
 * The point of writing this down as arithmetic rather than as a sentence is
 * that a sentence cannot be argued with. Every input is on the page, every
 * assumption is named, and a reader who thinks fifteen reviews a day is wrong
 * for their class can move it and watch the bill move. A funder reading "it
 * costs about seventy dollars a month" has to trust us; a funder who can see
 * which line grows fastest and where the next cliff is does not have to.
 *
 * THIS MODULE NAMES NO SERVICE. It works out how much of everything a month
 * contains and then asks each entry in `services.ts` what that costs. Adding a
 * new tool is one entry there, and the bill, the totals, the chart and the
 * page all pick it up, because none of them holds a list of its own.
 *
 * THREE KINDS OF NUMBER GO IN, AND THEY ARE NOT EQUALLY SOLID.
 *
 *   Measured      `facts.ts`, taken off this repository on a stated day.
 *   Published     `facts.ts`, off a vendor's own pricing page on a stated day.
 *   Assumed       `ASSUMPTIONS` in `facts.ts`, and nothing else.
 *
 * WHAT THIS DELIBERATELY DOES NOT MODEL. Anybody's time, which is the largest
 * real cost of this project and is not a hosting bill. Support, which is a
 * person. Whether a bigger database instance is needed for a reason other than
 * memory or connections, which it often is. A month with a launch in it. The
 * page says all of that out loud rather than letting a total imply it is
 * complete.
 *
 * Pure: no React, no Next, no Prisma.
 */
import {
  CARD_BYTES, DICTIONARY_MB, POSTGRES_ITSELF_MB, REVIEWS_PER_NEW_CARD, REVIEW_BYTES,
  STARTER_CARDS, WEEKS_PER_MONTH, assumed, round2,
} from "./facts";
import { SERVICES } from "./services";
import type { Bill, Line, Shape, Volume } from "./types";

export { ASSUMPTIONS, DEFAULT_SHAPE, TUTOR_MODELS } from "./facts";
export { MODEL_CAP_USD, SERVICES } from "./services";
export type { Bill, Line, Meter, Service, ServiceCost, Shape, TutorMode, Volume } from "./types";

/** What a month at this size actually consists of, before anybody is billed. */
export function volumeOf(shape: Shape): Volume {
  const learners = Math.max(0, shape.learners);
  const sessions = learners * shape.sessionsPerWeek * WEEKS_PER_MONTH;
  const reviews = sessions * shape.reviewsPerSession;
  const pageViews = sessions * assumed("pages");
  const clips = shape.audio ? learners * assumed("clips") : 0;
  const tutorCalls = shape.tutor === "off" ? 0 : learners * assumed("tutor");
  const graderCalls = shape.tutor === "off" ? 0 : learners * assumed("grader");

  const reviewsPerYear = shape.sessionsPerWeek * 52 * shape.reviewsPerSession;
  const newCardsPerMonth =
    Math.max(1, Math.round(shape.reviewsPerSession / REVIEWS_PER_NEW_CARD))
    * shape.sessionsPerWeek * WEEKS_PER_MONTH;
  const cards = STARTER_CARDS + newCardsPerMonth * 12 * shape.years;
  const learnerBytes = shape.years * reviewsPerYear * REVIEW_BYTES + cards * CARD_BYTES;

  return {
    sessions,
    reviews,
    pageViews,
    clips,
    spokenCharacters: clips * assumed("phrase"),
    emails: learners * assumed("emails"),
    tutorCalls,
    graderCalls,
    databaseGb:
      (POSTGRES_ITSELF_MB + DICTIONARY_MB) / 1000 + (learners * learnerBytes) / 1e9,
    peakConcurrent: Math.ceil(learners * (assumed("peak") / 100)),
  };
}

export function billFor(shape: Shape): Bill {
  const volume = volumeOf(shape);
  const lines: Line[] = SERVICES.map((service) => ({
    service,
    cost: service.bill(volume, shape),
  }));

  let totalUsd = 0;
  let creditedUsd = 0;
  let modelCapBinds = false;
  for (const { cost } of lines) {
    if (cost.kind === "charged") {
      totalUsd += cost.usd;
      if (cost.cappedByUs) modelCapBinds = true;
    } else if (cost.kind === "given") {
      /*
        Counted separately and never into the total. It is the size of what
        public institutions hand this app for nothing, which the page shows as
        credit rather than as a charge.
      */
      creditedUsd += cost.wouldCostUsd ?? 0;
    }
  }
  totalUsd = round2(totalUsd);
  creditedUsd = round2(creditedUsd);

  return {
    lines,
    totalUsd,
    creditedUsd,
    perLearnerUsd: shape.learners > 0 ? totalUsd / shape.learners : 0,
    modelCapBinds,
    volume,
  };
}

/**
 * The sizes the page plots, from one person to a country's worth of them.
 *
 * A logarithmic ladder rather than an even one, because the interesting thing
 * about this bill is where it steps rather than how it slopes, and the steps
 * are decades apart. Estonia has about 1.3 million people, of whom something
 * like 200,000 are learning the language at any time, so the top of this
 * ladder is deliberately past anything plausible: a reader should be able to
 * see the shape carry on rather than stop where we got comfortable.
 */
export const SCALE_LADDER: readonly number[] = [1, 10, 100, 1_000, 10_000, 100_000];

/** The same bill at every rung, for the chart and the table under it. */
export function ladderFor(shape: Shape): readonly { learners: number; bill: Bill }[] {
  return SCALE_LADDER.map((learners) => ({ learners, bill: billFor({ ...shape, learners }) }));
}
