import { describe, expect, it } from "vitest";

import { SYLLABUS } from "./syllabus";
import { THEMES, themeFor, themeLemmas } from "./topical";

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Every month and day of a leap year, which is the widest calendar there is. */
function everyDay(): [number, number][] {
  const out: [number, number][] = [];
  for (let month = 1; month <= 12; month += 1) {
    for (let day = 1; day <= DAYS_IN_MONTH[month - 1]!; day += 1) out.push([month, day]);
  }
  return out;
}

describe("the topical calendar", () => {
  it("names units the course actually has", () => {
    const ids = new Set(SYLLABUS.map((unit) => unit.id));
    for (const theme of THEMES) {
      for (const unit of theme.units) {
        expect(ids, `${theme.id} names a unit that is not in the syllabus: ${unit}`)
          .toContain(unit);
      }
    }
  });

  it("covers every day of the year exactly once", () => {
    for (const [month, day] of everyDay()) {
      const matches = THEMES.filter((theme) => themeFor(month, day).id === theme.id);
      expect(matches, `${month}-${day} is covered by ${matches.length} themes`).toHaveLength(1);
    }
  });

  /*
    The fallback in `themeFor` returns the first theme when nothing matches,
    which is the right behavior on a page and would hide a hole in the table
    from the test above. So the windows are checked directly as well.
  */
  it("has a window round every day rather than falling back to the first", () => {
    for (const [month, day] of everyDay()) {
      const point = month * 100 + day;
      const covering = THEMES.filter((theme) => {
        const from = theme.from[0] * 100 + theme.from[1];
        const to = theme.to[0] * 100 + theme.to[1];
        return from <= to ? point >= from && point <= to : point >= from || point <= to;
      });
      expect(covering.map((t) => t.id), `${month}-${day}`).toHaveLength(1);
    }
  });

  it("puts school words on the first of September and midsummer words in late June", () => {
    expect(themeFor(9, 1).id).toBe("kooliaasta");
    expect(themeFor(6, 24).id).toBe("jaanipaev");
    expect(themeFor(12, 24).id).toBe("joulud");
    expect(themeFor(1, 1).id).toBe("aastavahetus");
    expect(themeFor(2, 24).id).toBe("vabariik");
  });

  it("gives every theme enough words to fill a row", () => {
    for (const theme of THEMES) {
      expect(themeLemmas(theme).length, theme.id).toBeGreaterThanOrEqual(20);
    }
  });

  it("offers no multi-word phrase, which has no paradigm to open", () => {
    for (const theme of THEMES) {
      for (const lemma of themeLemmas(theme)) {
        expect(lemma, `${theme.id} offers a phrase`).not.toMatch(/\s/);
      }
    }
  });
});
