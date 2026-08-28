import { describe, expect, it } from "vitest";
import { emptyScheduling, grade, humaniseInterval, previewIntervals } from "./scheduler";

describe("FSRS scheduling", () => {
  const now = new Date("2026-01-01T10:00:00Z");

  it("starts a new card in state New with no review history", () => {
    const s = emptyScheduling(now);
    expect(s.state).toBe(0);
    expect(s.reps).toBe(0);
    expect(s.lastReview).toBeNull();
  });

  it("advances a card out of New once graded", () => {
    const next = grade(emptyScheduling(now), 3, now);
    expect(next.reps).toBe(1);
    expect(next.state).not.toBe(0);
    expect(next.lastReview).not.toBeNull();
  });

  it("schedules Easy further out than Good, and Good further than Again", () => {
    const s = emptyScheduling(now);
    const again = grade(s, 1, now).due.getTime();
    const good = grade(s, 3, now).due.getTime();
    const easy = grade(s, 4, now).due.getTime();
    expect(again).toBeLessThan(good);
    expect(good).toBeLessThan(easy);
  });

  it("graduates out of Learning into Review — regression: learningSteps must round-trip", () => {
    let s = grade(emptyScheduling(now), 3, now);
    expect(s.state).toBe(1); // Learning
    s = grade(s, 3, new Date(now.getTime() + 86400000));
    expect(s.state).toBe(2); // Review — fails if learningSteps is dropped between grades
    expect(s.scheduledDays).toBeGreaterThan(0);
  });

  it("counts a lapse when a card in Review is failed", () => {
    let s = emptyScheduling(now);
    for (const day of [0, 1, 3, 10]) {
      s = grade(s, 3, new Date(now.getTime() + day * 86400000));
    }
    expect(s.state).toBe(2);
    const failed = grade(s, 1, new Date(now.getTime() + 40 * 86400000));
    expect(failed.lapses).toBeGreaterThan(0);
    expect(failed.state).toBe(3); // Relearning
  });

  it("offers an interval preview for every button", () => {
    const p = previewIntervals(emptyScheduling(now), now);
    expect(Object.keys(p)).toHaveLength(4);
    for (const v of Object.values(p)) expect(v).toMatch(/\d|now/);
  });
});

describe("humaniseInterval", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  it.each([
    [30 * 60 * 1000, "30m"],
    [5 * 3600 * 1000, "5h"],
    [3 * 86400 * 1000, "3d"],
    [90 * 86400 * 1000, "3mo"],
  ])("formats %i ms as %s", (ms, expected) => {
    expect(humaniseInterval(new Date(now.getTime() + ms), now)).toBe(expected);
  });
});
