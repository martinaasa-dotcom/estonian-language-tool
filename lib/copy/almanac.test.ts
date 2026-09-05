import { describe, expect, it } from "vitest";
import { allOccasions, easterSunday, occasionsFor } from "./almanac";
import { EM_DASH, EN_DASH, EMOJI, findTells } from "./voice";

/** Every day of a non-leap and a leap year, as day keys. */
function everyDay(year: number): string[] {
  const out: string[] = [];
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= 31; d++) {
      const date = new Date(Date.UTC(year, m - 1, d));
      if (date.getUTCMonth() !== m - 1) continue;
      out.push(`${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
  }
  return out;
}

describe("easterSunday", () => {
  it("agrees with the calendar", () => {
    // Checked against the published dates rather than against itself. Pancake
    // Day is 47 days before each of these, so an error here moves the one
    // occasion in the table that a learner would actually notice being wrong.
    expect(easterSunday(2024)).toEqual({ month: 3, day: 31 });
    expect(easterSunday(2025)).toEqual({ month: 4, day: 20 });
    expect(easterSunday(2026)).toEqual({ month: 4, day: 5 });
    expect(easterSunday(2027)).toEqual({ month: 3, day: 28 });
    expect(easterSunday(2030)).toEqual({ month: 4, day: 21 });
    expect(easterSunday(2000)).toEqual({ month: 4, day: 23 });
  });

  it("always lands on a Sunday, for a century of them", () => {
    for (let year = 2000; year < 2100; year++) {
      const { month, day } = easterSunday(year);
      expect(new Date(Date.UTC(year, month - 1, day)).getUTCDay()).toBe(0);
    }
  });
});

describe("occasionsFor", () => {
  it("always has something to say", () => {
    // The month is the floor, so a day that reaches nothing is a hole in the
    // table rather than a quiet day.
    for (const year of [2025, 2026, 2028]) {
      for (const day of everyDay(year)) {
        expect(occasionsFor(day).length, day).toBeGreaterThan(0);
      }
    }
  });

  it("ends on the month, whatever else it found", () => {
    for (const day of everyDay(2026)) {
      const last = occasionsFor(day).at(-1);
      expect(last?.key, day).toMatch(/^(january|february|march|april|may|june|july|august|september|october|november|december)$/);
    }
  });

  it("puts a named day ahead of the shape of its number", () => {
    // Christmas Eve is also the twenty-fourth, and a learner opening the app
    // on the twenty-fourth of December is not thinking about hours in a day.
    expect(occasionsFor("2026-12-24")[0]?.key).toBe("christmas-eve");
    expect(occasionsFor("2026-12-24").map((o) => o.key)).toContain("day-24");
  });

  it("finds Pancake Day where Easter puts it", () => {
    // Shrove Tuesday: 17 February in 2026, 9 February in 2027, 25 February in 2031.
    expect(occasionsFor("2026-02-17").map((o) => o.key)).toContain("shrove-tuesday");
    expect(occasionsFor("2027-02-09").map((o) => o.key)).toContain("shrove-tuesday");
    expect(occasionsFor("2031-02-25").map((o) => o.key)).toContain("shrove-tuesday");
    expect(occasionsFor("2026-02-18").map((o) => o.key)).not.toContain("shrove-tuesday");
  });

  it("finds the days pinned to a weekday of a month", () => {
    // The second Sunday in May 2026 is the tenth; in November 2026 the eighth.
    expect(occasionsFor("2026-05-10").map((o) => o.key)).toContain("mothers-day");
    expect(occasionsFor("2026-05-03").map((o) => o.key)).not.toContain("mothers-day");
    expect(occasionsFor("2026-11-08").map((o) => o.key)).toContain("fathers-day");
  });

  it("says the same thing every time it is asked", () => {
    expect(occasionsFor("2026-03-14")).toEqual(occasionsFor("2026-03-14"));
  });

  it("says nothing at all about a malformed day", () => {
    expect(occasionsFor("")).toEqual([]);
    expect(occasionsFor("not-a-day")).toEqual([]);
  });

  it("leaves the days of mourning alone", () => {
    /*
      The fourteenth of June and the twenty-fifth of March are the deportation
      memorials, and a cheerful note about the word for a puddle would be the
      app misreading the room. Both fall through to the month, which says
      nothing about the date.
    */
    for (const day of ["2026-06-14", "2026-03-25"]) {
      const keys = occasionsFor(day).map((o) => o.key);
      expect(keys.every((k) => /^(june|march|day-14|day-25|sunday|monday|wednesday|friday|saturday)$/.test(k)), day).toBe(true);
    }
  });
});

describe("the almanac's own copy", () => {
  it("writes no Estonian at all", () => {
    /*
      ADR-005, and the reason the table is English. A word typed in here would
      be this app inventing vocabulary, and it would go on the home page every
      day with a heading saying it was chosen for you. The Estonian comes out
      of the dictionary or it does not appear.
    */
    for (const occasion of allOccasions()) {
      const text = `${occasion.name} ${occasion.note} ${occasion.glosses.join(" ")}`;
      expect(/[õäöüšž]/i.test(text), occasion.key).toBe(false);
    }
  });

  it("reads like a person wrote it", () => {
    for (const occasion of allOccasions()) {
      expect(findTells(occasion.note).map((t) => t.name), occasion.key).toEqual([]);
      expect(occasion.note.includes(EM_DASH) || occasion.note.includes(EN_DASH), occasion.key).toBe(false);
      expect(EMOJI.test(occasion.note), occasion.key).toBe(false);
      // A note is a sentence, not a label. It sits under the word and is read.
      expect(occasion.note.endsWith("."), occasion.key).toBe(true);
    }
  });

  it("never says that an Estonian name means something", () => {
    /*
      The fault this check was written for shipped, and a learner reported it:
      the card printed the word for a sauna under "The Estonian name for
      Saturday means bath day". That is true of the Old Norse the name was
      borrowed from and false of the Estonian, where nothing in the day's name
      says it, and the person best placed to notice is exactly the person the
      card is for.

      "Means" is the whole of what went wrong, because it tells a learner the
      letters in front of them carry that sense. A note may say what a name is
      built out of, which they can check in the spelling, or where it was
      borrowed from, which is history. It may not hand them a meaning: this
      file holds no Estonian and reads no dictionary, so it has nothing to
      check one against.
    */
    const claimsAMeaning = /\bestonian\b[^.]*\bmeans?\b/i;
    for (const occasion of allOccasions()) {
      expect(claimsAMeaning.test(occasion.note), occasion.key).toBe(false);
    }
    // Made to fail on the real sentence rather than on a hypothetical one.
    expect(claimsAMeaning.test("The Estonian name for Saturday means bath day.")).toBe(true);
    // And not on the two shapes that are allowed, or the rule is a ban on the
    // whole layer rather than on the one claim it cannot back.
    expect(claimsAMeaning.test("Estonian numbers four of its weekdays.")).toBe(false);
    expect(claimsAMeaning.test("Estonian borrowed the name from Old Norse.")).toBe(false);
  });

  it("gives every occasion a distinct key and something to ask for", () => {
    const keys = allOccasions().map((o) => o.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const occasion of allOccasions()) {
      expect(occasion.glosses.length, occasion.key).toBeGreaterThan(0);
      expect(occasion.name.trim(), occasion.key).not.toBe("");
    }
  });
});
