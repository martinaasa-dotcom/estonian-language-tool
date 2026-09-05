import { describe, expect, it } from "vitest";
import { buildLexicon, caseKeyFor, type DictEntry } from "./lexicon";
import { advances, readTurn, type TurnContext } from "./turn";
import type { BeatSpec } from "./types";

/**
 * The marker, against a fixture rather than the dictionary.
 *
 * Every word here is a real course word and every form is one the dictionary
 * holds, because the point of the fixture is to be the dictionary in miniature
 * rather than to invent Estonian: `tuba` and its cases are what
 * `lib/estonian/derive.ts` derives from those principal parts, and `kus` is the
 * question word the `kusisonad` unit teaches.
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
  { lemma: "Head aega!", pos: "PHRASE", cefr: "A1", parts: {}, usages: [] },
];

const LEX = buildLexicon(ENTRIES);

function context(over: Partial<TurnContext> = {}): TurnContext {
  return {
    lexicon: LEX,
    questionWords: new Set(["kus", "millal"]),
    negators: new Set(["ei"]),
    registerForms: new Set(["teie", "teil", "teile"]),
    hasFiniteVerb: (word: string) => word === "on",
    data: new Map([["since", new Set(["teisipäev", "teisipäevast"])]]),
    previous: "",
    ...over,
  };
}

function beat(over: Partial<BeatSpec> = {}): BeatSpec {
  return {
    id: "reason", goal: "Say what is wrong.", they: "They say something.", move: "ask",
    topic: ["valu"], needs: [{ kind: "lemma", oneOf: ["valu"] }],
    required: true, patience: 2, shape: "word",
    ...over,
  };
}

describe("reading a turn", () => {
  it("meets a lemma requirement through any form of the word", () => {
    for (const said of ["valu", "Mul on valu", "valusid"]) {
      const seen = readTurn(said, beat(), context());
      expect(seen.reading, `${said} did not read as complete`).toBe("complete");
    }
  });

  it("meets a case requirement only in that case, and takes every spelling of it", () => {
    const asks = beat({ needs: [{ kind: "case", lemma: "tuba", grammCase: "ILLATIVE" }] });
    /*
      The illative is the one case with two answers and only one of them is
      derivable. Marking `toasse` wrong is the fault `caseAnswer` exists to
      prevent, pointed at a conversation, so both count and the fixture asserts
      both rather than trusting the sentence that says so.
    */
    expect(readTurn("Ma lähen tuppa", asks, context()).reading).toBe("complete");
    expect(readTurn("Ma lähen toasse", asks, context()).reading).toBe("complete");
    // The nominative is the same word and is not the answer.
    expect(readTurn("Ma lähen tuba", asks, context()).reading).not.toBe("complete");
    expect(LEX.byCase.get(caseKeyFor("tuba", "ILLATIVE"))?.has("tuppa")).toBe(true);
  });

  it("takes a question mark as a question, because Homme? is one", () => {
    const asks = beat({ needs: [{ kind: "question" }] });
    expect(readTurn("Kus?", asks, context()).reading).toBe("complete");
    expect(readTurn("Kus see on", asks, context()).reading).toBe("complete");
    expect(readTurn("valu", asks, context()).reading).not.toBe("complete");
  });

  it("reads a turn written in English as English rather than as unreadable Estonian", () => {
    const seen = readTurn("Sorry, what do you mean?", beat(), context());
    expect(seen.reading).toBe("english");
  });

  it("does not read a loan word inside an Estonian turn as English", () => {
    /*
      One English function word is a slip; two with nothing vouched is a turn in
      English. `valu` is vouched here, which settles it before the count is
      reached, and that ordering is the check: the reading is about a turn with
      no Estonian in it at all.
    */
    expect(readTurn("Mul on valu, sorry", beat(), context()).reading).toBe("complete");
  });

  it("does not let the other side's own line be handed back as a turn", () => {
    const said = "Mul on valu";
    const seen = readTurn(said, beat(), context({ previous: `Kus teil on valu? ${said}` }));
    expect(seen.reading, "the line above was accepted as an answer").toBe("echo");
    expect(advances(seen.reading)).toBe(false);
  });

  it("takes a farewell answered with the same farewell, since the phrase is the answer", () => {
    /*
      `Head aega!` to `Head aega!` is every word of their line handed back and
      is exactly what a person says. The echo rule stands down on a beat whose
      line *is* a course phrase, or the last turn of every scene would be read
      as parroting.
    */
    const close = beat({
      move: "close", topic: ["Head aega!"], needs: [{ kind: "lemma", oneOf: ["Head aega!"] }],
    });
    const seen = readTurn("Head aega!", close, context({ previous: "Head aega!" }));
    expect(seen.reading).toBe("complete");
  });

  it("still takes a one-word answer that repeats one of their words", () => {
    // `Neljapäev?` after they said it is what a person says, so the echo rule
    // needs two words before it fires.
    const seen = readTurn("valu", beat(), context({ previous: "Kas teil on valu?" }));
    expect(seen.reading).toBe("complete");
  });

  it("reads a subject with its verb as a sentence, whatever the word count", () => {
    const asks = beat({ shape: "sentence" });
    expect(readTurn("Valu on.", asks, context()).reading).toBe("complete");
  });

  it("reads a short question as a whole turn", () => {
    const asks = beat({ shape: "sentence", needs: [{ kind: "question" }] });
    expect(readTurn("Kui kaua?", asks, context()).reading).toBe("complete");
  });

  it("does not wait for the rest of a turn it could not read at all", () => {
    // `xyzzy blorp` is not a short answer; it is a turn nobody understood.
    const asks = beat({ shape: "sentence" });
    expect(readTurn("xyzzy blorp", asks, context()).reading).toBe("unrecognised");
  });

  it("waits rather than advancing when a sentence was wanted and a word arrived", () => {
    const asks = beat({ shape: "sentence" });
    expect(readTurn("valu", asks, context()).reading).toBe("fragment");
    expect(readTurn("Mul on valu", asks, context()).reading).toBe("complete");
  });

  it("tells real Estonian aimed elsewhere from a turn nobody could read", () => {
    const asks = beat({ needs: [{ kind: "datum", slot: "since" }] });
    // Every word vouched, none of them the point.
    expect(readTurn("Mul on valu toas", asks, context()).reading).toBe("offtarget");
    // Nothing vouched at all.
    expect(readTurn("qqqq wwww eeee", asks, context()).reading).toBe("unrecognised");
    expect(readTurn("Teisipäevast", asks, context()).reading).toBe("complete");
  });

  it("names which requirement was missing, not merely that one was", () => {
    const asks = beat({
      needs: [{ kind: "lemma", oneOf: ["valu"] }, { kind: "datum", slot: "since" }],
    });
    const seen = readTurn("Mul on valu", asks, context());
    expect(seen.reading).toBe("incomplete");
    expect(seen.met).toEqual([true, false]);
    expect(seen.missing).toEqual([1]);
  });

  it("marks every word, because the debrief prints them", () => {
    const seen = readTurn("Mul on valu", beat(), context());
    expect(seen.words.map((w) => w.word)).toEqual(["mul", "on", "valu"]);
    expect(seen.words.find((w) => w.word === "valu")?.vouched).toBe(true);
    expect(seen.words.find((w) => w.word === "mul")?.vouched).toBe(false);
  });

  it("advances on nothing but a complete turn", () => {
    for (const reading of ["incomplete", "offtarget", "unrecognised", "english", "echo", "fragment"] as const) {
      expect(advances(reading), `${reading} advanced a scene`).toBe(false);
    }
    expect(advances("complete")).toBe(true);
  });
});

describe("what was matched", () => {
  it("names the learner's own word that met a requirement, and nothing for a question", () => {
    const seen = readTurn("valu", beat(), context());
    expect(seen.matched).toEqual(["valu"]);
    // A word out of a sentence is not repeated back: "Maksta." is not a thing a waiter says.
    expect(readTurn("Mul on valu", beat({ shape: "sentence" }), context()).matched).toEqual([]);
    const asked = readTurn("Kui kaua?", beat({ needs: [{ kind: "question" }] }), context());
    expect(asked.matched).toEqual([]);
  });
});
