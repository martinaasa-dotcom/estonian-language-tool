import { describe, expect, it } from "vitest";
import { DEADLINES, REASONS, TARGETS, countdownPhrase, daysUntil, deadlineFrom, normaliseGoals, reasonById, targetByBand, weeksUntil } from "./goals";
import { BANDS } from "./types";
import { dayClock } from "@/lib/time/day";

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

  /*
    `setMonth` overflows: 31 August plus six months was 3 March, which is the
    month after the one the preset names. The day is pinned to the end of the
    shorter month instead.
  */
  it("does not overflow past the month a preset names", () => {
    const sixMonths = DEADLINES.find((d) => d.id === "6m")!;
    const endOfAugust = new Date("2026-08-31T12:00:00Z");
    expect(deadlineFrom(sixMonths, endOfAugust)?.slice(0, 10)).toBe("2027-02-28");
    const threeMonths = DEADLINES.find((d) => d.id === "3m")!;
    expect(deadlineFrom(threeMonths, new Date("2026-01-31T12:00:00Z"))?.slice(0, 10)).toBe("2026-04-30");
  });

  it("keeps the same day of the month where that day exists", () => {
    const year = DEADLINES.find((d) => d.id === "1y")!;
    expect(deadlineFrom(year, new Date("2026-05-15T12:00:00Z"))?.slice(0, 10)).toBe("2027-05-15");
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

describe("daysUntil", () => {
  // Tallinn, because the whole reason this takes a clock and `weeksUntil` does
  // not is that a day's granularity can be moved by a midnight and a week's
  // cannot. In August that zone is UTC+3.
  const clock = dayClock("Europe/Tallinn");
  const now = new Date("2026-08-31T06:00:00Z");

  it("counts whole days on the learner's own calendar", () => {
    expect(daysUntil("2026-10-17T09:00:00.000Z", now, clock)).toBe(47);
    expect(daysUntil("2026-09-01T09:00:00.000Z", now, clock)).toBe(1);
    // 20:00 UTC is 23:00 the same evening in Tallinn, so it is still today.
    expect(daysUntil("2026-08-31T20:00:00.000Z", now, clock)).toBe(0);
  });

  it("reads a deadline against that clock rather than the process's", () => {
    /*
      22:00 UTC is one in the morning of the next day in Tallinn, so the same
      instant is one day out for the learner and two for a server in UTC. A
      countdown that says 47 in Tartu and 48 in Lisbon for one deadline is the
      fault `lib/time/day.ts` exists to prevent.
    */
    const late = "2026-09-01T22:00:00.000Z";
    expect(daysUntil(late, now, clock)).toBe(2);
    expect(daysUntil(late, now, dayClock("UTC"))).toBe(1);
  });

  it("goes negative once the date has gone, where weeksUntil clamps", () => {
    expect(daysUntil("2026-08-20T09:00:00.000Z", now, clock)).toBe(-11);
    expect(weeksUntil("2026-08-20T09:00:00.000Z", now)).toBe(0);
  });

  it("says nothing about a deadline that is not one", () => {
    expect(daysUntil(null, now, clock)).toBeNull();
    expect(daysUntil("", now, clock)).toBeNull();
    expect(daysUntil("not a date", now, clock)).toBeNull();
  });
});

describe("countdownPhrase", () => {
  it("counts in days while a day still means something", () => {
    expect(countdownPhrase(0)).toBe("today");
    expect(countdownPhrase(1)).toBe("tomorrow");
    expect(countdownPhrase(2)).toBe("2 days");
    expect(countdownPhrase(47)).toBe("47 days");
    expect(countdownPhrase(60)).toBe("60 days");
  });

  it("changes unit rather than printing a number nobody can hold", () => {
    expect(countdownPhrase(61)).toBe("9 weeks");
    expect(countdownPhrase(182)).toBe("26 weeks");
    expect(countdownPhrase(200)).toBe("7 months");
    expect(countdownPhrase(365)).toBe("1 year");
    expect(countdownPhrase(730)).toBe("2 years");
  });

  it("has something to say about a date that has gone", () => {
    expect(countdownPhrase(-1)).toBe("that date has gone");
    expect(countdownPhrase(-400)).toBe("that date has gone");
  });
});
