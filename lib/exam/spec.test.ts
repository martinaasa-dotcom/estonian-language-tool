import { describe, expect, it } from "vitest";
import {
  BANDS, BREAK_MINUTES, EXAM_LEVELS, LISTEN_PLAYS, OFFICIAL_LEVELS, PASS_PCT,
  READ_QUESTIONS_SECONDS, bandFor, isExamLevel, lengthsFor, speakingCriteria, specFor,
  writtenMinutes,
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

describe("the conditions the parts are sat under", () => {
  it("plays each listening recording twice, which is what the specifications set", () => {
    // A2, B1 and C1 all say each listening text is heard twice. Raising this is
    // making the paper easier than the one it claims to imitate; lowering it is
    // making it harder than any paper the state sets.
    expect(LISTEN_PLAYS).toBe(2);
  });

  it("gives a pause to read the questions before a listening task", () => {
    expect(READ_QUESTIONS_SECONDS).toBeGreaterThan(0);
  });

  it("puts a break between the written half and the spoken part", () => {
    // The Board publishes "a short break" and no number, so the figure is ours
    // and the screen says so. What is not ours is that there is one.
    expect(BREAK_MINUTES).toBeGreaterThan(0);
  });
});

describe("the writing part, which is two pieces of writing", () => {
  it("opens with the short message and follows with the longer text, as the real paper does", () => {
    for (const level of EXAM_LEVELS) {
      const writing = specFor(level).parts.find((p) => p.skill === "writing");
      expect(writing?.tasks.map((t) => t.kind).slice(0, 2)).toEqual(["message", "compose"]);
    }
  });

  it("names the two official writing tasks it stands in for", () => {
    const writing = specFor("B1").parts.find((p) => p.skill === "writing");
    const stands = writing?.tasks.map((t) => t.standsFor).join(" ") ?? "";
    expect(stands).toContain("teate koostamine");
    expect(stands).toContain("loovkirjutamine");
  });

  it("says out loud that the two accuracy drills are not tasks the real paper sets", () => {
    /*
      They stand in for a criterion an examiner marks inside the two texts,
      which this app may not mark, because marking Estonian prose means a model
      deciding whether an ending is right. Standing in for it is defensible.
      Letting somebody think the paper sets it is not.
    */
    const writing = specFor("B1").parts.find((p) => p.skill === "writing");
    const drills = writing?.tasks.filter((t) => t.kind === "case-form" || t.kind === "government");
    expect(drills).toHaveLength(2);
    for (const drill of drills ?? []) {
      expect(drill.standsFor).toMatch(/not a task the real paper sets/);
    }
  });

  it("lets the two texts carry more of the part than the drills do", () => {
    for (const level of EXAM_LEVELS) {
      const writing = specFor(level).parts.find((p) => p.skill === "writing");
      const texts = (writing?.tasks ?? [])
        .filter((t) => t.kind === "message" || t.kind === "compose")
        .reduce((sum, t) => sum + t.raw, 0);
      const drills = (writing?.tasks ?? [])
        .filter((t) => t.kind === "case-form" || t.kind === "government")
        .reduce((sum, t) => sum + t.raw, 0);
      expect(texts).toBeGreaterThan(drills);
    }
  });

  it("asks for a shorter message than composition at every level", () => {
    for (const level of EXAM_LEVELS) {
      const { messageWords, composeWords } = lengthsFor(level);
      expect(messageWords).toBeGreaterThan(0);
      expect(messageWords).toBeLessThan(composeWords);
    }
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
