import { describe, expect, it } from "vitest";
import { MIN_TIMED, askedFor, median, wordEvidence, type ReviewRow } from "./evidence";

const T0 = new Date("2026-09-01T10:00:00Z");
const NOW = new Date("2026-09-04T10:00:00Z");

function row(over: Partial<ReviewRow> & { rating: number }): ReviewRow {
  return { slot: null, targetCase: null, durationMs: 3_000, reviewedAt: T0, ...over };
}

describe("which question an answer was", () => {
  it("reads a recognition card as the word coming at you", () => {
    expect(askedFor({ slot: "RECOGNITION", targetCase: null })).toBe("recognise");
  });

  it("reads every other slot as the word being produced", () => {
    for (const slot of ["PRODUCTION", "CLOZE", "PARTITIVE", "IndPrSg3", "GOVERNMENT", "CONJUGATION", "GRADATION"]) {
      expect(askedFor({ slot, targetCase: null }), slot).toBe("produce");
    }
    expect(askedFor({ slot: null, targetCase: "INESSIVE" })).toBe("produce");
  });

  it("reads a row with no slot at all as recognition, which is the safe direction", () => {
    // A row written before `slot` existed and carrying no `targetCase` could be
    // anything. Counting it as production could clear the second rung on
    // evidence nobody has, so it may not.
    expect(askedFor({ slot: null, targetCase: null })).toBe("recognise");
    expect(askedFor({ slot: "", targetCase: null })).toBe("recognise");
  });
});

describe("the median", () => {
  it("is the middle of an odd list and the mean of the middle pair of an even one", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("what the log says about one word", () => {
  it("says nothing about a word with no rows", () => {
    const e = wordEvidence([], NOW);
    expect(e.recognise.asked).toBe(0);
    expect(e.produce.asked).toBe(0);
    expect(e.daysSince).toBeNull();
  });

  it("tallies recognition and production apart", () => {
    const e = wordEvidence([
      row({ rating: 3, slot: "RECOGNITION" }),
      row({ rating: 1, slot: "RECOGNITION" }),
      row({ rating: 3, slot: "PRODUCTION" }),
    ], NOW);
    expect(e.recognise).toMatchObject({ asked: 2, right: 1 });
    expect(e.produce).toMatchObject({ asked: 1, right: 1 });
  });

  it("times only correct answers, and only once there are enough of them", () => {
    const rows = [
      row({ rating: 1, slot: "PRODUCTION", durationMs: 30_000 }),
      row({ rating: 3, slot: "PRODUCTION", durationMs: 2_000 }),
      row({ rating: 3, slot: "PRODUCTION", durationMs: 4_000 }),
    ];
    expect(wordEvidence(rows, NOW).produce.medianMs).toBeNull();
    const enough = [...rows, row({ rating: 4, slot: "PRODUCTION", durationMs: 3_000 })];
    expect(enough.filter((r) => r.rating >= 3).length).toBe(MIN_TIMED);
    // The wrong answer's thirty seconds is not in the median.
    expect(wordEvidence(enough, NOW).produce.medianMs).toBe(3_000);
  });

  it("ignores a row with no time on it and a card left open", () => {
    const rows = [
      row({ rating: 3, slot: "PRODUCTION", durationMs: 0 }),
      row({ rating: 3, slot: "PRODUCTION", durationMs: 2_000 }),
      row({ rating: 3, slot: "PRODUCTION", durationMs: 2_000 }),
      row({ rating: 3, slot: "PRODUCTION", durationMs: 2_000 }),
      row({ rating: 3, slot: "PRODUCTION", durationMs: 400_000 }),
    ];
    expect(wordEvidence(rows, NOW).produce.medianMs).toBe(2_000);
  });

  it("reads the last answer by its timestamp, whatever order the rows arrive in", () => {
    const later = new Date(T0.getTime() + 60_000);
    const e = wordEvidence([
      row({ rating: 1, slot: "PRODUCTION", reviewedAt: later }),
      row({ rating: 3, slot: "PRODUCTION", reviewedAt: T0 }),
    ], NOW);
    expect(e.produce.lastRight).toBe(false);
    // Two days and 23 hours is two days, floored.
    expect(e.daysSince).toBe(2);
  });

  it("counts a distinct form only when it was right", () => {
    const e = wordEvidence([
      row({ rating: 3, slot: "PARTITIVE" }),
      row({ rating: 3, slot: "PARTITIVE" }),
      row({ rating: 1, slot: "INESSIVE" }),
      row({ rating: 3, slot: "IndPrSg3" }),
      row({ rating: 3, slot: "PRODUCTION" }),
    ], NOW);
    expect(e.formsRight).toBe(2);
  });
});
