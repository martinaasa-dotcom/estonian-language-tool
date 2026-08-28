import { describe, expect, it } from "vitest";
import { acceptedAnswers, checkAnswer, countsAsRecalled, editDistance } from "./answer";

describe("editDistance", () => {
  it("is zero for identical strings", () => {
    expect(editDistance("raamat", "raamat")).toBe(0);
  });

  it("counts a single substitution, insertion or deletion as one", () => {
    expect(editDistance("raamat", "ramat")).toBe(1);
    expect(editDistance("raamat", "raamatt")).toBe(1);
    expect(editDistance("raamat", "roamat")).toBe(1);
  });

  it("bails out past the cap rather than computing a large distance", () => {
    expect(editDistance("raamat", "arvuti", 1)).toBeGreaterThan(1);
  });
});

describe("acceptedAnswers", () => {
  it("splits the parallel forms Estonian genuinely has", () => {
    expect(acceptedAnswers("raamatutes / raamatuis", "et"))
      .toEqual(expect.arrayContaining(["raamatutes", "raamatuis"]));
  });

  it("accepts either half of a two-part English gloss", () => {
    expect(acceptedAnswers("woman, wife", "en"))
      .toEqual(expect.arrayContaining(["woman", "wife"]));
  });

  it("treats a parenthetical as optional", () => {
    const answers = acceptedAnswers("(to) help", "en");
    expect(answers).toEqual(expect.arrayContaining(["help"]));
  });
});

describe("checkAnswer — Estonian", () => {
  it("accepts the exact form", () => {
    const r = checkAnswer("toas", "toas");
    expect(r.verdict).toBe("correct");
    expect(r.suggestedRating).toBe(3);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(checkAnswer("  Toas ", "toas").verdict).toBe("correct");
  });

  it("accepts either parallel form", () => {
    expect(checkAnswer("raamatuis", "raamatutes / raamatuis").verdict).toBe("correct");
  });

  it("calls out a dropped diacritic instead of failing it outright", () => {
    const r = checkAnswer("soidan", "sõidan");
    expect(r.verdict).toBe("diacritics");
    expect(r.note).toContain("õ, not o");
    expect(r.suggestedRating).toBe(2);
  });

  it("names every diacritic that was dropped", () => {
    const r = checkAnswer("uliopilane", "üliõpilane");
    expect(r.verdict).toBe("diacritics");
    expect(r.note).toContain("ü, not u");
    expect(r.note).toContain("õ, not o");
  });

  it("forgives one slipped keystroke", () => {
    const r = checkAnswer("raamtu", "raamatu");
    expect(r.verdict).toBe("typo");
    expect(r.expected).toBe("raamatu");
    expect(r.suggestedRating).toBe(2);
  });

  it("does not forgive a typo in a short word, where it is another word", () => {
    // `kes` (who) and `kas` (whether) are one letter apart and both real.
    expect(checkAnswer("kes", "kas").verdict).toBe("wrong");
  });

  it("marks a genuinely different word wrong, and says what was wanted", () => {
    const r = checkAnswer("arvutis", "toas");
    expect(r.verdict).toBe("wrong");
    expect(r.note).toContain("toas");
    expect(r.suggestedRating).toBe(1);
  });

  it("treats an empty answer as wrong rather than crashing", () => {
    expect(checkAnswer("   ", "toas").verdict).toBe("wrong");
  });
});

describe("checkAnswer — English", () => {
  it("drops a leading article or infinitive marker", () => {
    expect(checkAnswer("to read", "read", "en").verdict).toBe("correct");
    expect(checkAnswer("the book", "book", "en").verdict).toBe("correct");
  });

  it("accepts one half of a multi-sense gloss", () => {
    expect(checkAnswer("wife", "woman, wife", "en").verdict).toBe("correct");
  });

  it("ignores trailing punctuation", () => {
    expect(checkAnswer("book.", "book", "en").verdict).toBe("correct");
  });
});

describe("countsAsRecalled", () => {
  it("counts near misses as recalled, and nothing else", () => {
    expect(countsAsRecalled("correct")).toBe(true);
    expect(countsAsRecalled("diacritics")).toBe(true);
    expect(countsAsRecalled("typo")).toBe(true);
    expect(countsAsRecalled("wrong")).toBe(false);
  });
});
