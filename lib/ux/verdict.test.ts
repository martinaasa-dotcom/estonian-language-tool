import { describe, expect, it } from "vitest";
import {
  OPTION_CLASS, VERDICT_CLASS, VERDICT_INK, optionState, verdictOfCheck, verdictOfRating,
} from "./verdict";

/**
 * The vocabulary and the two readings into it. The classes are checked against
 * the stylesheet by `scripts/test-invariants.ts`; what is checked here is that
 * the readings land where the palette says they should.
 */
describe("the verdict vocabulary", () => {
  it("has three words and three option states, each with its own class", () => {
    expect(new Set(Object.values(VERDICT_CLASS)).size).toBe(3);
    expect(new Set(Object.values(OPTION_CLASS)).size).toBe(3);
    expect(Object.keys(VERDICT_INK).sort()).toEqual(Object.keys(VERDICT_CLASS).sort());
  });

  it("writes every verdict in an ink, never in a fill", () => {
    for (const ink of Object.values(VERDICT_INK)) expect(ink).toMatch(/-ink\)$/);
  });

  it("reads the four ratings as miss, nearly, recall, recall", () => {
    expect(verdictOfRating(1)).toBe("wrong");
    expect(verdictOfRating(2)).toBe("nearly");
    expect(verdictOfRating(3)).toBe("right");
    expect(verdictOfRating(4)).toBe("right");
  });

  it("reads a slip as nearly, the way countsAsRecalled does", () => {
    expect(verdictOfCheck("correct")).toBe("right");
    expect(verdictOfCheck("diacritics")).toBe("nearly");
    expect(verdictOfCheck("typo")).toBe("nearly");
    expect(verdictOfCheck("wrong")).toBe("wrong");
  });

  it("lights the answer whoever pressed what", () => {
    expect(optionState(true, true)).toBe("right");
    expect(optionState(true, false)).toBe("right");
    expect(optionState(false, true)).toBe("wrong");
    expect(optionState(false, false)).toBe("other");
  });
});
