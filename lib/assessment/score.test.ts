import { describe, expect, it } from "vitest";
import { gradeChoice, gradeDictation, gradeWrite, levelFrom, placement } from "./score";
import type { ChoiceItem, DictationItem, Item, Response, WriteItem } from "./types";

const choice = (over: Partial<ChoiceItem> = {}): ChoiceItem => ({
  id: "c1", kind: "choice", skill: "reading", band: "A1", lemma: "tuba",
  question: "What does this word mean?", et: "tuba", heard: false,
  options: ["room", "book", "window", "door"], estonianOptions: false, answer: 0,
  source: "dictionary", because: "tuba is room.", ...over,
});

const dictation: DictationItem = {
  id: "d1", kind: "dictation", skill: "listening", band: "B1", lemma: "tuba",
  question: "Write what you heard.", et: "Ma olen praegu toas.", source: "usage",
};

const write: WriteItem = {
  id: "w1", kind: "write", skill: "writing", band: "A2", lemma: "tuba",
  question: "Write tuba in the form this sentence needs.", translation: "room",
  sentence: "Ma olen praegu ____.", full: "Ma olen praegu toas.",
  targetForm: "toas", otherForms: ["toa", "tuppa", "toast"], source: "usage",
};

const answer = (over: Partial<Response>): Response =>
  ({ itemId: "x", skill: "reading", band: "A1", credit: 1, ms: 1000, ...over });

describe("marking", () => {
  it("marks a choice against the stored index", () => {
    expect(gradeChoice(choice(), 0)).toBe(1);
    expect(gradeChoice(choice(), 3)).toBe(0);
  });

  it("gives a dictation partial credit for the words it got", () => {
    expect(gradeDictation(dictation, "Ma olen praegu toas.").credit).toBe(1);
    expect(gradeDictation(dictation, "").credit).toBe(0);
    const half = gradeDictation(dictation, "Ma olen praegu toa.");
    expect(half.credit).toBeGreaterThan(0.5);
    expect(half.credit).toBeLessThan(1);
  });

  it("floors an answer whose only fault is the Estonian letters", () => {
    const item = { ...dictation, et: "Ta läks õue." };
    const mark = gradeDictation(item, "Ta laks oue.");
    expect(mark.result.verdict).toBe("diacritics");
    expect(mark.credit).toBeGreaterThanOrEqual(0.8);
  });

  it("marks a typed gap against the word the sentence had", () => {
    expect(gradeWrite(write, "toas").credit).toBe(1);
    expect(gradeWrite(write, " Toas ").credit).toBe(1);
    expect(gradeWrite(write, "").credit).toBe(0);
    expect(gradeWrite(write, "raamat").credit).toBe(0);
  });

  it("calls a different form of the right word a near miss, and says which", () => {
    // The mistake the task exists to find: the word is known, the sentence is not.
    const near = gradeWrite(write, "tuppa");
    expect(near.credit).toBeGreaterThan(0);
    expect(near.credit).toBeLessThan(1);
    expect(near.usedAnotherForm).toBe(true);
    expect(near.note).toContain("toas");
  });

  it("does not fail somebody for a keyboard without Estonian letters", () => {
    const item = { ...write, targetForm: "õues", otherForms: ["õue"] };
    const mark = gradeWrite(item, "oues");
    expect(mark.right).toBe(true);
    expect(mark.credit).toBeGreaterThanOrEqual(0.8);
    expect(mark.credit).toBeLessThan(1);
  });
});

describe("levelFrom", () => {
  it("takes the highest band passed", () => {
    expect(levelFrom([
      { band: "A1", items: 2, credit: 2, ratio: 1 },
      { band: "A2", items: 2, credit: 2, ratio: 1 },
      { band: "B1", items: 2, credit: 0, ratio: 0 },
    ])).toBe("A2");
  });

  it("does not climb past a band that collapsed", () => {
    // B1 was guessed. A2 was not learned, so B1 is not the level.
    expect(levelFrom([
      { band: "A1", items: 2, credit: 2, ratio: 1 },
      { band: "A2", items: 2, credit: 0, ratio: 0 },
      { band: "B1", items: 2, credit: 2, ratio: 1 },
    ])).toBe("A1");
  });

  it("reports below A1 rather than rounding up to it", () => {
    expect(levelFrom([{ band: "A1", items: 2, credit: 0, ratio: 0 }])).toBe("pre-A1");
  });
});

describe("placement", () => {
  const items: Item[] = [
    choice({ id: "r1", band: "A1" }),
    choice({ id: "r2", band: "A2" }),
    { ...dictation, id: "l1", band: "A1" },
    { ...write, id: "w1", band: "A1" },
    { id: "s1", kind: "speak", skill: "speaking", band: "A1", lemma: "tuba", question: "Say it.", et: "tuba", translation: "room", isSentence: false, source: "dictionary" },
  ];

  it("takes the overall level from the weakest measured skill", () => {
    const result = placement(items, [
      answer({ itemId: "r1", band: "A1", credit: 1 }),
      answer({ itemId: "r2", band: "A2", credit: 1 }),
      answer({ itemId: "l1", skill: "listening", band: "A1", credit: 1 }),
      answer({ itemId: "w1", skill: "writing", band: "A1", credit: 0 }),
    ]);
    expect(result.overall).toBe("pre-A1");
    expect(result.ceiling).toBe("A2");
  });

  it("never lets a self rated recording move the level", () => {
    const spoken = answer({ itemId: "s1", skill: "speaking", band: "A1", credit: 0, selfRating: 4 });
    const without = placement(items, [answer({ itemId: "r1", credit: 1 })]);
    const with_ = placement(items, [answer({ itemId: "r1", credit: 1 }), spoken]);
    expect(with_.overall).toBe(without.overall);
    expect(with_.itemsAnswered).toBe(without.itemsAnswered);
    const speaking = with_.skills.find((s) => s.skill === "speaking");
    expect(speaking?.level).toBeNull();
    expect(speaking?.selfRating).toBe(4);
  });

  it("says a skill was not measured rather than scoring it at zero", () => {
    const result = placement(items, [answer({ itemId: "r1", credit: 1 })]);
    const listening = result.skills.find((s) => s.skill === "listening");
    expect(listening?.measured).toBe(false);
    expect(listening?.level).toBeNull();
  });

  it("gets less sure the fewer questions were answered", () => {
    const few = placement(items, [answer({ itemId: "r1", credit: 1 })]);
    expect(few.confidence).toBe("rough");
  });
});
