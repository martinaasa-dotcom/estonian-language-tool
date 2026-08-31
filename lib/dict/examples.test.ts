import { describe, expect, it } from "vitest";
import {
  mergeExamples, parseExamples, sentenceContaining, sentenceWords, serialiseExamples, splitOnForm,
  teachingSentence, usableExamples,
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

describe("teachingSentence", () => {
  const examples = [
    ek("Kohv on laual."),
    ek("Jõin tassi kohvi.", "I drank a cup of coffee."),
    ek("Ma ei taha täna kohvi juua."),
  ];

  it("prefers the sentence carrying the form the card is about to ask for", () => {
    // Ranked above the lemma on purpose: a learner meeting the partitive
    // learns nothing from a sentence carrying the nominative.
    const found = teachingSentence(examples, ["kohvi", "kohv"]);
    expect(found?.form).toBe("kohvi");
    expect(found?.example.et).toBe("Jõin tassi kohvi.");
  });

  it("falls back to the lemma when nothing carries the asked form", () => {
    const found = teachingSentence(examples, ["kohvile", "kohv"]);
    expect(found?.form).toBe("kohv");
    expect(found?.example.et).toBe("Kohv on laual.");
  });

  it("still offers a sentence when neither appears, and marks nothing in it", () => {
    // Worth showing: seeing a word inflected in a way you did not expect is
    // how anybody works out that Estonian inflects. Pointing at a word that is
    // not the one being taught would be worse than pointing at nothing.
    const found = teachingSentence([ek("Ilm on täna ilus.")], ["kohvi", "kohv"]);
    expect(found?.form).toBeNull();
    expect(found?.example.et).toBe("Ilm on täna ilus.");
  });

  it("has nothing to say about a word with no usable examples", () => {
    expect(teachingSentence([], ["kohv"])).toBeNull();
    expect(teachingSentence([ek("Ei.")], ["kohv"])).toBeNull();
  });

  it("skips blank and repeated candidates rather than matching on them", () => {
    const found = teachingSentence(examples, [null, "", "kohvi", "kohvi"]);
    expect(found?.form).toBe("kohvi");
  });
});

describe("splitOnForm", () => {
  it("marks the form and leaves the rest of the sentence alone", () => {
    expect(splitOnForm("Jõin tassi kohvi.", "kohvi")).toEqual([
      { text: "Jõin tassi ", match: false },
      { text: "kohvi", match: true },
      { text: ".", match: false },
    ]);
  });

  it("marks whole words only, so a stem inside a longer form is left alone", () => {
    // The same rule sentenceContaining is built on: `toa` sits inside `toas`,
    // and marking it there would point at a case the sentence does not carry.
    expect(splitOnForm("Toas on soe.", "toa")).toEqual([{ text: "Toas on soe.", match: false }]);
  });

  it("holds the boundary on Estonian's own letters", () => {
    // `\b` is defined on ASCII word characters, so õ is a boundary to it and
    // a naive pattern would match the tail of a longer word.
    expect(splitOnForm("Sõidan tööle.", "sõida")).toEqual([{ text: "Sõidan tööle.", match: false }]);
    expect(splitOnForm("Ma sõidan.", "sõidan")).toEqual([
      { text: "Ma ", match: false },
      { text: "sõidan", match: true },
      { text: ".", match: false },
    ]);
  });

  it("marks every occurrence, whatever the case", () => {
    const runs = splitOnForm("Kohv on kohv.", "kohv");
    expect(runs.filter((r) => r.match).map((r) => r.text)).toEqual(["Kohv", "kohv"]);
  });

  it("returns the whole sentence unmarked when there is no form to mark", () => {
    expect(splitOnForm("Ilm on ilus.", null)).toEqual([{ text: "Ilm on ilus.", match: false }]);
  });

  it("treats a form with regex characters in it as text", () => {
    expect(splitOnForm("Üle-eestiline võistlus.", "üle-eestiline")).toEqual([
      { text: "Üle-eestiline", match: true },
      { text: " võistlus.", match: false },
    ]);
  });
});
