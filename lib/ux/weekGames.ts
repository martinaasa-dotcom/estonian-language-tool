import { modeAt } from "./modes";
import { DESTINATIONS } from "./nav";
import { WEEKDAY_LONG, type Weekday } from "./schedule";

/**
 * ONE GAME A DAY, THE SAME ONE EVERY WEEK.
 *
 * The brief asked for this and gave the reason in one line: "it becomes
 * predictable and also something to look forward to". Eleven rounds on a menu
 * is a decision to make before you can start; one on the home page with a
 * reason beside it is an invitation. Thursday is Match, always, and by the
 * third week that is a thing somebody knows about their own Thursdays.
 *
 * NOTHING IS HIDDEN BY THIS, which is the same distinction `lib/ux/nav.ts`
 * draws about `within`. Every round stays on `/practice`, in the command
 * palette and at its own URL, on every day of the week. What this table decides
 * is only what Today *leads with*, which is `lib/ux/disclosure.ts`'s kind of
 * question rather than this one's, asked a different way: that module decides
 * by how far in a learner is, this one by what day it is.
 *
 * THE TWO PUZZLES THAT ARE GENUINELY ONE A DAY GET THE DAYS THAT SUIT THEM.
 * Sõnad and Ristsõna build a new one each morning and are finished once you
 * have done it, so featuring them is a nudge rather than a limit. Sõnad opens
 * the week because it is three minutes; Ristsõna is Saturday because it is
 * fifteen and Saturday is the day somebody has fifteen. The other five days
 * carry a round that can be played again, so a Tuesday with ten spare minutes
 * is not a Tuesday that runs out.
 *
 * The `href` is a mode's own, resolved through `lib/ux/modes.ts`, so a round
 * renamed there is renamed here and an invariant fails on an href this table
 * names and that table does not have. One row is not a round: Situations is a
 * place in `lib/ux/nav.ts` rather than a mode, and it is on the table because
 * every other day was a recall or a speed round and the thing the purpose doc
 * leads with, a conversation with somebody who wants something from you, was
 * on no day of the week. `featuredTitle` resolves either.
 *
 * `why` carries more weight than it looks like it does, because Today's card
 * draws a title and this line and no subtitle. So when Ristsõna was renamed out
 * of English, this was the one screen the word "crossword" left entirely, and
 * the line says it now: somebody who has never met the word should not have to
 * press the button to find out what the puzzle is.
 *
 * Pure: a weekday in, a row out.
 */

export interface FeaturedGame {
  /** The mode, by its own href. `modeAt` in lib/ux/modes.ts resolves it. */
  href: string;
  /** Why this one today, in the learner's terms. One short line. */
  why: string;
}

/**
 * Sunday first, because that is what `Date.getUTCDay` returns and
 * `WEEKDAY_LONG` is already indexed that way. Reordering it to start on Monday
 * would mean two conventions in one directory.
 */
export const WEEK_GAMES: readonly FeaturedGame[] = [
  { href: "/quest", why: "Two minutes on whatever went wrong this week." },
  { href: "/sonad", why: "A new word every Monday morning, and every other one." },
  { href: "/review/emoji", why: "No English on the board. The picture is the meaning." },
  { href: "/situations", why: "Midweek, a conversation. Somebody wants something from you." },
  { href: "/review/match", why: "Pairs against the clock. There is a personal best to beat." },
  { href: "/review/sprint", why: "Sixty seconds of cases. Friday does not need a long one." },
  { href: "/crossword", why: "The crossword, for the day there is time for a long one." },
];

/**
 * What today's row is called, off the table that owns the name.
 *
 * A mode's title where the href is a mode, and a destination's label where
 * it is a place, so this table describes nothing itself and a rename in
 * either source reaches the card on Today.
 */
export function featuredTitle(href: string): string | undefined {
  return modeAt(href)?.title ?? DESTINATIONS.find((d) => d.href === href)?.label;
}

/** Today's. */
export function gameOn(weekday: Weekday): FeaturedGame {
  return WEEK_GAMES[weekday] ?? WEEK_GAMES[0]!;
}

/** Tomorrow's, which is half of what makes a week have a shape. */
export function gameAfter(weekday: Weekday): { game: FeaturedGame; weekday: string } {
  const next = ((weekday + 1) % 7) as Weekday;
  return { game: gameOn(next), weekday: WEEKDAY_LONG[next] ?? "" };
}
