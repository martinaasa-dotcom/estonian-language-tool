import { describe, expect, it } from "vitest";
import { dayClock } from "@/lib/time/day";
import {
  atMinute, eventsOn, kindFrom, repeatLabel, span, weekdayOf, weekOf, type StudyEvent,
} from "./schedule";

const event = (over: Partial<StudyEvent> = {}): StudyEvent => ({
  id: "e1", title: "Eesti keel", notes: null, kind: "CLASS",
  startMinute: 18 * 60, durationMinutes: 90, weekdays: [1, 3], onDate: null, ...over,
});

describe("weekdayOf", () => {
  it("reads the weekday off the key rather than off a Date in some other zone", () => {
    // 2026-09-02 is a Wednesday.
    expect(weekdayOf("2026-09-02")).toBe(3);
    expect(weekdayOf("2026-09-06")).toBe(0);
    expect(weekdayOf("2026-09-07")).toBe(1);
  });
});

describe("weekOf", () => {
  const clock = dayClock("Europe/Tallinn");

  it("starts the week on Monday and runs seven days", () => {
    const week = weekOf(clock, new Date("2026-09-02T09:00:00Z"));
    expect(week).toHaveLength(7);
    expect(week[0]).toBe("2026-08-31");
    expect(week[6]).toBe("2026-09-06");
    expect(weekdayOf(week[0]!)).toBe(1);
  });

  it("moves whole weeks", () => {
    const now = new Date("2026-09-02T09:00:00Z");
    expect(weekOf(clock, now, -1)[0]).toBe("2026-08-24");
    expect(weekOf(clock, now, 1)[0]).toBe("2026-09-07");
  });

  it("is still seven days across a daylight saving change", () => {
    // Estonia moves its clocks on the last Sunday of October.
    const week = weekOf(clock, new Date("2026-10-27T09:00:00Z"));
    expect(week).toHaveLength(7);
    expect(new Set(week).size).toBe(7);
    expect(week[0]).toBe("2026-10-26");
    expect(week[6]).toBe("2026-11-01");
  });

  it("gives a learner in another zone their own week", () => {
    /*
      22:00 UTC on Sunday the 6th. In Tallinn that is one in the morning on
      Monday the 7th, which is a new week; in New York it is six on Sunday
      evening, which is still the old one. A week boundary is the learner's own
      midnight, not the deployment's, and this is the case that tells them
      apart.
    */
    const at = new Date("2026-09-06T22:00:00Z");
    expect(weekOf(dayClock("Europe/Tallinn"), at)[0]).toBe("2026-09-07");
    expect(weekOf(dayClock("America/New_York"), at)[0]).toBe("2026-08-31");
  });
});

describe("eventsOn", () => {
  it("lands a repeating event on each of its weekdays and no others", () => {
    const week = event({ weekdays: [1, 3] });
    expect(eventsOn([week], "2026-08-31")).toHaveLength(1); // Monday
    expect(eventsOn([week], "2026-09-02")).toHaveLength(1); // Wednesday
    expect(eventsOn([week], "2026-09-01")).toHaveLength(0); // Tuesday
  });

  it("lands a one-off only on its own day", () => {
    const once = event({ weekdays: [], onDate: "2026-09-04", title: "Exam" });
    expect(eventsOn([once], "2026-09-04")).toHaveLength(1);
    expect(eventsOn([once], "2026-09-05")).toHaveLength(0);
  });

  it("never reads a one-off's weekday, so a one-off does not repeat", () => {
    // 2026-09-04 is a Friday. A one-off on it must not appear next Friday.
    const once = event({ weekdays: [], onDate: "2026-09-04" });
    expect(eventsOn([once], "2026-09-11")).toHaveLength(0);
  });

  it("orders by start time, then by title, so two at six is not the plan's answer", () => {
    const list = [
      event({ id: "b", title: "Bravo", startMinute: 600, weekdays: [1] }),
      event({ id: "a", title: "Alfa", startMinute: 600, weekdays: [1] }),
      event({ id: "early", title: "Zulu", startMinute: 540, weekdays: [1] }),
    ];
    expect(eventsOn(list, "2026-08-31").map((e) => e.id)).toEqual(["early", "a", "b"]);
  });
});

describe("atMinute and span", () => {
  it("writes a 24-hour clock, never am or pm", () => {
    expect(atMinute(0)).toBe("00:00");
    expect(atMinute(9 * 60 + 5)).toBe("09:05");
    expect(atMinute(18 * 60)).toBe("18:00");
    expect(atMinute(23 * 60 + 59)).toBe("23:59");
  });

  it("wraps rather than printing a 25th hour", () => {
    expect(atMinute(1440)).toBe("00:00");
    expect(atMinute(-60)).toBe("23:00");
  });

  it("reads a span end to end", () => {
    expect(span(18 * 60, 90)).toBe("18:00 to 19:30");
    expect(span(23 * 60, 120)).toBe("23:00 to 01:00");
  });
});

describe("repeatLabel", () => {
  it("says once when it does not repeat", () => {
    expect(repeatLabel([])).toBe("Once");
  });

  it("names one day, and joins two with and", () => {
    expect(repeatLabel([1])).toBe("Every Monday");
    expect(repeatLabel([1, 3])).toBe("Every Monday and Wednesday");
    expect(repeatLabel([1, 3, 5])).toBe("Every Monday, Wednesday and Friday");
  });

  it("shortens the two runs worth shortening", () => {
    expect(repeatLabel([1, 2, 3, 4, 5])).toBe("Every weekday");
    expect(repeatLabel([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
  });

  it("sorts and deduplicates whatever it is handed", () => {
    expect(repeatLabel([3, 1, 3])).toBe("Every Monday and Wednesday");
  });

  it("ignores a day number that is not a day", () => {
    expect(repeatLabel([1, 9, -2])).toBe("Every Monday");
  });
});

describe("kindFrom", () => {
  it("keeps a kind this app offers and falls back for anything else", () => {
    expect(kindFrom("CLASS")).toBe("CLASS");
    expect(kindFrom("EXAM")).toBe("EXAM");
    expect(kindFrom("SOMETHING")).toBe("OTHER");
    expect(kindFrom(null)).toBe("OTHER");
  });
});
