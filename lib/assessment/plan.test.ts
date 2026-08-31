import { describe, expect, it } from "vitest";
import {
  CUMULATIVE_HOURS, FACTS, FOUND_HOURS_PER_WEEK, hoursBetween, project,
  sustainableNewCardsPerDay, weeksNeeded, weeksToLearn,
} from "./plan";
import { BANDS, PRE_A1, type Band, type Level } from "./types";
import { formatDuration, formatDurationRange } from "@/lib/time/duration";

describe("the hours table", () => {
  it("only ever goes up", () => {
    for (let i = 1; i < BANDS.length; i++) {
      const lower = CUMULATIVE_HOURS[BANDS[i - 1]!];
      const higher = CUMULATIVE_HOURS[BANDS[i]!];
      expect(higher.low).toBeGreaterThan(lower.low);
      expect(higher.high).toBeGreaterThan(lower.high);
    }
  });

  it("is a range, never a single number pretending to be a fact", () => {
    for (const band of BANDS) {
      expect(CUMULATIVE_HOURS[band].high).toBeGreaterThan(CUMULATIVE_HOURS[band].low);
    }
  });

  it("counts only the hours still to do", () => {
    expect(hoursBetween("A2", "B1")).toEqual({ low: 230, high: 320 });
    expect(hoursBetween("pre-A1", "A1")).toEqual({ low: 100, high: 160 });
    expect(hoursBetween("B2", "A2")).toEqual({ low: 0, high: 0 });
  });
});

describe("project", () => {
  const base = { from: "A2" as const, to: "B1" as const, minutesPerDay: 15, daysPerWeek: 5 };

  it("says how long the app alone would take, which is the sobering number", () => {
    const plan = project({ ...base, weeksAvailable: null });
    expect(plan.appHoursPerWeek).toBeCloseTo(1.25, 10);
    expect(plan.weeksOnAppAlone.low).toBeGreaterThan(150);
    expect(plan.verdict).toBe("open");
  });

  /*
    The pace used to be rounded to one decimal before anything divided by it,
    which is a display decision leaking into arithmetic. Three minutes a day
    three days a week is 0.15 hours and was shown and used as 0.2, a third more
    study than the learner said they would do, and it took a quarter off the
    weeks the app alone would need. Every figure here is exact now, and the
    panel rounds on the way to a tile.
  */
  it("never rounds a pace before dividing by it", () => {
    const plan = project({ from: "A1", to: "A2", minutesPerDay: 3, daysPerWeek: 3, weeksAvailable: null });
    expect(plan.appHoursPerWeek).toBeCloseTo(0.15, 10);
    expect(plan.weeksOnAppAlone).toEqual({ low: Math.ceil(120 / 0.15), high: Math.ceil(170 / 0.15) });
  });

  it("turns a deadline into hours a week to find elsewhere", () => {
    const plan = project({ ...base, weeksAvailable: 26 });
    expect(plan.appHoursAvailable).toBeCloseTo(32.5, 10);
    expect(plan.otherHoursPerWeek?.low).toBeCloseTo((230 - 32.5) / 26, 10);
    expect(plan.verdict).toBe("short");
  });

  it("calls an impossible deadline impossible", () => {
    const plan = project({ from: "pre-A1", to: "C1", minutesPerDay: 15, daysPerWeek: 5, weeksAvailable: 12 });
    expect(plan.verdict).toBe("short");
  });

  it("calls a deadline the app alone can meet comfortable", () => {
    const plan = project({ ...base, minutesPerDay: 240, daysPerWeek: 7, weeksAvailable: 52 });
    expect(plan.verdict).toBe("comfortable");
    expect(plan.otherHoursPerWeek).toEqual({ low: 0, high: 0 });
  });

  it("says so when the target is already behind you", () => {
    const plan = project({ ...base, from: "B2", weeksAvailable: 12 });
    expect(plan.verdict).toBe("arrived");
    expect(plan.hours).toEqual({ low: 0, high: 0 });
  });

  it("survives a pace of nothing without dividing by it", () => {
    const plan = project({ ...base, minutesPerDay: 0, weeksAvailable: 10 });
    expect(plan.weeksOnAppAlone).toEqual({ low: 0, high: 0 });
    expect(Number.isFinite(plan.otherHoursPerWeek?.low ?? 0)).toBe(true);
  });

  /*
    A deadline that has gone leaves nothing to divide by. It used to be floored
    at one week, so the screen said "in 0 weeks your daily goal puts in about
    0.4 of those hours" over a note asking for 1 099 hours a week.
  */
  it("says a date has gone rather than dividing the distance by no time", () => {
    const plan = project({ from: "A2", to: "C1", minutesPerDay: 5, daysPerWeek: 5, weeksAvailable: 0 });
    expect(plan.verdict).toBe("passed");
    expect(plan.otherHoursPerWeek).toBeNull();
    expect(plan.appHoursAvailable).toBe(0);
  });

  /*
    The headline and the sentence under it are one claim. "It fits" is only
    said where the found hours the note goes on to quote actually land inside
    the deadline, which is what drawing the band at the pessimistic end buys.
  */
  it("never calls a plan tight that its own found-hours figure cannot make", () => {
    const FROMS: Level[] = [PRE_A1, ...BANDS];
    const cases: string[] = [];
    for (const from of FROMS) {
      for (const to of BANDS as readonly Band[]) {
        for (const minutes of [3, 5, 8, 13]) {
          for (const days of [2, 3, 4, 5, 6, 7]) {
            for (const weeks of [13, 26, 52, 104]) {
              const plan = project({ from, to, minutesPerDay: minutes, daysPerWeek: days, weeksAvailable: weeks });
              if (plan.verdict !== "tight") continue;
              const found = weeksNeeded(plan.hours, plan.appHoursPerWeek, FOUND_HOURS_PER_WEEK);
              if (found.high > weeks) cases.push(`${from}->${to} ${minutes}min x${days}d in ${weeks}wk`);
            }
          }
        }
      }
    }
    expect(cases).toEqual([]);
  });

  it("keeps every figure finite, positive and the right way round, whatever is clicked", () => {
    const FROMS: Level[] = [PRE_A1, ...BANDS];
    for (const from of FROMS) {
      for (const to of BANDS as readonly Band[]) {
        for (const minutes of [3, 5, 8, 13]) {
          for (const days of [2, 3, 4, 5, 6, 7]) {
            for (const weeks of [null, 0, 13, 26, 52, 104]) {
              const p = project({ from, to, minutesPerDay: minutes, daysPerWeek: days, weeksAvailable: weeks });
              const figures = [
                p.appHoursPerWeek, p.weeksOnAppAlone.low, p.weeksOnAppAlone.high,
                p.appHoursAvailable ?? 0, p.otherHoursPerWeek?.low ?? 0, p.otherHoursPerWeek?.high ?? 0,
              ];
              for (const n of figures) {
                expect(Number.isFinite(n)).toBe(true);
                expect(n).toBeGreaterThanOrEqual(0);
              }
              expect(p.hours.low).toBeLessThanOrEqual(p.hours.high);
              expect(p.weeksOnAppAlone.low).toBeLessThanOrEqual(p.weeksOnAppAlone.high);
              if (p.otherHoursPerWeek) {
                expect(p.otherHoursPerWeek.low).toBeLessThanOrEqual(p.otherHoursPerWeek.high);
              }
            }
          }
        }
      }
    }
  });

  /*
    An hour is the wrong unit for the figures at the small end of this screen.
    Nine minutes a week was printed as "0.2h", which is twelve, and a real
    0.0218 hours a week still to find was printed as "0 hours a week" under a
    headline saying there was study left to do. Every duration the plan can
    print is swept here, because the fault is only visible at the ends.
  */
  it("prints no duration in a unit that rounds it away", () => {
    const FROMS: Level[] = [PRE_A1, ...BANDS];
    const wrong: string[] = [];
    for (const from of FROMS) {
      for (const to of BANDS as readonly Band[]) {
        for (const minutes of [3, 5, 8, 13]) {
          for (const days of [2, 3, 4, 5, 6, 7]) {
            for (const weeks of [null, 0, 13, 26, 52, 104]) {
              const p = project({ from, to, minutesPerDay: minutes, daysPerWeek: days, weeksAvailable: weeks });
              const where = `${from}->${to} ${minutes}min x${days}d in ${weeks}wk`;

              // The pace is a real amount of practice, so it never reads as none.
              const pace = formatDuration(p.appHoursPerWeek);
              if (p.appHoursPerWeek > 0 && /^0 /.test(pace)) wrong.push(`${where}: pace "${pace}"`);
              // And it is read in minutes wherever an hour would be the wrong unit.
              if (p.appHoursPerWeek < 1 && !pace.endsWith("min")) wrong.push(`${where}: pace "${pace}"`);

              // The note only renders on a real shortfall, so it may not read as none either.
              const other = p.otherHoursPerWeek;
              if (!other || other.high <= 0) continue;
              const found = formatDurationRange(other.low, other.high, "long");
              if (/^0 (minutes?|hours?)$/.test(found)) wrong.push(`${where}: shortfall "${found}"`);
              if (/to 0 (minutes?|hours?)$/.test(found)) wrong.push(`${where}: shortfall "${found}"`);
            }
          }
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it("never makes more practice take longer", () => {
    for (const to of BANDS as readonly Band[]) {
      for (const minutes of [3, 5, 8, 13]) {
        let previous = Infinity;
        for (const days of [2, 3, 4, 5, 6, 7]) {
          const p = project({ from: PRE_A1, to, minutesPerDay: minutes, daysPerWeek: days, weeksAvailable: null });
          expect(p.weeksOnAppAlone.high).toBeLessThanOrEqual(previous);
          previous = p.weeksOnAppAlone.high;
        }
      }
    }
  });
});

describe("what a deadline would have to move to", () => {
  it("counts the app hours and the found hours together", () => {
    expect(weeksNeeded({ low: 100, high: 200 }, 2, 3)).toEqual({ low: 20, high: 40 });
    expect(weeksNeeded({ low: 100, high: 200 }, 0, 0)).toEqual({ low: 0, high: 0 });
  });
});

describe("the daily goal a learner can actually sustain", () => {
  it("divides a review quota by the reviews a new card will cost", () => {
    expect(sustainableNewCardsPerDay(15)).toBe(2);
    expect(sustainableNewCardsPerDay(40)).toBe(4);
  });

  it("never says zero new cards a day, which would be advice to stop", () => {
    expect(sustainableNewCardsPerDay(1)).toBe(1);
  });

  it("turns a word count into weeks at two cards a word", () => {
    expect(weeksToLearn(50, 15, 5)).toBe(10);
    expect(weeksToLearn(0, 15, 5)).toBe(0);
  });
});

describe("the facts shown to a learner", () => {
  it("every one of them names where it came from", () => {
    expect(FACTS.length).toBeGreaterThan(3);
    for (const fact of FACTS) {
      expect(fact.source.length).toBeGreaterThan(10);
      expect(fact.claim.length).toBeGreaterThan(40);
    }
  });
});
