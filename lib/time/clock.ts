/*
  EVERY CLOCK READING IN THIS APP IS 24-HOUR. 08:30 AND 20:30, NEVER 8:30 AM.

  Two reasons, and the second is the one that decided it.

  Estonia writes the time this way, and so does every other country whose
  language this app teaches its learners to read. A learner practising for a
  class in Tartu should not be told when they study in a format their timetable
  never uses.

  And a reading that changes shape with the browser's locale is a reading two
  people cannot compare. A teacher looking at the same figure as a student, or
  the same person on a laptop and a phone that disagree about which country
  they are in, should see one answer.

  Only the hour is pinned. Date order and month names still come from the
  reader's own locale, because those are genuinely theirs. `hourCycle: "h23"`
  rather than `hour12: false`, because the latter renders midnight as "24:00"
  in en-US.

  `hour: "2-digit"` rather than `"numeric"` throughout, so a column of times
  lines up: 08:00 above 12:30, not 8:00 above 12:30.
*/

/** One hour of the day, for an axis or a sentence: 7 becomes "07:00". */
export function formatHour(hour: number): string {
  const clamped = Math.min(23, Math.max(0, Math.floor(hour)));
  return `${String(clamped).padStart(2, "0")}:00`;
}

/** A clock reading, on the reader's own clock: "14:05". */
export function formatTime(date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/**
 * A date and a time together. The reader's locale still chooses the date's
 * shape; only the hour is ours.
 */
export function formatDateTime(date: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}
