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

/*
  Ekilex writes government differently from the seed, and the difference was
  silently wrong rather than loudly broken.

  The seed puts the case name at the front. Ekilex records the question words a
  lexicographer noted, each annotated with the case it signals, ordered with
  the primary government first. Read with the rule written for the seed, the
  case came out of the app's own list order instead of the entry's, so a verb
  governing the allative was drilled as taking the partitive. The learner
  memorises whatever the drill says, which makes a confidently wrong answer
  the worst thing this screen can do.
*/
describe("parseGovernment, on the shape Ekilex writes", () => {
  it("takes the government Ekilex lists first, not the one the app lists first", () => {
    const g = parseGovernment("kellele (allative) · mida (partitive)");
    expect(g?.caseKey).toBe("ALLATIVE");
  });

  it("reads a single government", () => {
    expect(parseGovernment("millest (elative)")?.caseKey).toBe("ELATIVE");
  });

  it("reads the real aitama entry", () => {
    // As returned by Ekilex for `aitama`, question words and all.
    const g = parseGovernment("keda/mida* (partitive) · kellel + mida teha · millest (elative)");
    expect(g?.caseKey).toBe("PARTITIVE");
  });

  it("offers no example rather than inventing one", () => {
    // Ekilex keeps its sentences separately, as usages. The drill reads those;
    // this parser never composes one (ADR-005).
    expect(parseGovernment("kellele (allative) · mida (partitive)")?.example).toBeNull();
  });

  it("still reads the seed shape, which puts the case first", () => {
    const g = parseGovernment("partitive — aitan sind (I help you)");
    expect(g?.caseKey).toBe("PARTITIVE");
    expect(g?.example).toBe("aitan sind");
  });

  it("returns null when nothing in the entry names a case", () => {
    expect(parseGovernment("kellel + mida teha")).toBeNull();
  });
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

  it("offers the cases an object could otherwise be in", () => {
    /*
      Which three of the deck's cases get printed is a ranking now, not a
      shuffle: nimetav and omastav are the two other cases an Estonian object
      is ever in, so a question about osastav that offers alaleütlev and
      alaltütlev instead is asking whether the learner knows an object from a
      direction, which they answered by knowing the verb was transitive.
    */
    const wide: CaseKey[] = ["ALLATIVE", "ELATIVE", "COMITATIVE", "GENITIVE", "NOMINATIVE", "ADESSIVE"];
    const options = buildOptions("PARTITIVE", wide, 4, fixed);
    expect(options).toContain("GENITIVE");
    expect(options).toContain("NOMINATIVE");
  });

  it("tops up with the near cases rather than the head of a list", () => {
    // With an empty deck the fallback fills the question, and it is ordered by
    // what is hard to tell from the answer rather than by how it was typed.
    const options = buildOptions("ADESSIVE", [], 4, fixed);
    // -le beside -l is the hard one. Partitive heads the list and was always
    // taken first, which for a question about alalütlev is the easy one.
    expect(options).toContain("ALLATIVE");
    expect(options).not.toContain("PARTITIVE");
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
