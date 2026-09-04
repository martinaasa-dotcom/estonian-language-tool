/*
  THE DATE ON TODAY IS IN ESTONIAN, WHICH IS THE ONE PLACE THAT RULE IS TURNED
  AROUND.

  `lib/time/clock.ts` says only the hour is pinned, because "date order and
  month names still come from the reader's own locale, because those are
  genuinely theirs", and `components/LocalDate.tsx` is how that is kept honest
  on a server render. Both of those are about a date the app is *reporting*: a
  deadline, the day somebody joined a class, when a paper was sat.

  The line above the greeting on Today is not that. It is the first Estonian a
  learner reads every morning, and `kolmapäev` and `september` are two words of
  the seven and twelve that every course teaches in its first fortnight and
  that nothing else on the home page was ever going to say to them. A date is
  the one piece of Estonian that needs no gloss to be useful, because the
  reader already knows what today is: they are matching a word they have to a
  word they are learning, which is the whole of how a weekday name is learned
  anywhere.

  So this line is in Estonian and nothing else. It carried the English weekday
  beside it for a while, on the argument the grammar screens make about the
  Latin case names, and a date is the one place that argument does not hold: a
  reader already knows what day it is, which is exactly why this line teaches
  at all, so the gloss answers a question nobody had and takes away the guess
  that does the teaching.

  NOTHING HERE IS WRITTEN DOWN, WHICH IS WHAT MAKES IT LEGAL UNDER ADR-005. The
  seven weekday names and the twelve month names are read out of CLDR, the
  locale database the platform ships and ICU maintains, in exactly the sense
  the forms are read out of Ekilex: an attested source, not a model, and not a
  string somebody typed into this repository. The two words named below are
  naming what comes back; delete them and the output is identical, which is
  the test of whether a word in a file is data or a comment about data.

  AND A BUILD WITHOUT THE DATA SAYS SO RATHER THAN PRINTING ENGLISH IN ESTONIAN
  CLOTHES. Node has shipped full ICU by default since v13, so this is the
  unlikely case rather than the expected one, and it is the case that has to be
  handled: a small-icu build carries `en-US` alone and answers a request for
  `et-EE` with English, which under a `lang="et"` would be read aloud by a
  screen reader with Estonian phonology. `dateLine` returns null there and the
  caller falls back to the reader's own date, which is what the line said
  before any of this.

  Pure, and in `lib/time/` with the rest of the clock: `Intl` and nothing else.
*/

/** Estonia's own locale, and the only one this module asks for. */
export const ESTONIAN_LOCALE = "et-EE";

/**
 * Today, as Estonia writes it, weekday first. Null on a build whose locale
 * data does not carry Estonian.
 *
 * The zone is the learner's own (`lib/progress/dayClock.ts`), for the reason
 * every day-shaped figure on that page takes one: a server's midnight is the
 * deployment's, and a date is the most visible thing that gets wrong.
 */
export function dateLine(at: Date, zone?: string): string | null {
  if (!hasEstonian()) return null;
  try {
    return new Intl.DateTimeFormat(ESTONIAN_LOCALE, {
      timeZone: zone, weekday: "long", day: "numeric", month: "long",
    }).format(at);
  } catch {
    // A zone the platform will not take. The caller's fallback is a date
    // rather than nothing, so this is a missing line and never a broken page.
    return null;
  }
}

/**
 * Whether this build's locale data carries Estonian at all.
 *
 * `supportedLocalesOf` returns an empty list rather than throwing, which is
 * the whole reason it is asked: a small-icu build formats `et-EE` as English
 * and reports no error, so the only way to know is to ask before formatting.
 */
export function hasEstonian(): boolean {
  return Intl.DateTimeFormat.supportedLocalesOf([ESTONIAN_LOCALE]).length > 0;
}
