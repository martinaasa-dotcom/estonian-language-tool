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
    // A retrieved form, as Ekilex supplies them. A gap can only hide a
    // form we actually hold — the same rule the cloze cards follow.
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

  it("cannot hide a form the dictionary does not hold", () => {
    // Only principal parts are stored for this word, and none of them appears
    // in the sentence — so there is nothing to blank, and nothing is invented.
    const principalOnly = word({
      forms: [
        { formType: "NOM_SG", value: "tuba" },
        { formType: "GEN_SG", value: "toa" },
        { formType: "PART_SG", value: "tuba" },
      ],
    });
    expect(buildWorksheet([principalOnly]).gaps).toEqual([]);
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

  it("honours the limits it is given", () => {
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
