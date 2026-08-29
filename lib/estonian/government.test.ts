import { describe, expect, it } from "vitest";
import { buildOptions, maskExample, parseGovernment } from "./government";
import type { CaseKey } from "./types";

describe("parseGovernment", () => {
  it("parses the common shape: case, example, gloss", () => {
    const g = parseGovernment("partitive — aitan sind (I help you), not 'to you'");
    expect(g).toMatchObject({
      caseKey: "PARTITIVE",
      caseEn: "Partitive",
      caseEt: "osastav",
      example: "aitan sind",
      gloss: "I help you",
      experiencer: false,
    });
  });

  it("recognises an experiencer construction", () => {
    const g = parseGovernment(
      "allative experiencer — mulle meeldib see (I like it), literally 'to me it pleases'",
    );
    expect(g?.caseKey).toBe("ALLATIVE");
    expect(g?.experiencer).toBe(true);
    expect(g?.example).toBe("mulle meeldib see");
  });

  it("takes the first case named when the entry offers an alternative", () => {
    const g = parseGovernment("allative or -le peale — mõtlen sinule (I think of you)");
    expect(g?.caseKey).toBe("ALLATIVE");
  });

  it.each([
    ["elative — see sõltub sinust (that depends on you)", "ELATIVE"],
    ["comitative — nõustun sinuga (I agree with you)", "COMITATIVE"],
  ])("parses %j", (raw, expected) => {
    expect(parseGovernment(raw)?.caseKey).toBe(expected);
  });

  it("keeps the Estonian example exactly as stored", () => {
    // Nothing here may be regenerated — the example is the authoritative text.
    const raw = "partitive — kardan koera (I fear the dog)";
    expect(parseGovernment(raw)?.example).toBe("kardan koera");
    expect(parseGovernment(raw)?.raw).toBe(raw);
  });

  it("copes with an entry that has no bracketed gloss", () => {
    const g = parseGovernment("partitive — armastan sind");
    expect(g?.example).toBe("armastan sind");
    expect(g?.gloss).toBeNull();
  });

  it("copes with a bare case name and no example", () => {
    expect(parseGovernment("partitive")).toMatchObject({
      caseKey: "PARTITIVE", example: null, gloss: null,
    });
  });

  it.each([null, undefined, "", "   ", "takes a preposition"])(
    "returns null for %j rather than inventing a question",
    (raw) => {
      // A drill question built on a failed parse is a question with no right answer.
      expect(parseGovernment(raw)).toBeNull();
    },
  );
});

describe("buildOptions", () => {
  const pool: CaseKey[] = ["PARTITIVE", "ALLATIVE", "ELATIVE", "COMITATIVE"];
  // Deterministic "random" so option order is assertable.
  const fixed = () => 0.5;

  it("always contains the right answer", () => {
    expect(buildOptions("ELATIVE", pool, 4, fixed)).toContain("ELATIVE");
  });

  it("returns the requested number of options", () => {
    expect(buildOptions("ELATIVE", pool, 4, fixed)).toHaveLength(4);
  });

  it("never repeats an option", () => {
    const options = buildOptions("PARTITIVE", pool, 4, fixed);
    expect(new Set(options).size).toBe(options.length);
  });

  it("never offers the answer twice as a distractor", () => {
    const options = buildOptions("PARTITIVE", ["PARTITIVE", "PARTITIVE", "ALLATIVE"], 4, fixed);
    expect(options.filter((o) => o === "PARTITIVE")).toHaveLength(1);
  });

  it("tops up from the common government cases when the deck is too small", () => {
    // A learner with one governed verb still gets a real multiple choice.
    expect(buildOptions("PARTITIVE", [], 4, fixed)).toHaveLength(4);
  });

  it("draws distractors from the deck's own distribution when it can", () => {
    const options = buildOptions("PARTITIVE", ["ALLATIVE", "ELATIVE", "COMITATIVE"], 4, fixed);
    expect(options).toEqual(expect.arrayContaining(["PARTITIVE"]));
    expect(options.every((o) =>
      ["PARTITIVE", "ALLATIVE", "ELATIVE", "COMITATIVE"].includes(o))).toBe(true);
  });
});

describe("maskExample", () => {
  it("hides the governed complement", () => {
    expect(maskExample("aitan sind")).toBe("aitan …");
    expect(maskExample("mulle meeldib see")).toBe("mulle meeldib …");
  });

  it("leaves a one-word example alone rather than hiding all of it", () => {
    expect(maskExample("aitan")).toBe("aitan");
  });

  it("passes null through", () => {
    expect(maskExample(null)).toBeNull();
  });
});
