import { describe, expect, it, vi, afterEach } from "vitest";
import { dateLine, ESTONIAN_LOCALE, hasEstonian } from "./estonianDate";

/**
 * The one date in the app that is not written the reader's way.
 *
 * Every assertion here is against CLDR's own answer rather than a string
 * copied out of it, which is the point of the module: this repository does not
 * write Estonian, so a test that hard-coded the seven weekdays would be doing
 * exactly what the module exists to avoid. What is checked is the shape (the
 * weekday leads, the day is a number, the two halves are two languages), that
 * the zone decides which day it is, and that a build with no Estonian says so.
 */

afterEach(() => { vi.restoreAllMocks(); });

/** Wednesday morning in Tallinn, and still Tuesday evening in New York. */
const AT = new Date("2026-09-02T00:30:00Z");

describe("dateLine", () => {
  it("leads in Estonian and glosses the weekday in English", () => {
    const line = dateLine(AT, "Europe/Tallinn");
    expect(line).not.toBeNull();
    expect(line?.en).toBe("Wednesday");
    // CLDR's own Estonian, asked for here rather than typed in above.
    const weekday = new Intl.DateTimeFormat(ESTONIAN_LOCALE, {
      timeZone: "Europe/Tallinn", weekday: "long",
    }).format(AT);
    expect(line?.et.startsWith(weekday)).toBe(true);
    expect(line?.et).not.toBe(line?.en);
    // The day of the month, which is the half a beginner reads on day one.
    expect(line?.et).toContain("2");
  });

  it("is the learner's day, not the server's", () => {
    expect(dateLine(AT, "Europe/Tallinn")?.en).toBe("Wednesday");
    expect(dateLine(AT, "America/New_York")?.en).toBe("Tuesday");
  });

  /**
   * The English is pinned, because it is a gloss and not a date.
   *
   * `LocalDate` hands the shape of a date to the reader's own browser and is
   * right to. This line is a word being taught with its meaning beside it, and
   * every other gloss in this app is English, so a reader whose browser is set
   * to French gets English here exactly as they do in the paragraph below it.
   */
  it("does not follow the reader's locale", () => {
    const seen: (string | string[] | undefined)[] = [];
    const real = Intl.DateTimeFormat;
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- standing in for a constructor
      ((locales: any, options: any) => { seen.push(locales); return new real(locales, options); }) as any,
    );
    dateLine(AT, "Europe/Tallinn");
    expect(seen).toContain(ESTONIAN_LOCALE);
    expect(seen).not.toContain(undefined);
  });

  /**
   * A build with no Estonian in it says nothing rather than English.
   *
   * A small-icu build carries `en-US` alone and answers a request for `et-EE`
   * with English, reporting no error, so a line rendered under `lang="et"`
   * would be read aloud by a screen reader with Estonian phonology. The caller
   * falls back to the reader's own date, which is the line it had before.
   */
  it("returns nothing where the platform has no Estonian", () => {
    vi.spyOn(Intl.DateTimeFormat, "supportedLocalesOf").mockReturnValue([]);
    expect(hasEstonian()).toBe(false);
    expect(dateLine(AT, "Europe/Tallinn")).toBeNull();
  });

  it("returns nothing rather than throwing on a zone the platform will not take", () => {
    expect(dateLine(AT, "Middle/Earth")).toBeNull();
  });
});
