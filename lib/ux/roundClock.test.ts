import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROUND_PACE, ROUND_PACES, roundLength, roundPaceFrom, secondsFor,
} from "./roundClock";

describe("roundPaceFrom", () => {
  it("reads a missing row as the shipped pace", () => {
    expect(roundPaceFrom(null)).toBe(DEFAULT_ROUND_PACE);
    expect(roundPaceFrom(undefined)).toBe(DEFAULT_ROUND_PACE);
    expect(roundPaceFrom("")).toBe(DEFAULT_ROUND_PACE);
  });

  it("reads a value it does not know as the shipped pace", () => {
    // A stored row can be anything: an older build, a hand edit, a key that
    // was renamed. None of those may leave a learner with no clock at all.
    expect(roundPaceFrom("triple")).toBe(DEFAULT_ROUND_PACE);
    expect(roundPaceFrom("2x")).toBe(DEFAULT_ROUND_PACE);
  });

  it("keeps a pace the learner chose", () => {
    for (const pace of ROUND_PACES) expect(roundPaceFrom(pace.id)).toBe(pace.id);
  });
});

describe("ROUND_PACES", () => {
  /*
    THIS IS THE CRITERION ITSELF. WCAG 2.2 success criterion 2.2.1, Timing
    Adjustable, is met by adjustment where the learner can extend the limit to
    at least ten times its default before meeting it. A table that stopped at
    double would be an improvement and not a pass.
  */
  it("reaches at least ten times the standard", () => {
    const standard = ROUND_PACES.find((p) => p.id === DEFAULT_ROUND_PACE)!.multiplier;
    const longest = Math.max(...ROUND_PACES.map((p) => p.multiplier));
    expect(longest).toBeGreaterThanOrEqual(standard * 10);
  });

  it("starts at the shipped length and only ever goes up", () => {
    expect(ROUND_PACES[0]!.id).toBe(DEFAULT_ROUND_PACE);
    expect(ROUND_PACES[0]!.multiplier).toBe(1);
    const ups = ROUND_PACES.map((p) => p.multiplier);
    expect([...ups].sort((a, b) => a - b)).toEqual(ups);
  });

  it("names every pace once, in words rather than in arithmetic", () => {
    const ids = ROUND_PACES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const pace of ROUND_PACES) {
      expect(pace.label.length).toBeGreaterThan(3);
      expect(pace.detail.length).toBeGreaterThan(10);
    }
  });
});

describe("secondsFor", () => {
  it("returns whole seconds, because the clock counts down in them", () => {
    for (const base of [60, 120, 45, 7]) {
      for (const pace of ROUND_PACES) {
        expect(Number.isInteger(secondsFor(base, pace.id))).toBe(true);
      }
    }
  });

  it("leaves both rounds as they were at the standard pace", () => {
    expect(secondsFor(60, "standard")).toBe(60);
    expect(secondsFor(120, "standard")).toBe(120);
  });

  it("stretches each round from its own base", () => {
    expect(secondsFor(60, "ten-times")).toBe(600);
    expect(secondsFor(120, "ten-times")).toBe(1200);
    expect(secondsFor(60, "half-again")).toBe(90);
  });

  it("never returns a negative round", () => {
    expect(secondsFor(-30, "double")).toBe(0);
  });
});

describe("roundLength", () => {
  it("says seconds where a minute would round the difference away", () => {
    expect(roundLength(60)).toBe("60 seconds");
    expect(roundLength(90)).toBe("90 seconds");
  });

  it("says minutes where the figure is one", () => {
    expect(roundLength(120)).toBe("2 minutes");
    expect(roundLength(600)).toBe("10 minutes");
  });
});
