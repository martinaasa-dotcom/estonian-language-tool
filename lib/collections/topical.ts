/**
 * What time of year it is, in words a learner in Estonia would actually meet.
 *
 * The dictionary's suggestion row wants to feel like it was chosen this
 * morning rather than generated once. The news feed does most of that work,
 * but a feed can be unreachable, switched off, or having a bad minute, and the
 * calendar never is: on the first of September there is one obvious set of
 * words, and it is not the same set as the one for midsummer.
 *
 * NOTHING HERE IS AUTHORED ESTONIAN. Every window names *unit ids from the
 * course*, and the words come out of `lib/collections/syllabus/`, where a
 * lemma is already a request the Ekilex harvest either honoured or reported.
 * That is the whole reason this is a table of ids rather than a table of
 * words: a hand-written seasonal word list would be somebody writing Estonian
 * into the app (ADR-005), and the first misspelling would ship silently.
 * `topical.test.ts` fails if an id here is not a unit.
 *
 * Estonia's year, not a generic one. School starts on the first of September
 * and the day has a name; the twenty-fourth of February is the independence
 * day; midsummer is the week the country stops. A seasonal table written for
 * somewhere else would be worse than no table.
 *
 * Pure data and one function over a date, like the rest of lib/collections.
 */
import { SYLLABUS } from "./syllabus";

export interface Theme {
  /** Stable key, for tests and for telling two windows apart. */
  id: string;
  /**
   * The line above the row, in the reader's own language.
   *
   * It is what turns twelve random words into twelve chosen ones. Short,
   * because it sits above a row of chips on a phone.
   */
  reason: string;
  /** First day of the window, as month and day. */
  from: readonly [month: number, day: number];
  /** Last day of the window, inclusive. A window may wrap past December. */
  to: readonly [month: number, day: number];
  /** Course units the words come from. */
  units: readonly string[];
}

/**
 * The year, in order, with no gaps and no overlaps.
 *
 * Asserted rather than trusted: the test walks all 366 days of a leap year and
 * fails on a day that matches no window or more than one. A calendar table is
 * exactly the kind of data where an off-by-one sits unnoticed for eleven
 * months.
 */
export const THEMES: readonly Theme[] = [
  {
    id: "kooliaasta",
    reason: "School starts again on 1 September",
    from: [8, 20],
    to: [9, 15],
    units: ["kool-ja-keel", "haridus", "aeg"],
  },
  {
    id: "sugis",
    reason: "Autumn words",
    from: [9, 16],
    to: [10, 31],
    units: ["loodus", "ilm", "riided"],
  },
  {
    id: "pime",
    reason: "The dark month, and staying in",
    from: [11, 1],
    to: [11, 30],
    units: ["kodu", "tunded", "vaba-aeg"],
  },
  {
    id: "joulud",
    reason: "Christmas is close",
    from: [12, 1],
    to: [12, 26],
    units: ["sook-ja-jook", "inimesed", "kodu"],
  },
  {
    id: "aastavahetus",
    reason: "A new year, and plans for it",
    from: [12, 27],
    to: [1, 6],
    units: ["plaanid", "aeg", "arvud"],
  },
  {
    id: "talv",
    reason: "Deep winter",
    from: [1, 7],
    to: [2, 23],
    units: ["ilm", "riided", "kodu"],
  },
  {
    id: "vabariik",
    reason: "Estonia's independence day is 24 February",
    from: [2, 24],
    to: [2, 29],
    units: ["ajalugu", "inimesed", "kodu"],
  },
  {
    id: "kevad",
    reason: "Spring, and the light coming back",
    from: [3, 1],
    to: [4, 30],
    units: ["loodus", "ilm"],
  },
  {
    id: "kevadlopp",
    reason: "Exams, and long evenings",
    from: [5, 1],
    to: [6, 22],
    units: ["haridus", "vaba-aeg", "loodus"],
  },
  {
    id: "jaanipaev",
    reason: "Midsummer week",
    from: [6, 23],
    to: [6, 30],
    units: ["loodus", "sook-ja-jook", "vaba-aeg"],
  },
  {
    id: "suvi",
    reason: "Summer, and going places",
    from: [7, 1],
    to: [8, 19],
    units: ["reisimine", "vaba-aeg", "ilm"],
  },
];

/** A month and day as one comparable number, so a window is two integers. */
const stamp = (month: number, day: number): number => month * 100 + day;

function covers(theme: Theme, point: number): boolean {
  const from = stamp(theme.from[0], theme.from[1]);
  const to = stamp(theme.to[0], theme.to[1]);
  // A window that ends before it starts is one that runs past the new year.
  return from <= to ? point >= from && point <= to : point >= from || point <= to;
}

/**
 * The theme covering a date.
 *
 * Takes month and day rather than a `Date`, because a `Date` carries a
 * timezone and this is a question about the learner's calendar day, which
 * `lib/time/day.ts` is the one place allowed to answer. The caller reads the
 * day off a `DayClock` and passes the two numbers in.
 */
export function themeFor(month: number, day: number): Theme {
  const point = stamp(month, day);
  return THEMES.find((theme) => covers(theme, point)) ?? THEMES[0]!;
}

/**
 * Every lemma the theme's units teach.
 *
 * A request against the dictionary, exactly as the units themselves are: the
 * caller keeps only what is actually there, so a unit naming a word the
 * harvest never brought back costs a suggestion rather than showing a word
 * with nothing behind it.
 */
export function themeLemmas(theme: Theme): string[] {
  const wanted = new Set(theme.units);
  const out: string[] = [];
  for (const unit of SYLLABUS) {
    if (!wanted.has(unit.id)) continue;
    for (const word of unit.vocabulary) {
      if (word.pos === "PHRASE") continue;
      out.push(word.lemma);
    }
  }
  return [...new Set(out)];
}
