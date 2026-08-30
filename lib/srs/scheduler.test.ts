import { describe, expect, it } from "vitest";
import {
  emptyScheduling, grade, humaniseInterval, isStillLearning, previewIntervals,
  type SchedulingState,
} from "./scheduler";

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

describe("a card whose last review is in the future", () => {
  /*
    FSRS rejects a negative delta_t outright, and that throw reaches a learner
    as a Server Action 500 the review screens swallow: the grade is dropped and
    nothing on screen says so. Once a card has a future `lastReview` every later
    attempt to grade it fails, permanently. A wrong clock on a device that
    graded offline, a backup restored across timezones, or a fixture generating
    history around "now" all produce one.
  */
  const future = new Date("2026-08-30T04:00:00.000Z");
  const now = new Date("2026-08-29T17:00:00.000Z");

  function cardLastReviewedInTheFuture(): SchedulingState {
    return {
      ...emptyScheduling(now),
      state: 2,
      reps: 12,
      stability: 8,
      difficulty: 5,
      lastReview: future,
      due: future,
    };
  }

  it("grades rather than throwing", () => {
    expect(() => grade(cardLastReviewedInTheFuture(), 3, now)).not.toThrow();
  });

  it("treats it as no time having passed, not as negative time", () => {
    const next = grade(cardLastReviewedInTheFuture(), 3, now);
    expect(next.elapsedDays).toBe(0);
    // The next review is scheduled from the later of the two moments, so it
    // cannot land before the review it follows.
    expect(next.due.getTime()).toBeGreaterThanOrEqual(future.getTime());
  });

  it("leaves an ordinary card alone", () => {
    const past = new Date("2026-08-20T09:00:00.000Z");
    const ordinary: SchedulingState = {
      ...emptyScheduling(past), state: 2, reps: 5, stability: 6, difficulty: 5,
      lastReview: past, due: now,
    };
    const next = grade(ordinary, 3, now);
    expect(next.elapsedDays).toBeGreaterThan(0);
  });

  it("previews intervals for one instead of throwing", () => {
    expect(() => previewIntervals(cardLastReviewedInTheFuture(), now)).not.toThrow();
  });
});

describe("still learning", () => {
  const now = new Date("2026-01-01T10:00:00Z");

  it("counts a card that has never been seen", () => {
    expect(isStillLearning(emptyScheduling(now).state)).toBe(true);
  });

  it("counts a card part way through its learning steps", () => {
    // One Good on a new card leaves it in Learning, not Review: the graduating
    // step has not been reached, which is exactly the position multiple choice
    // is meant for.
    const next = grade(emptyScheduling(now), 3, now);
    expect(next.state).toBe(1);
    expect(isStillLearning(next.state)).toBe(true);
  });

  it("does not count a card that has graduated to Review", () => {
    expect(isStillLearning(2)).toBe(false);
  });

  it("counts a card that has lapsed back out of Review", () => {
    // A card in Review, failed. FSRS puts it in Relearning, and the memory is
    // in the same position a new card's is, so the scaffolding comes back.
    const settled: SchedulingState = {
      ...emptyScheduling(now), state: 2, reps: 8, stability: 20, difficulty: 5,
      lastReview: new Date("2026-01-01T09:00:00Z"),
    };
    const lapsed = grade(settled, 1, now);
    expect(lapsed.state).toBe(3);
    expect(isStillLearning(lapsed.state)).toBe(true);
  });
});
