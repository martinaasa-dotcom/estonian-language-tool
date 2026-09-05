import { describe, expect, it } from "vitest";

import { MAX_LEARNER_SHARE, MIN_LEARNERS, MIN_REVIEWS } from "./corpus";
import {
  figure,
  headcount,
  isWithheld,
  pooledRetention,
  summariseImpact,
  UNITS,
  type EncounterTotals,
  type LearnerTotals,
  type Share,
} from "./impact";
import type { CohortRow } from "@/lib/stats/retention";

/*
  The floors are the whole of what makes this file publishable, so the tests
  are about the floors rather than about the arithmetic. Each one is written as
  the smallest population that sits either side of a rule, because a figure
  that passes on a generous fixture says nothing about where the line is.
*/

function crowd(people: number, each: number): Share[] {
  return Array.from({ length: people }, (_, i) => ({
    learner: `p${i}`,
    value: each,
    records: each,
  }));
}

const NOW = new Date("2026-09-05T09:00:00.000Z");

describe("the floors suppress rather than report", () => {
  it("withholds a figure one person short of the head count", () => {
    const enough = Math.ceil(MIN_REVIEWS / (MIN_LEARNERS - 1)) + 1;
    const reported = figure(crowd(MIN_LEARNERS - 1, enough), UNITS.answers);
    expect(reported).toBe("learners");
  });

  it("publishes the same figure once one more person is behind it", () => {
    const enough = Math.ceil(MIN_REVIEWS / (MIN_LEARNERS - 1)) + 1;
    const reported = figure(crowd(MIN_LEARNERS, enough), UNITS.answers);
    expect(isWithheld(reported)).toBe(false);
  });

  it("withholds a figure resting on too few records, however many people", () => {
    const reported = figure(crowd(MIN_LEARNERS * 2, 1), UNITS.answers);
    expect(reported).toBe("reviews");
  });

  it("counts nobody who contributed nothing", () => {
    const shares = [...crowd(MIN_LEARNERS - 1, MIN_REVIEWS), { learner: "idle", value: 0, records: 0 }];
    expect(figure(shares, UNITS.answers)).toBe("learners");
  });
});

describe("a figure below the floor is absent, never zero", () => {
  it("says why rather than handing back a number", () => {
    const reported = figure(crowd(2, 4), UNITS.conversations);
    expect(isWithheld(reported)).toBe(true);
    expect(reported).not.toEqual(expect.objectContaining({ value: 0 }));
  });

  it("reports no conversations as an absence and not as a count", () => {
    const learners: LearnerTotals[] = Array.from({ length: MIN_LEARNERS }, (_, i) => ({
      learner: `p${i}`,
      reviews: 40,
      recentReviews: 20,
      studyHours: 3,
      wordsKnown: 25,
    }));
    const impact = summariseImpact({
      generatedAt: NOW,
      windowDays: 30,
      learners,
      encounters: [],
      cohorts: [],
    });
    expect(impact.conversationsReported).toBe("learners");
    expect(impact.learnersWithConversation).toBe("learners");
    expect(impact.anyActivity).toBe(true);
    expect(isWithheld(impact.reviewsAnswered)).toBe(false);
  });

  it("says plainly that a deployment with nobody in it has nobody in it", () => {
    const impact = summariseImpact({
      generatedAt: NOW,
      windowDays: 30,
      learners: [],
      encounters: [],
      cohorts: [],
    });
    expect(impact.anyActivity).toBe(false);
    expect(isWithheld(impact.learnersReached)).toBe(true);
    expect(isWithheld(impact.studyTime)).toBe(true);
  });
});

describe("one learner is never most of a figure", () => {
  it("withholds a total one person supplied most of", () => {
    const shares: Share[] = [
      ...crowd(MIN_LEARNERS, 10),
      { learner: "heavy", value: 500, records: 500 },
    ];
    expect(figure(shares, UNITS.answers)).toBe("dominance");
  });

  it("catches a person who is most of the hours while the answers look spread", () => {
    /*
      The records pass the dominance rule outright and the published quantity
      does not, which is the case `gate` on its own cannot see: a winter of
      long evenings is a modest share of the answers and nearly all of the
      time.
    */
    const shares: Share[] = [
      ...Array.from({ length: MIN_LEARNERS }, (_, i) => ({
        learner: `p${i}`,
        value: 1,
        records: 20,
      })),
      { learner: "winter", value: 200, records: 60 },
    ];
    expect(figure(shares, UNITS.hours)).toBe("dominance");
  });

  it("lets a figure through when everybody is under the share", () => {
    const shares = crowd(MIN_LEARNERS, 20);
    const reported = figure(shares, UNITS.answers);
    expect(isWithheld(reported)).toBe(false);
    if (isWithheld(reported)) return;
    expect(reported.value).toBe(200);
    expect(reported.unit).toBe(UNITS.answers);
    // A band, never a number, so two vintages cannot be differenced.
    expect(reported.learners).toBe("10-19");
    expect(Math.max(...shares.map((s) => s.value)) / 200).toBeLessThanOrEqual(MAX_LEARNER_SHARE);
  });

  it("holds a head count to the same two floors", () => {
    expect(headcount(crowd(MIN_LEARNERS - 1, MIN_REVIEWS))).toBe("learners");
    const reported = headcount(crowd(MIN_LEARNERS, 10));
    expect(isWithheld(reported)).toBe(false);
    if (isWithheld(reported)) return;
    expect(reported.learners).toBe("10-19");
  });
});

describe("retention pooled across cohorts", () => {
  const cohort = (learners: number, d7: number | null, suppressed = false): CohortRow => ({
    cohort: "2026-01-05",
    learners,
    rates: { d1: null, d7, d30: null },
    suppressed,
    });

  it("weights a big week more than a quiet one", () => {
    const readings = pooledRetention([cohort(40, 50), cohort(10, 100)]);
    const d7 = readings.find((r) => r.key === "d7");
    expect(d7?.pct).toBe(60);
    expect(d7?.learners).toBe("50-99");
  });

  it("leaves out a cohort that could not answer rather than reading it as zero", () => {
    const readings = pooledRetention([cohort(20, 80), cohort(20, null)]);
    expect(readings.find((r) => r.key === "d7")?.pct).toBe(80);
  });

  it("answers nothing where too few people are behind it", () => {
    const readings = pooledRetention([cohort(MIN_LEARNERS - 1, 90)]);
    const d7 = readings.find((r) => r.key === "d7");
    expect(d7?.pct).toBeNull();
  });

  it("says nothing at every milestone when there are no cohorts", () => {
    for (const reading of pooledRetention([])) expect(reading.pct).toBeNull();
  });
});

describe("nothing about one person leaves the module", () => {
  it("carries no learner key into the report", () => {
    const learners: LearnerTotals[] = Array.from({ length: MIN_LEARNERS + 2 }, (_, i) => ({
      learner: `secret-owner-${i}`,
      reviews: 60,
      recentReviews: 30,
      studyHours: 4,
      wordsKnown: 30,
    }));
    const encounters: EncounterTotals[] = learners.map((l) => ({
      learner: l.learner,
      reports: 12,
      conversations: 8,
    }));
    const impact = summariseImpact({
      generatedAt: NOW,
      windowDays: 30,
      learners,
      encounters,
      cohorts: [],
    });
    expect(JSON.stringify(impact)).not.toContain("secret-owner");
  });
});
