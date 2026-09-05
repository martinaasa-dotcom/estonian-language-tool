import { describe, expect, it } from "vitest";
import { asideFor, asideOwed, shrug } from "./aside";
import { buildLexicon, type DictEntry } from "./lexicon";
import type { RoleCard } from "./props";
import type { BeatSpec } from "./types";

/**
 * The other side, caught off guard by a question, against a fixture. Every
 * word here is a course word and every form is the dictionary's.
 */
const ENTRIES: DictEntry[] = [
  { lemma: "teadma", pos: "VERB", cefr: "A1", parts: { INF_MA: "teadma", INF_DA: "teada", PRES_1SG: "tean", PAST_1SG: "teadsin" }, usages: [] },
  { lemma: "minema", pos: "VERB", cefr: "A1", parts: { INF_MA: "minema", INF_DA: "minna", PRES_1SG: "lähen", PAST_1SG: "läksin" }, usages: [] },
  { lemma: "ei", pos: "ADVERB", cefr: "A1", parts: {}, usages: [] },
  { lemma: "hästi", pos: "ADVERB", cefr: "A1", parts: {}, usages: [] },
  { lemma: "aitäh", pos: "ADVERB", cefr: "A1", parts: {}, usages: [] },
  { lemma: "kell", pos: "NOUN", cefr: "A1", parts: { NOM_SG: "kell", GEN_SG: "kella", PART_SG: "kella" }, usages: [] },
  { lemma: "teisipäev", pos: "NOUN", cefr: "A1", parts: { NOM_SG: "teisipäev", GEN_SG: "teisipäeva", PART_SG: "teisipäeva" }, usages: [] },
];
const LEX = buildLexicon(ENTRIES);

const INSTRUCT: BeatSpec = {
  id: "way", goal: "Say the directions back.", they: "They tell you the way.", move: "instruct",
  topic: ["otse"], needs: [{ kind: "lemma", oneOf: ["otse"] }], required: true, patience: 2, shape: "word",
};
const ASKS_FOR_QUESTION: BeatSpec = {
  ...INSTRUCT, id: "far", goal: "Ask whether it is near.", they: "They wait.", move: "confirm",
  needs: [{ kind: "question" }],
};
const CARD: RoleCard = {
  you: "You.",
  props: [
    { slot: "time", card: "The time", literal: ["14:30"], lemmas: [], value: "14:30" },
    { slot: "day", card: "The day", literal: [], lemmas: ["teisipäev"], value: "teisipäev", theirs: true },
  ],
};

function input(over: Partial<Parameters<typeof asideFor>[0]> = {}) {
  return {
    asked: "kuhu", spoken: ["ja", "kuhu", "siis"], answered: INSTRUCT, card: CARD, lexicon: LEX,
    more: [], answers: [], ...over,
  };
}

describe("a question the scene did not anticipate", () => {
  it("is nothing where nothing was asked", () => {
    expect(asideFor(input({ asked: null }))).toBeNull();
    expect(asideOwed(input({ asked: null }))).toBe(false);
  });

  it("answers how are you with the two course words", () => {
    const line = asideFor(input({ asked: "kuidas", spoken: ["kuidas", "läheb"] }));
    expect(line?.text).toBe("Hästi, aitäh.");
    // `Kuidas?` on its own is somebody asking to hear it again, not small talk.
    expect(asideFor(input({ asked: "kuidas", spoken: ["kuidas"], more: [] }))).toBeNull();
  });

  it("answers when with the day and the time off the card, the day in the adessive", () => {
    const line = asideFor(input({ asked: "millal", spoken: ["millal"] }));
    expect(line?.text).toBe("Teisipäeval kell 14:30.");
    expect(line?.provenance).toBe("attested");
  });

  it("answers a question after directions with more of the directions", () => {
    const line = asideFor(input({ more: ["Otse edasi ja siis vasakule."] }));
    expect(line).toEqual({ text: "Otse edasi ja siis vasakule.", provenance: "scripted" });
  });

  it("does not answer a question after a greeting with a second greeting", () => {
    const greet: BeatSpec = { ...INSTRUCT, id: "greet", move: "greet" };
    expect(asideFor(input({ answered: greet, more: ["Tere hommikust!"] }))).toBeNull();
    expect(asideOwed(input({ answered: greet }))).toBe(true);
  });

  it("answers a question the beat asked for with the beat's own banked answer", () => {
    const line = asideFor(input({ asked: "kas", answered: ASKS_FOR_QUESTION, answers: ["Jah, see on lähedal."] }));
    expect(line).toEqual({ text: "Jah, see on lähedal.", provenance: "scripted" });
  });

  it("owes nothing for a question the beat asked for and the next move answers", () => {
    const asking = input({ asked: "kus", answered: ASKS_FOR_QUESTION, answers: [] });
    expect(asideFor(asking)).toBeNull();
    // The directions are the answer to "where is it"; a shrug here would be a person contradicting themselves.
    expect(asideOwed(asking)).toBe(false);
  });

  it("owes an answer for a question nothing else can supply, and the shrug is off the course", () => {
    const asking = input({ asked: "miks", spoken: ["miks"], more: [] });
    expect(asideFor(asking)).toBeNull();
    expect(asideOwed(asking)).toBe(true);
    const line = shrug(LEX);
    expect(line?.text).toBe("Ei tea.");
    expect(line?.provenance).toBe("attested");
  });

  it("withholds the shrug whole where the verb cannot be derived", () => {
    const thin = buildLexicon(ENTRIES.filter((e) => e.lemma !== "teadma"));
    expect(shrug(thin)).toBeNull();
  });
});
