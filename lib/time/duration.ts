/*
  A STRETCH OF STUDY, WRITTEN IN THE UNIT THAT MAKES IT HONEST.

  The plan screen prints two figures that are small and one that is not, and it
  printed all three in hours to one decimal place. At the top of the range that
  is fine. At the bottom it is a lie with a decimal point in it: nine minutes a
  week came out as "0.2h", which is 12 minutes, and 1.3 minutes came out as
  "0 hours a week" under a sentence saying the learner still had study to find.

  Rounding a quantity for a screen is normal. Rounding it into a different
  quantity is not, and an hour is simply the wrong unit for a figure the whole
  app measures in minutes a day. So the unit follows the size: whole minutes
  below an hour, where a minute is a real amount of practice and a tenth of an
  hour is six of them; hours to one decimal above, where minute precision would
  be a claim nobody made.

  Two spellings, because the same figure appears in a stat tile and in a
  sentence, and "8.1 h a week" reads as an abbreviation in prose while
  "25 minutes" is too wide for a tile.

  Pure arithmetic on a number. No React, no database, no clock: this is a
  duration, not a time of day, which is why it does not live in `clock.ts`.
*/

const MINUTES_PER_HOUR = 60;

type Unit = "min" | "h";

/** Short for a tile, long for a sentence. */
export type DurationStyle = "short" | "long";

/**
 * Minutes below an hour, hours above.
 *
 * Drawn at exactly one hour rather than at some rounder threshold, because
 * that is the point where the smaller unit stops being the one a person would
 * use: "90 minutes a week" is a sentence somebody says, "470 minutes" is not.
 */
function unitFor(hours: number): Unit {
  return hours < 1 ? "min" : "h";
}

function amountIn(hours: number, unit: Unit): number {
  return unit === "min"
    ? Math.round(hours * MINUTES_PER_HOUR)
    : Math.round(hours * 10) / 10;
}

function label(amount: number, unit: Unit, style: DurationStyle): string {
  if (style === "short") return unit;
  const word = unit === "min" ? "minute" : "hour";
  return amount === 1 ? word : `${word}s`;
}

function write(amount: number, unit: Unit, style: DurationStyle): string {
  return `${amount} ${label(amount, unit, style)}`;
}

/** One duration: "25 min", or "25 minutes" in a sentence. */
export function formatDuration(hours: number, style: DurationStyle = "short"): string {
  const safe = Math.max(0, hours);
  const unit = unitFor(safe);
  return write(amountIn(safe, unit), unit, style);
}

/**
 * A range, with the unit said once at the end.
 *
 * The unit follows the larger end, since that is the figure a reader anchors
 * on, and then steps back down if that would print the smaller end as a zero
 * it is not. That guard is the whole reason this takes both ends at once: the
 * note under the plan's verdict reached "roughly 0 to 0 hours a week" on a
 * real figure, which is a sentence that argues with the paragraph around it.
 */
export function formatDurationRange(low: number, high: number, style: DurationStyle = "short"): string {
  const lo = Math.max(0, low);
  const hi = Math.max(0, high);
  let unit = unitFor(Math.max(lo, hi));
  if (unit === "h" && lo > 0 && amountIn(lo, "h") === 0) unit = "min";

  const from = amountIn(lo, unit);
  const to = amountIn(hi, unit);
  return from === to ? write(from, unit, style) : `${from} to ${write(to, unit, style)}`;
}


/*
  HOW LONG ONE ANSWER TOOK, WHICH IS THE OTHER END OF THE SAME SCALE.

  Everything above is a stretch of *study*: hours a week, minutes a day, the
  figures the plan is built out of. `Review.durationMs` is the opposite end,
  one answer, and `lib/stats/pace.ts` reads it in the low seconds. It is here
  rather than in a module of its own for the reason the two spellings above
  share one file: turning a length of time into words is one job, and a second
  file doing it in a third unit is where two of them stop agreeing.

  The precision follows the size, exactly as the unit does above. Below ten
  seconds a tenth is the whole signal, because the difference between
  answering in 2.4 and in 3.8 is the difference this panel exists to show. At
  ten and above a tenth is precision nobody measured: a browser's own
  scheduling is worth more than that, and "14.3s" claims a stopwatch. Past a
  minute it is minutes, since a median answer over a minute is somebody who
  put their phone down and the seconds are not the point.
*/
const SECOND = 1000;
/** Below this many seconds, a tenth is the signal rather than noise. */
const TENTHS_BELOW_S = 10;

/** One answer's time: "2.4s", "14s", "1.5 min". */
export function formatAnswerTime(ms: number): string {
  const seconds = Math.max(0, ms) / SECOND;
  if (seconds >= MINUTES_PER_HOUR) {
    return `${Math.round((seconds / MINUTES_PER_HOUR) * 10) / 10} min`;
  }
  return seconds < TENTHS_BELOW_S
    ? `${Math.round(seconds * 10) / 10}s`
    : `${Math.round(seconds)}s`;
}
