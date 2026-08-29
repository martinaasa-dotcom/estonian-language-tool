import { describe, expect, it } from "vitest";
import { buildCheckpoint, checkpointPassed, type CheckpointWord } from "./checkpoint";

const word = (lemma: string, extra: Partial<CheckpointWord> = {}): CheckpointWord => ({
  lemma,
  gloss: `${lemma} in English`,
  pos: "NOUN",
  examples: [],
  parts: { NOM_SG: lemma, GEN_SG: `${lemma}i`, PART_SG: `${lemma}it` },
  ...extra,
});

const WORDS: CheckpointWord[] = [
  word("maja", { examples: ["Maja on suur ja valge."], parts: { NOM_SG: "maja", GEN_SG: "maja", PART_SG: "maja" } }),
  word("tuba", { examples: ["Toas on soe."], parts: { NOM_SG: "tuba", GEN_SG: "toa", PART_SG: "tuba" } }),
  word("uks", { parts: { NOM_SG: "uks", GEN_SG: "ukse", PART_SG: "ust" } }),
  word("aken"), word("laud"), word("tool"), word("sein"), word("pilt"),
  word("klaas"), word("tass"), word("võti"), word("raamat"),
];

describe("buildCheckpoint", () => {
  it("asks only for production, never for a choice", () => {
    // Four options hand a quarter of the marks to somebody who knows nothing,
    // which is exactly the thing a level exam must not do.
    for (const q of buildCheckpoint(WORDS, 10, 1)) {
      expect(["type", "gap"]).toContain(q.kind);
    }
  });

  it("never repeats a word to reach the question count", () => {
    const questions = buildCheckpoint(WORDS, 10, 4);
    expect(new Set(questions.map((q) => q.lemma)).size).toBe(questions.length);
  });

  it("returns fewer questions rather than padding a thin level", () => {
    const questions = buildCheckpoint(WORDS.slice(0, 5), 20, 2);
    expect(questions.length).toBe(5);
  });

  it("builds gap questions only from attested sentences", () => {
    const gaps = buildCheckpoint(WORDS, 12, 6).filter((q) => q.kind === "gap");
    for (const gap of gaps) {
      const source = WORDS.find((w) => w.lemma === gap.lemma)!;
      expect(source.examples).toContain(gap.full);
      expect(gap.full).toContain(gap.answer);
      expect(gap.sentence).not.toEqual(gap.full);
    }
  });

  it("falls back to production for a word with no sentence", () => {
    const bare = buildCheckpoint(WORDS.filter((w) => w.examples.length === 0), 8, 3);
    expect(bare.every((q) => q.kind === "type")).toBe(true);
    for (const q of bare) expect(q.answer).toBe(q.lemma);
  });

  it("is deterministic for a seed", () => {
    expect(JSON.stringify(buildCheckpoint(WORDS, 8, 5)))
      .toBe(JSON.stringify(buildCheckpoint(WORDS, 8, 5)));
    expect(JSON.stringify(buildCheckpoint(WORDS, 8, 5)))
      .not.toBe(JSON.stringify(buildCheckpoint(WORDS, 8, 6)));
  });

  it("has nothing to ask about an empty level", () => {
    expect(buildCheckpoint([], 20, 1)).toEqual([]);
  });
});

describe("checkpointPassed", () => {
  it("passes at the mark, not above it", () => {
    expect(checkpointPassed(16, 20, 80)).toBe(true);
    expect(checkpointPassed(15, 20, 80)).toBe(false);
  });

  it("refuses to pass an exam that asked nothing", () => {
    expect(checkpointPassed(0, 0, 80)).toBe(false);
  });
});
