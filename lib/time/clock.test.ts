import { describe, expect, it } from "vitest";
import { formatDateTime, formatHour, formatTime } from "@/lib/time/clock";

describe("the hour", () => {
  it("is two digits, so a column of times lines up", () => {
    expect(formatHour(7)).toBe("07:00");
    expect(formatHour(20)).toBe("20:00");
  });

  it("says midnight rather than 24:00", () => {
    // `hour12: false` renders midnight as "24:00" in en-US, which is why the
    // formatters below pin `hourCycle` instead.
    expect(formatHour(0)).toBe("00:00");
  });

  it("never says am or pm", () => {
    for (let h = 0; h < 24; h += 1) {
      expect(formatHour(h)).not.toMatch(/[ap]m/i);
      expect(formatHour(h)).toMatch(/^\d{2}:00$/);
    }
  });

  it("survives a number that is not an hour", () => {
    expect(formatHour(-3)).toBe("00:00");
    expect(formatHour(99)).toBe("23:00");
    expect(formatHour(7.6)).toBe("07:00");
  });
});

describe("a clock reading is the same reading in every locale", () => {
  const evening = new Date(Date.UTC(2026, 2, 14, 20, 5));

  it("is 24-hour in a locale that would rather use twelve", () => {
    // The whole point: a teacher and a student looking at the same figure see
    // the same figure, whatever country their browser thinks they are in.
    expect(formatTime(evening, "en-US")).toBe("20:05");
    expect(formatTime(evening, "en-GB")).toBe("20:05");
    expect(formatTime(evening, "et")).toBe("20:05");
  });

  it("renders midnight as 00:00 rather than 24:00", () => {
    const midnight = new Date(Date.UTC(2026, 2, 14, 0, 0));
    expect(formatTime(midnight, "en-US")).toBe("00:00");
  });

  it("still lets the reader's locale choose the date's shape", () => {
    // Only the hour is pinned. The date order is genuinely theirs.
    expect(formatDateTime(evening, "en-US")).toContain("20:05");
    expect(formatDateTime(evening, "en-GB")).toContain("20:05");
    expect(formatDateTime(evening, "en-US")).toMatch(/Mar/);
  });
});
