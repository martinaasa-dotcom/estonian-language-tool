import { describe, expect, it } from "vitest";
import { buildReminderIcs, escapeIcsText, parseReminderTime } from "./reminder";

/**
 * The reminder file, and one bug in particular.
 *
 * `setHours()` sets an hour in the timezone the Node process happens to run
 * in, and the route then read it back out as UTC. On Vercel that is UTC, and
 * Estonia is two or three hours ahead of it, so every Estonian learner who
 * asked to be reminded at 18:00 was reminded at 20:00 or 21:00. The hour they
 * picked never survived the round trip.
 *
 * These run the builder at a fixed instant and read the hour back out of the
 * text. The first test is the one that fails against the old code, whatever
 * timezone the machine running it is set to — which is the other half of the
 * point, since the old bug was invisible on a developer's laptop in Tallinn
 * and only appeared in production.
 */

const base = {
  uid: "test@kodukeel",
  goal: 20,
  url: "https://example.test/review",
  // Deliberately late in the UTC day: a machine running in a zone behind UTC
  // is on the previous date at this instant, and a machine ahead of it is on
  // the next one. Nothing below may notice.
  now: new Date("2026-08-30T23:30:00Z"),
};

const lineOf = (ics: string, key: string) =>
  ics.split("\r\n").find((line) => line.startsWith(`${key}:`)) ?? "";

describe("buildReminderIcs", () => {
  it("starts at the hour that was asked for", () => {
    const ics = buildReminderIcs({ ...base, at: { hour: 18, minute: 0 } });
    expect(lineOf(ics, "DTSTART")).toBe("DTSTART:20260830T180000");
  });

  it("writes a floating time, so it does not drift with the clocks", () => {
    /*
      No `Z` and no `TZID`. A `Z` would pin the reminder to one UTC offset for
      ever, and Estonia changes its own twice a year: a correctly converted
      18:00 would become 17:00 in October and 19:00 in March, which is the
      second bug hiding behind the first.
    */
    const start = lineOf(ics(), "DTSTART");
    expect(start.endsWith("Z")).toBe(false);
    expect(start).not.toContain("TZID");
    expect(ics()).not.toContain("VTIMEZONE");
  });

  it("keeps DTSTAMP absolute, because that one really is an instant", () => {
    // When the file was written, not when it fires. The distinction is the
    // whole fix, so it is asserted in both directions rather than one.
    expect(lineOf(ics(), "DTSTAMP")).toBe("DTSTAMP:20260830T233000Z");
  });

  it("ends ten minutes later, in the same frame as it starts", () => {
    const out = buildReminderIcs({ ...base, at: { hour: 8, minute: 5 } });
    expect(lineOf(out, "DTSTART")).toBe("DTSTART:20260830T080500");
    expect(lineOf(out, "DTEND")).toBe("DTEND:20260830T081500");
  });

  it("rolls the end into the next day rather than inventing hour 25", () => {
    const out = buildReminderIcs({ ...base, at: { hour: 23, minute: 55 } });
    expect(lineOf(out, "DTSTART")).toBe("DTSTART:20260830T235500");
    expect(lineOf(out, "DTEND")).toBe("DTEND:20260831T000500");
  });

  it("repeats daily", () => {
    expect(ics()).toContain("RRULE:FREQ=DAILY");
  });

  function ics() {
    return buildReminderIcs({ ...base, at: { hour: 18, minute: 0 } });
  }
});

describe("parseReminderTime", () => {
  it("reads a 24-hour reading", () => {
    expect(parseReminderTime("08:30")).toEqual({ hour: 8, minute: 30 });
    expect(parseReminderTime("20:05")).toEqual({ hour: 20, minute: 5 });
  });

  it("falls back to the early evening rather than failing a download", () => {
    // There is no screen to show an error on: this builds a file. A sensible
    // hour is a better answer to a malformed parameter than a broken link.
    expect(parseReminderTime(null)).toEqual({ hour: 18, minute: 0 });
    expect(parseReminderTime("nonsense")).toEqual({ hour: 18, minute: 0 });
  });

  it("clamps rather than wrapping", () => {
    expect(parseReminderTime("99:99")).toEqual({ hour: 23, minute: 59 });
  });
});

describe("escapeIcsText", () => {
  it("escapes the characters iCalendar treats as structure", () => {
    expect(escapeIcsText("a,b;c\\d")).toBe("a\\,b\\;c\\\\d");
  });
});
