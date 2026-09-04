import { describe, expect, it } from "vitest";
import { buildLexicon, type DictEntry } from "./lexicon";
import type { GateContext } from "./gate";
import { pickAttested, sceneLine, type LineRequest } from "./line";
import { topicForms } from "./retrieval";
import type { BeatSpec } from "./types";

const ENTRIES: DictEntry[] = [
  {
    lemma: "valu", pos: "NOUN", cefr: "A2",
    parts: {
      NOM_SG: "valu", GEN_SG: "valu", PART_SG: "valu",
      NOM_PL: "valud", PART_PL: "valusid", GEN_PL: "valude",
    },
    usages: [],
  },
  {
    lemma: "olema", pos: "VERB", cefr: "A1",
    parts: { INF_MA: "olema", INF_DA: "olla", PRES_1SG: "olen", PAST_1SG: "olin" },
    extraForms: [{ code: "IndPrSg3", value: "on" }],
    usages: [],
  },
];
const LEX = buildLexicon(ENTRIES);
const LEXICON = { ...LEX, forms: new Set([...LEX.forms, "teil", "kas", "kus", "ja"]) };

const BEAT: BeatSpec = {
  id: "reason", goal: "Ask what is wrong.", move: "ask",
  topic: ["valu"], needs: [{ kind: "any" }],
  required: true, patience: 2, shape: "sentence",
};

const GATE: GateContext = {
  lexicon: LEXICON, wrongRegister: new Set(["sul"]), governed: [], caseOf: new Map(),
};

/** Everything but the pool and the composer, which every test varies. */
function request(over: Partial<LineRequest> = {}): LineRequest {
  return {
    beat: BEAT,
    lexicon: LEXICON,
    gate: GATE,
    pool: [],
    topic: topicForms(BEAT, LEXICON),
    // `on` is the finite verb the fixture holds, which is what makes a recorded
    // usage a clause somebody said rather than a label under a headword.
    hasFiniteVerb: (word) => word === "on",
    fallback: "Vabandust?",
    used: new Set(),
    ...over,
  };
}

const RECORDED = { text: "Kas teil on valu?", lemma: "valu", cefr: "A2" };

describe("the ladder", () => {
  it("takes an attested sentence before it asks anybody", async () => {
    let asked = 0;
    const line = await sceneLine(request({
      pool: [RECORDED],
      compose: async () => { asked += 1; return "Kas teil on valu?"; },
    }));
    expect(line.provenance).toBe("attested");
    expect(line.text).toBe(RECORDED.text);
    // Whose sentence it is, so the screen can say so.
    expect(line.from).toBe("valu");
    expect(asked, "a model was asked for a line the dictionary already had").toBe(0);
  });

  it("passes over a line this run has already used", async () => {
    const line = pickAttested(request({ pool: [RECORDED], used: new Set([RECORDED.text]) }));
    /*
      §5: no attested line repeats until the pool for that move is exhausted,
      and when it is the run falls through to the composer rather than quietly
      cycling.
    */
    expect(line).toBeNull();
  });

  it("composes when nothing recorded fits, and says a model wrote it", async () => {
    const line = await sceneLine(request({ compose: async () => "Kas teil on valu?" }));
    expect(line.provenance).toBe("composed");
    expect(line.text).toBe("Kas teil on valu?");
    expect(line.from, "a composed line claimed a lexicographer wrote it").toBeUndefined();
  });

  it("withholds a composed line whole rather than showing it with a caveat", async () => {
    const line = await sceneLine(request({ compose: async () => "Kas teil on peavalu?" }));
    expect(line.provenance).toBe("fallback");
    expect(line.text, "the withheld line reached the learner").toBe("Vabandust?");
    expect(line.withheld).toContain("vouching");
  });

  it("retries once with the failing words named, and takes the second line", async () => {
    const seen: string[][] = [];
    const line = await sceneLine(request({
      compose: async (avoid) => {
        seen.push([...avoid]);
        return seen.length === 1 ? "Kas teil on peavalu?" : "Kas teil on valu?";
      },
    }));
    expect(line.provenance).toBe("composed");
    expect(seen).toHaveLength(2);
    expect(seen[0]).toEqual([]);
    expect(seen[1], "the retry was not told which word failed").toContain("peavalu");
  });

  it("stops after one retry, because somebody is standing there waiting", async () => {
    let asked = 0;
    const line = await sceneLine(request({
      compose: async () => { asked += 1; return "Kas teil on peavalu?"; },
    }));
    expect(asked).toBe(2);
    expect(line.provenance).toBe("fallback");
  });

  it("runs with no composer at all, which is what a keyless deployment gets", async () => {
    const withPool = await sceneLine(request({ pool: [RECORDED] }));
    expect(withPool.provenance).toBe("attested");

    const without = await sceneLine(request());
    expect(without.provenance).toBe("fallback");
    expect(without.text).toBe("Vabandust?");
  });

  it("falls back when the model answers with nothing", async () => {
    const line = await sceneLine(request({ compose: async () => null }));
    expect(line.provenance).toBe("fallback");
  });

  it("refuses a recorded sentence that is not this beat's shape", async () => {
    // `ask` wants a question, and a statement is not one however good it is.
    const line = pickAttested(request({
      pool: [{ text: "Teil on valu.", lemma: "valu", cefr: "A2" }],
    }));
    expect(line).toBeNull();
  });

  it("refuses a recorded sentence with a word the scene cannot read", async () => {
    const line = pickAttested(request({
      pool: [{ text: "Kas teil on peavalu?", lemma: "valu", cefr: "A2" }],
    }));
    expect(line).toBeNull();
  });
});
