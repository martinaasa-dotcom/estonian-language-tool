import { describe, expect, it } from "vitest";
import { measuredPace, SESSION_GAP_MS, studyHours } from "./pace";
import { dayClock } from "@/lib/time/day";

const MIN = 60_000;
const DAY = 86_400_000;
const t0 = new Date("2026-03-01T18:00:00Z");
const at = (offsetMs: number, durationMs = 20_000) => ({ reviewedAt: new Date(t0.getTime() + offsetMs), durationMs });

describe("time in a sitting", () => {
  it("is nothing for no reviews and one card's own time for one", () => {
    expect(studyHours([])).toBe(0);
    expect(studyHours([at(0, 30_000)])).toBeCloseTo(30_000 / 3_600_000, 10);
  });

  /*
    The timestamp is when the grade landed, so the first card's minute sits
    before the first timestamp. The span from first to last plus that one
    card is the sitting; summing durations alone would call a run of cards
    with a correction read between them a fraction of what it took.
  */
  it("spans a run from its first card to its last, plus the first card's own time", () => {
    const hours = studyHours([at(0, 20_000), at(1 * MIN, 5_000), at(2 * MIN, 5_000)]);
    expect(hours).toBeCloseTo((2 * MIN + 20_000) / 3_600_000, 10);
  });

  it("starts a new sitting after the gap and never counts the gap", () => {
    const rows = [at(0), at(MIN), at(3 * 60 * MIN), at(3 * 60 * MIN + 2 * MIN)];
    expect(studyHours(rows)).toBeCloseTo((MIN + 20_000 + 2 * MIN + 20_000) / 3_600_000, 10);
    // Just inside the gap is still the same sitting.
    expect(studyHours([at(0), at(SESSION_GAP_MS - 1)])).toBeCloseTo((SESSION_GAP_MS - 1 + 20_000) / 3_600_000, 10);
  });

  it("does not care what order the rows arrive in", () => {
    const rows = [at(2 * MIN), at(0), at(MIN)];
    expect(studyHours(rows)).toBe(studyHours([...rows].reverse()));
  });

  it("caps one card at ten minutes, since a tab left open is not study", () => {
    expect(studyHours([at(0, 5 * 60 * 60 * 1000)])).toBeCloseTo(600_000 / 3_600_000, 10);
    expect(studyHours([at(0, -50)])).toBe(0);
  });
});

describe("the pace over the window", () => {
  const clock = dayClock("UTC");
  const now = new Date("2026-04-01T20:00:00Z");

  it("is nothing to say before the first review", () => {
    expect(measuredPace([], { now, firstReviewAt: null, clock })).toBeNull();
  });

  it("measures a new learner over the weeks they have actually had", () => {
    const first = new Date(now.getTime() - 21 * DAY);
    const rows = [0, 7, 14].map((d) => ({ reviewedAt: new Date(first.getTime() + d * DAY), durationMs: 6 * MIN }));
    const pace = measuredPace(rows, { now, firstReviewAt: first, clock });
    expect(pace?.weeks).toBeCloseTo(3, 10);
    expect(pace?.hoursPerWeek).toBeCloseTo(0.3 / 3, 10);
    expect(pace?.daysPerWeek).toBeCloseTo(1, 10);
  });

  it("reads an old hand over four weeks and ignores everything before them", () => {
    const first = new Date(now.getTime() - 400 * DAY);
    const rows = [
      { reviewedAt: new Date(now.getTime() - 100 * DAY), durationMs: 6 * MIN },
      { reviewedAt: new Date(now.getTime() - 10 * DAY), durationMs: 6 * MIN },
      { reviewedAt: new Date(now.getTime() - 3 * DAY), durationMs: 6 * MIN },
    ];
    const pace = measuredPace(rows, { now, firstReviewAt: first, clock });
    expect(pace?.weeks).toBeCloseTo(4, 10);
    expect(pace?.hoursPerWeek).toBeCloseTo(0.2 / 4, 10);
    expect(pace?.daysPerWeek).toBeCloseTo(2 / 4, 10);
  });

  it("reports a window that held nothing as a pace of nothing over real weeks", () => {
    const first = new Date(now.getTime() - 60 * DAY);
    const pace = measuredPace([], { now, firstReviewAt: first, clock });
    expect(pace).toEqual({ hoursPerWeek: 0, daysPerWeek: 0, weeks: 4 });
  });

  it("counts days on the learner's own calendar", () => {
    const first = new Date(now.getTime() - 28 * DAY);
    // 23:30 and 00:30 UTC are two days on a UTC clock and one evening in Tallinn.
    const rows = [
      { reviewedAt: new Date("2026-03-30T23:30:00Z"), durationMs: MIN },
      { reviewedAt: new Date("2026-03-31T00:30:00Z"), durationMs: MIN },
    ];
    const tallinn = measuredPace(rows, { now, firstReviewAt: first, clock: dayClock("Europe/Tallinn") });
    const utc = measuredPace(rows, { now, firstReviewAt: first, clock });
    expect(tallinn!.daysPerWeek * 4).toBeCloseTo(1, 10);
    expect(utc!.daysPerWeek * 4).toBeCloseTo(2, 10);
  });
});
