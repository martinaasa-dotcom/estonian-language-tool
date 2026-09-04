import { describe, expect, it } from "vitest";
import { buildLexicon, type DictEntry } from "./lexicon";
import type { GateContext } from "./gate";
import { pickAttested, sceneLine, wayOut, type LineRequest } from "./line";
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
    scripted: [],
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


/*
  THE SCRIPTED RUNG (ADR-025 amendment 1). A line drafted before the run and
  gated then. It sits under the lexicographer and above the model, costs a
  comparison, and is what a keyless deployment converses with.
*/
describe("the scripted rung", () => {
  it("takes a recorded sentence ahead of a scripted one", async () => {
    const line = await sceneLine(request({ pool: [RECORDED], scripted: ["Mis on valus?"] }));
    expect(line.provenance).toBe("attested");
  });

  it("takes a scripted line ahead of asking a model, and says which rung answered", async () => {
    let asked = 0;
    const line = await sceneLine(request({
      scripted: ["Kas teil on valu?"],
      compose: async () => { asked++; return "Kas teil on valu?"; },
    }));
    expect(line).toEqual({ text: "Kas teil on valu?", provenance: "scripted" });
    // The whole point: a booked call is what this rung saves.
    expect(asked).toBe(0);
  });

  it("passes over a scripted line this run has already used", async () => {
    const line = await sceneLine(request({
      scripted: ["Kas teil on valu?", "Kus on valu?"],
      used: new Set(["Kas teil on valu?"]),
    }));
    expect(line.text).toBe("Kus on valu?");
    expect(line.provenance).toBe("scripted");
  });

  it("falls through to the model once every scripted line has been said", async () => {
    const line = await sceneLine(request({
      scripted: ["Kas teil on valu?"],
      used: new Set(["Kas teil on valu?"]),
      compose: async () => "Kus on valu?",
    }));
    expect(line.provenance).toBe("composed");
  });

  it("answers keyless where a scripted line exists, rather than asking again", async () => {
    const line = await sceneLine(request({ scripted: ["Kas teil on valu?"] }));
    expect(line.provenance).toBe("scripted");
  });
});

/**
 * THE REPAIR MOVE IS FOR A TURN NOBODY UNDERSTOOD, AND FOR NOTHING ELSE.
 *
 * The fault this was written for, in the order it happened to a learner: the
 * scene said `Tere!`, the objective said "Greet them back", they wrote `Tere`,
 * the tick appeared, and the next thing on the screen was "Ma ei saa aru". The
 * ladder had fallen through on the *following* beat, which is a fact about an
 * empty pool and a spent allowance, and the only sentence it had to say it
 * with was the one that means "I did not understand you".
 */
describe("wayOut", () => {
  const beat: BeatSpec = { ...BEAT, move: "ask" };

  it("asks again in character when the turn was not understood", () => {
    for (const reading of ["unrecognised", "offtarget"] as const) {
      const line = wayOut({ beat, reading, fallback: "Vabandust?" });
      expect(line.provenance).toBe("fallback");
      expect(line.text).toBe("Vabandust?");
    }
  });

  it("never claims that about a turn that landed", () => {
    const line = wayOut({ beat, reading: "complete", fallback: "Vabandust?" });
    expect(line.provenance).toBe("unspoken");
    expect(line.text, "the repair move was printed at somebody who did nothing wrong")
      .not.toBe("Vabandust?");
  });

  /* The opening line has no turn to have misread, so it cannot be a repair. */
  it("never claims it before the learner has said anything", () => {
    expect(wayOut({ beat, reading: null, fallback: "Vabandust?" }).provenance).toBe("unspoken");
  });

  it("says what the other side did, in the move's own words", () => {
    expect(wayOut({ beat, reading: "complete", fallback: "x" }).text).toBe("They ask you about it.");
    expect(wayOut({ beat: { ...BEAT, move: "close" }, reading: "complete", fallback: "x" }).text)
      .toBe("They say goodbye.");
  });

  /*
    English is written in English by construction, which is the point: an
    `unspoken` line is not Estonian and the screen must not mark it as such.
    ADR-005 has nothing to say about it because nothing was generated; this
    only asserts the file did not grow an Estonian sentence.
  */
  it("writes no Estonian", () => {
    for (const move of ["greet", "ask", "offer", "confirm", "instruct", "refuse", "correct", "close"] as const) {
      const { text } = wayOut({ beat: { ...BEAT, move }, reading: "complete", fallback: "x" });
      expect(text, move).toMatch(/^[A-Za-z ,.']+$/);
    }
  });

  it("carries what the gate withheld, so the debrief can still say", () => {
    const line = wayOut({ beat, reading: "complete", fallback: "x", withheld: ["vouching"] });
    expect(line.withheld).toContain("vouching");
  });
});
