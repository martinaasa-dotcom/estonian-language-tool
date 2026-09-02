import { describe, expect, it } from "vitest";
import { sameSpelling } from "./values";

describe("a word spelled the same in both languages", () => {
  /*
    Twelve of these are taught by the course and thirty are in the shipped
    dictionary. Every screen that prints a word over its meaning printed them
    twice, which reads as a rendering fault rather than as a fact about the
    word.
  */
  it("recognises an identical gloss", () => {
    for (const word of ["film", "number", "park", "sport", "stress", "argument", "risk"]) {
      expect(sameSpelling(word, word)).toBe(true);
    }
    expect(sameSpelling(" film ", "film")).toBe(true);
  });

  /*
    THE CAPITAL LETTER IS THE LESSON. Estonian writes its months in lower case
    and English does not, so folding case here would delete the one thing those
    five cards teach.
  */
  it("keeps a difference of case, because that is the lesson", () => {
    for (const [et, en] of [["august", "August"], ["november", "November"],
      ["september", "September"], ["islam", "Islam"], ["muslim", "Muslim"]] as const) {
      expect(sameSpelling(et, en)).toBe(false);
    }
  });

  it("says nothing about a gloss that merely contains the word", () => {
    expect(sameSpelling("norm", "norm, quota, standard")).toBe(false);
    expect(sameSpelling("sport", "sport, sports")).toBe(false);
    expect(sameSpelling("", "")).toBe(false);
  });
});
