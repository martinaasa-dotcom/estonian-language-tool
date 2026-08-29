import { describe, expect, it } from "vitest";
import {
  mergeExamples, parseExamples, sentenceContaining, sentenceWords, serialiseExamples, usableExamples,
  type Example,
} from "./examples";

const ek = (et: string, en?: string): Example => ({ et, source: "EKILEX", ...(en ? { en } : {}) });

describe("parseExamples", () => {
  it("reads what serialiseExamples wrote", () => {
    const examples = [ek("Jõin tassi kohvi.", "I drank a cup of coffee.")];
    expect(parseExamples(serialiseExamples(examples))).toEqual([
      { et: "Jõin tassi kohvi.", en: "I drank a cup of coffee.", source: "EKILEX" },
    ]);
  });

  it("treats a missing or empty column as no examples", () => {
    expect(parseExamples(null)).toEqual([]);
    expect(parseExamples("")).toEqual([]);
    expect(parseExamples("[]")).toEqual([]);
  });

  it("survives a malformed column rather than throwing on the page", () => {
    expect(parseExamples("{not json")).toEqual([]);
    expect(parseExamples('"a string"')).toEqual([]);
  });

  it("drops entries that are not sentences", () => {
    expect(parseExamples(JSON.stringify([{ source: "EKILEX" }, { et: "   " }, ek("Ta on kodus.")])))
      .toEqual([{ et: "Ta on kodus.", source: "EKILEX" }]);
  });
});

describe("usableExamples", () => {
  it("drops fragments and paragraphs", () => {
    const kept = usableExamples([
      ek("Ei."),
      ek("Jõin tassi kohvi."),
      ek("x".repeat(200)),
    ]);
    expect(kept.map((e) => e.et)).toEqual(["Jõin tassi kohvi."]);
  });

  it("puts the shortest first — a beginner reads the one-liner", () => {
    const kept = usableExamples([
      ek("Sünnipäevapeol sai hästi süüa ja juua."),
      ek("Jõin tassi kohvi."),
    ]);
    expect(kept[0]!.et).toBe("Jõin tassi kohvi.");
  });

  it("removes duplicates, ignoring case and stray whitespace", () => {
    const kept = usableExamples([ek("Jõin tassi kohvi."), ek("jõin  tassi kohvi.")]);
    expect(kept).toHaveLength(1);
  });

  it("caps how many one word can carry", () => {
    const many = Array.from({ length: 20 }, (_, i) => ek(`Ta läks sinna number ${i} korda.`));
    expect(usableExamples(many).length).toBeLessThanOrEqual(8);
  });
});

describe("mergeExamples", () => {
  it("keeps a translation already resolved when the sentence is refetched", () => {
    const merged = mergeExamples(
      [ek("Jõin tassi kohvi.", "I drank a cup of coffee.")],
      [ek("Jõin tassi kohvi.")],
    );
    expect(merged[0]!.en).toBe("I drank a cup of coffee.");
  });

  it("adds sentences that are new", () => {
    const merged = mergeExamples([ek("Jõin tassi kohvi.")], [ek("Kitsed olid ojal joomas.")]);
    expect(merged).toHaveLength(2);
  });

  it("does not duplicate a sentence that only differs by case", () => {
    const merged = mergeExamples([ek("Jõin tassi kohvi.")], [ek("JÕIN TASSI KOHVI.")]);
    expect(merged).toHaveLength(1);
  });
});

describe("sentenceWords", () => {
  it("keeps Estonian letters and drops punctuation", () => {
    expect(sentenceWords("Jõin tassi kohvi.")).toEqual(["jõin", "tassi", "kohvi"]);
  });

  it("keeps a hyphenated word whole", () => {
    expect(sentenceWords("üle-eestiline võistlus")).toEqual(["üle-eestiline", "võistlus"]);
  });

  it("copes with quotes, dashes and numbers between words", () => {
    expect(sentenceWords("«Tere!» — ütles ta 2007. aastal")).toEqual([
      "tere", "ütles", "ta", "aastal",
    ]);
  });
});

describe("sentenceContaining", () => {
  const ex = (et: string, en?: string): Example => ({ et, en: en ?? null, source: "EKILEX" });

  it("finds a sentence holding the form as a whole word", () => {
    const found = sentenceContaining([ex("Ta istub toas ja loeb.")], "toas");
    expect(found?.et).toBe("Ta istub toas ja loeb.");
  });

  it("does not match a form that is only a substring of another word", () => {
    // `toa` is inside `toas`. Offering this sentence as an example of the
    // genitive would be teaching the inessive by accident.
    expect(sentenceContaining([ex("Ta istub toas ja loeb.")], "toa")).toBeNull();
  });

  it("ignores case, including Estonian letters", () => {
    expect(sentenceContaining([ex("Õues sajab vihma.")], "õues")?.et).toBe("Õues sajab vihma.");
  });

  it("prefers a sentence that has been translated", () => {
    const found = sentenceContaining(
      [ex("Ma ootan bussi peatuses."), ex("Bussi ei tulnud.", "The bus did not come.")],
      "bussi",
    );
    expect(found?.en).toBe("The bus did not come.");
  });

  it("returns nothing for an empty form or an empty list", () => {
    expect(sentenceContaining([ex("Ta istub toas.")], "  ")).toBeNull();
    expect(sentenceContaining([], "toas")).toBeNull();
  });
});
