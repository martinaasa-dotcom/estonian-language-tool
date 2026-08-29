import { describe, expect, it } from "vitest";
import {
  LAPSE_THRESHOLD, MIN_REVIEWS_FOR_ACCURACY, POOR_ACCURACY,
  stickingNote, stickingPoints, type StickingInput,
} from "./sticking";

const card = (over: Partial<StickingInput> = {}): StickingInput => ({
  id: "c1",
  lemma: "tuba",
  front: "tuba",
  back: "room",
  cardType: "RECOGNITION",
  targetCase: null,
  lapses: 0,
  reps: 10,
  suspended: false,
  ...over,
});

/** `n` reviews for a card, `recalled` of them rated Good. */
const log = (cardId: string, n: number, recalled: number) =>
  Array.from({ length: n }, (_, i) => ({ cardId, rating: i < recalled ? 3 : 1 }));

describe("stickingPoints", () => {
  it("flags a card that has been learned and forgotten too often", () => {
    const points = stickingPoints([card({ lapses: LAPSE_THRESHOLD })], log("c1", 10, 6));
    expect(points).toHaveLength(1);
    expect(points[0]?.reason).toBe("lapses");
    expect(points[0]?.accuracy).toBe(60);
  });

  it("leaves a card one lapse short of the threshold alone", () => {
    expect(stickingPoints([card({ lapses: LAPSE_THRESHOLD - 1 })], log("c1", 10, 8))).toEqual([]);
  });

  it("flags a card that has never settled, even with no lapses recorded", () => {
    const points = stickingPoints([card()], log("c1", MIN_REVIEWS_FOR_ACCURACY, 2));
    expect(points).toHaveLength(1);
    expect(points[0]?.reason).toBe("accuracy");
    expect(points[0]?.accuracy).toBeLessThanOrEqual(POOR_ACCURACY);
  });

  it("waits for enough answers before calling a bad run a pattern", () => {
    // Two wrong out of three is not evidence; it is a tired evening.
    expect(stickingPoints([card()], log("c1", 3, 1))).toEqual([]);
  });

  it("ignores a card that is barely out of the box", () => {
    // Lapses beyond the threshold, but only two repetitions: still new.
    expect(stickingPoints([card({ reps: 2, lapses: 9 })], log("c1", 2, 0))).toEqual([]);
  });

  it("never nags about a card that has already been suspended", () => {
    expect(stickingPoints([card({ suspended: true, lapses: 9 })], log("c1", 10, 1))).toEqual([]);
  });

  it("puts the worst card first", () => {
    const cards = [
      card({ id: "mild", lemma: "mild", lapses: 4 }),
      card({ id: "awful", lemma: "awful", lapses: 9 }),
      card({ id: "bad", lemma: "bad", lapses: 6 }),
    ];
    const reviews = [...log("mild", 10, 6), ...log("awful", 10, 2), ...log("bad", 10, 4)];
    expect(stickingPoints(cards, reviews).map((p) => p.id)).toEqual(["awful", "bad", "mild"]);
  });

  it("breaks ties the same way every time, so the list does not reshuffle", () => {
    const cards = [
      card({ id: "b", lemma: "beeta", lapses: 5 }),
      card({ id: "a", lemma: "alfa", lapses: 5 }),
    ];
    const reviews = [...log("a", 10, 5), ...log("b", 10, 5)];
    expect(stickingPoints(cards, reviews).map((p) => p.id)).toEqual(["a", "b"]);
    expect(stickingPoints([...cards].reverse(), reviews).map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("honours the limit", () => {
    const cards = Array.from({ length: 12 }, (_, i) =>
      card({ id: `c${i}`, lemma: `w${i}`, lapses: 5 + i }));
    expect(stickingPoints(cards, [], 4)).toHaveLength(4);
  });

  it("gives a word one row, however many of its cards are stuck", () => {
    // A noun with four card types can produce four rows, which buries every
    // other word behind the one the learner already knows about.
    const cards = [
      card({ id: "reco", cardType: "RECOGNITION", lapses: 4 }),
      card({ id: "case", cardType: "CASE_FORM", lapses: 7, targetCase: "INESSIVE" }),
      card({ id: "prod", cardType: "PRODUCTION", lapses: 5 }),
      card({ id: "other", lemma: "aken", lapses: 6 }),
    ];
    const points = stickingPoints(cards, []);
    expect(points.map((p) => p.id)).toEqual(["case", "other"]);
    // The worst of the word's cards stands for the rest, and says how many.
    expect(points[0]?.siblings).toBe(2);
    expect(points[1]?.siblings).toBe(0);
    expect(stickingNote(points[0]!)).toMatch(/Another 2 cards for this word are stuck too/);
  });

  it("counts one sibling in the singular", () => {
    const cards = [
      card({ id: "a", lapses: 5 }),
      card({ id: "b", cardType: "PRODUCTION", lapses: 4 }),
    ];
    expect(stickingNote(stickingPoints(cards, [])[0]!)).toMatch(/Another 1 card for this word is stuck too/);
  });

  it("copes with a card that has lapses but no reviews in the window", () => {
    // The log is trimmed to six months on the page; the card's own lapse count
    // is not. Assuming full recall for a card with no rows would be a lie, but
    // so would reporting 0% — it reports what the log has and says how many.
    const points = stickingPoints([card({ lapses: 5 })], []);
    expect(points[0]?.reviews).toBe(0);
    expect(points[0]?.accuracy).toBe(100);
    expect(points[0]?.reason).toBe("lapses");
  });

  it("returns nothing for an empty deck", () => {
    expect(stickingPoints([], [])).toEqual([]);
  });
});

describe("stickingNote", () => {
  it("counts the lapses when that is what flagged the card", () => {
    const [point] = stickingPoints([card({ lapses: 5 })], log("c1", 10, 5));
    expect(stickingNote(point!)).toBe("Learned and forgotten 5 times, 50% recalled over 10 reviews.");
  });

  it("talks about settling when accuracy is what flagged it", () => {
    const [point] = stickingPoints([card()], log("c1", 8, 3));
    expect(stickingNote(point!)).toMatch(/never really settled/);
  });
});
