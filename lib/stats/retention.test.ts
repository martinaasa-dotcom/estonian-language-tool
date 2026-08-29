import { describe, expect, it } from "vitest";

import {
  MIN_COHORT, activitySummary, cohortRetention, dayKey, weekStart,
  type LearnerActivity,
} from "./retention";

/*
  Every date here is fixed and the clock is an argument, so this suite says the
  same thing in January as in June.
*/
const NOW = new Date("2026-06-01T12:00:00.000Z");

/** A learner who joined on `firstDay` and came back on the given offsets. */
const learner = (firstDay: string, offsets: number[]): LearnerActivity => ({
  firstDay,
  activeDays: [
    firstDay,
    ...offsets.map((o) => dayKey(new Date(Date.parse(`${firstDay}T00:00:00Z`) + o * 86_400_000))),
  ],
});

/** A cohort large enough to be reported, all with the same return pattern. */
const cohort = (firstDay: string, count: number, offsets: number[]) =>
  Array.from({ length: count }, () => learner(firstDay, offsets));

describe("weekStart", () => {
  it("puts a Monday in its own week", () => {
    expect(weekStart("2026-01-05")).toBe("2026-01-05");
  });

  it("puts a Sunday at the end of the week it finishes, not the start of the next", () => {
    // getUTCDay calls Sunday 0, which would otherwise read as the first day and
    // move every Sunday joiner into the following cohort.
    expect(weekStart("2026-01-11")).toBe("2026-01-05");
  });
});

describe("cohortRetention", () => {
  it("reports nobody as nothing rather than as zero percent", () => {
    expect(cohortRetention([], NOW)).toEqual([]);
  });

  it("counts a learner who came back on the day itself", () => {
    const rows = cohortRetention(cohort("2026-01-05", 10, [1, 7, 30]), NOW);
    expect(rows[0]?.rates).toEqual({ d1: 100, d7: 100, d30: 100 });
  });

  it("counts a learner who came back a day late, because they came back", () => {
    // D7 brackets days 7 to 9. Somebody who reviewed on day 8 has not churned.
    const rows = cohortRetention(cohort("2026-01-05", 10, [8]), NOW);
    expect(rows[0]?.rates.d7).toBe(100);
  });

  it("does not count a return outside the bracket", () => {
    const rows = cohortRetention(cohort("2026-01-05", 10, [12]), NOW);
    expect(rows[0]?.rates.d7).toBe(0);
  });

  it("reports a real proportion", () => {
    const rows = cohortRetention(
      [...cohort("2026-01-05", 3, [1]), ...cohort("2026-01-05", 7, [])],
      NOW,
    );
    expect(rows[0]?.learners).toBe(10);
    expect(rows[0]?.rates.d1).toBe(30);
  });

  it("groups a whole week into one cohort", () => {
    const rows = cohortRetention(
      [...cohort("2026-01-05", 5, [1]), ...cohort("2026-01-08", 5, [1])],
      NOW,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.cohort).toBe("2026-01-05");
  });

  /*
    The two ways a rate is unanswerable, and why neither may be printed as 0.
    A young cohort reported as 0% would drag every recent week down on a chart
    and make a healthy product look like it was collapsing.
  */
  it("says null, not zero, for a cohort too young to have reached the milestone", () => {
    const justJoined = dayKey(NOW);
    const rows = cohortRetention(cohort(justJoined, 10, []), NOW);
    expect(rows[0]?.rates.d30).toBeNull();
    expect(rows[0]?.suppressed).toBe(false);
  });

  it("says null for a cohort too small to report, and says why", () => {
    const rows = cohortRetention(cohort("2026-01-05", MIN_COHORT - 1, [1, 7, 30]), NOW);
    expect(rows[0]?.rates).toEqual({ d1: null, d7: null, d30: null });
    expect(rows[0]?.suppressed).toBe(true);
  });

  it("still reports the size of a suppressed cohort, so the totals do not lie", () => {
    const rows = cohortRetention(cohort("2026-01-05", 2, [1]), NOW);
    expect(rows[0]?.learners).toBe(2);
  });

  it("waits for the last joiner in a week before answering for the cohort", () => {
    // Somebody who joined on the Sunday of this cohort reaches day 30 six days
    // after somebody who joined on the Monday. Reporting before then would
    // count the late joiners as churned.
    const cohortStart = "2026-05-04";
    const rows = cohortRetention(cohort(cohortStart, 10, []), new Date("2026-06-05T00:00:00Z"));
    expect(rows[0]?.rates.d30).toBeNull();
  });

  it("keeps a cohort's number fixed once it is measured", () => {
    // A learner returning in month three must not improve a D7 that has closed.
    const late = cohort("2026-01-05", 10, [1, 90]);
    const rows = cohortRetention(late, NOW);
    expect(rows[0]?.rates.d7).toBe(0);
  });

  it("orders cohorts oldest first", () => {
    const rows = cohortRetention(
      [...cohort("2026-02-02", 5, [1]), ...cohort("2026-01-05", 5, [1])],
      NOW,
    );
    expect(rows.map((r) => r.cohort)).toEqual(["2026-01-05", "2026-02-02"]);
  });
});

describe("activitySummary", () => {
  const today = dayKey(NOW);

  it("counts nobody without dividing by zero", () => {
    expect(activitySummary([], NOW)).toEqual({ dau: 0, wau: 0, mau: 0, stickiness: null });
  });

  it("counts somebody active today in all three windows", () => {
    const summary = activitySummary([{ firstDay: today, activeDays: [today] }], NOW);
    expect(summary).toMatchObject({ dau: 1, wau: 1, mau: 1, stickiness: 100 });
  });

  it("leaves somebody who has not reviewed in a fortnight out of the week", () => {
    const old = dayKey(new Date(NOW.getTime() - 14 * 86_400_000));
    const summary = activitySummary([{ firstDay: old, activeDays: [old] }], NOW);
    expect(summary).toMatchObject({ dau: 0, wau: 0, mau: 1 });
  });

  it("reports stickiness as the share of the month that showed up this week", () => {
    const old = dayKey(new Date(NOW.getTime() - 20 * 86_400_000));
    const summary = activitySummary(
      [
        { firstDay: today, activeDays: [today] },
        { firstDay: old, activeDays: [old] },
      ],
      NOW,
    );
    expect(summary.stickiness).toBe(50);
  });
});
