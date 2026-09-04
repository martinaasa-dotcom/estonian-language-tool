import { describe, expect, it } from "vitest";
import { masteryOf, MASTERY_CORRECT, MASTERY_ORDER, MASTERY_SLOTS, type WordReview } from "./mastery";

let clock = 0;
/**
 * A graded answer. `at` only matters where the order of two of them does.
 *
 * The slot is what the round asked, which is the column mastery counts;
 * `targetCase` rides along as null because these are not case cards and the
 * two questions are deliberately answered by two columns.
 */
const r = (rating: number, slot: string | null = null, at?: number): WordReview =>
  ({ rating, targetCase: null, slot, reviewedAt: new Date(at ?? (clock += 1000)) });

const right = (c: string | null = null, at?: number) => r(4, c, at);
const wrong = (c: string | null = null, at?: number) => r(1, c, at);

describe("masteryOf", () => {
  it("says nothing about a word with no answers behind it", () => {
    expect(masteryOf([])).toEqual({
      mastery: "learning", correct: 0, total: 0, slots: 0, slotsNeeded: MASTERY_SLOTS,
      filled: [], accuracy: null, progress: 0,
    });
  });

  it("calls a word mastered at five correct answers across three slots", () => {
    const v = masteryOf([right("SEES"), right("SEEST"), right(null), right("SEES"), right("SEEST")]);
    expect(v.mastery).toBe("mastered");
    expect(v.correct).toBe(5);
    expect(v.slots).toBe(3);
    expect(v.progress).toBe(1);
  });

  it("refuses to call five right answers in one slot mastered", () => {
    /*
      The half of the rule that makes the claim mean anything. Five correct
      answers to the same recognition card is five reads of one flashcard, and
      a learner who can do that and cannot put the word in the seesütlev has
      not mastered it.
    */
    const v = masteryOf([right(), right(), right(), right(), right()]);
    expect(v.mastery).toBe("almost");
    expect(v.correct).toBe(5);
    expect(v.slots).toBe(1);
  });

  it("counts a near miss as correct, because the learner still produced it", () => {
    // Hard is what the marker grades a dropped diacritic or a typo.
    const v = masteryOf([r(3, "SEES"), r(3, "SEEST"), r(3, null), r(3, "OSA"), r(3, "SEES")]);
    expect(v.mastery).toBe("mastered");
  });

  it("holds a word out of mastered when the last answer was wrong", () => {
    /*
      A word answered right five times last month and wrong this morning is not
      mastered. Saying so would be the app telling somebody they know something
      they had just got wrong. The history is not thrown away: it lands in
      almost, and one correct answer puts it back.
    */
    const history = [right("SEES", 1), right("SEEST", 2), right(null, 3), right("OSA", 4), right("SEES", 5)];
    expect(masteryOf(history).mastery).toBe("mastered");
    expect(masteryOf([...history, wrong("SEES", 6)]).mastery).toBe("almost");
    expect(masteryOf([...history, wrong("SEES", 6), right("SEES", 7)]).mastery).toBe("mastered");
  });

  it("reads the last answer by its timestamp, not by its position", () => {
    // An offline grade can land after a newer one: the outbox replays with the
    // time it was actually answered, never re-stamped.
    const out = [right("SEES", 1), right("SEEST", 2), right(null, 3), right("OSA", 4),
      right("SEES", 9), wrong("SEES", 5)];
    // The wrong one is last in the array and fifth in time, so the word stands.
    expect(masteryOf(out).mastery).toBe("mastered");
  });

  it("calls a word that keeps going wrong struggling, even at the almost count", () => {
    /*
      Tested before `almost` on purpose: four correct and eight wrong meets the
      almost count and is plainly not almost anything, and the list somebody
      opens to find what to work on is the one that must not lose it.
    */
    const reviews = [
      right("SEES"), right("SEEST"), right(null), right("OSA"),
      wrong(), wrong(), wrong(), wrong(), wrong(), wrong(), wrong(), wrong(),
    ];
    const v = masteryOf(reviews);
    expect(v.mastery).toBe("struggling");
    expect(v.correct).toBe(4);
  });

  it("does not call two wrong answers a pattern", () => {
    // Accuracy is not read at all below four answers: everybody gets a word
    // wrong twice on the way in.
    const v = masteryOf([wrong(), wrong()]);
    expect(v.accuracy).toBeNull();
    expect(v.mastery).toBe("learning");
  });

  it("is still learning below three correct answers", () => {
    expect(masteryOf([right("SEES"), right("SEEST")]).mastery).toBe("learning");
  });

  it("reports progress as the smaller of the two thresholds", () => {
    // Five correct answers in one slot is not five sixths of the way there.
    const v = masteryOf([right(), right(), right(), right(), right()]);
    expect(v.progress).toBeCloseTo(1 / MASTERY_SLOTS);

    const even = masteryOf([right("A"), right("B"), right("C")]);
    expect(even.progress).toBeCloseTo(3 / MASTERY_CORRECT);
  });

  it("counts every non-case answer as one shared slot", () => {
    // `Review` carries no card type, so recognition and production land
    // together. Undercounting is the safe direction for a claim like this.
    expect(masteryOf([right(null), right(null), right(null)]).slots).toBe(1);
  });
});

describe("MASTERY_ORDER", () => {
  it("leads with what is going wrong and ends with what is done", () => {
    expect(MASTERY_ORDER[0]).toBe("struggling");
    expect(MASTERY_ORDER.at(-1)).toBe("mastered");
  });

  it("names every tier exactly once", () => {
    expect(new Set(MASTERY_ORDER).size).toBe(MASTERY_ORDER.length);
    expect(MASTERY_ORDER).toHaveLength(4);
  });
});

describe("the bar is what the word can carry", () => {
  /*
    The fault this parameter exists for. Every one of these words was
    unmasterable before it, for ever, on any deck: the threshold was a flat
    three and the log could not record more than one kind of answer about
    them.
  */
  it("masters a phrase on the two questions a phrase has", () => {
    const v = masteryOf(
      [right("RECOGNITION"), right("PRODUCTION"), right("RECOGNITION"),
       right("PRODUCTION"), right("RECOGNITION")],
      2,
    );
    expect(v.mastery).toBe("mastered");
    expect(v.slotsNeeded).toBe(2);
  });

  it("still asks three of a word that has more than three", () => {
    const v = masteryOf(
      [right("RECOGNITION"), right("PRODUCTION"), right("RECOGNITION"),
       right("PRODUCTION"), right("RECOGNITION")],
      9,
    );
    expect(v.mastery).toBe("almost");
    expect(v.slotsNeeded).toBe(MASTERY_SLOTS);
  });

  it("never asks for nothing, however little a word can be asked", () => {
    // A word with no cards at all cannot be asked anything, and dividing by
    // that to say so would report it as finished on its first correct answer.
    expect(masteryOf([right()], 0).slotsNeeded).toBe(1);
  });

  it("reads a row written before the slot column the way it always did", () => {
    const legacy = (at: number): WordReview =>
      ({ rating: 4, targetCase: "INESSIVE", slot: null, reviewedAt: new Date(at) });
    const v = masteryOf([legacy(1), legacy(2), legacy(3), legacy(4), legacy(5)]);
    expect(v.slots).toBe(1);
    expect(v.filled).toEqual(["INESSIVE"]);
  });

  it("names the slots already answered, so a round can ask for another", () => {
    const v = masteryOf([right("INESSIVE"), wrong("COMITATIVE"), right("RECOGNITION")]);
    expect([...v.filled].sort()).toEqual(["INESSIVE", "RECOGNITION"]);
  });
});
