import { describe, expect, it } from "vitest";
import {
  BLANK, buildPassageCloze, isClozeCorrect, isDiacriticSlip, splitSentences, type KnownForm,
} from "./passage";

const known: KnownForm[] = [
  { value: "toas", lexemeId: "L1", lemma: "tuba", translation: "room", formLabel: "inessive" },
  { value: "raamatut", lexemeId: "L2", lemma: "raamat", translation: "book", formLabel: "partitive" },
  { value: "raamatuid", lexemeId: "L2", lemma: "raamat", translation: "book", formLabel: "partitive plural" },
  { value: "õppima", lexemeId: "L3", lemma: "õppima", translation: "to learn", formLabel: "ma-infinitive" },
];

describe("splitSentences", () => {
  it("splits on terminating punctuation and keeps it", () => {
    expect(splitSentences("Ma olen toas. Sa loed raamatut!")).toEqual([
      "Ma olen toas.", "Sa loed raamatut!",
    ]);
  });

  it("collapses newlines and runs of space", () => {
    expect(splitSentences("Üks   lause.\n\nTeine lause.")).toEqual(["Üks lause.", "Teine lause."]);
  });

  it("returns a single sentence with no terminator", () => {
    expect(splitSentences("Ma olen toas")).toEqual(["Ma olen toas"]);
  });

  it("returns nothing for empty input", () => {
    expect(splitSentences("   ")).toEqual([]);
  });
});

describe("buildPassageCloze", () => {
  it("blanks a known form and keeps the rest of the sentence", () => {
    const [item] = buildPassageCloze("Ma istun praegu toas ja loen.", known);
    expect(item?.answer).toBe("toas");
    expect(item?.masked).toContain(BLANK.trim());
    expect(item?.masked).not.toContain("toas");
    expect(item?.sentence).toBe("Ma istun praegu toas ja loen.");
  });

  it("takes the answer from the learner's own text, not from the dictionary", () => {
    // The point of the feature: a native writer put that form there, so it is
    // authoritative without anything being generated.
    const [item] = buildPassageCloze("Ma istun praegu Toas ja loen.", known);
    expect(item?.answer).toBe("Toas");
  });

  it("records which word and which form was blanked", () => {
    const [item] = buildPassageCloze("Ma istun praegu toas ja loen.", known);
    expect(item).toMatchObject({ lemma: "tuba", translation: "room", formLabel: "inessive" });
  });

  it("blanks at most one word per sentence", () => {
    const items = buildPassageCloze("Ma loen toas seda raamatut praegu.", known);
    expect(items).toHaveLength(1);
  });

  it("skips a sentence with too little context to use", () => {
    expect(buildPassageCloze("Olen toas.", known)).toEqual([]);
  });

  it("skips a sentence containing no known word", () => {
    expect(buildPassageCloze("Täna on ilus ilm ja päike paistab.", known)).toEqual([]);
  });

  it("does not match a known form inside a longer word", () => {
    // "toaseinal" contains "toas" but is a different word.
    expect(buildPassageCloze("Ma nägin seda toaseinal eile õhtul.", known)).toEqual([]);
  });

  it("prefers the longest matching form", () => {
    const [item] = buildPassageCloze("Ma lugesin neid raamatuid terve eile õhtu.", known);
    expect(item?.answer).toBe("raamatuid");
    expect(item?.formLabel).toBe("partitive plural");
  });

  it("finds items across several sentences", () => {
    const items = buildPassageCloze(
      "Ma istun praegu toas ja loen. Ta tahab kõike õppima hakata kohe.",
      known,
    );
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.answer)).toEqual(["toas", "õppima"]);
  });

  it("honours the limit", () => {
    const text = Array.from({ length: 30 }, () => "Ma istun praegu toas ja loen.").join(" ");
    expect(buildPassageCloze(text, known, { limit: 5 })).toHaveLength(5);
  });

  it("returns nothing when the learner knows no words yet", () => {
    expect(buildPassageCloze("Ma istun praegu toas ja loen.", [])).toEqual([]);
  });

  it("handles a hyphenated compound as one token", () => {
    const withHyphen: KnownForm[] = [
      { value: "e-post", lexemeId: "L9", lemma: "e-post", translation: "email", formLabel: "nominative" },
    ];
    const [item] = buildPassageCloze("Ma saatsin sulle eile e-post ja ootan vastust.", withHyphen);
    expect(item?.answer).toBe("e-post");
  });
});

describe("isClozeCorrect", () => {
  it("accepts the exact answer", () => {
    expect(isClozeCorrect("toas", "toas")).toBe(true);
  });

  it("forgives case and surrounding space", () => {
    expect(isClozeCorrect("  Toas ", "toas")).toBe(true);
  });

  it("rejects a different case form", () => {
    // The whole exercise is producing the right form, so this must not pass.
    expect(isClozeCorrect("tuba", "toas")).toBe(false);
  });

  it("rejects a missing diacritic", () => {
    expect(isClozeCorrect("oppima", "õppima")).toBe(false);
  });
});

describe("isDiacriticSlip", () => {
  it("recognises a keyboard problem rather than a knowledge one", () => {
    expect(isDiacriticSlip("oppima", "õppima")).toBe(true);
  });

  it("is false when the answer is simply right", () => {
    expect(isDiacriticSlip("õppima", "õppima")).toBe(false);
  });

  it("is false when the answer is a genuinely different word", () => {
    expect(isDiacriticSlip("tuba", "toas")).toBe(false);
  });
});
