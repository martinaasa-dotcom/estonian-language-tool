import { describe, expect, it } from "vitest";
import { LEVELS } from "./syllabus";
import { aroundFirst, bandsAround, isAround } from "./levels";

describe("the level window", () => {
  it("covers every level the course has", () => {
    for (const level of LEVELS) {
      expect(bandsAround(level).length).toBeGreaterThan(1);
      expect(bandsAround(level)).toContain(level);
    }
  });

  it("reaches one band up, so a learner meets what is next", () => {
    expect(bandsAround("A1")).toContain("A2");
    expect(bandsAround("B1")).toContain("B2");
  });

  it("leaves out what is two bands away in either direction", () => {
    expect(isAround("C1", "A1")).toBe(false);
    expect(isAround("A1", "C1")).toBe(false);
  });

  it("keeps a word the learner added themselves, whatever their level", () => {
    // Nothing typed in, pasted or photographed carries a CEFR tag, and a level
    // that hid those would hide the learner's own homework from their deck.
    for (const level of LEVELS) {
      expect(isAround(null, level)).toBe(true);
      expect(isAround("", level)).toBe(true);
    }
  });

  it("offers C2 to the one level it could be any use to", () => {
    expect(isAround("C2", "C1")).toBe(true);
    expect(isAround("C2", "B1")).toBe(false);
  });
});

describe("aroundFirst", () => {
  const deck = [
    { lemma: "far-below", cefr: "A1" },
    { lemma: "at-level", cefr: "B1" },
    { lemma: "far-above", cefr: "C1" },
    { lemma: "their-own", cefr: null },
    { lemma: "one-up", cefr: "B2" },
  ];
  const order = (level: Parameters<typeof aroundFirst>[1]) =>
    aroundFirst(deck, level, (w) => w.cefr).map((w) => w.lemma);

  it("puts what is around the level in front and drops nothing", () => {
    expect(order("B1")).toEqual(["at-level", "their-own", "one-up", "far-below", "far-above"]);
    expect(order("B1")).toHaveLength(deck.length);
  });

  it("keeps the caller's order inside each half", () => {
    // Review hands cards over in the order they were added, and that order is
    // an answer to a different question that still has to survive this one.
    expect(order("A1")).toEqual(["far-below", "their-own", "at-level", "far-above", "one-up"]);
  });

  it("returns everything however far the level is from the deck", () => {
    expect(order("C1")).toHaveLength(deck.length);
    expect(new Set(order("C1"))).toEqual(new Set(deck.map((w) => w.lemma)));
  });
});
