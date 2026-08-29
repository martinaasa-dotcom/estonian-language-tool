import { describe, expect, it } from "vitest";
import { BLANK, buildCloze, isBuildable, sentenceMatches, sentenceTiles } from "./cloze";

describe("buildCloze", () => {
  it("blanks the form that appears in the sentence", () => {
    const cloze = buildCloze("Jõin tassi kohvi.", ["kohv", "kohvi", "kohvile"]);
    expect(cloze?.text).toBe(`Jõin tassi ${BLANK}.`);
    expect(cloze?.answer).toBe("kohvi");
    expect(cloze?.full).toBe("Jõin tassi kohvi.");
  });

  it("prefers the longest matching form", () => {
    // `toa` and `toas` are both real forms of `tuba`; blanking `toa` out of
    // `toas` would leave "____s", which is unanswerable.
    const cloze = buildCloze("Ma olen toas ja loen.", ["toa", "toas", "tuba"]);
    expect(cloze?.answer).toBe("toas");
    expect(cloze?.text).toContain(`${BLANK} ja`);
  });

  it("matches regardless of case but keeps the original spelling", () => {
    const cloze = buildCloze("Tuba on suur ja valge.", ["tuba"]);
    expect(cloze?.answer).toBe("Tuba");
  });

  it("matches whole words only", () => {
    // `on` must not be found inside `sõnad`.
    expect(buildCloze("Need sõnad olid rasked.", ["on"])).toBeNull();
  });

  it("handles Estonian letters inside a word", () => {
    const cloze = buildCloze("Ta sõidab bussiga tööle.", ["sõidab"]);
    expect(cloze?.answer).toBe("sõidab");
  });

  it("returns null when no form of the word is present", () => {
    expect(buildCloze("Ilm on täna ilus.", ["raamat", "raamatu"])).toBeNull();
  });

  it("refuses a sentence too short to be a question", () => {
    expect(buildCloze("Tere hommikust!", ["tere"])).toBeNull();
  });

  it("returns null for empty input rather than throwing", () => {
    expect(buildCloze("", ["tuba"])).toBeNull();
    expect(buildCloze("Ma olen toas ja loen.", [])).toBeNull();
    expect(buildCloze("Ma olen toas ja loen.", ["  "])).toBeNull();
  });

  it("reports where the blank is, for highlighting the answer", () => {
    const cloze = buildCloze("Jõin tassi kohvi.", ["kohvi"]);
    expect(cloze?.full.slice(cloze.index, cloze.index + cloze.answer.length)).toBe("kohvi");
  });
});

describe("sentenceTiles", () => {
  it("splits into words and drops the punctuation that would give it away", () => {
    expect(sentenceTiles("Jõin tassi kohvi.")).toEqual(["Jõin", "tassi", "kohvi"]);
    expect(sentenceTiles("Kui palju see maksab?")).toEqual(["Kui", "palju", "see", "maksab"]);
  });

  it("keeps a hyphenated word whole", () => {
    expect(sentenceTiles("Eesti-inglise sõnaraamat on laual.")).toEqual(
      ["Eesti-inglise", "sõnaraamat", "on", "laual"],
    );
  });

  it("is empty for a sentence with no words", () => {
    expect(sentenceTiles("   ")).toEqual([]);
  });
});

describe("sentenceMatches", () => {
  const original = "Kitsed olid ojal joomas.";

  it("accepts the right order, ignoring the stripped punctuation", () => {
    expect(sentenceMatches(["Kitsed", "olid", "ojal", "joomas"], original)).toBe(true);
  });

  it("ignores capitalisation", () => {
    expect(sentenceMatches(["kitsed", "olid", "ojal", "joomas"], original)).toBe(true);
  });

  it("rejects the wrong order", () => {
    expect(sentenceMatches(["Olid", "kitsed", "ojal", "joomas"], original)).toBe(false);
  });

  it("rejects an incomplete sentence", () => {
    expect(sentenceMatches(["Kitsed", "olid"], original)).toBe(false);
  });
});

describe("isBuildable", () => {
  it("wants a sentence with an order worth getting right", () => {
    expect(isBuildable("Ma olen kodus.")).toBe(false);
    expect(isBuildable("Kitsed olid ojal joomas.")).toBe(true);
  });

  it("rejects a sentence long enough to be a memory test", () => {
    expect(isBuildable(
      "Kui ma hommikul ärkasin siis oli väljas juba päris valge ja linnud laulsid puudel.",
    )).toBe(false);
  });

  it("rejects a sentence with a repeated word, where wrong order is unfalsifiable", () => {
    expect(isBuildable("Ta on siin ja ta on rõõmus.")).toBe(false);
  });
});
