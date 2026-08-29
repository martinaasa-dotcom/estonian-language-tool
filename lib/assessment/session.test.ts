import { describe, expect, it } from "vitest";
import { ladderStopped, nextCursor, progress } from "./session";
import type { Band, ChoiceItem, Item, Response, Skill } from "./types";

const item = (id: string, skill: Skill, band: Band): ChoiceItem => ({
  id, kind: "choice", skill, band, lemma: id,
  question: "?", et: "tuba", heard: false,
  options: ["a", "b", "c", "d"], estonianOptions: false, answer: 0,
  source: "dictionary", because: "",
});

const PAPER: Item[] = [
  item("r-a1-1", "reading", "A1"), item("r-a1-2", "reading", "A1"),
  item("r-a2-1", "reading", "A2"), item("r-a2-2", "reading", "A2"),
  item("r-b1-1", "reading", "B1"), item("r-b1-2", "reading", "B1"),
  item("l-a1-1", "listening", "A1"),
];

const said = (id: string, credit: number): Response => {
  const found = PAPER.find((i) => i.id === id)!;
  return { itemId: id, skill: found.skill, band: found.band, credit, ms: 500 };
};

describe("the ladder", () => {
  it("asks the easiest unanswered question first", () => {
    expect(nextCursor(PAPER, []).index).toBe(0);
    expect(nextCursor(PAPER, [said("r-a1-1", 1)]).index).toBe(1);
  });

  it("stops climbing once a whole band came in under half", () => {
    const answers = [said("r-a1-1", 1), said("r-a1-2", 1), said("r-a2-1", 0), said("r-a2-2", 0)];
    expect(ladderStopped(PAPER, answers, "reading", "B1")).toBe(true);
    // It moves on to the next skill rather than to harder reading.
    expect(PAPER[nextCursor(PAPER, answers).index!]?.id).toBe("l-a1-1");
    expect(nextCursor(PAPER, answers).skipped).toBe(2);
  });

  it("keeps climbing on a band that was only half missed", () => {
    const answers = [said("r-a1-1", 1), said("r-a1-2", 1), said("r-a2-1", 1), said("r-a2-2", 0)];
    expect(ladderStopped(PAPER, answers, "reading", "B1")).toBe(false);
    expect(PAPER[nextCursor(PAPER, answers).index!]?.id).toBe("r-b1-1");
  });

  it("does not stop a skill on another skill's failure", () => {
    const answers = [said("r-a1-1", 0), said("r-a1-2", 0)];
    expect(ladderStopped(PAPER, answers, "listening", "A1")).toBe(false);
  });

  it("finishes", () => {
    const all = PAPER.map((i) => said(i.id, 1));
    expect(nextCursor(PAPER, all).index).toBeNull();
    expect(progress(PAPER, all)).toBe(100);
  });

  it("counts a skipped band out of the progress meter, not into it", () => {
    const answers = [said("r-a1-1", 0), said("r-a1-2", 0)];
    // Two answered, one listening question left, four reading ones abandoned.
    expect(progress(PAPER, answers)).toBe(67);
  });
});
