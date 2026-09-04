import { describe, expect, it } from "vitest";
import { buildGateData, governmentSuspect, runGate, wrongRegisterForms, type GateEntry } from "./gate";
import { buildLexicon } from "./lexicon";

const entries: GateEntry[] = [
  { lemma: "aitama", pos: "VERB", cefr: "A1", parts: { INF_MA: "aitama", INF_DA: "aidata", PRES_1SG: "aitan", PAST_1SG: "aitasin" },
    usages: [], government: "keda/mida* (partitive)" },
  { lemma: "raamat", pos: "NOUN", cefr: "A1", parts: { NOM_SG: "raamat", GEN_SG: "raamatu", PART_SG: "raamatut" }, usages: [] },
  { lemma: "sina", pos: "PRONOUN", cefr: "A1", parts: { NOM_SG: "sina", GEN_SG: "sinu", PART_SG: "sind" }, usages: [] },
  { lemma: "teie", pos: "PRONOUN", cefr: "A1", parts: { NOM_SG: "teie", GEN_SG: "teie", PART_SG: "teid" }, usages: [] },
  { lemma: "kas", pos: "ADVERB", cefr: "A1", parts: {}, usages: [] },
  { lemma: "mina", pos: "PRONOUN", cefr: "A1", parts: { NOM_SG: "mina", GEN_SG: "minu", PART_SG: "mind" }, usages: [], extraForms: [{ code: "Sg", value: "ma" }] },
];
const data = buildGateData(entries);
const forms = buildLexicon(entries).forms;
const wrongRegister = wrongRegisterForms("teie", entries);

describe("the gate", () => {
  it("passes a short vouched question for an ask", () => {
    const v = runGate({ text: "Kas teid aidata?", move: "ask", forms, wrongRegister, data });
    expect(v.failed).toEqual([]);
  });

  it("withholds a word outside the list, and names it", () => {
    const v = runGate({ text: "Kas teid aidata homme?", move: "ask", forms, wrongRegister, data });
    expect(v.failed).toContain("vouching");
    expect(v.unknown).toEqual(["homme"]);
  });

  it("withholds the wrong register", () => {
    const v = runGate({ text: "Kas sind aidata?", move: "ask", forms, wrongRegister, data });
    expect(v.failed).toContain("register");
  });

  it("withholds a shape that did not do the move", () => {
    expect(runGate({ text: "Ma aitan teid.", move: "ask", forms, wrongRegister, data }).failed).toContain("shape");
    expect(runGate({ text: "Kas teid aidata?", move: "close", forms, wrongRegister, data }).failed).toContain("shape");
    expect(runGate({ text: "Kas teid **aidata**?", move: "ask", forms, wrongRegister, data }).failed).toContain("shape");
    expect(runGate({ text: "Tere. Kas teid aidata?", move: "ask", forms, wrongRegister, data }).failed).toContain("shape");
  });

  it("suspects a governed verb with no nominal in a case it governs", () => {
    // aitama takes the partitive: raamatut is fine, raamatu (genitive) is not.
    expect(governmentSuspect(["ma", "aitan", "raamatut"], data)).toBe(false);
    expect(governmentSuspect(["ma", "aitan", "raamatu"], data)).toBe(true);
    // No governed verb, nothing to say.
    expect(governmentSuspect(["raamatu"], data)).toBe(false);
  });
});
