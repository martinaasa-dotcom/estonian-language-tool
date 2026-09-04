import { describe, expect, it } from "vitest";
import {
  FLUENT_ACCURACY, MIN_TIMED, SLOW_RATIO, median, answerTimeReading, type AnswerTimePoint,
} from "./answerTime";

/** `n` timed answers of one slot, `recalled` of them rated Good, each `ms` long. */
const timed = (slot: string, n: number, recalled: number, ms: number): AnswerTimePoint[] =>
  Array.from({ length: n }, (_, i) => ({
    slot, rating: i < recalled ? 3 : 1, durationMs: ms,
  }));

describe("median", () => {
  it("takes the middle value rather than sorting as strings", () => {
    // `sort()` with no comparator puts 10000 before 900, which is the bug this
    // guards: the median of these is 900 and the lexicographic answer is 10000.
    expect(median([900, 10000, 200])).toBe(900);
  });

  it("averages the middle two on an even count", () => {
    expect(median([100, 200, 300, 400])).toBe(250);
  });

  it("has no answer for nothing", () => {
    expect(median([])).toBeNull();
  });
});

describe("answerTimeReading", () => {
  it("reads a slot the learner is timed on", () => {
    const reading = answerTimeReading(timed("INESSIVE", MIN_TIMED, MIN_TIMED, 2000));
    expect(reading.slots).toHaveLength(1);
    expect(reading.slots[0]?.medianMs).toBe(2000);
    expect(reading.slots[0]?.answers).toBe(MIN_TIMED);
    expect(reading.medianMs).toBe(2000);
  });

  it("says nothing about a slot one answer short of the floor", () => {
    expect(answerTimeReading(timed("INESSIVE", MIN_TIMED - 1, MIN_TIMED - 1, 2000)).slots).toEqual([]);
  });

  /*
    THE THREE RULES ABOUT WHICH ROWS COUNT. Each of these was a real shape in
    the log rather than a hypothetical: six rounds grade in bulk and write
    zero, Match used to write its round clock divided by the pair count, and
    `writeGrade` caps the column at ten minutes so a tab left open at lunch
    writes exactly the cap.
  */
  it("ignores an answer no round timed, however many there are", () => {
    const untimed: AnswerTimePoint[] = Array.from({ length: 50 }, () => ({
      slot: "INESSIVE", rating: 3, durationMs: 0,
    }));
    expect(answerTimeReading(untimed).slots).toEqual([]);
    expect(answerTimeReading(untimed).medianMs).toBeNull();
  });

  it("ignores the time on an answer that was wrong", () => {
    // Twenty slow misses and six quick recalls: the pace is the recalls.
    const reading = answerTimeReading([
      ...timed("INESSIVE", 20, 0, 30_000),
      ...timed("INESSIVE", MIN_TIMED, MIN_TIMED, 1000),
    ]);
    expect(reading.slots[0]?.medianMs).toBe(1000);
    // The accuracy still counts every timed answer, recalled or not.
    expect(reading.slots[0]?.accuracy).toBe(23);
  });

  it("is not moved by one tab left open at lunch", () => {
    const reading = answerTimeReading([
      ...timed("INESSIVE", MIN_TIMED, MIN_TIMED, 2000),
      { slot: "INESSIVE", rating: 3, durationMs: 600_000 },
    ]);
    expect(reading.slots[0]?.medianMs).toBe(2000);
  });

  describe("the slots they know and still have to think about", () => {
    it("names a slot that is accurate and slow against their own median", () => {
      const reading = answerTimeReading([
        ...timed("GENITIVE", 30, 30, 1000),
        ...timed("INESSIVE", MIN_TIMED, MIN_TIMED, 1000 * SLOW_RATIO + 500),
      ]);
      expect(reading.medianMs).toBe(1000);
      expect(reading.slow.map((s) => s.slot)).toEqual(["INESSIVE"]);
    });

    it("leaves a slow slot alone while it is also inaccurate", () => {
      /*
        Below `FLUENT_ACCURACY` the slot is simply not known yet and
        `WeakestCases` already names it. A second panel saying the same thing
        in a different unit is two answers to one question.
      */
      const wrong = Math.ceil(MIN_TIMED * ((100 - FLUENT_ACCURACY) / FLUENT_ACCURACY)) + MIN_TIMED;
      const reading = answerTimeReading([
        ...timed("GENITIVE", 30, 30, 1000),
        ...timed("INESSIVE", wrong, MIN_TIMED, 9000),
      ]);
      expect(reading.slots.map((s) => s.slot)).toContain("INESSIVE");
      expect(reading.slots.find((s) => s.slot === "INESSIVE")!.accuracy).toBeLessThan(FLUENT_ACCURACY);
      expect(reading.slow).toEqual([]);
    });

    it("leaves a slot that is merely a little slower alone", () => {
      const reading = answerTimeReading([
        ...timed("GENITIVE", 30, 30, 1000),
        ...timed("INESSIVE", MIN_TIMED, MIN_TIMED, 1200),
      ]);
      expect(reading.slow).toEqual([]);
    });

    it("has nothing to compare against with no timed answers at all", () => {
      expect(answerTimeReading([{ slot: "INESSIVE", rating: 3, durationMs: 0 }]).slow).toEqual([]);
    });
  });

  it("keeps to forms by default, because a meaning slot measures reading speed", () => {
    const rows = timed("RECOGNITION", MIN_TIMED, MIN_TIMED, 2000);
    expect(answerTimeReading(rows).slots).toEqual([]);
    expect(answerTimeReading(rows, false).slots).toHaveLength(1);
  });

  it("skips a review written before the column existed", () => {
    expect(answerTimeReading([{ slot: null, rating: 3, durationMs: 2000 }]).slots).toEqual([]);
  });

  it("puts the slowest slot first", () => {
    const reading = answerTimeReading([
      ...timed("GENITIVE", MIN_TIMED, MIN_TIMED, 1000),
      ...timed("INESSIVE", MIN_TIMED, MIN_TIMED, 5000),
      ...timed("ELATIVE", MIN_TIMED, MIN_TIMED, 3000),
    ]);
    expect(reading.slots.map((s) => s.slot)).toEqual(["INESSIVE", "ELATIVE", "GENITIVE"]);
  });
});
