import { describe, expect, it } from "vitest";
import { diagnose, reviewsNeeded, type ReviewFact } from "./diagnosis";

function facts(
  n: number,
  over: Partial<ReviewFact> & { okRate: number },
): ReviewFact[] {
  const { okRate, ...rest } = over;
  return Array.from({ length: n }, (_, i) => ({
    targetCase: "PARTITIVE",
    rating: i < Math.round(n * okRate) ? 4 : 1,
    gradation: "NONE",
    hasIrregularPlural: false,
    lemma: `w${i}`,
    ...rest,
  }));
}

describe("diagnose — the gradation finding", () => {
  it("separates a case that is fine from the stems that break it", () => {
    // 95% on stable stems, 30% on gradating ones: the ending is not the problem.
    const findings = diagnose([
      ...facts(20, { okRate: 0.95, gradation: "NONE" }),
      ...facts(20, { okRate: 0.3, gradation: "QUALITATIVE" }),
    ]);

    const gradation = findings.find((f) => f.headline.includes("until the stem changes"));
    expect(gradation).toBeDefined();
    expect(gradation!.strongPct).toBeGreaterThan(gradation!.weakPct);
    expect(gradation!.detail).toMatch(/astmevaheldus/);
    expect(gradation!.href).toBe("/review?case=PARTITIVE");
  });

  it("says nothing when both groups are equally good", () => {
    const findings = diagnose([
      ...facts(20, { okRate: 0.9, gradation: "NONE" }),
      ...facts(20, { okRate: 0.9, gradation: "QUALITATIVE" }),
    ]);
    expect(findings.find((f) => f.headline.includes("until the stem changes"))).toBeUndefined();
  });

  it("says nothing when one side has too few reviews to mean anything", () => {
    // Three failures on gradating stems is not a pattern, it is three failures.
    const findings = diagnose([
      ...facts(20, { okRate: 0.95, gradation: "NONE" }),
      ...facts(3, { okRate: 0, gradation: "QUALITATIVE" }),
    ]);
    expect(findings.find((f) => f.headline.includes("until the stem changes"))).toBeUndefined();
  });
});

describe("diagnose — the plural finding", () => {
  it("notices that the irregular plural stem is the problem", () => {
    const findings = diagnose([
      ...facts(20, { okRate: 0.95, hasIrregularPlural: false }),
      ...facts(20, { okRate: 0.35, hasIrregularPlural: true }),
    ]);
    const plural = findings.find((f) => f.headline.includes("plural stem"));
    expect(plural).toBeDefined();
    expect(plural!.caseKey).toBeNull();
  });
});

describe("diagnose — the plain weak-case finding", () => {
  it("names a case that is weak against every other", () => {
    const findings = diagnose([
      ...facts(20, { okRate: 0.95, targetCase: "INESSIVE" }),
      ...facts(20, { okRate: 0.95, targetCase: "ELATIVE" }),
      ...facts(20, { okRate: 0.25, targetCase: "COMITATIVE" }),
    ]);
    expect(findings.some((f) => f.headline.includes("comitative"))).toBe(true);
  });

  it("says nothing when every case is equally strong", () => {
    expect(diagnose([
      ...facts(20, { okRate: 0.9, targetCase: "INESSIVE" }),
      ...facts(20, { okRate: 0.9, targetCase: "ELATIVE" }),
    ])).toEqual([]);
  });
});

describe("diagnose — restraint", () => {
  it("returns nothing at all with no data", () => {
    expect(diagnose([])).toEqual([]);
  });

  it("returns nothing when there is too little data to be honest", () => {
    expect(diagnose(facts(4, { okRate: 0 }))).toEqual([]);
  });

  it("ignores reviews that carry no case", () => {
    // Recognition and production cards have no targetCase and say nothing here.
    expect(diagnose(facts(40, { okRate: 0.1, targetCase: null }))).toEqual([]);
  });

  it("caps how much it says at once", () => {
    const many: ReviewFact[] = [];
    for (const c of ["INESSIVE", "ELATIVE", "ALLATIVE", "ADESSIVE", "COMITATIVE", "TRANSLATIVE"]) {
      many.push(...facts(20, { okRate: 0.95, targetCase: c, gradation: "NONE" }));
      many.push(...facts(20, { okRate: 0.2, targetCase: c, gradation: "QUALITATIVE" }));
    }
    expect(diagnose(many).length).toBeLessThanOrEqual(4);
  });

  it("puts the biggest gap first", () => {
    const findings = diagnose([
      ...facts(20, { okRate: 1, targetCase: "INESSIVE", gradation: "NONE" }),
      ...facts(20, { okRate: 0.75, targetCase: "INESSIVE", gradation: "QUALITATIVE" }),
      ...facts(20, { okRate: 1, targetCase: "ELATIVE", gradation: "NONE" }),
      ...facts(20, { okRate: 0.1, targetCase: "ELATIVE", gradation: "QUALITATIVE" }),
    ]);
    const gaps = findings.map((f) => f.strongPct - f.weakPct);
    expect(gaps).toEqual([...gaps].sort((a, b) => b - a));
  });
});

describe("reviewsNeeded", () => {
  it("counts down to the point where a claim would be honest", () => {
    expect(reviewsNeeded([])).toBe(16);
    expect(reviewsNeeded(facts(10, { okRate: 0.5 }))).toBe(6);
  });

  it("reaches zero once there is enough", () => {
    expect(reviewsNeeded(facts(40, { okRate: 0.5 }))).toBe(0);
  });

  it("does not count reviews that carry no case", () => {
    expect(reviewsNeeded(facts(40, { okRate: 0.5, targetCase: null }))).toBe(16);
  });
});
