import { describe, expect, it } from "vitest";

import {
  MAX_LEARNER_SHARE,
  MIN_LEARNERS,
  MIN_REVIEWS,
  NO_LEARNERS,
  bandLearners,
  buildSection,
  gate,
  roundCount,
  type Contribution,
  type SectionSpec,
} from "./corpus";

/*
  The gate is the only thing standing between a table of averages and a table
  of one person's evening, so these are written to fail rather than to pass:
  each rule is given input that trips it and input a hair on the safe side, and
  the last test asks the whole thing at once over a few thousand random shapes.
  A privacy check nobody has watched fail is a privacy check nobody knows the
  state of.
*/

function contributors(
  n: number,
  each: number,
  ok: number,
  keys: string[] = ["PARTITIVE"],
): Contribution[] {
  return Array.from({ length: n }, (_, i) => ({
    keys,
    learner: `p${i}`,
    reviews: each,
    correct: ok,
    matureReviews: each,
    matureCorrect: ok,
  }));
}

const tallies = (rows: Contribution[]) =>
  rows.map((r) => ({ learner: r.learner, n: r.reviews, ok: r.correct }));

const SPEC: SectionSpec = {
  id: "case",
  title: "t",
  dimensions: ["case"],
  note: "n",
  groupBy: 0,
};

const CROSSTAB: SectionSpec = {
  id: "case_by_level",
  title: "t",
  dimensions: ["case", "cefr"],
  note: "n",
  groupBy: 1,
};

describe("the threshold rule", () => {
  it("withholds a cell too few people contributed to, however many answers", () => {
    // Nine people and nine hundred answers is still nine people.
    expect(gate(tallies(contributors(MIN_LEARNERS - 1, 100, 60)))).toBe("learners");
  });

  it("withholds a cell too thin to mean anything, however many people", () => {
    // Forty people, one answer each: nobody is exposed and the number is noise.
    expect(gate(tallies(contributors(40, 1, 1)))).toBe("reviews");
  });

  it("publishes at exactly the two thresholds", () => {
    const each = Math.ceil(MIN_REVIEWS / MIN_LEARNERS);
    const summary = gate(tallies(contributors(MIN_LEARNERS, each, each)));
    expect(typeof summary).not.toBe("string");
  });

  it("does not count somebody who contributed nothing as a head", () => {
    const rows = tallies(contributors(MIN_LEARNERS - 1, 10, 6));
    rows.push({ learner: "ghost", n: 0, ok: 0 });
    expect(gate(rows)).toBe("learners");
  });
});

describe("the dominance rule", () => {
  it("withholds a cell one person is most of", () => {
    const rows = tallies(contributors(MIN_LEARNERS + 5, 4, 2));
    rows.push({ learner: "heavy", n: 500, ok: 500 });
    expect(gate(rows)).toBe("dominance");
  });

  it("is the rule a head count alone would miss", () => {
    // Same shape as above: it clears both thresholds and is still one person.
    const rows = tallies(contributors(MIN_LEARNERS + 5, 4, 2));
    rows.push({ learner: "heavy", n: 500, ok: 500 });
    const learners = rows.filter((r) => r.n > 0).length;
    const reviews = rows.reduce((sum, r) => sum + r.n, 0);
    expect(learners).toBeGreaterThanOrEqual(MIN_LEARNERS);
    expect(reviews).toBeGreaterThanOrEqual(MIN_REVIEWS);
  });

  it("lets an evenly spread cell through", () => {
    expect(typeof gate(tallies(contributors(20, 10, 7)))).not.toBe("string");
  });
});

describe("what a published figure looks like", () => {
  it("rounds answers and bands people", () => {
    const summary = gate(tallies(contributors(23, 11, 8)));
    if (typeof summary === "string") throw new Error(summary);
    expect(summary.reviews).toBe(roundCount(23 * 11));
    expect(summary.reviews % 10).toBe(0);
    expect(summary.learners).toBe("20-49");
    expect(summary.accuracyPct).toBe(Math.round((8 / 11) * 100));
  });

  it("never reports a bare head count", () => {
    expect(bandLearners(0)).toBe(NO_LEARNERS);
    expect(bandLearners(3)).toMatch(/fewer than/);
    expect(bandLearners(10)).toBe("10-19");
    expect(bandLearners(9999)).toBe("1000+");
  });
});

describe("the mature column is gated on its own", () => {
  it("publishes a cell and withholds its mature half when that half is one person", () => {
    const rows = contributors(20, 10, 7).map((r, i) => ({
      ...r,
      // Only one person has ever seen these cards as mature.
      matureReviews: i === 0 ? 80 : 0,
      matureCorrect: i === 0 ? 40 : 0,
    }));
    const [cell] = buildSection(SPEC, rows).cells;
    expect(cell).toBeDefined();
    expect(cell!.all.reviews).toBeGreaterThan(0);
    expect(cell!.mature).toBeNull();
  });

  it("publishes both when the mature half stands up on its own", () => {
    const [cell] = buildSection(SPEC, contributors(20, 10, 7)).cells;
    expect(cell!.mature).not.toBeNull();
    expect(cell!.mature!.accuracyPct).toBe(70);
  });
});

describe("complementary suppression", () => {
  const group = (level: string, people: number, each: number) =>
    contributors(people, each, each, ["PARTITIVE", level]);

  it("hides a second cell when a group hid exactly one", () => {
    const section = buildSection(CROSSTAB, [
      ...group("A1", 40, 20),
      ...group("A2", 30, 20),
      ...group("B1", 12, 10), // the smallest survivor
      ...group("B2", 2, 40), // withheld: too few people
    ]);
    expect(section.cells.map((c) => c.keys[1])).toEqual(["A1", "A2"]);
    expect(section.suppressed).toBe(2);
  });

  it("leaves a group alone when it hid nothing", () => {
    const section = buildSection(CROSSTAB, [
      ...group("A1", 40, 20),
      ...group("A2", 30, 20),
      ...group("B1", 12, 10),
    ]);
    expect(section.cells).toHaveLength(3);
    expect(section.suppressed).toBe(0);
  });

  it("leaves a group alone when it already hid two, since nothing is recoverable", () => {
    const section = buildSection(CROSSTAB, [
      ...group("A1", 40, 20),
      ...group("A2", 30, 20),
      ...group("B1", 2, 40),
      ...group("B2", 2, 40),
    ]);
    expect(section.cells).toHaveLength(2);
    expect(section.suppressed).toBe(2);
  });

  it("groups a crosstab by its first dimension, not across the whole table", () => {
    /*
      The partitive row hides one and must lose a second. The genitive row is
      whole and must keep all of its cells: a gap in one row says nothing about
      another row's total.
    */
    const gen = (level: string, people: number, each: number) =>
      contributors(people, each, each, ["GENITIVE", level]);
    const section = buildSection(CROSSTAB, [
      ...group("A1", 40, 20),
      ...group("A2", 12, 10),
      ...group("B1", 2, 40),
      ...gen("A1", 40, 20),
      ...gen("A2", 30, 20),
    ]);
    const kept = section.cells.map((c) => c.keys.join("/"));
    expect(kept).toContain("GENITIVE/A1");
    expect(kept).toContain("GENITIVE/A2");
    expect(kept).toContain("PARTITIVE/A1");
    expect(kept).not.toContain("PARTITIVE/A2");
  });

  it("picks its second victim by the unrounded count, so two runs agree", () => {
    // 12 people * 10 and 12 people * 11 both round to different tens, and the
    // smaller must go whichever order the rows arrive in.
    const rows = [
      ...group("A1", 40, 20),
      ...group("A2", 12, 11),
      ...group("B1", 12, 10),
      ...group("B2", 2, 40),
    ];
    const forwards = buildSection(CROSSTAB, rows).cells.map((c) => c.keys[1]);
    const backwards = buildSection(CROSSTAB, [...rows].reverse()).cells.map((c) => c.keys[1]);
    expect(forwards).toEqual(backwards);
    expect(forwards).not.toContain("B1");
    expect(forwards).toContain("A2");
  });
});

describe("the shape of a section", () => {
  it("reads worst first, and orders totally", () => {
    const section = buildSection(SPEC, [
      ...contributors(20, 10, 9, ["GENITIVE"]),
      ...contributors(20, 10, 3, ["PARTITIVE"]),
      ...contributors(20, 10, 6, ["ILLATIVE"]),
    ]);
    expect(section.cells.map((c) => c.keys[0])).toEqual(["PARTITIVE", "ILLATIVE", "GENITIVE"]);
  });

  it("counts what it withheld, so a reader knows the table is partial", () => {
    const section = buildSection(SPEC, [
      ...contributors(20, 10, 9, ["GENITIVE"]),
      ...contributors(3, 10, 3, ["ABESSIVE"]),
      ...contributors(2, 10, 3, ["ESSIVE"]),
    ]);
    expect(section.cells).toHaveLength(1);
    expect(section.suppressed).toBe(2);
  });
});

describe("no published cell can breach the rules, over every shape", () => {
  /*
    The tests above each aim at one rule. This one takes the whole gate at once
    and throws several thousand randomly shaped cells at it, then checks the
    only three claims the file makes about itself. A deterministic generator,
    because a unit test that fails one run in fifty is a test people learn to
    re-run rather than read.
  */
  function lcg(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  it("holds the three rules on every cell it publishes", () => {
    const rand = lcg(20260902);
    let published = 0;

    for (let round = 0; round < 3000; round++) {
      const people = Math.floor(rand() * 30);
      const rows: Contribution[] = [];
      let biggest = 0;
      let total = 0;
      for (let i = 0; i < people; i++) {
        // A heavy tail on purpose: the dominance rule only bites when somebody
        // answered far more than the rest, which a uniform draw rarely makes.
        const n = Math.floor(rand() * (rand() < 0.15 ? 400 : 20));
        rows.push({
          keys: ["X"],
          learner: `p${i}`,
          reviews: n,
          correct: Math.floor(rand() * (n + 1)),
          matureReviews: 0,
          matureCorrect: 0,
        });
        if (n > biggest) biggest = n;
        total += n;
      }

      const heads = rows.filter((r) => r.reviews > 0).length;
      const summary = gate(tallies(rows));
      if (typeof summary === "string") continue;

      published++;
      expect(heads).toBeGreaterThanOrEqual(MIN_LEARNERS);
      expect(total).toBeGreaterThanOrEqual(MIN_REVIEWS);
      expect(biggest / total).toBeLessThanOrEqual(MAX_LEARNER_SHARE);
      expect(summary.reviews % 10).toBe(0);
      expect(summary.learners).toMatch(/^\d+[-+]/);
    }

    // If nothing got through, the assertions above proved nothing.
    expect(published).toBeGreaterThan(100);
  });
});
