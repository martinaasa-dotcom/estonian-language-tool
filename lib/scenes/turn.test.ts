import { describe, expect, it } from "vitest";
import { buildLexicon, caseKeyFor, type DictEntry } from "./lexicon";
import { addsEvidence, advances, readTurn, type TurnContext } from "./turn";
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
  {
    lemma: "kõrv", pos: "NOUN", cefr: "A1",
    parts: {
      NOM_SG: "kõrv", GEN_SG: "kõrva", PART_SG: "kõrva",
      NOM_PL: "kõrvad", PART_PL: "kõrvu", GEN_PL: "kõrvade",
    },
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

  it("meets a case requirement in that case, and takes every spelling of it, with no slip", () => {
    const asks = beat({ needs: [{ kind: "case", lemma: "tuba", grammCase: "ILLATIVE" }] });
    /*
      The illative is the one case with two answers and only one of them is
      derivable. Marking `toasse` wrong is the fault `caseAnswer` exists to
      prevent, pointed at a conversation, so both count and the fixture asserts
      both rather than trusting the sentence that says so.
    */
    for (const said of ["Ma lähen tuppa", "Ma lähen toasse"]) {
      const seen = readTurn(said, asks, context());
      expect(seen.reading, said).toBe("complete");
      expect(seen.slips, said).toEqual([]);
    }
    expect(LEX.byCase.get(caseKeyFor("tuba", "ILLATIVE"))?.has("tuppa")).toBe(true);
  });

  /*
    THE RIGHT WORD IN THE WRONG CASE IS UNDERSTOOD. `Ma lähen tuba` is not
    Estonian and nobody who hears it wonders where the person is going. The
    beat is met, the slip carries the case, and the recast is the table's
    own form, so the other side can say `tuppa` back.
  */
  it("understands the right word in the wrong case, and writes the case down as the slip", () => {
    const asks = beat({ needs: [{ kind: "case", lemma: "tuba", grammCase: "ILLATIVE" }] });
    const seen = readTurn("Ma lähen tuba", asks, context());
    expect(seen.reading).toBe("complete");
    expect(seen.met).toEqual([true]);
    expect(seen.slips).toEqual([
      { kind: "case", said: "tuba", form: "tuppa", lemma: "tuba", grammCase: "ILLATIVE" },
    ]);
    // What the other side repeats is the recast, never the slip.
    expect(seen.matched).toEqual(["tuppa"]);
    // A different word is still a miss, not a slip.
    expect(readTurn("Ma lähen valu", asks, context()).reading).not.toBe("complete");
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

  /*
    One word you recognised is not "I did not catch that". The scene's list is
    the units it declares rather than the whole course, so a learner reaching
    for a real word from somewhere else had most of their sentence counted
    against them and was told they were incomprehensible for using Estonian.
  */
  it("reads a turn with one word it knows as aimed elsewhere, not as unreadable", () => {
    const seen = readTurn("ma tahan blorp xyzzy qwerty tuba", beat(), context());
    expect(seen.reading).toBe("offtarget");
  });

  /*
    The scene's list is what the other side may *say*; whether the learner was
    understood is a wider question. A bus window that does not declare the
    shopping unit read `sularahaga` as nothing anybody could make out and
    answered "I did not catch that", to somebody who had said "with cash"
    perfectly, in a word this course teaches.
  */
  it("counts a word only the course knows as Estonian, so it is aimed elsewhere and not unreadable", () => {
    const wider = context({ known: (word) => word === "sularahaga" });
    expect(readTurn("sularahaga", beat(), wider).reading).toBe("offtarget");
    // And without the wider list it is what it was, which is what a thin caller gets.
    expect(readTurn("sularahaga", beat(), context()).reading).toBe("unrecognised");
  });

  /*
    A wrong number is a thing anybody can read. A clerk hearing the wrong time
    says "no, half past ten", not "I did not catch that".
  */
  it("reads a wrong number as aimed elsewhere rather than as unreadable", () => {
    const asks = beat({ needs: [{ kind: "datum", slot: "since" }] });
    expect(readTurn("08:30", asks, context()).reading).toBe("offtarget");
    expect(readTurn("!!!", asks, context()).reading).toBe("unrecognised");
  });

  it("keeps the repair phrase for a turn it recognised nothing in", () => {
    expect(readTurn("blorp xyzzy qwerty", beat(), context()).reading).toBe("unrecognised");
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

describe("a beat that takes any one of several answers", () => {
  /*
    "Does 14:30 suit you?" is answered with the time, with `sobib`, with
    `jah` or with `ei`, and the landlord's offer used to take the time alone:
    `Sobib` read as real Estonian off the point and the offer was made again
    until his patience ran out. The learner had said yes twice.
  */
  const offer = beat({
    id: "agree", shape: "word",
    needs: [{ kind: "anyOf", of: [
      { kind: "datum", slot: "time" },
      { kind: "lemma", oneOf: ["valu"] },
      { kind: "negation" },
    ] }],
  });
  const ctx = context({ data: new Map([["time", new Set(["14:30", "14.30", "14"])]]) });

  it("is met by whichever option the learner took", () => {
    for (const said of ["14:30", "Valu", "Ei"]) {
      expect(readTurn(said, offer, ctx).reading, said).toBe("complete");
    }
  });

  it("is one requirement to the marker, so a miss is a miss and not a partial answer", () => {
    const seen = readTurn("tuba", offer, ctx);
    expect(seen.reading).toBe("offtarget");
    expect(seen.met).toEqual([false]);
  });

  it("repeats back the word that met it, and never the no", () => {
    expect(readTurn("valu", offer, ctx).matched).toEqual(["valu"]);
    expect(readTurn("ei", offer, ctx).matched).toEqual([]);
  });
});

describe("a phrase that answers the question", () => {
  const wants = beat({ shape: "sentence", needs: [{ kind: "lemma", oneOf: ["tuba"] }] });

  it("is an answer, with or without a verb: asked which room, `toas` and `valu` is not somebody still talking", () => {
    expect(readTurn("valu toas", wants, context()).reading).toBe("complete");
  });

  it("while the one required word alone is still a look and a wait", () => {
    expect(readTurn("toas", wants, context()).reading).toBe("fragment");
  });

  it("and two words that miss the point are still what they were", () => {
    expect(readTurn("valu valu", wants, context()).reading).toBe("fragment");
  });
});

describe("a no on an offer that has a counter", () => {
  const offer = beat({
    id: "agree", shape: "word",
    counter: { they: "They offer another time.", replaces: [["time", "time2"]] },
    needs: [{ kind: "anyOf", of: [{ kind: "datum", slot: "time" }, { kind: "lemma", oneOf: ["valu"] }] }],
  });
  const ctx = context({ data: new Map([["time", new Set(["14:30"])]]) });

  it("is read as declined, and marks nothing met even where the accepting word is in the turn", () => {
    for (const said of ["Ei", "Ei sobi", "ei valu"]) {
      const seen = readTurn(said, offer, ctx);
      expect(seen.reading, said).toBe("declined");
      expect(seen.met).toEqual([false]);
      expect(seen.matched).toEqual([]);
    }
  });

  it("is only ever read on a beat that has something else to offer", () => {
    const plain = beat({ ...offer, counter: undefined });
    expect(readTurn("Ei", plain, ctx).reading).not.toBe("declined");
  });

  it("does not stop a yes being a yes", () => {
    expect(readTurn("14:30", offer, ctx).reading).toBe("complete");
  });
});

/**
 * The rule that keeps one turn from being credited with a beat it never
 * addressed. The transcript in the header of `addsEvidence` is a real one.
 */
describe("carrying one turn on to the next beat", () => {
  const ctx = context();

  it("does not carry on a beat met by a question mark alone", () => {
    const directions = beat({
      id: "way", shape: "word",
      needs: [{ kind: "lemma", oneOf: ["valu"] }],
    });
    const near = beat({ id: "far", shape: "sentence", needs: [{ kind: "question" }] });

    const first = readTurn("okei, valu, ja kus siis?", directions, ctx);
    expect(first.reading).toBe("complete");
    const second = readTurn("okei, valu, ja kus siis?", near, ctx);
    // The next beat reads as met, and on nothing the turn has not already spent.
    expect(second.reading).toBe("complete");
    expect(addsEvidence(second, new Set(first.satisfiedBy))).toBe(false);
  });

  it("does not carry on a beat that anything at all satisfies", () => {
    const anything = beat({ id: "confirm", shape: "sentence", needs: [{ kind: "any" }] });
    const seen = readTurn("Mul on valu", anything, ctx);
    expect(seen.reading).toBe("complete");
    expect(addsEvidence(seen, new Set(["valu"]))).toBe(false);
    expect(addsEvidence(seen, new Set())).toBe(false);
  });

  it("carries on where the turn said a second thing", () => {
    const greet = beat({ id: "greet", move: "greet", shape: "word", topic: ["Head aega!"],
      needs: [{ kind: "lemma", oneOf: ["Head aega!"] }] });
    const where = beat({
      id: "where", shape: "sentence",
      needs: [{ kind: "question" }, { kind: "case", lemma: "tuba", grammCase: "INESSIVE" }],
    });
    const said = "head aega, kus on toas?";
    const first = readTurn(said, greet, ctx);
    expect(first.reading).toBe("complete");
    const second = readTurn(said, where, ctx);
    expect(second.reading).toBe("complete");
    // The case form is a word the greeting did not use, so the beat is met.
    expect(addsEvidence(second, new Set(first.satisfiedBy))).toBe(true);
  });

  it("does not let one word buy two beats", () => {
    const one = beat({ id: "a", shape: "word", needs: [{ kind: "lemma", oneOf: ["valu"] }] });
    const seen = readTurn("valu", one, ctx);
    expect(seen.satisfiedBy).toEqual(["valu"]);
    expect(addsEvidence(seen, new Set(["valu"]))).toBe(false);
  });

  /*
    A word out of a sentence is not worth repeating back and is still the word
    that met the beat, which is why this reads `satisfiedBy` rather than
    `matched`.
  */
  it("counts a word a sentence-shaped beat was met by, which the echo list drops", () => {
    const sentence = beat({
      id: "reason", shape: "sentence",
      needs: [{ kind: "lemma", oneOf: ["valu"] }],
    });
    const seen = readTurn("Mul on valu", sentence, ctx);
    expect(seen.reading).toBe("complete");
    expect(seen.matched).toEqual([]);
    expect(seen.satisfiedBy).toEqual(["valu"]);
    expect(addsEvidence(seen, new Set(["toas"]))).toBe(true);
  });
});


/**
 * The moment somebody decides whether they are stupid or simply learning.
 * A learner who says they are not following is answered with the word they
 * need, never with the same question a third time.
 */
describe("a learner who says they are not following", () => {
  const verbs: DictEntry[] = [
    { lemma: "teadma", pos: "VERB", cefr: "A1", parts: { INF_MA: "teadma", INF_DA: "teada", PRES_1SG: "tean", PAST_1SG: "teadsin" }, usages: [] },
    { lemma: "saama", pos: "VERB", cefr: "A1", parts: { INF_MA: "saama", INF_DA: "saada", PRES_1SG: "saan", PAST_1SG: "sain" }, usages: [] },
    { lemma: "Ma ei saa aru", pos: "PHRASE", cefr: "A1", parts: {}, usages: [] },
  ];
  const ctx = context({ lexicon: buildLexicon([...ENTRIES, ...verbs]) });

  it("is read as lost, off the course's own phrase", () => {
    expect(readTurn("Ma ei saa aru", beat(), ctx).reading).toBe("lost");
  });

  it("is read as lost off the negator beside a verb the course teaches", () => {
    for (const said of ["ma ei tea", "ma ei saa aru", "Ei tea."]) {
      expect(readTurn(said, beat(), ctx).reading, said).toBe("lost");
    }
  });

  it("is not read off the verb without the negator, since that is an answer", () => {
    expect(readTurn("ma tean", beat(), ctx).reading).not.toBe("lost");
  });

  it("is never read on a beat that wanted a no, where ei is the answer", () => {
    const refusing = beat({ needs: [{ kind: "negation" }], shape: "word" });
    expect(readTurn("ma ei tea", refusing, ctx).reading).toBe("complete");
  });

  it("is never read on a turn that answered the question, whatever else is in it", () => {
    expect(readTurn("Mul on valu, aga ma ei tea", beat(), ctx).reading).toBe("complete");
  });

  it("advances nothing, because saying you are lost is not an answer", () => {
    expect(advances(readTurn("ma ei tea", beat(), ctx).reading)).toBe(false);
  });
});

/**
 * Being understood is not the same as being correct, and the marker reads
 * the first (`lib/scenes/nearly.ts`). Each shape of nearly-right is met, is
 * written down as a slip, and is recast off the dictionary and nothing else.
 */
describe("a turn that is nearly right", () => {
  const ctx = context();

  it("reads a dropped diacritic as the word, with the spelling noted", () => {
    const asks = beat({ needs: [{ kind: "case", lemma: "kõrv", grammCase: "INESSIVE" }], shape: "sentence" });
    const seen = readTurn("Mul on valu korvas", asks, ctx);
    expect(seen.reading).toBe("complete");
    expect(seen.slips).toEqual([{ kind: "spelling", said: "korvas", form: "kõrvas", lemma: "kõrv" }]);
    expect(seen.matched).toEqual(["kõrvas"]);
  });

  it("counts a folded spelling as vouched, so a clear turn is not read as unreadable", () => {
    const asks = beat({ needs: [{ kind: "lemma", oneOf: ["tuba"] }] });
    const seen = readTurn("korv korvad", asks, ctx);
    expect(seen.words.every((w) => w.vouched)).toBe(true);
    // Real Estonian aimed elsewhere, not a turn nobody could read.
    expect(seen.reading).toBe("offtarget");
  });

  it("reads one letter out on a long enough word as that word", () => {
    const asks = beat({ needs: [{ kind: "lemma", oneOf: ["valu"] }] });
    // `valusid` is the partitive plural; one letter slipped.
    const seen = readTurn("Mul on valusod", asks, ctx);
    expect(seen.reading).toBe("complete");
    expect(seen.slips).toEqual([{ kind: "spelling", said: "valusod", form: "valusid", lemma: "valu" }]);
  });

  it("does not read a short word as a typo of another, because pea and tee are one edit apart", () => {
    const asks = beat({ needs: [{ kind: "lemma", oneOf: ["valu"] }] });
    expect(readTurn("Mul on valo", asks, ctx).reading).not.toBe("complete");
  });

  it("does not read two letters out as the word", () => {
    const asks = beat({ needs: [{ kind: "lemma", oneOf: ["valu"] }] });
    expect(readTurn("Mul on valosdi", asks, ctx).reading).not.toBe("complete");
  });

  it("understands an infinitive after a subject pronoun, and recasts it to the person", () => {
    const asks = beat({ needs: [{ kind: "lemma", oneOf: ["olema"] }], shape: "sentence" });
    const seen = readTurn("ma olema kodus", asks, context({ hasFiniteVerb: () => false }));
    expect(seen.reading).toBe("complete");
    /*
      `olema` is the one verb the present rule refuses, so the slip is
      understood and not recast: `form` is null and the screen says
      "understood" and no more, which is what a person does with a verb they
      cannot put right in passing.
    */
    expect(seen.slips).toEqual([{ kind: "person", said: "olema", form: null, lemma: "olema" }]);
  });

  it("recasts a regular verb off the derived present", () => {
    const entries: DictEntry[] = [
      ...ENTRIES,
      {
        lemma: "tulema", pos: "VERB", cefr: "A1",
        parts: { INF_MA: "tulema", INF_DA: "tulla", PRES_1SG: "tulen", PAST_1SG: "tulin" },
        usages: [],
      },
    ];
    const ctx2 = context({ lexicon: buildLexicon(entries) });
    const asks = beat({ needs: [{ kind: "lemma", oneOf: ["tulema"] }], shape: "sentence" });
    const seen = readTurn("ma tulema koju", asks, ctx2);
    expect(seen.reading).toBe("complete");
    expect(seen.slips).toEqual([{ kind: "person", said: "tulema", form: "tulen", lemma: "tulema" }]);
    expect(readTurn("ta tulema koju", asks, ctx2).slips[0]?.form).toBe("tuleb");
    // The infinitive on its own, or after another verb, is not a slip.
    expect(readTurn("tulema koju", asks, ctx2).slips).toEqual([]);
    expect(readTurn("ma tahan tulla", asks, ctx2).slips).toEqual([]);
    expect(readTurn("ma tulen koju", asks, ctx2).slips).toEqual([]);
  });

  /*
    THE THING A PERSON ACTUALLY DOES, WHICH IS HEAR THE STEM AND STOP CARING.
    `ma tahan minna haiglat` is not Estonian and there is no doubt whatever
    about which building is meant, so every ending on a stem the dictionary
    knows is that word.
  */
  it("understands any ending on a stem it knows, real or invented", () => {
    const asks = beat({ needs: [{ kind: "case", lemma: "kõrv", grammCase: "INESSIVE" }], shape: "sentence" });
    for (const said of ["kõrvat", "kõrvaks", "kõrvasi", "kõrvale"]) {
      const seen = readTurn(`Mul on valu ${said}`, asks, ctx);
      expect(seen.reading, said).toBe("complete");
      expect(seen.slips[0], said).toMatchObject({ kind: "case", said, form: "kõrvas" });
    }
  });

  it("recasts to a real form where the beat wanted the word rather than a case", () => {
    const asks = beat({ needs: [{ kind: "lemma", oneOf: ["valu"] }] });
    const seen = readTurn("Mul on valumine", asks, ctx);
    expect(seen.reading).toBe("complete");
    expect(seen.slips[0]).toMatchObject({ kind: "form", said: "valumine", lemma: "valu" });
    expect(seen.slips[0]?.form).toBeTruthy();
  });

  /*
    And the guard that makes it safe: a word the scene's own list can vouch
    for is a word, not a mangled other one. `tuba` is in the list, so it is
    never read as a botched `tube`.
  */
  /*
    `valutab` is the third person of a verb the course teaches and was read as
    a slip of the pen for `valuta`, so the review told a learner that the word
    they had got right is said some other way. A real word is a word.
  */
  it("never reads a word the course knows as a slip of the pen for another", () => {
    const asks = beat({ needs: [{ kind: "lemma", oneOf: ["valu"] }] });
    const wider = context({ known: (word) => word === "valutab" });
    expect(readTurn("minu pea valutab", asks, wider).slips).toEqual([]);
    // A dropped diacritic is still the keyboard rather than a word, and is still read.
    const folded = context({ known: () => false });
    expect(readTurn("Mul on valu korvas", beat({ needs: [{ kind: "case", lemma: "kõrv", grammCase: "INESSIVE" }] }), folded).slips)
      .toEqual([{ kind: "spelling", said: "korvas", form: "kõrvas", lemma: "kõrv" }]);
  });

  it("never reads a word the list vouches for as a mangled form of another", () => {
    const asks = beat({ needs: [{ kind: "lemma", oneOf: ["kõrv"] }] });
    const seen = readTurn("kõrvad", asks, ctx);
    expect(seen.slips).toEqual([]);
    // And a different word is still a different word.
    expect(readTurn("Ma lähen tuppa", asks, ctx).reading).not.toBe("complete");
  });

  it("does not read a short word as a stem of a longer one", () => {
    const asks = beat({ needs: [{ kind: "lemma", oneOf: ["kõrv"] }] });
    // Three characters of shared opening is an accident, not a stem.
    expect(readTurn("kõr", asks, ctx).reading).not.toBe("complete");
  });

  it("never records a slip on a requirement that was not met", () => {
    const asks = beat({ needs: [{ kind: "lemma", oneOf: ["valu"] }] });
    const seen = readTurn("xyzzy blorp", asks, ctx);
    expect(seen.reading).toBe("unrecognised");
    expect(seen.slips).toEqual([]);
  });
});
