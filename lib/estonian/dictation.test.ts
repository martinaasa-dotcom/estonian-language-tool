import { describe, expect, it } from "vitest";
import { checkDictation, dictationWords } from "./dictation";

const statuses = (typed: string, expected: string) =>
  checkDictation(typed, expected).words.map((w) => w.status);

describe("dictationWords", () => {
  it("splits on whitespace and keeps the words as written", () => {
    expect(dictationWords("Ta istub toas.")).toEqual(["Ta", "istub", "toas."]);
  });

  it("drops stray punctuation standing on its own", () => {
    expect(dictationWords("Tere — kuidas läheb ?")).toEqual(["Tere", "kuidas", "läheb"]);
  });

  it("is empty for an empty answer", () => {
    expect(dictationWords("   ")).toEqual([]);
  });
});

describe("checkDictation", () => {
  it("accepts an exact answer", () => {
    const result = checkDictation("Ta istub toas", "Ta istub toas");
    expect(result.verdict).toBe("correct");
    expect(result.accuracy).toBe(100);
    expect(result.suggestedRating).toBe(3);
  });

  it("ignores punctuation and capitals, which a listener cannot hear", () => {
    const result = checkDictation("ta istub toas", "Ta istub toas.");
    expect(result.verdict).toBe("correct");
    expect(result.right).toBe(3);
  });

  it("calls out a dropped diacritic without calling the word wrong", () => {
    const result = checkDictation("Oues sajab vihma", "Õues sajab vihma");
    expect(result.verdict).toBe("diacritics");
    expect(result.suggestedRating).toBe(2);
    expect(statuses("Oues sajab vihma", "Õues sajab vihma")).toEqual([
      "diacritics", "right", "right",
    ]);
    expect(result.note).toMatch(/one is missing/i);
  });

  it("counts several diacritic slips in the summary", () => {
    const result = checkDictation("Oues sajab lund ja on kulm", "Õues sajab lund ja on külm");
    expect(result.verdict).toBe("diacritics");
    expect(result.note).toMatch(/2 are missing/);
  });

  it("marks a single slipped keystroke as a typo, not a different word", () => {
    // The ending survives in both: a letter went missing from the middle.
    expect(statuses("Ta istub raamtu juures", "Ta istub raamatu juures")).toEqual([
      "right", "right", "typo", "right",
    ]);
    // A substitution inside a word of the same length is a typo too.
    expect(statuses("Ta istib toas", "Ta istub toas")).toEqual(["right", "typo", "right"]);
  });

  it("does not forgive a case ending — that is the whole exercise", () => {
    // `toa` is the genitive, `toas` the inessive: one keystroke apart, and the
    // keystroke is the ending. Forgiving it as a typo would forgive the exact
    // thing this exercise exists to test.
    expect(statuses("Ta istub toa", "Ta istub toas")).toEqual(["right", "right", "wrong"]);
    expect(statuses("Ta joob kohv", "Ta joob kohvi")).toEqual(["right", "right", "wrong"]);
  });

  it("survives a word dropped early without failing everything after it", () => {
    // A naive zip would shift every later word and mark the lot wrong.
    expect(statuses("Ta toas ja loeb", "Ta istub toas ja loeb")).toEqual([
      "right", "missing", "right", "right", "right",
    ]);
  });

  it("flags a word that was never said", () => {
    expect(statuses("Ta istub praegu toas", "Ta istub toas")).toEqual([
      "right", "right", "extra", "right",
    ]);
  });

  it("keeps both sides of every pairing for display", () => {
    const { words } = checkDictation("Oues sajab", "Õues sajab");
    expect(words[0]).toEqual({ expected: "Õues", typed: "Oues", status: "diacritics" });
  });

  it("counts a mostly-right sentence as close rather than wrong", () => {
    const result = checkDictation(
      "Ma ostsin poest leiba ja piima",
      "Ma ostsin poest saia ja piima",
    );
    expect(result.verdict).toBe("close");
    expect(result.accuracy).toBeGreaterThanOrEqual(60);
    expect(result.suggestedRating).toBe(2);
  });

  it("calls a mostly-wrong sentence wrong", () => {
    const result = checkDictation("Ma ei tea", "Kass magab diivanil ja norskab");
    expect(result.verdict).toBe("wrong");
    expect(result.suggestedRating).toBe(1);
  });

  it("handles an empty answer without dividing by zero", () => {
    const result = checkDictation("   ", "Ta istub toas");
    expect(result.verdict).toBe("wrong");
    expect(result.accuracy).toBe(0);
    expect(result.note).toBe("Nothing typed.");
    expect(result.words.every((w) => w.status === "missing")).toBe(true);
  });

  it("handles an empty sentence without claiming success", () => {
    const result = checkDictation("midagi", "");
    expect(result.total).toBe(0);
    expect(result.accuracy).toBe(0);
    expect(result.verdict).toBe("wrong");
  });

  it("never loses a typed word from the marked-up output", () => {
    const typed = "Ma lasen tal minna koju kohe";
    const expected = "Ma lasen tal minna koju";
    const { words } = checkDictation(typed, expected);
    expect(words.filter((w) => w.typed !== null).map((w) => w.typed)).toEqual(
      dictationWords(typed),
    );
    expect(words.filter((w) => w.expected !== null).map((w) => w.expected)).toEqual(
      dictationWords(expected),
    );
  });
});
