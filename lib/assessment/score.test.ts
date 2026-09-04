import { describe, expect, it } from "vitest";
import { confidenceFrom, decisiveItems, gradeChoice, gradeDictation, gradeWrite, levelFrom, overallFrom, placement } from "./score";
import type { Band, ChoiceItem, DictationItem, Item, Response, WriteItem } from "./types";

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
  because: "Ma olen praegu toas. The gap takes toas, which is tuba in the seesütlev (inessive).",
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

  it("stops at a band that was asked and not passed, unless the band above confirms it", () => {
    /*
      A band between half and two thirds is a band somebody visibly did not
      pass, and it is also exactly what four-option questions and a little
      knowledge produce. So on its own it ends the climb, and it used to end
      it whatever came after. But the session asks one band past a near miss
      for one reason, to find out whether it was a bad six questions, and a
      pass there is that answer: this shape read A1 with B1 passed beside it,
      and a real sitting read A2 overall with two B1s. Under half is still the
      end, whatever sits above.
    */
    expect(levelFrom([
      { band: "A1", items: 7, credit: 7, ratio: 1 },
      { band: "A2", items: 7, credit: 3.9, ratio: 0.557 },
      { band: "B1", items: 7, credit: 4.9, ratio: 0.7 },
    ])).toBe("B1");
    expect(levelFrom([
      { band: "A1", items: 7, credit: 7, ratio: 1 },
      { band: "A2", items: 7, credit: 3.9, ratio: 0.557 },
      { band: "B1", items: 7, credit: 4.2, ratio: 0.6 },
    ])).toBe("A1");
  });

  it("does not call somebody below A1 on a section that set no A1 question", () => {
    /*
      Writing has no A1 item and cannot: choosing the ending a sentence needs
      is a step past reading the word, so every gap is raised to A2. Reading a
      failed A2 as "below A1" claims something about a band nobody was asked
      about, and since the overall level follows the weakest skill it put that
      claim on most results.
    */
    expect(levelFrom([{ band: "A2", items: 8, credit: 2, ratio: 0.25 }])).toBe("A1");
    expect(levelFrom([{ band: "A1", items: 7, credit: 2, ratio: 0.29 }])).toBe("pre-A1");
  });

  it("reads a near miss as passed when the band above it passes", () => {
    /*
      The session asks one band past a near miss so that a bad six questions
      can be told from a ceiling, and this is the sitting that found the scorer
      ignoring the answer: writing A2 at 53% and B1 at 73%, scored A1, and A2
      overall beside two B1s.
    */
    expect(levelFrom([
      { band: "A2", items: 6, credit: 3.2, ratio: 0.533 },
      { band: "B1", items: 6, credit: 4.4, ratio: 0.733 },
    ])).toBe("B1");
    // And the climb carries on above the confirmation.
    expect(levelFrom([
      { band: "A1", items: 6, credit: 6, ratio: 1 },
      { band: "A2", items: 6, credit: 3.2, ratio: 0.533 },
      { band: "B1", items: 6, credit: 4.4, ratio: 0.733 },
      { band: "B2", items: 6, credit: 5, ratio: 0.833 },
      { band: "C1", items: 6, credit: 2, ratio: 0.333 },
    ])).toBe("B2");
  });

  it("does not read a near miss as passed on anything less than a pass above it", () => {
    // A near miss over a near miss is two bands not passed.
    expect(levelFrom([
      { band: "A1", items: 6, credit: 6, ratio: 1 },
      { band: "A2", items: 6, credit: 3.2, ratio: 0.533 },
      { band: "B1", items: 6, credit: 3.5, ratio: 0.583 },
      { band: "B2", items: 6, credit: 6, ratio: 1 },
    ])).toBe("A1");
    // Nothing above it asked: a near miss stays a miss.
    expect(levelFrom([
      { band: "A1", items: 6, credit: 6, ratio: 1 },
      { band: "A2", items: 6, credit: 3.2, ratio: 0.533 },
    ])).toBe("A1");
    // Under half is not a near miss, whatever the band above did.
    expect(levelFrom([
      { band: "A1", items: 6, credit: 6, ratio: 1 },
      { band: "A2", items: 6, credit: 2.9, ratio: 0.483 },
      { band: "B1", items: 6, credit: 6, ratio: 1 },
    ])).toBe("A1");
  });

  it("steps over a band nothing could be asked at rather than failing it", () => {
    // A dictionary too thin to fill a band is not evidence about the learner.
    expect(levelFrom([
      { band: "A1", items: 7, credit: 7, ratio: 1 },
      { band: "B1", items: 7, credit: 7, ratio: 1 },
    ])).toBe("B1");
  });
});

describe("decisiveItems", () => {
  const at = (band: Band, count: number): Response[] =>
    Array.from({ length: count }, (_, i) => answer({ itemId: `${band}-${i}`, band, credit: 1 }));

  it("counts the boundary the level turns on, not the whole paper", () => {
    // Forty questions below A2 say nothing more than the first three did.
    const responses = [...at("A1", 20), ...at("A2", 9), ...at("B1", 7)];
    expect(decisiveItems(responses, "A2")).toBe(16);
  });

  it("counts what was asked at A1 for somebody who did not reach it", () => {
    expect(decisiveItems([...at("A1", 11)], "pre-A1")).toBe(11);
  });

  it("does not count a recording as evidence of anything", () => {
    // ADR-018: speaking is not scored, so it is not evidence either.
    const spoken = answer({ itemId: "s", skill: "speaking", band: "A1", credit: 0, selfRating: 4 });
    expect(decisiveItems([...at("A1", 4), spoken], "pre-A1")).toBe(4);
  });

  it("does not count a question that was skipped", () => {
    const skipped = { ...answer({ itemId: "x", band: "A1", credit: 0 }), skipped: true };
    expect(decisiveItems([...at("A1", 4), skipped], "pre-A1")).toBe(4);
  });
});

describe("confidenceFrom", () => {
  it("scales with the paper rather than with a number somebody has to raise", () => {
    // A band carries fifteen scored questions, so one whole band is already
    // evidence and two of them is a boundary properly measured.
    expect(confidenceFrom(15)).toBe("reasonable");
    expect(confidenceFrom(30)).toBe("reasonable");
    // A band decided on two questions is a coin toss wearing a percentage.
    expect(confidenceFrom(4)).toBe("rough");
  });
});

describe("placement", () => {
  it("reports the evidence the confidence tier is about", () => {
    /*
      The result screen prints the whole paper's count, so the tier has to
      arrive with the smaller number it was actually computed from. Without it
      the sentence reads "68 scored questions" over a tier that 30 of them
      decided, which is a headline and its caption answering one question two
      different ways.
    */
    const items: Item[] = [choice({ id: "a1", band: "A1" }), choice({ id: "a2", band: "A2" }), choice({ id: "b2", band: "B2" })];
    const result = placement(items, [
      answer({ itemId: "a1", band: "A1", credit: 1 }),
      answer({ itemId: "a2", band: "A2", credit: 0 }),
      answer({ itemId: "b2", band: "B2", credit: 1 }),
    ]);
    expect(result.overall).toBe("A1");
    expect(result.itemsAnswered).toBe(3);
    // A1 and A2, the band reached and the one that ended the climb. Not B2.
    expect(result.decisive).toBe(2);
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

  it("averages the measured skills rather than taking the weakest", () => {
    /*
      Reading A2, listening A1, writing pre-A1. The old rule read that as
      pre-A1, on the strength of one skill, and reported a level below the
      band two of the three had cleared. The mean of -1, 0 and 1 is 0, which
      is A1.
    */
    const result = placement(items, [
      answer({ itemId: "r1", band: "A1", credit: 1 }),
      answer({ itemId: "r2", band: "A2", credit: 1 }),
      answer({ itemId: "l1", skill: "listening", band: "A1", credit: 1 }),
      answer({ itemId: "w1", skill: "writing", band: "A1", credit: 0 }),
    ]);
    expect(result.overall).toBe("A1");
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

describe("overallFrom", () => {
  it("reads the sitting that produced this rule as B1 rather than below A1", () => {
    /*
      The real result that got the rule changed: reading B2, listening A1,
      writing B2. The screen said "below A1" to somebody who reads and writes
      at B2, which is three bands under any honest reading of them. The mean of
      3, 0 and 3 is 2, which is B1.
    */
    expect(overallFrom(["B2", "A1", "B2"])).toEqual({ level: "B1", nearly: null });
  });

  it("names the next band when the average fell between two", () => {
    // B1, B2, B2 averages 2.67: a confident B1 who was nearly B2.
    expect(overallFrom(["B1", "B2", "B2"])).toEqual({ level: "B1", nearly: "B2" });
  });

  it("stays silent about the next band when the average was not close to it", () => {
    // 2.33 is inside B1, not between B1 and B2. A "nearly" on every result
    // would stop meaning anything.
    expect(overallFrom(["B1", "B1", "B2"])).toEqual({ level: "B1", nearly: null });
  });

  it("takes the lower band on a straight tie, and says which one it nearly was", () => {
    expect(overallFrom(["A2", "B1"])).toEqual({ level: "A2", nearly: "B1" });
  });

  it("keeps pre-A1 for somebody who reached no band, and never says nearly pre-A1", () => {
    expect(overallFrom(["pre-A1", "pre-A1"])).toEqual({ level: "pre-A1", nearly: null });
    expect(overallFrom(["pre-A1", "A1"])).toEqual({ level: "pre-A1", nearly: "A1" });
  });

  it("does not climb past the top band", () => {
    expect(overallFrom(["C1", "C1", "C1"])).toEqual({ level: "C1", nearly: null });
  });

  it("reports one measured skill as itself", () => {
    expect(overallFrom(["B1"])).toEqual({ level: "B1", nearly: null });
  });

  it("has no level to report when nothing was measured", () => {
    expect(overallFrom([])).toEqual({ level: null, nearly: null });
  });
});
