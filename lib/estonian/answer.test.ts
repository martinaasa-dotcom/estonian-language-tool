import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { acceptedAnswers, acceptedForms, checkAnswer, countsAsRecalled, editDistance } from "./answer";
import { HARVESTED } from "../../prisma/data/harvested";

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

/*
  A CORRECTION PRINTS WHAT THE DICTIONARY HOLDS.

  `normalise` lowercases, strips punctuation and drops an English article,
  which is what makes the marking fair and is not a spelling. It used to be
  what the correction printed, so a missed `Eesti` came back as `eesti`, a
  different word; `Head aega!` as `head aega`; `April` as `april`; `To sleep`
  as `sleep`. The sweep at the end is the half that can fail on a word.
*/
describe("the correction shows the stored spelling", () => {
  it("keeps a proper noun's capital, which in Estonian is the difference between two words", () => {
    const r = checkAnswer("soome", "Eesti");
    expect(r.expected).toBe("Eesti");
    expect(r.note).toContain("Eesti");
    expect(r.note).not.toContain("eesti”");
  });

  it("keeps a phrase's own punctuation and does not add a second full stop", () => {
    const r = checkAnswer("tere", "Head aega!");
    expect(r.expected).toBe("Head aega!");
    expect(r.note).toBe("Not quite, it's “Head aega!”");
  });

  it("shows the stored spelling on a typo too", () => {
    const r = checkAnswer("Eest", "Eesti");
    expect(r.verdict).toBe("typo");
    expect(r.expected).toBe("Eesti");
  });

  it("names the letter on a diacritic slip and still shows the stored spelling", () => {
    const r = checkAnswer("Aitah", "Aitäh!");
    expect(r.verdict).toBe("diacritics");
    expect(r.expected).toBe("Aitäh!");
    expect(r.note).toBe("Almost, it's ä, not a.");
  });

  it("keeps an English gloss's capital and its infinitive marker", () => {
    expect(checkAnswer("x", "April", "en").expected).toBe("April");
    expect(checkAnswer("x", "To sleep", "en").expected).toBe("To sleep");
    expect(checkAnswer("sleep", "To sleep", "en").verdict).toBe("correct");
  });

  it("keeps a parenthetical, because the parentheses are what the dictionary says", () => {
    const r = checkAnswer("x", "(electric) kettle", "en");
    expect(r.expected).toBe("(electric) kettle");
    expect(checkAnswer("kettle", "(electric) kettle", "en").verdict).toBe("correct");
  });

  it("leads with the first of the alternatives a stored value carries", () => {
    expect(checkAnswer("x", "raamatutes / raamatuis").expected).toBe("raamatutes");
    expect(checkAnswer("x", "woman, wife", "en").expected).toBe("woman");
  });

  it("still flattens for comparison, which is what acceptedAnswers reports", () => {
    expect(acceptedAnswers("Head aega!", "et")).toEqual(["head aega"]);
    expect(acceptedForms("Head aega!", "et")).toEqual([
      { shown: "Head aega!", compared: "head aega" },
    ]);
  });
});

/*
  Hermetic: it reads the two files `npm run db:seed` loads and nothing else.
*/
interface SeedEntry { lemma: string; translation: string }
const EXPANDED: SeedEntry[] = JSON.parse(readFileSync("prisma/data/expanded.json", "utf8"));

describe("every shipped answer prints itself back", () => {
  const values: [string, "et" | "en"][] = [];
  for (const entry of EXPANDED) {
    values.push([entry.lemma, "et"]);
    if (entry.translation) values.push([entry.translation, "en"]);
  }
  for (const word of HARVESTED) {
    values.push([word.lemma, "et"]);
    if (word.gloss) values.push([word.gloss, "en"]);
  }

  it("never invents a spelling for a word or a gloss in the seed", () => {
    const invented: string[] = [];
    for (const [value, language] of values) {
      const shown = checkAnswer("zzzqqq", value, language).expected;
      if (!value.includes(shown)) invented.push(`${value} => ${shown}`);
    }
    expect(invented.slice(0, 10)).toEqual([]);
    expect(values.length).toBeGreaterThan(10_000);
  });
});

describe("checkAnswer — another form of the same word", () => {
  /*
    Every pair of Estonian cases is one letter apart, so the slip rule read
    them all as typos and `countsAsRecalled` sent them to the scheduler as
    recalls. Measured over the shipped dictionary, 47,982 of 51,513 case
    answers have another case of the same word one edit away.
  */
  const rivals = ["toast", "toale", "toalt", "tuppa", "toa"];

  it("is wrong rather than a slip, and does not count as recalled", () => {
    const out = checkAnswer("toast", "toas", "et", rivals);
    expect(out.verdict).toBe("wrong");
    expect(out.suggestedRating).toBe(1);
    expect(countsAsRecalled(out.verdict)).toBe(false);
  });

  it("does not claim a slip in the note", () => {
    expect(checkAnswer("toast", "toas", "et", rivals).note).not.toMatch(/So close/);
  });

  it("still calls a real slip a slip", () => {
    expect(checkAnswer("tooas", "toas", "et", rivals).verdict).toBe("typo");
  });

  it("never treats a second right spelling as a rival", () => {
    // `tuppa / toasse` are both the illative and both right.
    expect(checkAnswer("toasse", "tuppa / toasse", "et", ["tuppa", "toas"]).verdict).toBe("correct");
  });

  it("reads a wrong case with a dropped diacritic as the wrong case", () => {
    expect(checkAnswer("roomust", "rõõmus", "et", ["rõõmust"]).verdict).toBe("wrong");
  });

  it("behaves exactly as before when no forms are supplied", () => {
    expect(checkAnswer("toast", "toas", "et").verdict).toBe("typo");
  });
});
