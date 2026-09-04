import { describe, expect, it } from "vitest";
import { ASKABLE_CASES, markDescription, taskFor, type SceneWord } from "./describe";

const forms = (parts: Record<string, string>) =>
  Object.entries(parts).map(([formType, value]) => ({ formType, value }));

const maja: SceneWord = {
  lemma: "maja", pos: "NOUN", translation: "house", emoji: "🏠", semanticTypes: null,
  forms: forms({ NOM_SG: "maja", GEN_SG: "maja", PART_SG: "maja" }),
};
const koer: SceneWord = {
  lemma: "koer", pos: "NOUN", translation: "dog", emoji: "🐕", semanticTypes: null,
  forms: forms({ NOM_SG: "koer", GEN_SG: "koera", PART_SG: "koera" }),
};
/*
  With the plural a lexicographer wrote down, because nothing derives it. It
  used to be `genSg + d`, and `scripts/audit-cases.ts` put that to the
  Institute for every nominal the dictionary ships: right for 5,098 of 5,143
  and wrong for every pronoun with a plural, since `see` goes to `need` and no
  ending reaches it. So `NOM_PL` is a stored principal part, 98.5% of the
  nominals in the shipped dictionary carry one, and a fixture without it is a
  word the dictionary has never been asked about rather than an ordinary entry.
*/
const lind: SceneWord = {
  lemma: "lind", pos: "NOUN", translation: "bird", emoji: "🐦", semanticTypes: null,
  forms: forms({ NOM_SG: "lind", GEN_SG: "linnu", PART_SG: "lindu", NOM_PL: "linnud" }),
};

const scene = { id: "pets", situation: "Pets" };
const words = [maja, koer, lind];

describe("taskFor", () => {
  it("asks for a case the dictionary can answer", () => {
    const task = taskFor(scene, words, 1, "INESSIVE");
    expect(task?.shown).toEqual(["koeras"]);
    expect(task?.accepted).toContain("koeras");
  });

  it("sets no task on a word with no genitive stem", () => {
    const aitah: SceneWord = {
      lemma: "aitäh", pos: "NOUN", translation: "thanks", emoji: "🙏", semanticTypes: null,
      forms: forms({ NOM_SG: "aitäh" }),
    };
    expect(taskFor(scene, [aitah], 0, "INESSIVE")).toBeNull();
  });

  /*
    The prompt shows all three scene words, so a task whose answer is one of
    them is completed by copying. `liblikas` has the genitive `liblika`, so its
    seesütlev is `liblika` plus `s`, which is the word again, and eight of the
    1,980 tasks the sixty scenes can set were free that way.
  */
  it("sets no task on a case the word is already spelled as", () => {
    const liblikas: SceneWord = {
      lemma: "liblikas", pos: "NOUN", translation: "butterfly", emoji: "🦋", semanticTypes: null,
      forms: forms({ NOM_SG: "liblikas", GEN_SG: "liblika", PART_SG: "liblikat" }),
    };
    expect(taskFor(scene, [liblikas], 0, "INESSIVE")).toBeNull();
    // And the word is still askable in the ten cases that do change it.
    expect(taskFor(scene, [liblikas], 0, "ELATIVE")?.shown).toEqual(["liblikast"]);
  });

  it("sets no task on a principal part, which is stored rather than derived", () => {
    expect(taskFor(scene, words, 1, "GENITIVE")).toBeNull();
    expect(taskFor(scene, words, 1, "NOMINATIVE")).toBeNull();
  });

  it("offers only the eleven cases built on the genitive stem", () => {
    expect(ASKABLE_CASES).toHaveLength(11);
    expect(ASKABLE_CASES).not.toContain("NOMINATIVE");
    expect(ASKABLE_CASES).not.toContain("PARTITIVE");
  });

  it("keeps both illatives, and shows both", () => {
    const tuba: SceneWord = {
      lemma: "tuba", pos: "NOUN", translation: "room", emoji: "🛏️", semanticTypes: null,
      forms: forms({ NOM_SG: "tuba", GEN_SG: "toa", PART_SG: "tuba", ILL_SG_SHORT: "tuppa" }),
    };
    const task = taskFor(scene, [tuba], 0, "ILLATIVE")!;
    // The short one leads, because it is the form anybody says, and the long
    // one stands beside it because it is also right.
    expect(task.shown).toEqual(["tuppa", "toasse"]);
  });
});

describe("markDescription", () => {
  const task = taskFor(scene, words, 1, "INESSIVE")!;

  it("takes the required case and grades it Good", () => {
    const mark = markDescription(task, "Koeras on midagi imelikku.");
    expect(mark.rightCase).toBe(true);
    expect(mark.rating).toBe(3);
  });

  it("grades the right word in the wrong case Hard, and names what was written", () => {
    const mark = markDescription(task, "Koerast räägitakse palju.");
    expect(mark.rightCase).toBe(false);
    expect(mark.rating).toBe(2);
    expect(mark.written).toBe("koerast");
    expect(mark.verdict).toEqual({ kind: "one", key: "ELATIVE" });
  });

  it("grades a sentence without the word at all Again", () => {
    const mark = markDescription(task, "Majas on palju linde.");
    expect(mark.rating).toBe(1);
    expect(mark.written).toBeNull();
    expect(mark.verdict).toBeNull();
  });

  it("ticks off every scene word the sentence used, in any form", () => {
    const mark = markDescription(task, "Koeras ja majas elavad linnud.");
    // `maja` in the inessive, `koer` in the inessive, `lind` in the plural
    // nominative: three different endings, and every one of them counts as the
    // word being used. The plural is the one the entry carries rather than one
    // built from the genitive, which is not a rule in this language.
    expect(mark.used).toEqual([true, true, true]);
  });

  it("accepts the other true illative without printing it as the answer", () => {
    const tuba: SceneWord = {
      lemma: "tuba", pos: "NOUN", translation: "room", emoji: "🛏️", semanticTypes: null,
      forms: forms({ NOM_SG: "tuba", GEN_SG: "toa", PART_SG: "tuba", ILL_SG_SHORT: "tuppa" }),
    };
    const illative = taskFor(scene, [tuba], 0, "ILLATIVE")!;
    expect(markDescription(illative, "Ma lähen tuppa.").rightCase).toBe(true);
    expect(markDescription(illative, "Ma lähen toasse.").rightCase).toBe(true);
  });

  it("says nothing about a case where two of them share the spelling", () => {
    const mark = markDescription(task, "Ma nägin koera.");
    // `koera` is the omastav and the osastav both. Naming either would be a
    // coin toss, so the screen is told there is nothing to name.
    expect(mark.rightCase).toBe(false);
    expect(mark.verdict?.kind).toBe("shared");
    expect(mark.rating).toBe(2);
  });

  it("matches whole words, so a stem inside a longer word is not the word", () => {
    // `koera` sits inside `koerad`, and crediting the genitive for a plural
    // would report a case the sentence does not contain.
    const mark = markDescription(task, "Majas jooksevad koerad ringi.");
    expect(mark.rightCase).toBe(false);
    expect(mark.verdict).toBeNull();
  });

  it("knows a fragment is not a sentence", () => {
    expect(markDescription(task, "koeras").isSentence).toBe(false);
    expect(markDescription(task, "Koeras on midagi.").isSentence).toBe(true);
  });
});
