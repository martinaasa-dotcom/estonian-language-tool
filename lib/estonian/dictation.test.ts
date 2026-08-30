import { describe, expect, it } from "vitest";
import { checkDictation, dictationWords, wordNote } from "./dictation";

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

describe("wordNote", () => {
  /*
    The exercise's headline claim: it tells you whether you only lost the
    Estonian letters. That distinction lived in a `title` attribute, which is
    a hover tooltip, on an app whose primary device has no hover — so on a
    phone `diacritics` and `typo` were two identical chips.
  */
  it("names the letters that were dropped", () => {
    expect(wordNote({ expected: "õues", typed: "oues", status: "diacritics" }))
      .toBe("õ, not o");
  });

  it("names every dropped letter, once each", () => {
    expect(wordNote({ expected: "üksüs", typed: "uksus", status: "diacritics" }))
      .toBe("ü, not u");
  });

  it("says only that a typo was a typo", () => {
    // Not which keystroke. Separating a slip from a lesson is the point; two
    // equally detailed notes would put them back on the same footing.
    expect(wordNote({ expected: "kool", typed: "koll", status: "typo" }))
      .toBe("one letter out");
  });

  it("says nothing where the chip already says it", () => {
    expect(wordNote({ expected: "maja", typed: "kool", status: "wrong" })).toBeNull();
    expect(wordNote({ expected: "maja", typed: null, status: "missing" })).toBeNull();
    expect(wordNote({ expected: null, typed: "ja", status: "extra" })).toBeNull();
    expect(wordNote({ expected: "maja", typed: "maja", status: "right" })).toBeNull();
  });

  it("falls back to a phrase rather than an empty label", () => {
    // A `diacritics` verdict whose letters this cannot line up (a length
    // difference, say) must still say something: a blank line under a word is
    // worse than the tooltip was.
    expect(wordNote({ expected: "õu", typed: "ou koos", status: "diacritics" }))
      .toBeTruthy();
  });

  it("never reaches for a word neither side wrote", () => {
    // Every character it names is read out of the expected form, which came
    // from Ekilex. ADR-005: nothing here composes Estonian.
    const note = wordNote({ expected: "tänav", typed: "tanav", status: "diacritics" });
    expect(note).toBe("ä, not a");
  });
});
