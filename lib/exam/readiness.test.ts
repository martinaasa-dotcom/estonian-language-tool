import { describe, expect, it } from "vitest";
import {
  CEILING, EVIDENCE_FAIR, assessReadiness, evidenceFrom, passChance, readinessFor,
  type ReadinessSignals,
} from "./readiness";
import { PASS_PCT } from "./spec";
import { SKILLS } from "./types";

function signals(over: Partial<ReadinessSignals> = {}): ReadinessSignals {
  return {
    vocabulary: {
      A1: { known: 0, available: 100 },
      A2: { known: 0, available: 100 },
      B1: { known: 0, available: 100 },
      B2: { known: 0, available: 100 },
      C1: { known: 0, available: 100 },
      C2: { known: 0, available: 100 },
    },
    accuracy: { pct: 0, reviews: 0 },
    cases: [],
    skills: {
      writing: { attempts: 0, pct: 0 },
      listening: { attempts: 0, pct: 0 },
      reading: { attempts: 0, pct: 0 },
      speaking: { attempts: 0, pct: 0 },
    },
    attempts: [],
    totalReviews: 0,
    ...over,
  };
}

/** Somebody with a real history: most of A1 and A2 known, good recall. */
function established(): ReadinessSignals {
  return signals({
    vocabulary: {
      A1: { known: 95, available: 100 },
      A2: { known: 88, available: 100 },
      B1: { known: 40, available: 100 },
      B2: { known: 5, available: 100 },
      C1: { known: 0, available: 100 },
      C2: { known: 0, available: 100 },
    },
    accuracy: { pct: 88, reviews: 1200 },
    skills: {
      writing: { attempts: 300, pct: 84 },
      listening: { attempts: 80, pct: 79 },
      reading: { attempts: 900, pct: 90 },
      speaking: { attempts: 40, pct: 75 },
    },
    totalReviews: 2400,
  });
}

describe("how sure the app is allowed to be", () => {
  it("calls a handful of reviews thin", () => {
    expect(evidenceFrom(signals({ totalReviews: 20 }))).toBe("thin");
  });

  it("will not call anything good until several skills have been practised", () => {
    const many = signals({ totalReviews: 5000 });
    expect(evidenceFrom(many)).toBe("thin");
  });

  it("caps confidence at the tier's ceiling, whatever the model says", () => {
    // Everything known, perfect recall, and almost no history to prove it.
    const beginner = signals({
      vocabulary: {
        A1: { known: 100, available: 100 }, A2: { known: 100, available: 100 },
        B1: { known: 100, available: 100 }, B2: { known: 100, available: 100 },
        C1: { known: 100, available: 100 }, C2: { known: 100, available: 100 },
      },
      accuracy: { pct: 100, reviews: 10 },
      totalReviews: 10,
    });
    const reading = readinessFor(beginner, "C1");
    expect(reading.evidence).toBe("thin");
    expect(reading.confidence).toBeLessThanOrEqual(CEILING.thin);
  });

  it("is never zero and never certain", () => {
    for (const level of ["A1", "C2"] as const) {
      const low = readinessFor(signals(), level);
      expect(low.confidence).toBeGreaterThanOrEqual(1);
      expect(low.confidence).toBeLessThanOrEqual(CEILING.good);
    }
  });
});

describe("the pass chance", () => {
  it("is a coin flip exactly on the pass mark", () => {
    expect(passChance(PASS_PCT, 12)).toBeCloseTo(0.5, 6);
  });

  it("rises with the predicted score", () => {
    expect(passChance(80, 12)).toBeGreaterThan(passChance(60, 12));
    expect(passChance(40, 12)).toBeLessThan(passChance(60, 12));
  });

  it("is pulled towards the middle when the spread is wide", () => {
    const narrow = passChance(80, 6);
    const wide = passChance(80, 24);
    expect(wide).toBeLessThan(narrow);
  });
});

describe("reading a real history", () => {
  const readiness = assessReadiness(established());

  it("is more confident about the lower papers than the higher ones", () => {
    const at = (level: string) => readiness.levels.find((l) => l.level === level)!.confidence;
    expect(at("A1")).toBeGreaterThanOrEqual(at("A2"));
    expect(at("A2")).toBeGreaterThan(at("B2"));
    expect(at("B2")).toBeGreaterThanOrEqual(at("C1"));
    expect(at("C1")).toBeGreaterThanOrEqual(at("C2"));
  });

  it("names a level it would bet on, and the next one to aim at", () => {
    expect(readiness.assessed).toBeTruthy();
    expect(readiness.next).toBeTruthy();
    expect(readiness.assessed).not.toEqual(readiness.next);
  });

  it("only bets on a level it puts at or above the pass mark", () => {
    const assessed = readiness.levels.find((l) => l.level === readiness.assessed)!;
    expect(assessed.confidence).toBeGreaterThanOrEqual(PASS_PCT);
  });

  it("predicts every part, so no quarter of the paper is unaccounted for", () => {
    for (const level of readiness.levels) {
      for (const skill of SKILLS) {
        expect(level.expected[skill]).toBeGreaterThanOrEqual(0);
        expect(level.expected[skill]).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("someone with no history at all", () => {
  const readiness = assessReadiness(signals());

  it("bets on nothing, rather than guessing a level", () => {
    expect(readiness.assessed).toBeNull();
  });

  it("says so in the advice rather than only in a number", () => {
    expect(readiness.gaps.some((g) => g.id === "evidence")).toBe(true);
  });

  it("still offers somewhere to go for every gap it raises", () => {
    for (const gap of readiness.gaps) {
      expect(gap.href).toBeTruthy();
      expect(gap.cta).toBeTruthy();
    }
  });
});

describe("a paper actually sat", () => {
  it("outweighs the model for that level", () => {
    const base = established();
    const without = readinessFor(base, "C1").confidence;
    const withPass = readinessFor(
      { ...base, attempts: [{ level: "C1", pct: 88, passed: true, at: "2026-08-01" }] },
      "C1",
    );
    expect(withPass.confidence).toBeGreaterThan(without);
    expect(withPass.measured).toBe(true);
    expect(withPass.verdict).toContain("88");
  });

  it("pulls a level down when it was failed", () => {
    const base = established();
    const without = readinessFor(base, "A2").confidence;
    const withFail = readinessFor(
      { ...base, attempts: [{ level: "A2", pct: 22, passed: false, at: "2026-08-01" }] },
      "A2",
    );
    expect(withFail.confidence).toBeLessThan(without);
  });

  it("says nothing about the levels it was not sat at", () => {
    const base = established();
    const before = readinessFor(base, "B1").confidence;
    const after = readinessFor(
      { ...base, attempts: [{ level: "C1", pct: 12, passed: false, at: "2026-08-01" }] },
      "B1",
    );
    expect(after.confidence).toBe(before);
  });
});

describe("the advice", () => {
  it("names a skill that has never been practised, because a zero fails the paper", () => {
    const readiness = assessReadiness(established());
    const missing = assessReadiness(signals({
      ...established(),
      skills: { ...established().skills, listening: { attempts: 0, pct: 0 } },
    }));
    expect(missing.gaps.some((g) => g.id === "unpractised-listening")).toBe(true);
    expect(readiness.gaps.some((g) => g.id === "unpractised-listening")).toBe(false);
  });

  it("names a weak case and links to the rule", () => {
    const readiness = assessReadiness(signals({
      ...established(),
      cases: [{ caseKey: "ELATIVE", caseEn: "Elative", pct: 42, reviews: 30 }],
    }));
    const gap = readiness.gaps.find((g) => g.id === "case-ELATIVE");
    expect(gap?.href).toBe("/grammar/elative");
    expect(gap?.title).toContain("42");
  });

  it("ignores a case with too few reviews to mean anything", () => {
    const readiness = assessReadiness(signals({
      ...established(),
      cases: [{ caseKey: "ESSIVE", caseEn: "Essive", pct: 0, reviews: 2 }],
    }));
    expect(readiness.gaps.some((g) => g.id === "case-ESSIVE")).toBe(false);
  });

  it("reports strengths as well, so nobody grinds what they already know", () => {
    const readiness = assessReadiness(established());
    expect(readiness.strengths.length).toBeGreaterThan(0);
  });

  it("stops warning about the evidence once there is some", () => {
    const readiness = assessReadiness(signals({ ...established(), totalReviews: EVIDENCE_FAIR }));
    expect(readiness.gaps.some((g) => g.id === "evidence")).toBe(false);
  });
});

describe("naming the worst part", () => {
  const weakAcross = assessReadiness(signals({
    ...established(),
    skills: {
      writing: { attempts: 100, pct: 40 },
      listening: { attempts: 100, pct: 20 },
      reading: { attempts: 100, pct: 55 },
      speaking: { attempts: 100, pct: 60 },
    },
  }));

  it("says one part is the worst, not four", () => {
    const claiming = weakAcross.gaps.filter((g) => /costing you the most marks/.test(g.detail));
    expect(claiming).toHaveLength(1);
  });

  it("picks the actually worst one", () => {
    const claiming = weakAcross.gaps.find((g) => /costing you the most marks/.test(g.detail));
    expect(claiming?.id).toBe("weak-listening");
  });

  it("does not claim a skill was never practised when it simply cannot tell", () => {
    const blind = assessReadiness(signals({
      ...established(),
      skills: { ...established().skills, speaking: { attempts: 0, pct: 0 } },
    }));
    const gap = blind.gaps.find((g) => g.id === "unpractised-speaking");
    expect(gap?.title).toMatch(/tells us about/i);
    expect(gap?.title).not.toMatch(/never practised/i);
  });
});
