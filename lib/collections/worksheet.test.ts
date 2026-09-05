import { describe, expect, it } from "vitest";
import { BLANK } from "@/lib/estonian/cloze";
import { buildWorksheet, type WorksheetWord } from "./worksheet";

const word = (over: Partial<WorksheetWord> = {}): WorksheetWord => ({
  lemma: "tuba",
  translation: "room",
  pos: "NOUN",
  forms: [
    { formType: "NOM_SG", value: "tuba" },
    { formType: "GEN_SG", value: "toa" },
    { formType: "PART_SG", value: "tuba" },
    // A retrieved form, as Ekilex supplies them. A gap hides a form the app
    // can vouch for, which is a stored one or one of the two derivations
    // ADR-005 amendment 1 allows, and it has to stand in the sentence.
    { formType: "EKILEX:SgIn", value: "toas" },
  ],
  examples: [{ et: "Ta istub toas ja loeb raamatut.", en: null, source: "EKILEX" }],
  ...over,
});

describe("buildWorksheet", () => {
  it("lists the vocabulary in the order it was given", () => {
    const sheet = buildWorksheet([
      word({ lemma: "tuba", translation: "room" }),
      word({ lemma: "aken", translation: "window" }),
    ]);
    expect(sheet.vocabulary.map((v) => v.lemma)).toEqual(["tuba", "aken"]);
  });

  it("skips a word with no translation to ask for", () => {
    const sheet = buildWorksheet([word({ translation: "   " })]);
    expect(sheet.vocabulary).toEqual([]);
  });

  it("blanks an inflected form inside a real sentence", () => {
    const sheet = buildWorksheet([word()]);
    expect(sheet.gaps).toHaveLength(1);
    expect(sheet.gaps[0]?.answer).toBe("toas");
    expect(sheet.gaps[0]?.text).toContain(BLANK);
    expect(sheet.gaps[0]?.text).not.toContain("toas");
    // The dictionary form is the hint, so the exercise is the ending.
    expect(sheet.gaps[0]?.hint).toBe("tuba");
  });

  it("keeps the English translation with the gap when there is one", () => {
    const sheet = buildWorksheet([
      word({ examples: [{ et: "Ta istub toas ja loeb.", en: "He sits in the room and reads.", source: "EKILEX" }] }),
    ]);
    expect(sheet.gaps[0]?.english).toBe("He sits in the room and reads.");
  });

  it("produces no gap for a word with no usable sentence", () => {
    expect(buildWorksheet([word({ examples: [] })]).gaps).toEqual([]);
    // Too short to hide a word in and still be a question.
    expect(buildWorksheet([word({ examples: [{ et: "Ilus tuba.", source: "EKILEX" }] })]).gaps).toEqual([]);
  });

  /*
    THIS USED TO ASSERT THE LIMITATION AS IF IT WERE THE RULE.

    It gave the word its three principal parts, took `toas` away, and expected
    no gap, on the reasoning that "nothing is invented". `toas` is the
    inessive, which is the genitive stem this word does store plus `-s`: it is
    what the entry prints, what the grammar page teaches and what a card
    already asks for. Not hiding it was the worksheet knowing fewer forms than
    the rest of the app, which is what its own comment about `tuba` and `toas`
    had been describing all along.
  */
  it("hides a case worked out from the stem, which is what the sentence has in it", () => {
    const principalOnly = word({
      forms: [
        { formType: "NOM_SG", value: "tuba" },
        { formType: "GEN_SG", value: "toa" },
        { formType: "PART_SG", value: "tuba" },
      ],
    });
    expect(buildWorksheet([principalOnly]).gaps[0]?.answer).toBe("toas");
  });

  it("hides a verb person worked out from the stored first person", () => {
    const verb = word({
      lemma: "algama", translation: "to begin", pos: "VERB",
      forms: [{ formType: "PRES_1SG", value: "algan" }],
      examples: [{ et: "Kontsert algab kell kaheksa.", en: null, source: "EKILEX" }],
    });
    expect(buildWorksheet([verb]).gaps[0]?.answer).toBe("algab");
  });

  it("takes a later sentence rather than gap the word printed beside the blank", () => {
    /*
      The sheet prints the lemma in brackets after the blank, so a gap whose
      answer is the lemma is answered by copying the bracket. The first sentence
      here is the nominative, which is what a lexicographer usually writes.
    */
    const both = word({
      examples: [
        { et: "Ilus tuba on siin ja seal.", en: null, source: "EKILEX" },
        { et: "Ta istub toas ja loeb raamatut.", en: null, source: "EKILEX" },
      ],
    });
    expect(buildWorksheet([both]).gaps[0]?.answer).toBe("toas");
  });

  it("sets no gap at all where every sentence would gap the lemma", () => {
    const nominativeOnly = word({
      examples: [{ et: "Ilus tuba on siin ja seal.", en: null, source: "EKILEX" }],
    });
    expect(buildWorksheet([nominativeOnly]).gaps).toEqual([]);
  });

  it("hides nothing when no form of the word stands in the sentence", () => {
    const elsewhere = word({
      examples: [{ et: "Ta istub siin ja loeb raamatut.", en: null, source: "EKILEX" }],
    });
    expect(buildWorksheet([elsewhere]).gaps).toEqual([]);
  });

  it("builds a case row only when both principal parts are held", () => {
    const missing = word({ forms: [{ formType: "NOM_SG", value: "tuba" }] });
    expect(buildWorksheet([missing]).cases).toEqual([]);
    expect(buildWorksheet([word()]).cases).toHaveLength(1);
  });

  it("leaves verbs out of the case table", () => {
    expect(buildWorksheet([word({ pos: "VERB" })]).cases).toEqual([]);
  });

  it("rotates which cells are blank so the sheet is not one column", () => {
    const sheet = buildWorksheet([
      word({ lemma: "a" }), word({ lemma: "b" }), word({ lemma: "c" }), word({ lemma: "d" }),
    ]);
    expect(sheet.cases.map((c) => c.blanks)).toEqual([
      ["genitive"], ["partitive"], ["genitive", "partitive"], ["genitive"],
    ]);
  });

  it("keeps every answer in the row, blank or not — the key needs them", () => {
    const [row] = buildWorksheet([word()]).cases;
    expect(row).toMatchObject({ nominative: "tuba", genitive: "toa", partitive: "tuba" });
  });

  it("honors the limits it is given", () => {
    const words = Array.from({ length: 20 }, (_, i) => word({ lemma: `w${i}` }));
    const sheet = buildWorksheet(words, { vocabulary: 3, gaps: 2, cases: 1 });
    expect(sheet.vocabulary).toHaveLength(3);
    expect(sheet.gaps).toHaveLength(2);
    expect(sheet.cases).toHaveLength(1);
  });

  it("is deterministic — the same unit prints the same sheet twice", () => {
    const words = [word({ lemma: "tuba" }), word({ lemma: "aken" }), word({ lemma: "laud" })];
    expect(buildWorksheet(words)).toEqual(buildWorksheet(words));
  });

  it("says so when there is nothing to print", () => {
    const sheet = buildWorksheet([]);
    expect(sheet.empty).toBe(true);
    expect(buildWorksheet([word()]).empty).toBe(false);
  });
});
