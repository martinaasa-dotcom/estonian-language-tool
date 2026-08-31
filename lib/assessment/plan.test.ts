import { describe, expect, it } from "vitest";
import { CUMULATIVE_HOURS, FACTS, hoursBetween, project, sustainableNewCardsPerDay, weeksNeeded, weeksToLearn } from "./plan";
import { BANDS } from "./types";

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
    expect(plan.appHoursPerWeek).toBe(1.3);
    expect(plan.weeksOnAppAlone.low).toBeGreaterThan(150);
    expect(plan.verdict).toBe("open");
  });

  it("turns a deadline into hours a week to find elsewhere", () => {
    const plan = project({ ...base, weeksAvailable: 26 });
    expect(plan.appHoursAvailable).toBe(33.8);
    expect(plan.otherHoursPerWeek?.low).toBeCloseTo(7.5, 1);
    expect(plan.verdict).toBe("tight");
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

  it("turns a card count into weeks at the sustainable rate", () => {
    // 15 a day sustains 2 new cards, 5 days a week, so 100 cards is 10 weeks.
    expect(weeksToLearn(100, 15, 5)).toBe(10);
    expect(weeksToLearn(0, 15, 5)).toBe(0);
  });

  /*
    The regression this signature exists for. It took words and doubled them,
    which is the card count for a unit that drills nothing; a real A1 unit is
    nearer nine cards a word, so the old call understated a starter deck by a
    factor of four and a half and told a beginner nine weeks where the answer
    was forty.
  */
  it("counts the cards it was given rather than doubling them", () => {
    // The A1 starter deck, measured: 52 words build 404 cards, not 104.
    expect(weeksToLearn(404, 25, 5)).toBe(27);
    expect(weeksToLearn(50, 15, 5)).toBe(5);
  });

  it("is faster at a higher goal, which is what the copy now says", () => {
    expect(weeksToLearn(400, 40, 5)).toBeLessThan(weeksToLearn(400, 10, 5));
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
