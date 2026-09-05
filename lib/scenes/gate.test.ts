import { describe, expect, it } from "vitest";
import { buildLexicon, type DictEntry } from "./lexicon";
import { governmentSuspect, passes, runGate, type GateContext } from "./gate";
import type { BeatSpec } from "./types";
import type { CaseKey } from "@/lib/estonian/types";

/**
 * The four checks, against a fixture that is the dictionary in miniature.
 *
 * Every form here is one `lib/estonian/derive.ts` builds from those principal
 * parts, so nothing in this file is Estonian anybody typed: it is the same
 * knowledge the gate reads at run time, small enough to reason about.
 */
const ENTRIES: DictEntry[] = [
  {
    lemma: "tuba", pos: "NOUN", cefr: "A1",
    parts: {
      NOM_SG: "tuba", GEN_SG: "toa", PART_SG: "tuba",
      ILL_SG_SHORT: "tuppa", NOM_PL: "toad", PART_PL: "tube", GEN_PL: "tubade",
    },
    usages: [],
  },
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
// `teil` and `mul` are the short pronoun forms a sentence is actually made of,
// and no rule over a genitive stem reaches them, so the fixture lends them the
// way the harvest stores them.
const EXTRA = new Set(["teil", "mul", "kus", "kas"]);
const LEXICON = { ...LEX, forms: new Set([...LEX.forms, ...EXTRA]) };

function context(over: Partial<GateContext> = {}): GateContext {
  return {
    lexicon: LEXICON,
    wrongRegister: new Set(["sul", "sinul", "sina"]),
    governed: [],
    caseOf: new Map(),
    ...over,
  };
}

function beat(over: Partial<BeatSpec> = {}): BeatSpec {
  return {
    id: "reason", goal: "Ask what is wrong.", they: "They say something.", move: "ask",
    topic: ["valu"], needs: [{ kind: "any" }],
    required: true, patience: 2, shape: "sentence",
    ...over,
  };
}

describe("the gate", () => {
  it("passes a line the scene's own list can account for", () => {
    const verdict = runGate("Kas teil on valu?", beat(), context());
    expect(verdict.failed).toEqual([]);
    expect(passes(verdict)).toBe(true);
  });

  it("withholds a line reaching outside the scene's list, and names the words", () => {
    /*
      Vouching is against the scene's list rather than the dictionary, and that
      distinction is the whole constraint: against the dictionary this would
      pass, because these are ordinary Estonian words. Against a few hundred
      lemmas the model is choosing inside a box.
    */
    const verdict = runGate("Kas teil on peavalu?", beat(), context());
    expect(verdict.failed).toContain("vouching");
    expect(verdict.unknown).toContain("peavalu");
  });

  it("wants a question where the move asks one, and forbids one where it does not", () => {
    expect(runGate("Teil on valu.", beat(), context()).failed).toContain("shape");
    expect(runGate("Kas teil on valu?", beat({ move: "instruct" }), context()).failed)
      .toContain("shape");
  });

  it("refuses two sentences, no punctuation, markdown, and a line that runs on", () => {
    const ctx = context();
    expect(runGate("Kas teil on valu? Kus?", beat(), ctx).failed).toContain("shape");
    expect(runGate("Kas teil on valu", beat(), ctx).failed).toContain("shape");
    expect(runGate("**Kas** teil on valu?", beat(), ctx).failed).toContain("shape");
    expect(runGate(`${"valu ".repeat(20)}?`, beat(), ctx).failed).toContain("shape");
    expect(runGate("", beat(), ctx).failed).toContain("shape");
  });

  it("refuses the register the scene did not ask for", () => {
    // The model error a learner would find most jarring, and one lookup.
    const verdict = runGate("Kas sul on valu?", beat(), context());
    expect(verdict.failed).toContain("register");
  });

  it("reports every failure rather than the first", () => {
    /*
      §6 allows one retry with the failing words named, and a retry told about
      one problem out of two comes back with the other.
    */
    const verdict = runGate("Kas sul on peavalu", beat(), context());
    expect(verdict.failed).toEqual(expect.arrayContaining(["shape", "vouching", "register"]));
  });
});

describe("the government check", () => {
  /*
    Drawn as weakly as it can be and still be a check: a line holding a governed
    word has to hold at least one nominal in a case that word governs. There is
    no parser here, so the strict reading fires on any sentence with an adjunct
    in it, which is most of them.
  */
  const ctx = context({
    governed: [{
      lemma: "aitama",
      forms: new Set(["aitama", "aitan", "aitab"]),
      cases: new Set(["PARTITIVE"]),
    }],
    caseOf: new Map<string, ReadonlySet<CaseKey>>([
      ["tuba", new Set(["NOMINATIVE", "PARTITIVE"])],
      ["toas", new Set(["INESSIVE"])],
      ["toa", new Set(["GENITIVE"])],
    ]),
  });

  it("lets through a line whose nominal is in a case the word governs", () => {
    expect(governmentSuspect(["ta", "aitab", "tuba"], ctx)).toBe(false);
  });

  it("flags a line whose only nominal is in a case it does not", () => {
    expect(governmentSuspect(["ta", "aitab", "toas"], ctx)).toBe(true);
  });

  it("says nothing about a line with no governed word, or with no nominal", () => {
    expect(governmentSuspect(["ta", "on", "toas"], ctx)).toBe(false);
    expect(governmentSuspect(["ta", "aitab"], ctx)).toBe(false);
  });

  it("needs only one nominal to be right, because it cannot find the complement", () => {
    // `toas` is an adjunct and `tuba` is the object. A stricter reading would
    // fire on this, which is most sentences.
    expect(governmentSuspect(["ta", "aitab", "tuba", "toas"], ctx)).toBe(false);
  });
});
