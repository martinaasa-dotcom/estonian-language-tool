import { describe, expect, it } from "vitest";

import { gapForms, gapFormsFromParts } from "./gapForms";

const TUBA = {
  lemma: "tuba",
  pos: "NOUN",
  forms: [
    { formType: "NOM_SG", value: "tuba" },
    { formType: "GEN_SG", value: "toa" },
    { formType: "PART_SG", value: "tuba" },
    { formType: "ILL_SG_SHORT", value: "tuppa" },
  ],
};

const ALGAMA = {
  lemma: "algama",
  pos: "VERB",
  forms: [
    { formType: "INF_MA", value: "algama" },
    { formType: "PRES_1SG", value: "algan" },
    { formType: "PAST_1SG", value: "algasin" },
  ],
};

describe("gapForms", () => {
  it("holds every stored form, keyed the way a sentence would spell it", () => {
    const forms = gapForms(TUBA);
    for (const stored of ["tuba", "toa", "tuppa"]) expect(forms.has(stored)).toBe(true);
  });

  it("holds the cases worked out from the genitive stem, which is what a sentence has", () => {
    const forms = gapForms(TUBA);
    expect(forms.get("toas")).toBe("INESSIVE");
    expect(forms.get("toast")).toBe("ELATIVE");
    expect(forms.get("toaga")).toBe("COMITATIVE");
  });

  it("holds both illatives, because a lexicographer may have written either", () => {
    const forms = gapForms(TUBA);
    expect(forms.get("tuppa")).toBe("ILLATIVE");
    expect(forms.get("toasse")).toBe("ILLATIVE");
  });

  it("holds a verb's persons and calls none of them a case", () => {
    const forms = gapForms(ALGAMA);
    for (const person of ["algab", "algad", "algame", "algavad"]) {
      expect(forms.has(person)).toBe(true);
      expect(forms.get(person)).toBeNull();
    }
    expect(forms.get("algaksin")).toBeNull();
  });

  it("does not offer a case table for a verb, which has none", () => {
    expect(gapForms(ALGAMA).get("algas")).toBeUndefined();
  });

  it("calls the headword no case at all", () => {
    expect(gapForms(TUBA).get("tuba")).toBeNull();
  });

  it("says nothing about a word with nothing stored", () => {
    expect(gapForms({ lemma: "", pos: "NOUN", forms: [] }).size).toBe(0);
  });

  it("reads a word held as principal parts the same way", () => {
    const fromParts = gapFormsFromParts({
      lemma: "tuba", pos: "NOUN",
      parts: { NOM_SG: "tuba", GEN_SG: "toa", PART_SG: "tuba", ILL_SG_SHORT: "tuppa" },
    });
    expect(fromParts.get("toas")).toBe("INESSIVE");
    expect(fromParts.get("tuppa")).toBe("ILLATIVE");
  });

  /*
    A STORED SLOT OUTRANKS A GUESSED ONE.

    `tuba` is its own nominative and its own partitive, and Ekilex names a
    retrieved form outright. A suffix rule reaching the same string later must
    not relabel it, because the label is what the accuracy chart counts.
  */
  it("keeps the slot the dictionary named over the one a rule would guess", () => {
    const forms = gapForms({
      ...TUBA,
      forms: [...TUBA.forms, { formType: "EKILEX:SgIn", value: "toas", morphCode: "SgIn" }],
    });
    expect(forms.get("toas")).toBe("INESSIVE");
  });
});
