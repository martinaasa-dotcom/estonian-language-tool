/**
 * WHAT THIS INSTALLATION HAS DONE, IN THE FIGURES A FUNDER ASKS FOR.
 *
 * A grant application asks four things: how many people, how much study,
 * whether they come back, and what the thing is measured by. Three of those
 * were already computed here for other reasons. `/api/metrics` reads retention
 * off the append-only review log (ADR-014), `lib/stats/pace.ts` reads how long
 * a sitting was off `Review.durationMs`, and `Encounter` records the one number
 * this app says it is measured by, which is a conversation somebody had in
 * Estonian outside it (ADR-027). None of it was in a shape anybody could paste
 * into an application. This is that shape, and it is the same argument
 * `lib/research/corpus.ts` makes about the error tables next door: nothing is
 * collected to produce these numbers, no question is put to anybody, and every
 * one of them is a derivation over rows the app keeps in order to work.
 *
 * WHAT MAKES IT SAFE IS THE FILE NEXT DOOR. The disclosure rules are not
 * restated here and are not loosened here. `gate` is imported and every
 * published figure goes through it, so a figure resting on fewer than
 * `MIN_LEARNERS` people or fewer than `MIN_REVIEWS` records is **absent**
 * rather than small, and no one person may be more than `MAX_LEARNER_SHARE` of
 * a figure. That last rule is the one a head count misses, and it is checked
 * twice here: once on the records a figure rests on, which is what `gate` sees,
 * and once on the published quantity itself, because a total of study hours can
 * be one person's winter while the answer counts underneath it look spread.
 *
 * Head counts are published as a band and never as a number, for the reason
 * `bandLearners` gives: two vintages of a report otherwise let a reader
 * difference them and recover what happened in between.
 *
 * NOTHING PER LEARNER LEAVES THIS MODULE. A `learner` key is handed in so the
 * dominance rule can be answered at all, which is the finest thing that has to
 * exist for it. It is counted, compared against nothing outside its own figure,
 * and cannot reach an output field.
 *
 * THE OPT-OUT IS HONORED BEFORE ANYTHING REACHES HERE. Settings lets anybody
 * exclude their own rows from research, and CLAUDE.md's rule is that it means
 * the rows are never read rather than subtracted afterwards. So the caller
 * splices the exclusion into every query separately, and this module is handed
 * tallies that never held those people. There is no field here to subtract one
 * with, deliberately.
 *
 * Pure, like `corpus.ts` and `lib/stats/retention.ts`: it takes tallies and a
 * clock and hands back a report, so the tests need no Postgres to say whether
 * the floors hold.
 */
import {
  MAX_LEARNER_SHARE,
  MIN_LEARNERS,
  MIN_REVIEWS,
  bandLearners,
  gate,
  roundCount,
  type SuppressionReason,
} from "./corpus";
import { MILESTONES, type CohortRow, type MilestoneKey } from "@/lib/stats/retention";

/** A figure that was withheld carries why, exactly as a cell in `corpus.ts` does. */
export type Reported<T> = T | SuppressionReason;

/** Whether a reported figure is the reason it is missing rather than the figure. */
export function isWithheld<T>(reported: Reported<T>): reported is SuppressionReason {
  return typeof reported === "string";
}

/**
 * One person's contribution to one figure.
 *
 * `value` is what gets published once it is summed, and `records` is what the
 * figure rests on: answers for study time, reports for conversations, cards for
 * words. They are separate because the floor and the quantity are different
 * questions. Fifty hours is not a sensible floor and fifty answers is, so
 * `MIN_REVIEWS` is applied to the records and the published quantity is free to
 * be an hour count, a word count or anything else.
 */
export interface Share {
  readonly learner: string;
  readonly value: number;
  readonly records: number;
}

/** What each published quantity is counted in, printed beside it. */
export const UNITS = {
  answers: "answers",
  hours: "hours of study",
  words: "words",
  conversations: "conversations",
} as const;

export type Unit = (typeof UNITS)[keyof typeof UNITS];

export interface Figure {
  /** The published quantity, rounded to `COUNT_ROUNDING`. */
  readonly value: number;
  readonly unit: Unit;
  /** People behind it, as a band. Never a number. */
  readonly learners: string;
  /** Rows behind it, rounded. */
  readonly records: number;
}

/** A figure whose whole content is how many people there were. */
export interface Headcount {
  /** As a band, which is the only form a head count is published in. */
  readonly learners: string;
  /** Rows behind the claim that those people were there, rounded. */
  readonly records: number;
}

/**
 * The dominance rule applied to the published quantity.
 *
 * `gate` already applies it to the records, and that is not the same check.
 * Somebody who answered a fifth of the deployment's cards over a winter can be
 * four fifths of its study hours, so the figure a reader would quote is the one
 * the rule has to hold on.
 */
function dominated(shares: readonly Share[]): boolean {
  let total = 0;
  let largest = 0;
  for (const share of shares) {
    if (share.value <= 0) continue;
    total += share.value;
    if (share.value > largest) largest = share.value;
  }
  return total > 0 && largest / total > MAX_LEARNER_SHARE;
}

/** Only the people who actually contributed something, which is who the floors count. */
function contributors(shares: readonly Share[]): Share[] {
  return shares.filter((s) => s.records > 0 && s.value > 0);
}

/**
 * A quantity, or the reason it is not published.
 *
 * The order is the safety argument, and it is `buildSection`'s order: the gate
 * decides on the raw tallies, and only what survives is rounded. Rounding first
 * would let a figure resting on 46 answers pass as 50.
 */
export function figure(shares: readonly Share[], unit: Unit): Reported<Figure> {
  const held = contributors(shares);
  const passed = gate(held.map((s) => ({ learner: s.learner, n: s.records, ok: 0 })));
  if (typeof passed === "string") return passed;
  if (dominated(held)) return "dominance";

  let value = 0;
  for (const share of held) value += share.value;
  return {
    value: roundCount(value),
    unit,
    learners: passed.learners,
    records: passed.reviews,
  };
}

/**
 * How many people, as a band, or the reason there is no answer.
 *
 * The dominance rule is not asked of a head count, because every person
 * contributes exactly one head and there is nothing for one of them to be most
 * of. What is asked is the same two floors, so a room of four says nothing at
 * all rather than saying four.
 */
export function headcount(shares: readonly Share[]): Reported<Headcount> {
  const held = contributors(shares);
  const passed = gate(held.map((s) => ({ learner: s.learner, n: s.records, ok: 0 })));
  if (typeof passed === "string") return passed;
  return { learners: passed.learners, records: passed.reviews };
}

/** One milestone from `lib/stats/retention`, pooled across every cohort old enough to answer. */
export interface RetentionReading {
  readonly key: MilestoneKey;
  /** Days after a learner's first review that the window opens, and how wide it is. */
  readonly offsetDays: number;
  readonly windowDays: number;
  /**
   * The share who came back, 0 to 100, or null where it cannot be answered:
   * every cohort is either too young to have reached the milestone or too small
   * to report. Never zero for want of evidence.
   */
  readonly pct: number | null;
  /** People behind the reading, as a band. */
  readonly learners: string;
}

/**
 * Retention as one number a milestone, rather than as a table of weeks.
 *
 * An application has room for "about half come back on day seven" and no room
 * for sixty weekly rows. Cohorts are pooled by weight, so a big week counts for
 * more than a quiet one, and a cohort `cohortRetention` already withheld or
 * could not measure is left out rather than read as a zero: that module's own
 * rule is that null means unanswerable.
 */
export function pooledRetention(cohorts: readonly CohortRow[]): RetentionReading[] {
  return MILESTONES.map((milestone) => {
    let people = 0;
    let returned = 0;
    for (const row of cohorts) {
      const rate = row.rates[milestone.key];
      if (row.suppressed || rate === null) continue;
      people += row.learners;
      returned += (rate / 100) * row.learners;
    }
    const answerable = people >= MIN_LEARNERS;
    return {
      key: milestone.key,
      offsetDays: milestone.offset,
      windowDays: milestone.windowDays,
      pct: answerable ? Math.round((returned / people) * 1000) / 10 : null,
      learners: bandLearners(people),
    };
  });
}

/** What one learner did, already grouped in the database. Never a row per review. */
export interface LearnerTotals {
  readonly learner: string;
  /** Every answer they have ever given. */
  readonly reviews: number;
  /** Answers inside the active window. */
  readonly recentReviews: number;
  /**
   * Hours in sittings, read the way `lib/stats/pace.ts` reads them: first card
   * to last plus the first card's own time, with a break longer than the gap
   * starting a new sitting. Summing card durations alone calls a forty minute
   * evening twelve minutes.
   */
  readonly studyHours: number;
  /** Words the scheduler has stopped treating as new, which is its own opinion of "known". */
  readonly wordsKnown: number;
}

/** What one learner reported about Estonian they spoke outside the app. */
export interface EncounterTotals {
  readonly learner: string;
  /** Days they answered the question, including the days the answer was no. */
  readonly reports: number;
  /**
   * Of those, the ones that were a conversation. `isConversation` is the one
   * place that is decided, and counting rows instead would report a fortnight
   * of honest noes as a fortnight of conversations.
   */
  readonly conversations: number;
}

export interface ImpactInput {
  readonly generatedAt: Date;
  /** How far back "active" reaches, so the figure carries what it was measured over. */
  readonly windowDays: number;
  readonly learners: readonly LearnerTotals[];
  readonly encounters: readonly EncounterTotals[];
  readonly cohorts: readonly CohortRow[];
}

export interface Impact {
  readonly generatedAt: string;
  readonly windowDays: number;
  /**
   * Whether anybody has answered anything at all.
   *
   * A deployment nobody has used yet is a different statement from a deployment
   * too small to report, and a report that printed zeros for both would read as
   * a measurement of something. The report says which.
   */
  readonly anyActivity: boolean;
  /** People who have ever answered a card here. */
  readonly learnersReached: Reported<Headcount>;
  /** People who answered one inside the window. */
  readonly activeLearners: Reported<Headcount>;
  readonly reviewsAnswered: Reported<Figure>;
  readonly studyTime: Reported<Figure>;
  readonly wordsLearned: Reported<Figure>;
  /** Conversations in Estonian outside the app, as the learners themselves reported them. */
  readonly conversationsReported: Reported<Figure>;
  /** How many different people reported one. */
  readonly learnersWithConversation: Reported<Headcount>;
  readonly retention: readonly RetentionReading[];
}

/**
 * The whole report, from tallies the caller grouped in the database.
 *
 * Every figure is built from the same two lists, so a reader comparing two of
 * them is comparing the same population rather than two windows that happen to
 * be named alike.
 */
export function summariseImpact(input: ImpactInput): Impact {
  const reviewShares: Share[] = input.learners.map((l) => ({
    learner: l.learner,
    value: l.reviews,
    records: l.reviews,
  }));
  const activeShares: Share[] = input.learners.map((l) => ({
    learner: l.learner,
    value: l.recentReviews,
    records: l.recentReviews,
  }));
  const hourShares: Share[] = input.learners.map((l) => ({
    learner: l.learner,
    value: l.studyHours,
    records: l.reviews,
  }));
  const wordShares: Share[] = input.learners.map((l) => ({
    learner: l.learner,
    value: l.wordsKnown,
    records: l.wordsKnown,
  }));
  const conversationShares: Share[] = input.encounters.map((e) => ({
    learner: e.learner,
    value: e.conversations,
    records: e.reports,
  }));

  return {
    generatedAt: input.generatedAt.toISOString(),
    windowDays: input.windowDays,
    anyActivity: input.learners.some((l) => l.reviews > 0),
    learnersReached: headcount(reviewShares),
    activeLearners: headcount(activeShares),
    reviewsAnswered: figure(reviewShares, UNITS.answers),
    studyTime: figure(hourShares, UNITS.hours),
    wordsLearned: figure(wordShares, UNITS.words),
    conversationsReported: figure(conversationShares, UNITS.conversations),
    learnersWithConversation: headcount(conversationShares),
    retention: pooledRetention(input.cohorts),
  };
}

/**
 * Why a figure is missing, in the words a reader of the report needs.
 *
 * Said once here rather than in the route and again in the script, because two
 * screens explaining one absence differently is two answers to one question.
 */
export function withheldBecause(reason: SuppressionReason): string {
  switch (reason) {
    case "learners":
      return `fewer than ${MIN_LEARNERS} people behind it`;
    case "reviews":
      return `fewer than ${MIN_REVIEWS} records behind it`;
    case "dominance":
      return `one person is more than ${Math.round(MAX_LEARNER_SHARE * 100)}% of it`;
  }
}
