import { describe, expect, it } from "vitest";

import { dayClock, isTimeZone, nextCardLine, normaliseZone } from "./day";

/*
  The bug these exist for, stated once.

  Every screen that leads with a day boundary is rendered on the server, and
  the server's day boundary is the deployment's, not the learner's. On Vercel
  that is UTC. A learner in Tallinn who studied on Monday morning, at one in
  the morning on Tuesday and again on Wednesday morning kept a three-day
  streak; in UTC days that is Monday, Monday and Wednesday, which is a broken
  streak with a hole in it.

  So these tests are written against real instants and real zone names rather
  than against offsets, and every one of them would have passed before the
  change if the machine running it happened to sit in the right zone. That is
  the whole point: `dayClock` takes the zone as an argument, so the answer is a
  property of the code rather than of the box.
*/

const TALLINN = "Europe/Tallinn";
const NEW_YORK = "America/New_York";

describe("a day key belongs to a zone, not to the process", () => {
  it("puts one in the morning in Tallinn on the local day, not the UTC one", () => {
    // 22:30 UTC on the 24th is 01:30 on the 25th in Tallinn (UTC+3 in August).
    const at = new Date("2026-08-24T22:30:00.000Z");
    expect(dayClock(TALLINN).dayKey(at)).toBe("2026-08-25");
    expect(dayClock("UTC").dayKey(at)).toBe("2026-08-24");
  });

  it("puts eight in the evening in New York on the local day, not tomorrow", () => {
    // 00:00 UTC on the 25th is 20:00 on the 24th in New York.
    const at = new Date("2026-08-25T00:00:00.000Z");
    expect(dayClock(NEW_YORK).dayKey(at)).toBe("2026-08-24");
    expect(dayClock("UTC").dayKey(at)).toBe("2026-08-25");
  });

  it("gives three consecutive local days for the sittings that read as two UTC ones", () => {
    const sittings = [
      new Date("2026-08-24T06:00:00.000Z"), // Mon 09:00 Tallinn
      new Date("2026-08-24T22:00:00.000Z"), // Tue 01:00 Tallinn
      new Date("2026-08-26T06:00:00.000Z"), // Wed 09:00 Tallinn
    ];
    const local = dayClock(TALLINN);
    expect(new Set(sittings.map((d) => local.dayKey(d))).size).toBe(3);
    expect(new Set(sittings.map((d) => dayClock("UTC").dayKey(d))).size).toBe(2);
  });
});

describe("midnight is the zone's midnight", () => {
  it("starts the day at local midnight, whatever the offset", () => {
    const clock = dayClock(TALLINN);
    // 21:00 UTC on the 23rd is midnight on the 24th in Tallinn.
    expect(clock.startOfDay(new Date("2026-08-24T06:00:00.000Z")).toISOString())
      .toBe("2026-08-23T21:00:00.000Z");
  });

  it("is idempotent: midnight is already the start of its own day", () => {
    const clock = dayClock(NEW_YORK);
    const once = clock.startOfDay(new Date("2026-08-24T18:00:00.000Z"));
    expect(clock.startOfDay(once).getTime()).toBe(once.getTime());
  });

  it("keeps the day key it was asked about", () => {
    const clock = dayClock(TALLINN);
    for (const iso of [
      "2026-08-24T21:00:00.000Z", "2026-08-25T00:00:00.000Z", "2026-08-25T20:59:59.999Z",
    ]) {
      const at = new Date(iso);
      expect(clock.dayKey(clock.startOfDay(at))).toBe(clock.dayKey(at));
    }
  });
});

describe("stepping days survives a clock change", () => {
  /*
    Europe/Tallinn moves off summer time at 04:00 local on 25 October 2026, so
    that day is 25 hours long. Adding 86,400,000 milliseconds to its midnight
    lands at 23:00 the same day, which is how a day goes missing from a
    heatmap.
  */
  it("steps one calendar day across the autumn change, not 24 hours", () => {
    const clock = dayClock(TALLINN);
    const sunday = new Date("2026-10-25T09:00:00.000Z");
    expect(clock.dayKey(sunday)).toBe("2026-10-25");
    expect(clock.dayKey(clock.shiftDay(sunday, 1))).toBe("2026-10-24");
    expect(clock.dayKey(clock.shiftDay(sunday, -1))).toBe("2026-10-26");
  });

  it("steps across the spring change too", () => {
    // Tallinn springs forward at 03:00 local on 29 March 2026: a 23-hour day.
    const clock = dayClock(TALLINN);
    const sunday = new Date("2026-03-29T12:00:00.000Z");
    expect(clock.dayKey(sunday)).toBe("2026-03-29");
    expect(clock.dayKey(clock.shiftDay(sunday, 1))).toBe("2026-03-28");
    expect(clock.dayKey(clock.shiftDay(sunday, -1))).toBe("2026-03-30");
  });

  it("names every day in a run that spans a clock change, with no repeat and no hole", () => {
    const keys = dayClock(TALLINN).recentDayKeys(5, new Date("2026-10-27T09:00:00.000Z"));
    expect(keys).toEqual([
      "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27",
    ]);
  });

  it("counts whole calendar days between instants, not 24-hour blocks", () => {
    const clock = dayClock(TALLINN);
    // 23:00 on the 24th to 01:00 on the 25th is two hours and one day.
    expect(clock.daysBetween(
      new Date("2026-08-24T20:00:00.000Z"), new Date("2026-08-24T22:00:00.000Z"),
    )).toBe(1);
    expect(clock.daysBetween(
      new Date("2026-10-24T09:00:00.000Z"), new Date("2026-10-26T09:00:00.000Z"),
    )).toBe(2);
  });
});

describe("a stored zone is never trusted blind", () => {
  it("accepts a real IANA name", () => {
    expect(isTimeZone(TALLINN)).toBe(true);
    expect(isTimeZone("UTC")).toBe(true);
  });

  it("rejects anything Intl will not take, including the shapes an attacker sends", () => {
    for (const bad of [
      "", "Mars/Olympus", "'; DROP TABLE \"Review\"; --", "Europe/Tallinn'", 42, null, undefined,
      "A".repeat(200),
    ]) {
      expect(isTimeZone(bad)).toBe(false);
    }
  });

  it("falls back to the process rather than throwing on a zone that stopped existing", () => {
    const clock = dayClock("Mars/Olympus");
    expect(clock.zone).toBeUndefined();
    expect(clock.dayKey(new Date("2026-08-24T12:00:00.000Z"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(normaliseZone("Mars/Olympus")).toBeUndefined();
    expect(normaliseZone(TALLINN)).toBe(TALLINN);
  });
});

/*
  The caught-up screen's one sentence.

  Every case is a day count rather than a clock reading, because FSRS schedules
  in days: a card due at 04:12 on Thursday is a card due on Thursday. The zone
  is the part that decides which day, which is why the last of these is here at
  all: 23:30 UTC is already tomorrow in Tallinn, and a learner there is told
  "tomorrow" for a card an hour away while a learner in London is told "later
  today" for the same card.
*/
describe("nextCardLine", () => {
  const clock = dayClock(TALLINN);
  const now = new Date("2026-09-02T09:00:00Z"); // Wednesday, 12:00 in Tallinn

  it("names the rest of today when the card is hours away", () => {
    expect(nextCardLine(new Date("2026-09-02T18:00:00Z"), now, clock))
      .toBe("The next card comes back later today.");
  });

  it("says tomorrow rather than naming a weekday for it", () => {
    expect(nextCardLine(new Date("2026-09-03T05:00:00Z"), now, clock))
      .toBe("The next card comes back tomorrow.");
  });

  it("names the weekday inside a week", () => {
    expect(nextCardLine(new Date("2026-09-05T05:00:00Z"), now, clock))
      .toBe("The next card comes back on Saturday.");
  });

  it("counts the days once a weekday would be ambiguous", () => {
    expect(nextCardLine(new Date("2026-09-14T05:00:00Z"), now, clock))
      .toBe("The next card comes back in 12 days.");
  });

  it("reads the learner's zone rather than the server's", () => {
    // 23:00 in Tallinn, 21:00 in London, on the same Wednesday evening.
    const evening = new Date("2026-09-02T20:00:00Z");
    // Two and a half hours on: past midnight in Tallinn, not in London.
    const soon = new Date("2026-09-02T22:30:00Z");
    expect(nextCardLine(soon, evening, dayClock(TALLINN)))
      .toBe("The next card comes back tomorrow.");
    expect(nextCardLine(soon, evening, dayClock("Europe/London")))
      .toBe("The next card comes back later today.");
  });
});
