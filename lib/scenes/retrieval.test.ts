/**
 * The funnel that decides whether a recorded sentence can be somebody's line.
 *
 * Every Estonian string in this file is a form the shipped dictionary holds or
 * a sentence built out of them, and each one is here because it is a shape the
 * measurement got wrong at least once. The noun phrase is `Kodune aadress.`,
 * which is filed under `aadress` and is not a thing anybody says; the greeting
 * is `Tere!`, which the two-word floor threw away in the first run and took
 * every greeting beat to zero with it.
 */
import { describe, expect, it } from "vitest";
import { buildLexicon, formsOf, withExtras, words, type DictEntry } from "./lexicon";
import {
  fits, fitsMove, isQuestion, minWords, onTopic, spokenLine, topicForms, unknownWords,
} from "./retrieval";
import type { BeatSpec } from "./types";

const entries: DictEntry[] = [
  {
    lemma: "aeg", pos: "NOUN", cefr: "A1",
    parts: { NOM_SG: "aeg", GEN_SG: "aja", PART_SG: "aega", PART_PL: "aegu", GEN_PL: "aegade" },
    usages: [],
  },
  {
    lemma: "kell", pos: "NOUN", cefr: "A1",
    parts: { NOM_SG: "kell", GEN_SG: "kella", PART_SG: "kella" },
    usages: [],
  },
  {
    lemma: "valu", pos: "NOUN", cefr: "A2",
    parts: { NOM_SG: "valu", GEN_SG: "valu", PART_SG: "valu" },
    usages: [],
  },
  {
    lemma: "lugema", pos: "VERB", cefr: "A1",
    parts: { INF_MA: "lugema", INF_DA: "lugeda", PRES_1SG: "loen", PAST_1SG: "lugesin" },
    usages: [],
  },
  {
    lemma: "aadress", pos: "NOUN", cefr: "A1",
    parts: { NOM_SG: "aadress", GEN_SG: "aadressi", PART_SG: "aadressi" },
    usages: [],
  },
  { lemma: "Tere!", pos: "PHRASE", cefr: "A1", parts: {}, usages: ["Tere!"] },
];

const lexicon = buildLexicon(entries);
const verbForms = new Set(formsOf(entries[3]!));
const hasFiniteVerb = (w: string) => verbForms.has(w);

const beat = (over: Partial<BeatSpec>): BeatSpec => ({
  id: "b", goal: "g", they: "They say something.", move: "ask", topic: ["valu"], needs: [{ kind: "any" }],
  required: true, patience: 2, shape: "sentence", ...over,
});

describe("formsOf", () => {
  it("derives the regular cases of a nominal from its genitive stem", () => {
    const forms = new Set(formsOf(entries[0]!));
    expect(forms).toContain("aeg");
    expect(forms).toContain("aja");
    // Inessive: genitive stem plus s. Derived, never stored.
    expect(forms).toContain("ajas");
  });

  it("derives the present tense of a verb from its stored first person", () => {
    expect(verbForms).toContain("loen");
    expect(verbForms).toContain("loeb");
    // The negative after `ei`, which is the bare stem.
    expect(verbForms).toContain("loe");
  });

  it("takes a phrase apart into its own words, since it has no forms", () => {
    expect(formsOf(entries[5]!)).toEqual(["tere"]);
  });
});

describe("spokenLine", () => {
  it("rejects a noun phrase filed under a headword", () => {
    // Two words, ends in a full stop, and no verb: a label, not a line.
    expect(spokenLine("Kodune aadress.", hasFiniteVerb)).toBe(false);
  });

  it("accepts a clause with a finite verb", () => {
    expect(spokenLine("Ma loen raamatut.", hasFiniteVerb)).toBe(true);
  });

  it("accepts a question with no verb in it at all", () => {
    expect(spokenLine("Mis kell on?", hasFiniteVerb)).toBe(true);
  });

  /*
    The floor of two words dropped every greeting in the catalog and took
    four beats to zero. Greeting and leaving are complete turns at one word.
  */
  it("accepts a one-word greeting, and only for greeting and leaving", () => {
    expect(minWords("greet")).toBe(1);
    expect(minWords("ask")).toBe(2);
    expect(spokenLine("Tere!", hasFiniteVerb, "greet")).toBe(true);
    expect(spokenLine("Tere!", hasFiniteVerb, "ask")).toBe(false);
  });

  it("rejects what naturalSentence already rejects", () => {
    expect(spokenLine("Uuringud näitavad, et ..", hasFiniteVerb)).toBe(false);
    expect(spokenLine("Ma loen raamatut", hasFiniteVerb)).toBe(false);
  });

  it("rejects a sentence too long to say in one breath", () => {
    expect(spokenLine(`${"ma loen ".repeat(9)}raamatut.`, hasFiniteVerb)).toBe(false);
  });
});

describe("fitsMove", () => {
  it("requires a question where the move asks one", () => {
    expect(isQuestion("Mis kell on?")).toBe(true);
    expect(fitsMove("Mis kell on?", beat({ move: "ask" }))).toBe(true);
    expect(fitsMove("Aeg ei peatu.", beat({ move: "ask" }))).toBe(false);
  });

  it("forbids one where the move is an instruction", () => {
    expect(fitsMove("Mis kell on?", beat({ move: "instruct" }))).toBe(false);
  });

  it("takes either for an offer, because both are things people say", () => {
    expect(fitsMove("Mis kell on?", beat({ move: "offer" }))).toBe(true);
    expect(fitsMove("Aeg ei peatu.", beat({ move: "offer" }))).toBe(true);
  });
});

describe("onTopic", () => {
  it("matches an inflected form of the beat's word, not only the lemma", () => {
    const topic = topicForms(beat({ topic: ["aeg"] }), lexicon);
    expect(onTopic(words("Mul ei ole aega."), topic)).toBe(true);
    expect(onTopic(words("Mis kell on?"), topic)).toBe(false);
  });
});

describe("unknownWords", () => {
  it("names the words the closed list cannot account for", () => {
    expect(unknownWords(words("Kell ja valu."), lexicon)).toEqual(["ja"]);
  });

  it("takes an extra set without touching the lemma index", () => {
    const wider = withExtras(lexicon, ["ja"]);
    expect(unknownWords(words("Kell ja valu."), wider)).toEqual([]);
    expect(wider.byLemma).toBe(lexicon.byLemma);
  });
});

describe("fits", () => {
  /*
    Every line below is one the shipped dictionary actually holds, which is the
    same discipline the module itself works under: the app does not write
    Estonian, and neither does its test. `Mis kell on?` and `Aeg ei peatu.` are
    recorded usages, and `Kodune aadress.` is the noun phrase filed under
    `aadress` that started the spoken-line rule.
  */
  const run = (
    text: string,
    over: Partial<BeatSpec> = {},
    allowUnknown = 0,
    lex = lexicon,
  ) => {
    const b = beat(over);
    return fits({
      line: { text, lemma: "x", cefr: "A2" },
      tokens: words(text),
      beat: b,
      topic: topicForms(b, lex),
      lexicon: lex,
      hasFiniteVerb,
      allowUnknown,
    });
  };

  it("reports the first thing that stopped it, cheapest question first", () => {
    expect(run("Mis kell on?", { topic: ["valu"] }).why).toBe("off-topic");
    expect(run("Aeg ei peatu.", { topic: ["aeg"], move: "ask" }).why).toBe("shape");
    expect(run("Kodune aadress.", { topic: ["aadress"], move: "offer" }).why).toBe("not-spoken");
  });

  it("counts what the learner would not know", () => {
    const strict = run("Mis kell on?", { topic: ["kell"], move: "ask" });
    expect(strict.ok).toBe(false);
    expect(strict.why).toBe("unreadable");
    // `mis` and `on`: a question word the course teaches under another lemma,
    // and the present of `olema`, which nothing in this app can vouch for.
    expect(strict.unknown).toBe(2);
    expect(run("Mis kell on?", { topic: ["kell"], move: "ask" }, 2).ok).toBe(true);
  });

  /*
    The finding the measurement turned up, as a test. An attested question about
    a word the learner knows is unusable for want of two words nothing in the
    dictionary can account for, and usable the moment they are in the list.
  */
  it("passes once the words nothing can vouch for are in the list", () => {
    const wider = withExtras(lexicon, ["mis", "on"]);
    expect(run("Mis kell on?", { topic: ["kell"], move: "ask" }, 0, wider).ok).toBe(true);
  });

  /*
    The band of the entry a sentence was filed under is a fact about the
    headword, not about the sentence, and filtering on it dropped every A1
    greeting out of a B1 scene. Readability answers the question precisely, so
    there is no level in this signature at all.
  */
  it("has no opinion about the level of the entry the line came from", () => {
    expect(Object.keys(run("Mis kell on?", { topic: ["kell"], move: "ask" }, 2)))
      .not.toContain("band");
  });
});
