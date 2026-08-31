import { describe, expect, it } from "vitest";
import {
  differentMeaning, differentSentence, differentText,
  formNearness, glossNearness, glossOption, pickOptions, sameMeaning, sameSentence,
  sentenceNearness, sentenceOption, type GlossOption,
} from "./distractors";
import { mulberry32 } from "./items";

/** The A1 colours, which is what a question about `must` should be built from. */
const colour = (text: string): GlossOption => glossOption({ text, pos: "ADJECTIVE", band: "A1", theme: "varvid" });
const COLOURS = ["black", "white", "red", "blue", "green", "yellow"].map(colour);

/** Real glosses from the dictionary, and the three the old shuffle reached for. */
const FAR: GlossOption[] = [
  { text: "plastic bag", pos: "NOUN", band: "A2" as const, theme: null },
  { text: "narcomania, drug addiction, substance abuse", pos: "NOUN", band: "B2" as const, theme: null },
  { text: "settlement, city, town, village", pos: "NOUN", band: "B2" as const, theme: null },
  { text: "a person living in, or from Estonia", pos: "NOUN", band: "B2" as const, theme: null },
].map(glossOption);

const pickGlosses = (seed: number, candidates: GlossOption[]) =>
  pickOptions({
    answer: colour("black"),
    candidates,
    rng: mulberry32(seed),
    distinct: differentMeaning,
    nearness: glossNearness,
  });

describe("a wrong answer is picked for being hard to cross out", () => {
  it("keeps a beginner's colour among colours rather than among C1 nouns", () => {
    for (let seed = 1; seed < 40; seed++) {
      const set = pickGlosses(seed, [...COLOURS, ...FAR]);
      expect(set).not.toBeNull();
      for (const option of set!.options) {
        expect(COLOURS.map((c) => c.text)).toContain(option);
      }
    }
  });

  it("takes the far options when the near ones run out, rather than asking nothing", () => {
    const set = pickGlosses(3, [colour("white"), ...FAR]);
    expect(set?.options).toHaveLength(4);
    expect(set?.options).toContain("white");
  });

  it("still refuses a question it cannot fill honestly", () => {
    expect(pickGlosses(3, [colour("white"), colour("red")])).toBeNull();
  });

  it("puts the answer in exactly once and never repeats an option", () => {
    for (let seed = 1; seed < 40; seed++) {
      const set = pickGlosses(seed, [...COLOURS, ...FAR])!;
      expect(new Set(set.options).size).toBe(4);
      expect(set.options[set.answer]).toBe("black");
    }
  });

  it("is fixed for a seed and moves between them", () => {
    const pool = [...COLOURS, ...FAR];
    expect(pickGlosses(11, pool)).toEqual(pickGlosses(11, pool));
    const orders = new Set(
      Array.from({ length: 20 }, (_, i) => pickGlosses(i + 1, pool)!.options.join("|")),
    );
    expect(orders.size).toBeGreaterThan(1);
  });
});

describe("what counts as the same answer", () => {
  it("reads a shared meaning as one answer", () => {
    expect(sameMeaning("car", "a car")).toBe(true);
    expect(sameMeaning("client, customer", "customer")).toBe(true);
    expect(sameMeaning("black", "white")).toBe(false);
  });

  it("does not let an empty word stand in for a shared meaning", () => {
    // Both of these mean something, and what they mean is different.
    expect(sameMeaning("in the morning", "in the evening")).toBe(false);
    expect(sameMeaning("out of the house", "into the house")).toBe(true);
  });

  it("falls back to the full reading when the strict one empties a side", () => {
    // `one` is an empty word and `one, single` is not, so dropping them one
    // side at a time would offer these two in a single question.
    expect(sameMeaning("one", "one, single")).toBe(true);
    expect(sameMeaning("something", "something else")).toBe(true);
    expect(sameMeaning("one", "two")).toBe(false);
  });

  it("reads a sentence by containment rather than by one shared word", () => {
    expect(sameSentence("I am in the room.", "I am in the room right now.")).toBe(true);
    expect(sameSentence("The room is cold.", "I am in the room right now.")).toBe(false);
    expect(differentSentence("The room is cold.", "The car is red.")).toBe(true);
  });

  it("prefers a sentence that has to be read to one that can be scanned", () => {
    const answer = sentenceOption("I am in the room right now.");
    const overlapping = sentenceOption("The room is cold today.");
    const unrelated = sentenceOption("He sold his bicycle to a neighbour last year.");
    expect(sentenceNearness(overlapping, answer)).toBeGreaterThan(sentenceNearness(unrelated, answer));
  });
});

describe("one form is offered against the forms it is nearly", () => {
  it("ranks the endings above a stem that changed", () => {
    const answer = { text: "toas" };
    const near = formNearness({ text: "toast" }, answer);
    expect(near).toBeGreaterThan(formNearness({ text: "tuba" }, answer));
    expect(formNearness({ text: "toal" }, answer)).toBeGreaterThan(formNearness({ text: "tuba" }, answer));
  });

  it("keeps the nominative out when the endings can fill the question", () => {
    const set = pickOptions({
      answer: { text: "toas" },
      candidates: ["tuba", "toa", "toast", "toasse", "toale", "toal"].map((text) => ({ text })),
      rng: mulberry32(2),
      distinct: differentText,
      nearness: formNearness,
    })!;
    expect(set.options).not.toContain("tuba");
    expect(set.options).toContain("toas");
  });
});
