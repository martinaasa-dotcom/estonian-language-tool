import { describe, expect, it } from "vitest";
import type { Evidence, Readiness } from "@/lib/exam/readiness";
import { CLOSE_PCT, LIKELY_PCT } from "@/lib/exam/readiness";
import type { ExamLevel } from "@/lib/exam/spec";
import {
  MIN_EVIDENCE_TO_BAND, bandFor, cohortKind, summariseCohort, type CohortInput,
} from "./cohort";

/** A readiness object carrying one confidence at one level, which is all this reads. */
function readinessAt(level: ExamLevel, confidence: number, evidence: Evidence): Readiness {
  return {
    levels: [{
      level,
      confidence,
      expected: { reading: 0, writing: 0, listening: 0, speaking: 0 },
      expectedTotal: 0,
      evidence,
      measured: false,
      seen: { reading: false, writing: false, listening: false, speaking: false },
      verdict: "",
    }],
    assessed: null,
    next: null,
    evidence,
    strengths: [],
    gaps: [],
  };
}

function member(over: Partial<CohortInput> & { ownerId: string }): CohortInput {
  return {
    displayName: over.ownerId,
    readiness: null,
    reviewsThisWeek: 0,
    daysSinceLastReview: null,
    ...over,
  };
}

describe("cohortKind", () => {
  it("reads a workplace group back", () => {
    expect(cohortKind("WORKPLACE")).toBe("WORKPLACE");
  });

  it("treats every row written before the column existed as a class", () => {
    // The consent screen those members saw was the class one, so falling the
    // other way would silently move them into a group they never joined.
    expect(cohortKind(null)).toBe("CLASS");
    expect(cohortKind(undefined)).toBe("CLASS");
    expect(cohortKind("")).toBe("CLASS");
    expect(cohortKind("SOMETHING_ELSE")).toBe("CLASS");
  });
});

describe("bandFor", () => {
  it("bands on the same numbers the learner's own verdict is written in", () => {
    expect(bandFor(LIKELY_PCT, "good")).toBe("likely");
    expect(bandFor(LIKELY_PCT - 1, "good")).toBe("close");
    expect(bandFor(CLOSE_PCT, "good")).toBe("close");
    expect(bandFor(CLOSE_PCT - 1, "good")).toBe("far");
  });

  it("refuses to band anybody on thin evidence, however sure the model sounds", () => {
    // The whole point: a confident-looking number off nine reviews is exactly
    // the one that must not appear beside an employee's name.
    expect(bandFor(99, "thin")).toBe("unknown");
    expect(bandFor(2, "thin")).toBe("unknown");
  });

  it("starts banding at the declared floor", () => {
    expect(MIN_EVIDENCE_TO_BAND).toBe("fair");
    expect(bandFor(90, "fair")).toBe("likely");
  });
});

describe("summariseCohort", () => {
  const level: ExamLevel = "B1";

  it("counts the bands and says how many are active", () => {
    const summary = summariseCohort([
      member({ ownerId: "a", readiness: readinessAt(level, 90, "good"), daysSinceLastReview: 0, reviewsThisWeek: 40 }),
      member({ ownerId: "b", readiness: readinessAt(level, 60, "good"), daysSinceLastReview: 3, reviewsThisWeek: 12 }),
      member({ ownerId: "c", readiness: readinessAt(level, 10, "good"), daysSinceLastReview: 30 }),
      member({ ownerId: "d", readiness: readinessAt(level, 80, "thin"), daysSinceLastReview: 1, reviewsThisWeek: 4 }),
    ], level);

    expect(summary.counts).toEqual({ likely: 1, close: 1, far: 1, unknown: 1 });
    expect(summary.active).toBe(3);
    expect(summary.level).toBe(level);
  });

  it("gives a member with no history at all no band rather than a bad one", () => {
    const summary = summariseCohort([member({ ownerId: "a" })], level);
    expect(summary.members[0]!.band).toBe("unknown");
  });

  it("gives no band for a level the readiness does not cover", () => {
    const summary = summariseCohort(
      [member({ ownerId: "a", readiness: readinessAt("A2", 95, "good") })],
      "C1",
    );
    expect(summary.members[0]!.band).toBe("unknown");
  });

  it("carries no confidence figure and no weakest case", () => {
    /*
      The boundary, asserted on the shape rather than on a screen. A percentage
      that never reaches this type cannot be printed by a view somebody writes
      next year, and neither can a case somebody keeps missing.
    */
    const summary = summariseCohort(
      [member({ ownerId: "a", readiness: readinessAt(level, 73, "good") })],
      level,
    );
    const keys = Object.keys(summary.members[0]!);
    expect(keys).not.toContain("confidence");
    expect(keys).not.toContain("weakestCase");
    expect(keys).not.toContain("weeklyXp");
  });

  it("takes the group's evidence from its weakest member", () => {
    // One long-standing member may not vouch for a cohort who joined last week.
    const summary = summariseCohort([
      member({ ownerId: "a", readiness: readinessAt(level, 90, "good") }),
      member({ ownerId: "b", readiness: readinessAt(level, 50, "thin") }),
    ], level);
    expect(summary.evidence).toBe("thin");
  });

  it("says thin for an empty group rather than good", () => {
    expect(summariseCohort([], level).evidence).toBe("thin");
  });

  it("orders by name, never by how far behind somebody is", () => {
    const summary = summariseCohort([
      member({ ownerId: "3", displayName: "Kadri", readiness: readinessAt(level, 5, "good") }),
      member({ ownerId: "1", displayName: "Anu", readiness: readinessAt(level, 95, "good") }),
      member({ ownerId: "2", displayName: "Jaan", readiness: readinessAt(level, 60, "good") }),
    ], level);
    expect(summary.members.map((m) => m.displayName)).toEqual(["Anu", "Jaan", "Kadri"]);
  });

  it("orders two members sharing a name by something total", () => {
    // localeCompare returns 0 for one name against itself, and a sort that
    // returns 0 keeps whatever order the query happened to hand over.
    const summary = summariseCohort([
      member({ ownerId: "b", displayName: "Kadri" }),
      member({ ownerId: "a", displayName: "Kadri" }),
    ], level);
    expect(summary.members.map((m) => m.ownerId)).toEqual(["a", "b"]);
  });
});
