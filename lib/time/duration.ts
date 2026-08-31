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
