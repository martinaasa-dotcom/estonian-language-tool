import { describe, expect, it } from "vitest";
import { DEADLINES, REASONS, TARGETS, deadlineFrom, normaliseGoals, reasonById, targetByBand, weeksUntil } from "./goals";
import { BANDS } from "./types";

describe("the goal options", () => {
  it("gives every reason a level it usually needs", () => {
    for (const reason of REASONS) {
      expect(BANDS).toContain(reason.implies);
      expect(reason.detail.length).toBeGreaterThan(20);
    }
  });

  it("describes every level by what it does not get you as well as what it does", () => {
    expect(TARGETS.map((t) => t.band)).toEqual(["A1", "A2", "B1", "B2", "C1"]);
    for (const target of TARGETS) {
      expect(target.can.length).toBeGreaterThan(30);
      expect(target.cannot.length).toBeGreaterThan(20);
    }
  });

  it("looks a reason and a level up by id", () => {
    expect(reasonById("citizenship")?.implies).toBe("B1");
    expect(reasonById("nonsense")).toBeUndefined();
    expect(targetByBand("B2")?.label).toBe("Work in it");
  });
});

describe("deadlines", () => {
  const now = new Date("2026-01-15T10:00:00Z");

  it("turns a preset into a real date", () => {
    const sixMonths = DEADLINES.find((d) => d.id === "6m")!;
    expect(deadlineFrom(sixMonths, now)?.slice(0, 7)).toBe("2026-07");
    const none = DEADLINES.find((d) => d.id === "none")!;
    expect(deadlineFrom(none, now)).toBeNull();
  });

  it("counts whole weeks, and never counts backwards", () => {
    expect(weeksUntil("2026-04-16T10:00:00Z", now)).toBe(13);
    expect(weeksUntil("2025-01-01T10:00:00Z", now)).toBe(0);
    expect(weeksUntil(null, now)).toBeNull();
    expect(weeksUntil("not a date", now)).toBeNull();
  });
});

describe("normalising what came back from the form", () => {
  it("drops anything it does not recognise rather than storing it", () => {
    const goals = normaliseGoals({ reason: "made up", target: "Z9" as never, deadline: "nope", daysPerWeek: 99, note: " hi " });
    expect(goals.reason).toBeNull();
    expect(goals.target).toBeNull();
    expect(goals.deadline).toBeNull();
    expect(goals.daysPerWeek).toBe(7);
    expect(goals.note).toBe("hi");
  });

  it("keeps what it does recognise", () => {
    const goals = normaliseGoals({ reason: "work", target: "B2", deadline: "2027-01-01T00:00:00.000Z", daysPerWeek: 4, note: "x" });
    expect(goals).toEqual({
      reason: "work", target: "B2", deadline: "2027-01-01T00:00:00.000Z", daysPerWeek: 4, note: "x",
    });
  });

  it("caps a note rather than letting a setting row grow without limit", () => {
    expect(normaliseGoals({ note: "a".repeat(500) }).note).toHaveLength(280);
  });
});
