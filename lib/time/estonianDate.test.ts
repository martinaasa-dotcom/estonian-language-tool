import { describe, expect, it, vi, afterEach } from "vitest";
import { dateLine, ESTONIAN_LOCALE, hasEstonian } from "./estonianDate";

/**
 * The one date in the app that is not written the reader's way.
 *
 * Every assertion here is against CLDR's own answer rather than a string
 * copied out of it, which is the point of the module: this repository does not
 * write Estonian, so a test that hard-coded the seven weekdays would be doing
 * exactly what the module exists to avoid. What is checked is the shape (the
 * weekday leads, the day is a number), that the zone decides which day it is,
 * that no English comes back with it, and that a build with no Estonian says
 * so.
 */

afterEach(() => { vi.restoreAllMocks(); });

/** Wednesday morning in Tallinn, and still Tuesday evening in New York. */
const AT = new Date("2026-09-02T00:30:00Z");

describe("dateLine", () => {
  it("leads with the weekday and carries the day of the month", () => {
    const line = dateLine(AT, "Europe/Tallinn");
    expect(line).not.toBeNull();
    // CLDR's own Estonian, asked for here rather than typed in above.
    const weekday = new Intl.DateTimeFormat(ESTONIAN_LOCALE, {
      timeZone: "Europe/Tallinn", weekday: "long",
    }).format(AT);
    expect(line?.startsWith(weekday)).toBe(true);
    // The day of the month, which is the half a beginner reads on day one.
    expect(line).toContain("2");
  });

  /**
   * And nothing English comes back with it.
   *
   * The line used to carry the English weekday as a cross-reference, on the
   * argument the grammar screens make about the Latin case names. A reader
   * already knows what day it is, which is why this line can teach at all, so
   * the gloss answered a question nobody had and took the guess with it.
   */
  it("carries no English weekday beside it", () => {
    const en = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Tallinn", weekday: "long",
    }).format(AT);
    expect(dateLine(AT, "Europe/Tallinn")).not.toContain(en);
  });

  it("is the learner's day, not the server's", () => {
    const tallinn = dateLine(AT, "Europe/Tallinn");
    const newYork = dateLine(AT, "America/New_York");
    expect(tallinn).not.toBe(newYork);
    // One day apart: half past midnight in Tallinn is the evening before there.
    expect(tallinn).toContain("2");
    expect(newYork).toContain("1");
  });

  /**
   * The locale is pinned, because the line is Estonian rather than a date the
   * app is reporting back.
   *
   * `LocalDate` hands the shape of a date to the reader's own browser and is
   * right to. This one is a word being taught, so a reader whose browser is
   * set to French still gets Estonian here.
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
