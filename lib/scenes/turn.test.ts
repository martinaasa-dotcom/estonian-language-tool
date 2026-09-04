import { describe, expect, it } from "vitest";
import { buildLexicon, type DictEntry } from "./lexicon";
import { readTurn, type TurnContext } from "./turn";
import type { Requirement } from "./types";

const entries: DictEntry[] = [
  { lemma: "valu", pos: "NOUN", cefr: "A2", parts: { NOM_SG: "valu", GEN_SG: "valu", PART_SG: "valu" }, usages: [] },
  { lemma: "pea", pos: "NOUN", cefr: "A1", parts: { NOM_SG: "pea", GEN_SG: "pea", PART_SG: "pead" }, usages: [] },
  { lemma: "olema", pos: "VERB", cefr: "A1", parts: { INF_MA: "olema", INF_DA: "olla", PRES_1SG: "olen", PAST_1SG: "olin" }, usages: [],
    extraForms: [{ code: "IndPrSg3", value: "on" }, { code: "Neg", value: "pole" }] },
  { lemma: "mina", pos: "PRONOUN", cefr: "A1", parts: { NOM_SG: "mina", GEN_SG: "minu", PART_SG: "mind" }, usages: [],
    extraForms: [{ code: "SgAd", value: "mul" }] },
  { lemma: "teie", pos: "PRONOUN", cefr: "A1", parts: { NOM_SG: "teie", GEN_SG: "teie", PART_SG: "teid" }, usages: [] },
  { lemma: "mis", pos: "PRONOUN", cefr: "A1", parts: { NOM_SG: "mis", GEN_SG: "mille", PART_SG: "mida" }, usages: [] },
  { lemma: "ei", pos: "ADVERB", cefr: "A1", parts: {}, usages: [] },
  { lemma: "Tere!", pos: "PHRASE", cefr: "A1", parts: {}, usages: ["Tere!"] },
  { lemma: "teisipäev", pos: "NOUN", cefr: "A1", parts: { NOM_SG: "teisipäev", GEN_SG: "teisipäeva", PART_SG: "teisipäeva" }, usages: [] },
];
const lexicon = buildLexicon(entries);
const ctx: TurnContext = {
  lexicon,
  questionWords: new Set(lexicon.byLemma.get("mis") ?? []),
  negation: new Set(["ei", "pole"]),
  register: new Set(lexicon.byLemma.get("teie") ?? []),
  props: [
    { slot: "since", kind: "weekday", display: "Tuesday", lemma: "teisipäev", accepted: ["teisipäev", ...(lexicon.byLemma.get("teisipäev") ?? [])] },
    { slot: "time", kind: "clock", display: "14:00", lemma: null, accepted: ["14:00", "14.00", "14", "kell 14"] },
  ],
  caseForms: new Map([["pea|INESSIVE", ["peas"]]]),
};
const lemma = (oneOf: string[]): Requirement => ({ kind: "lemma", oneOf });

describe("reading a turn", () => {
  it("completes a beat on a vouched form of a named word", () => {
    const e = readTurn({ text: "Mul on valu peas.", needs: [lemma(["valu"])], shape: "sentence", ctx, lastLine: null });
    expect(e.outcome).toBe("complete");
    expect(e.met[0]).toEqual({ met: true, with: "valu" });
    expect(e.unknown).toEqual([]);
  });

  it("marks an inflected form, since the learner says what a person says", () => {
    const e = readTurn({ text: "Mul on pead valus", needs: [lemma(["pea"])], shape: "sentence", ctx, lastLine: null });
    expect(e.met[0]?.met).toBe(true);
    // `valus` is not a form the fixture holds, so it is an unknown and the turn still completes.
    expect(e.outcome).toBe("complete");
  });

  it("answers a datum with the weekday in any form, or the time as digits", () => {
    const since = readTurn({ text: "Teisipäeva.", needs: [{ kind: "datum", slot: "since" }], shape: "word", ctx, lastLine: null });
    expect(since.outcome).toBe("complete");
    const time = readTurn({ text: "Kell 14 sobib.", needs: [{ kind: "datum", slot: "time" }], shape: "word", ctx, lastLine: null });
    expect(time.outcome).toBe("complete");
    const wrong = readTurn({ text: "Kell 140.", needs: [{ kind: "datum", slot: "time" }], shape: "word", ctx, lastLine: null });
    expect(wrong.met[0]?.met).toBe(false);
  });

  it("tells English from unreadable Estonian", () => {
    const en = readTurn({ text: "Sorry, I do not understand you.", needs: [lemma(["valu"])], shape: "sentence", ctx, lastLine: null });
    expect(en.outcome).toBe("english");
    const noise = readTurn({ text: "xqzv brrt", needs: [lemma(["valu"])], shape: "sentence", ctx, lastLine: null });
    expect(noise.outcome).toBe("unrecognised");
  });

  it("does not count their own line said back", () => {
    const e = readTurn({ text: "Mis teil on?", needs: [lemma(["valu"])], shape: "sentence", ctx, lastLine: "Mis teil on?" });
    expect(e.outcome).toBe("repeat");
  });

  it("wants a sentence where a word is a dodge, and lets a datum be one word", () => {
    const short = readTurn({ text: "Valu.", needs: [lemma(["valu"])], shape: "sentence", ctx, lastLine: null });
    expect(short.outcome).toBe("tooShort");
    const ok = readTurn({ text: "Valu.", needs: [lemma(["valu"])], shape: "word", ctx, lastLine: null });
    expect(ok.outcome).toBe("complete");
  });

  it("separates real words that missed the point from nothing at all", () => {
    const off = readTurn({ text: "Mina olen mina.", needs: [lemma(["valu"])], shape: "sentence", ctx, lastLine: null });
    expect(off.outcome).toBe("offTarget");
    expect(off.recognised.length).toBeGreaterThan(0);
  });

  it("reads a question mark or a question word, a negator, and a case form", () => {
    expect(readTurn({ text: "Millal?", needs: [{ kind: "question" }], shape: "word", ctx, lastLine: null }).outcome).toBe("complete");
    expect(readTurn({ text: "mida te tahate", needs: [{ kind: "question" }], shape: "sentence", ctx, lastLine: null }).outcome).toBe("complete");
    expect(readTurn({ text: "Mul ei ole seda.", needs: [{ kind: "negation" }], shape: "sentence", ctx, lastLine: null }).outcome).toBe("complete");
    expect(readTurn({ text: "Valu on peas.", needs: [{ kind: "case", lemma: "pea", grammCase: "INESSIVE" }], shape: "sentence", ctx, lastLine: null }).outcome).toBe("complete");
    expect(readTurn({ text: "Valu on pea.", needs: [{ kind: "case", lemma: "pea", grammCase: "INESSIVE" }], shape: "sentence", ctx, lastLine: null }).met[0]?.met).toBe(false);
  });

  it("is incomplete when some of what was asked is there", () => {
    const e = readTurn({
      text: "Mul on valu.", needs: [lemma(["valu"]), { kind: "datum", slot: "since" }], shape: "sentence", ctx, lastLine: null,
    });
    expect(e.outcome).toBe("incomplete");
  });
});
