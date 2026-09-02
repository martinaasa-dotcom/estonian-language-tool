import { describe, expect, it } from "vitest";
import {
  bestStudyHour, buildForecast, buildHeatmap, caseAccuracy, dailyLoad, ratingBreakdown,
  retentionReading, RETENTION_MINIMUM, RETENTION_TARGET, REVIEW_STATE,
} from "./history";
import { REQUEST_RETENTION } from "@/lib/srs/scheduler";
import { dayKey, daysBetween, recentDayKeys, shiftDay, startOfDay } from "@/lib/time/day";

const NOON = new Date(2026, 7, 28, 12, 0, 0); // 28 Aug 2026, local noon
const daysAgo = (n: number, hour = 12) => {
  const d = shiftDay(NOON, n);
  d.setHours(hour, 0, 0, 0);
  return d;
};

describe("day keys", () => {
  it("uses the local calendar day, not UTC", () => {
    // 23:30 local on the 28th is the 28th, whatever UTC thinks.
    expect(dayKey(new Date(2026, 7, 28, 23, 30))).toBe("2026-08-28");
    expect(dayKey(new Date(2026, 7, 28, 0, 15))).toBe("2026-08-28");
  });

  it("walks backwards across a month boundary", () => {
    expect(dayKey(shiftDay(new Date(2026, 8, 1, 12), 1))).toBe("2026-08-31");
  });

  it("lists recent days oldest first, ending today", () => {
    const keys = recentDayKeys(3, NOON);
    expect(keys).toEqual(["2026-08-26", "2026-08-27", "2026-08-28"]);
  });

  it("measures whole days between timestamps regardless of time of day", () => {
    expect(daysBetween(new Date(2026, 7, 28, 23, 0), new Date(2026, 7, 29, 1, 0))).toBe(1);
    expect(startOfDay(NOON).getHours()).toBe(0);
  });
});

describe("buildHeatmap", () => {
  it("covers exactly the requested window, ending today", () => {
    const grid = buildHeatmap([], 30, NOON);
    expect(grid).toHaveLength(30);
    expect(grid[29]!.day).toBe("2026-08-28");
    expect(grid.every((d) => d.count === 0 && d.level === 0)).toBe(true);
  });

  it("counts reviews into their own day", () => {
    const grid = buildHeatmap([daysAgo(0), daysAgo(0), daysAgo(2)], 7, NOON);
    expect(grid.find((d) => d.day === "2026-08-28")!.count).toBe(2);
    expect(grid.find((d) => d.day === "2026-08-26")!.count).toBe(1);
  });

  it("scales intensity to the learner's own busiest day", () => {
    const dates = [...Array(20).fill(0).map(() => daysAgo(0)), daysAgo(1)];
    const grid = buildHeatmap(dates, 7, NOON);
    expect(grid.find((d) => d.day === "2026-08-28")!.level).toBe(4);
    expect(grid.find((d) => d.day === "2026-08-27")!.level).toBe(1);
  });

  it("ignores reviews older than the window", () => {
    const grid = buildHeatmap([daysAgo(400)], 30, NOON);
    expect(grid.reduce((s, d) => s + d.count, 0)).toBe(0);
  });
});

describe("buildForecast", () => {
  it("folds overdue cards into today rather than losing them", () => {
    const forecast = buildForecast([daysAgo(3), daysAgo(1)], 7, NOON);
    expect(forecast[0]!.offset).toBe(0);
    expect(forecast[0]!.count).toBe(2);
  });

  it("buckets future due dates by day", () => {
    const inDays = (n: number) => shiftDay(NOON, -n);
    const forecast = buildForecast([inDays(1), inDays(1), inDays(3)], 7, NOON);
    expect(forecast[1]!.count).toBe(2);
    expect(forecast[3]!.count).toBe(1);
    expect(forecast[2]!.count).toBe(0);
  });

  it("drops anything past the horizon", () => {
    const forecast = buildForecast([shiftDay(NOON, -90)], 14, NOON);
    expect(forecast.reduce((s, d) => s + d.count, 0)).toBe(0);
  });
});

describe("ratingBreakdown", () => {
  it("is empty and honest with no reviews", () => {
    expect(ratingBreakdown([])).toMatchObject({ total: 0, accuracy: null });
  });

  it("counts each rating and computes accuracy from Good and Easy", () => {
    const b = ratingBreakdown([{ rating: 1 }, { rating: 2 }, { rating: 3 }, { rating: 4 }]);
    expect(b).toMatchObject({ again: 1, hard: 1, good: 1, easy: 1, total: 4, accuracy: 50 });
  });

  it("ignores a rating outside the scale", () => {
    expect(ratingBreakdown([{ rating: 7 }]).total).toBe(0);
  });
});

describe("dailyLoad", () => {
  it("reports null accuracy on a day with no reviews", () => {
    const load = dailyLoad([], 3, NOON);
    expect(load).toHaveLength(3);
    expect(load.every((d) => d.reviews === 0 && d.accuracy === null)).toBe(true);
  });

  it("computes per-day accuracy", () => {
    const load = dailyLoad(
      [
        { reviewedAt: daysAgo(0), rating: 3 },
        { reviewedAt: daysAgo(0), rating: 1 },
        { reviewedAt: daysAgo(1), rating: 4 },
      ],
      3, NOON,
    );
    expect(load[2]).toMatchObject({ day: "2026-08-28", reviews: 2, accuracy: 50 });
    expect(load[1]).toMatchObject({ day: "2026-08-27", reviews: 1, accuracy: 100 });
  });
});

describe("caseAccuracy", () => {
  const reviews = [
    ...Array(4).fill({ targetCase: "INESSIVE", rating: 3 }),
    { targetCase: "INESSIVE", rating: 1 },
    ...Array(3).fill({ targetCase: "COMITATIVE", rating: 1 }),
    { targetCase: "ESSIVE", rating: 1 },
    { targetCase: null, rating: 3 },
  ];

  it("sorts weakest first", () => {
    const stats = caseAccuracy(reviews);
    expect(stats[0]!.grammCase).toBe("COMITATIVE");
    expect(stats[0]!.accuracy).toBe(0);
    expect(stats[1]!.grammCase).toBe("INESSIVE");
    expect(stats[1]!.accuracy).toBe(80);
  });

  it("hides a case with too few reviews to mean anything", () => {
    expect(caseAccuracy(reviews).map((c) => c.grammCase)).not.toContain("ESSIVE");
  });

  it("ignores reviews with no case attached", () => {
    expect(caseAccuracy([{ targetCase: null, rating: 3 }])).toEqual([]);
  });
});

describe("bestStudyHour", () => {
  it("says nothing until there is enough data to say it", () => {
    expect(bestStudyHour([{ reviewedAt: daysAgo(0, 9), rating: 3 }])).toBeNull();
  });

  it("finds the busiest hour", () => {
    const reviews = [
      ...Array(15).fill(0).map(() => ({ reviewedAt: daysAgo(0, 21), rating: 3 })),
      ...Array(10).fill(0).map(() => ({ reviewedAt: daysAgo(1, 8), rating: 3 })),
    ];
    expect(bestStudyHour(reviews)).toBe(21);
  });
});

describe("retentionReading", () => {
  /** `count` mature reviews, `recalled` of them rated Good or better. */
  const mature = (count: number, recalled: number) =>
    Array.from({ length: count }, (_, i) => ({
      rating: i < recalled ? 3 : 1,
      stateBefore: REVIEW_STATE,
    }));

  it("says so, rather than guessing, before there is enough data", () => {
    const reading = retentionReading(mature(10, 9));
    expect(reading.verdict).toBe("unknown");
    expect(reading.retention).toBeNull();
    expect(reading.reviews).toBe(10);
    expect(reading.advice).toContain(String(RETENTION_MINIMUM));
  });

  it("ignores answers on cards that were still being learned", () => {
    // A first sight of a new card is not a memory test, and counting it would
    // drag the number down for exactly the learner who is working hardest.
    const learning = Array.from({ length: 100 }, () => ({ rating: 1, stateBefore: 0 }));
    const reading = retentionReading([...mature(40, 36), ...learning]);
    expect(reading.reviews).toBe(40);
    expect(reading.retention).toBe(90);
  });

  it("calls the schedule healthy when retention sits on the target", () => {
    const reading = retentionReading(mature(100, 90));
    expect(reading.verdict).toBe("on-target");
    expect(reading.retention).toBe(RETENTION_TARGET);
    expect(reading.advice).toMatch(/nothing to change/i);
  });

  it("treats a few points either way as noise, not a diagnosis", () => {
    expect(retentionReading(mature(100, 93)).verdict).toBe("on-target");
    expect(retentionReading(mature(100, 87)).verdict).toBe("on-target");
  });

  it("says there is room for more new words when recall runs high", () => {
    const reading = retentionReading(mature(100, 98));
    expect(reading.verdict).toBe("above");
    expect(reading.headline).toMatch(/more than the schedule/i);
    expect(reading.advice).toMatch(/daily goal/i);
  });

  it("says to ease off when recall runs low", () => {
    const reading = retentionReading(mature(100, 70));
    expect(reading.verdict).toBe("below");
    expect(reading.retention).toBe(70);
    expect(reading.advice).toMatch(/ease off/i);
  });

  it("counts Hard as forgotten and Easy as recalled", () => {
    const reviews = [
      ...Array.from({ length: 50 }, () => ({ rating: 4, stateBefore: REVIEW_STATE })),
      ...Array.from({ length: 50 }, () => ({ rating: 2, stateBefore: REVIEW_STATE })),
    ];
    expect(retentionReading(reviews).retention).toBe(50);
  });

  it("takes a different target when one is given", () => {
    const reading = retentionReading(mature(100, 80), 80);
    expect(reading.verdict).toBe("on-target");
    expect(reading.target).toBe(80);
  });

  it("copes with an empty log", () => {
    const reading = retentionReading([]);
    expect(reading.verdict).toBe("unknown");
    expect(reading.reviews).toBe(0);
  });
});

/*
  THE TARGET AND THE SCHEDULER ARE ONE NUMBER.

  `retentionReading` compares how often a mature card was recalled against what
  the scheduler plans for, and that comparison is only worth printing if the two
  are the same number. This file held its own `90` under a comment saying "the
  target the scheduler is configured for", which is a second copy pointing at
  the first.
*/
describe("the retention target", () => {
  it("is the share the scheduler was configured to plan for", () => {
    expect(RETENTION_TARGET).toBe(Math.round(REQUEST_RETENTION * 100));
    expect(RETENTION_TARGET).toBeGreaterThan(50);
    expect(RETENTION_TARGET).toBeLessThan(100);
  });

  it("is what the reading reports and compares against", () => {
    const mature = Array.from({ length: 100 }, (_, i) => ({
      rating: i < RETENTION_TARGET ? 3 : 1,
      stateBefore: 2,
    }));
    const reading = retentionReading(mature);
    expect(reading.target).toBe(RETENTION_TARGET);
    expect(reading.retention).toBe(RETENTION_TARGET);
    expect(reading.verdict).toBe("on-target");
  });

  it("counts only the cards the scheduler thought were learned", () => {
    // A first sight of a new card is nobody's failure and is not a mature review.
    const mixed = [
      ...Array.from({ length: 40 }, () => ({ rating: 3, stateBefore: 2 })),
      ...Array.from({ length: 40 }, () => ({ rating: 1, stateBefore: 0 })),
    ];
    const reading = retentionReading(mixed);
    expect(reading.reviews).toBe(40);
    expect(reading.retention).toBe(100);
  });
});
