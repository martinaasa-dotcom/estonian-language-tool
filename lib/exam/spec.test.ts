import { describe, expect, it } from "vitest";
import {
  BANDS, EXAM_LEVELS, OFFICIAL_LEVELS, PASS_PCT, bandFor, isExamLevel, lengthsFor,
  speakingCriteria, specFor, writtenMinutes,
} from "./spec";
import { SKILLS } from "./types";

/*
  These assert the *published* examination, not this app's taste. Every number
  here was read off the Education and Youth Board's own specifications and is
  cited in docs/16-exam.md. A change to one of them is a change to a claim the
  product makes about a real examination somebody may be about to book, so it
  should have to argue with a test first.
*/

describe("the levels the state examines", () => {
  it("is A2, B1, B2 and C1, and nothing else", () => {
    expect([...OFFICIAL_LEVELS]).toEqual(["A2", "B1", "B2", "C1"]);
  });

  it("marks A1 and C2 as not official, because no such paper exists", () => {
    expect(specFor("A1").official).toBe(false);
    expect(specFor("C2").official).toBe(false);
  });

  it("recognises a level string and rejects anything else", () => {
    expect(isExamLevel("B2")).toBe(true);
    expect(isExamLevel("D1")).toBe(false);
    expect(isExamLevel("b2")).toBe(false);
  });
});

describe("the shape of each paper", () => {
  it("has four parts everywhere, in the order they are sat", () => {
    for (const level of EXAM_LEVELS) {
      expect(specFor(level).parts.map((p) => p.skill)).toEqual([...SKILLS]);
    }
  });

  it("gives A2 eighty points, twenty for each part", () => {
    const spec = specFor("A2");
    expect(spec.totalPoints).toBe(80);
    expect(spec.parts.every((p) => p.points === 20)).toBe(true);
  });

  it("gives B1, B2 and C1 a hundred points, twenty five for each part", () => {
    for (const level of ["B1", "B2", "C1"] as const) {
      const spec = specFor(level);
      expect(spec.totalPoints).toBe(100);
      expect(spec.parts.every((p) => p.points === 25)).toBe(true);
    }
  });

  it("keeps the published minutes for each part", () => {
    const minutes = (level: Parameters<typeof specFor>[0]) =>
      Object.fromEntries(specFor(level).parts.map((p) => [p.skill, p.minutes]));

    expect(minutes("A2")).toEqual({ writing: 30, listening: 30, reading: 50, speaking: 15 });
    expect(minutes("B1")).toEqual({ writing: 30, listening: 35, reading: 50, speaking: 15 });
    expect(minutes("B2")).toEqual({ writing: 80, listening: 35, reading: 70, speaking: 20 });
    expect(minutes("C1")).toEqual({ writing: 90, listening: 45, reading: 60, speaking: 20 });
  });

  it("adds up the written half, which is what somebody plans an evening around", () => {
    // B2 is three hours and five minutes of written paper.
    expect(writtenMinutes(specFor("B2"))).toBe(185);
  });

  it("asks for a longer text at every step up", () => {
    const lengths = EXAM_LEVELS.map((l) => lengthsFor(l).composeWords);
    for (let i = 1; i < lengths.length; i++) {
      expect(lengths[i]!).toBeGreaterThan(lengths[i - 1]!);
    }
    // The C1 paper's second writing task runs to about 260 words.
    expect(lengthsFor("C1").composeWords).toBe(260);
  });

  it("makes every task worth at least one mark", () => {
    for (const level of EXAM_LEVELS) {
      for (const part of specFor(level).parts) {
        for (const task of part.tasks) {
          expect(task.items).toBeGreaterThan(0);
          expect(task.raw).toBeGreaterThan(0);
        }
      }
    }
  });

  it("says what every task is standing in for", () => {
    for (const level of EXAM_LEVELS) {
      for (const part of specFor(level).parts) {
        for (const task of part.tasks) {
          expect(task.standsFor.length).toBeGreaterThan(8);
        }
      }
    }
  });
});

describe("the pass mark and the bands", () => {
  it("is sixty percent", () => {
    expect(PASS_PCT).toBe(60);
  });

  it("reports the same verbal assessment a real result carries", () => {
    expect(bandFor(100).label).toBe("very good");
    expect(bandFor(91).label).toBe("very good");
    expect(bandFor(90).label).toBe("good");
    expect(bandFor(76).label).toBe("good");
    expect(bandFor(75).label).toBe("satisfactory");
    expect(bandFor(60).label).toBe("satisfactory");
    expect(bandFor(59).label).toBe("poor");
    expect(bandFor(50).label).toBe("poor");
    expect(bandFor(49).label).toBe("not up to the level");
    expect(bandFor(0).label).toBe("not up to the level");
  });

  it("has a band for every score, so no result is unlabelled", () => {
    for (let pct = 0; pct <= 100; pct++) {
      expect(BANDS).toContain(bandFor(pct));
    }
  });
});

describe("the self-marked spoken part", () => {
  it("hands back one criterion per mark", () => {
    expect(speakingCriteria(4)).toHaveLength(4);
    expect(speakingCriteria(9)).toHaveLength(9);
  });

  it("never returns none, however small the ask", () => {
    expect(speakingCriteria(0).length).toBeGreaterThan(0);
    expect(speakingCriteria(-3).length).toBeGreaterThan(0);
  });

  it("has enough criteria for the longest paper", () => {
    const most = Math.max(
      ...EXAM_LEVELS.flatMap((l) =>
        specFor(l).parts.filter((p) => p.skill === "speaking").flatMap((p) => p.tasks.map((t) => t.raw))),
    );
    expect(speakingCriteria(most)).toHaveLength(most);
  });
});
