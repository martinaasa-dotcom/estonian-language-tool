import { describe, expect, it } from "vitest";
import { dayHash, dayHashFor, dayIndex, dayOrdinal } from "./dayHash";

/**
 * The two properties, and the second is the one that had failed.
 *
 * Measured over a year rather than asserted on three days, because "the days
 * either side land somewhere else" is a statement about a distribution and a
 * hash can pass three examples and still walk a pool one row at a time. That
 * is exactly what `h * 31 + charCode` did, and it is why this file exists.
 */

function year(): string[] {
  const days: string[] = [];
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= 28; d++) {
      days.push(`2026-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
  }
  return days;
}

describe("dayHash", () => {
  it("gives the same day the same number", () => {
    expect(dayHash("2026-09-02")).toBe(dayHash("2026-09-02"));
  });

  it("is a non-negative integer, so a modulo of it is an index", () => {
    for (const day of year()) {
      const h = dayHash(day);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
    }
  });

  /**
   * The fault this replaces, stated as a measurement.
   *
   * With the old hash, consecutive days landed on consecutive rows of the
   * pool: a step of exactly 1, every day, all year. Sõnad's B1 pool gave a
   * week of words beginning with L. A step of one, twice in a year, is
   * coincidence; a step of one every day is the bug.
   */
  it("does not walk a pool one row at a time", () => {
    const POOL = 477; // Sõnad's measured B1 answer pool.
    const days = year();
    let adjacent = 0;
    for (let i = 1; i < days.length; i++) {
      const step = Math.abs((dayHash(days[i]!) % POOL) - (dayHash(days[i - 1]!) % POOL));
      if (step <= 2) adjacent += 1;
    }
    // Five in a row out of 335 would be chance at this pool size; a walk is 335.
    expect(adjacent).toBeLessThan(12);
  });

  it("spreads a year over a pool rather than clumping", () => {
    const POOL = 200;
    const seen = new Set(year().map((d) => dayHash(d) % POOL));
    // 336 draws from 200 slots covers about 82% of them if they are uniform.
    expect(seen.size).toBeGreaterThan(150);
  });
});

describe("dayHashFor", () => {
  it("gives one day two different answers for two salts", () => {
    expect(dayHashFor("2026-09-02", "sonad")).not.toBe(dayHashFor("2026-09-02", "wordOfDay"));
  });

  it("is stable for one day and one salt", () => {
    expect(dayHashFor("2026-09-02", "sonad")).toBe(dayHashFor("2026-09-02", "sonad"));
  });

  it("does not walk either, which is the point of salting rather than adding", () => {
    const POOL = 300;
    const days = year();
    let adjacent = 0;
    for (let i = 1; i < days.length; i++) {
      const step = Math.abs(
        (dayHashFor(days[i]!, "x") % POOL) - (dayHashFor(days[i - 1]!, "x") % POOL),
      );
      if (step <= 2) adjacent += 1;
    }
    expect(adjacent).toBeLessThan(12);
  });
});

describe("dayIndex", () => {
  it("uses every element before it uses any twice", () => {
    const POOL = 47;
    const seen: number[] = [];
    for (let i = 0; i < POOL; i++) {
      seen.push(dayIndex(dayFrom(2026, 0, 1 + i), "sonad", POOL));
    }
    expect(new Set(seen).size).toBe(POOL);
  });

  /**
   * The measurement that produced this function. A hash modulo a pool is an
   * independent draw, so it repeats at the birthday rate: `rekord` twice in
   * twelve days on Sõnad's B1 pool, which on a daily puzzle reads as broken.
   */
  it("never repeats inside a pool's worth of days, where a hash does", () => {
    const POOL = 477;
    const days = Array.from({ length: 60 }, (_, i) => dayFrom(2026, 0, 1 + i));
    const walked = days.map((d) => dayIndex(d, "sonad", POOL));
    expect(new Set(walked).size).toBe(days.length);

    const drawn = days.map((d) => dayHashFor(d, "sonad") % POOL);
    expect(new Set(drawn).size).toBeLessThan(days.length);
  });

  it("keeps consecutive days far apart", () => {
    const POOL = 477;
    const days = Array.from({ length: 120 }, (_, i) => dayFrom(2026, 0, 1 + i));
    let close = 0;
    for (let i = 1; i < days.length; i++) {
      const step = Math.abs(dayIndex(days[i]!, "s", POOL) - dayIndex(days[i - 1]!, "s", POOL));
      if (step <= 2) close += 1;
    }
    expect(close).toBeLessThan(6);
  });

  it("gives two callers two different elements on one day", () => {
    expect(dayIndex("2026-09-02", "sonad", 400)).not.toBe(dayIndex("2026-09-02", "crossword", 400));
  });

  it("is safe on an empty pool", () => {
    expect(dayIndex("2026-09-02", "sonad", 0)).toBe(0);
  });
});

describe("dayOrdinal", () => {
  it("goes up by one a day", () => {
    expect(dayOrdinal("2026-09-03") - dayOrdinal("2026-09-02")).toBe(1);
    expect(dayOrdinal("2026-10-01") - dayOrdinal("2026-09-30")).toBe(1);
    expect(dayOrdinal("2027-01-01") - dayOrdinal("2026-12-31")).toBe(1);
  });

  it("survives a key it cannot read rather than throwing", () => {
    expect(dayOrdinal("not-a-day")).toBe(0);
  });
});

/** A `YYYY-MM-DD` key that is really `day` days into the month, carrying over. */
function dayFrom(year: number, monthIndex: number, day: number): string {
  const at = new Date(Date.UTC(year, monthIndex, day));
  return at.toISOString().slice(0, 10);
}
