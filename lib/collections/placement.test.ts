import { describe, expect, it } from "vitest";
import {
  PASS_MARK, PER_LEVEL, buildPlacement, passed, placementResult, placementSummary,
  type PlacementWord, type StageScore,
} from "./placement";
import { LEVELS, courseWords, type Level } from "./syllabus";

/** Enough words per level that every level can build a full stage. */
const WORDS: PlacementWord[] = LEVELS.flatMap((level) =>
  Array.from({ length: 12 }, (_, i) => ({
    lemma: `${level.toLowerCase()}sõna${i}`,
    gloss: `${level} word ${i}`,
    level,
  })),
);

const score = (level: Level, correct: number): StageScore => ({ level, correct, asked: PER_LEVEL });

describe("buildPlacement", () => {
  it("builds a rung for every level", () => {
    const stages = buildPlacement(WORDS, 3);
    expect(stages.map((s) => s.level)).toEqual([...LEVELS]);
  });

  it("asks the same number of questions at every level", () => {
    for (const stage of buildPlacement(WORDS, 3)) {
      expect(stage.questions.length, stage.level).toBe(PER_LEVEL);
    }
  });

  it("draws wrong answers from the same level as the right one", () => {
    // Offering an A1 gloss beside a C1 word lets somebody climb the ladder by
    // eliminating the easy options, which measures test-taking, not Estonian.
    for (const stage of buildPlacement(WORDS, 5)) {
      for (const q of stage.questions) {
        for (const option of q.options) expect(option.startsWith(stage.level)).toBe(true);
      }
    }
  });

  it("marks exactly one option correct, and it is the word's own gloss", () => {
    const glossOf = new Map(WORDS.map((w) => [w.lemma, w.gloss]));
    for (const stage of buildPlacement(WORDS, 9)) {
      for (const q of stage.questions) {
        expect(q.options.length).toBe(4);
        expect(new Set(q.options).size).toBe(4);
        expect(q.options[q.answer]).toBe(glossOf.get(q.lemma));
      }
    }
  });

  it("is deterministic for a seed", () => {
    const a = JSON.stringify(buildPlacement(WORDS, 7));
    expect(JSON.stringify(buildPlacement(WORDS, 7))).toBe(a);
    expect(JSON.stringify(buildPlacement(WORDS, 8))).not.toBe(a);
  });

  it("skips a level it cannot build a fair question for", () => {
    // Better to leave a rung out than to ask a question with two options.
    const thin = WORDS.filter((w) => w.level !== "C1");
    const stages = buildPlacement([...thin, { lemma: "üks", gloss: "one", level: "C1" }], 2);
    expect(stages.map((s) => s.level)).not.toContain("C1");
  });
});

describe("placementResult", () => {
  it("places a complete beginner at A1", () => {
    expect(placementResult([score("A1", 0)])).toBe("A1");
  });

  it("places somebody at the highest level they passed", () => {
    const scores = [score("A1", 4), score("A2", 4), score("B1", 3), score("B2", 1)];
    expect(placementResult(scores)).toBe("B1");
  });

  it("never counts a level reached across a failure", () => {
    // Four lucky guesses at B2 after failing B1 is not B2.
    const scores = [score("A1", 4), score("A2", 4), score("B1", 0), score("B2", 4)];
    expect(placementResult(scores)).toBe("A2");
  });

  it("places a fluent speaker at the top", () => {
    expect(placementResult(LEVELS.map((l) => score(l, 4)))).toBe("C1");
  });

  it("requires the pass mark, not a majority", () => {
    expect(passed(score("A1", PASS_MARK))).toBe(true);
    expect(passed(score("A1", PASS_MARK - 1))).toBe(false);
  });

  it("scales the pass mark to a short stage rather than assuming four", () => {
    expect(passed({ level: "A1", correct: 2, asked: 2 })).toBe(true);
    expect(passed({ level: "A1", correct: 1, asked: 2 })).toBe(false);
    expect(passed({ level: "A1", correct: 0, asked: 0 })).toBe(false);
  });
});

describe("placementSummary", () => {
  it("says something true and encouraging to a beginner", () => {
    const text = placementSummary("A1", [score("A1", 1)]);
    expect(text).toMatch(/beginning/i);
  });

  it("admits that the test only measures recognition", () => {
    const text = placementSummary("B1", [score("A1", 4), score("A2", 4), score("B1", 3), score("B2", 1)]);
    expect(text).toMatch(/recognition/i);
  });

  it("does not pretend fluency past the course is finished by finishing units", () => {
    const text = placementSummary("C1", LEVELS.map((l) => score(l, 4)));
    expect(text).toMatch(/reading and arguing/i);
  });
});

describe("against the real course", () => {
  it("can build a full ladder from the words the course teaches", () => {
    // The placement test is only as good as the vocabulary behind it, and the
    // old path could not have built this at all: it had 14 words at B2 and 14
    // at C1, fewer than one stage needs to be fair.
    const words: PlacementWord[] = courseWords().map((w) => ({
      lemma: w.lemma, gloss: w.gloss, level: w.level,
    }));
    const stages = buildPlacement(words, 1);
    expect(stages.map((s) => s.level)).toEqual([...LEVELS]);
    for (const stage of stages) expect(stage.questions.length).toBe(PER_LEVEL);
  });
});
