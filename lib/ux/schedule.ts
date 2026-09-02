/**
 * A LEARNER'S OWN ESTONIAN WEEK.
 *
 * Almost everybody using this is also sitting in a class, and the two halves of
 * their week live in different places: the class is on Monday and Wednesday
 * evening, and the homework and the review sittings go in the gaps. The app
 * knew about the second half (`Task` has a due date and Today draws it) and
 * nothing at all about the first.
 *
 * This is the arithmetic of a week: which days it holds, which events fall on
 * each of them, and how a span of time reads. It holds no Prisma, no React and
 * no clock of its own, for the reason `lib/ux/agenda.ts` gives at length: "due
 * today" is a question about the learner's own midnight, and every day-shaped
 * figure in this app that reached for the process's clock has been wrong for
 * anybody outside the deployment's zone.
 *
 * A REPEATING EVENT STORES A WALL CLOCK, NOT AN INSTANT. A class at 18:00 every
 * Monday is at 18:00 in March and in November; a stored timestamp is not, it
 * moves an hour when the clocks change. So `startMinute` is minutes from local
 * midnight and `weekdays` says which days it lands on, and the learner's own
 * zone is what turns that into a moment.
 */

import type { DayClock, DayKey } from "@/lib/time/day";

/** 0 Sunday to 6 Saturday, the numbering `Date.getUTCDay` uses. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** What kind of thing is in the calendar. Decides the hue and the icon. */
export type EventKind = "CLASS" | "STUDY" | "EXAM" | "OTHER";

export const EVENT_KINDS: readonly EventKind[] = ["CLASS", "STUDY", "EXAM", "OTHER"];

/** What each kind is called, once, so a form and a row cannot disagree. */
export const KIND_LABEL: Record<EventKind, string> = {
  CLASS: "Class",
  STUDY: "Study",
  EXAM: "Exam",
  OTHER: "Other",
};

/** A hue each. Mint and peach are spoken for elsewhere, so neither is here. */
export const KIND_TONE: Record<EventKind, "accent" | "sky" | "blush" | "butter"> = {
  CLASS: "accent",
  STUDY: "sky",
  EXAM: "blush",
  OTHER: "butter",
};

export interface StudyEvent {
  id: string;
  title: string;
  notes: string | null;
  kind: EventKind;
  /** Minutes from local midnight, 0 to 1439. */
  startMinute: number;
  durationMinutes: number;
  /** The days it repeats on. Empty means it happens once, on `onDate`. */
  weekdays: readonly number[];
  /** A one-off's day key, or null when it repeats. */
  onDate: string | null;
}

/** Monday first, because that is how a week is written here and in Estonia. */
export const WEEK_START: Weekday = 1;

/** The short names a column header uses, indexed by weekday. */
export const WEEKDAY_SHORT: readonly string[] =
  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const WEEKDAY_LONG: readonly string[] =
  ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Which weekday a day key falls on.
 *
 * Read off the key rather than off the `Date`, and that is the whole point: the
 * key was already worked out in the learner's own zone by `dayClock`, so this
 * cannot drift back to the server's idea of the day. Parsed as UTC because a
 * bare `YYYY-MM-DD` is midnight UTC in every engine, which makes the weekday
 * a pure function of the three numbers in the string.
 */
export function weekdayOf(key: DayKey): Weekday {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay() as Weekday;
}

/**
 * The seven day keys of the week `now` falls in, Monday first.
 *
 * `offset` moves whole weeks: -1 is last week, 1 is next. Everything goes
 * through the clock's own `shiftDay`, so a week that spans a daylight saving
 * change is still seven days rather than six and a bit.
 */
export function weekOf(clock: DayClock, now: Date, offset = 0): DayKey[] {
  const today = clock.startOfDay(now);
  const back = (weekdayOf(clock.dayKey(today)) - WEEK_START + 7) % 7;
  const monday = clock.shiftDay(today, back - offset * 7);
  return Array.from({ length: 7 }, (_, i) => clock.dayKey(clock.shiftDay(monday, -i)));
}

/**
 * The events that fall on one day, earliest first.
 *
 * A repeating event lands on a day when that day's weekday is in its list; a
 * one-off lands when its stored key matches. Sorted by start and then by title,
 * because two things at six o'clock is ordinary and the order they print in
 * should not be the query plan's answer.
 */
export function eventsOn(events: readonly StudyEvent[], key: DayKey): StudyEvent[] {
  const weekday = weekdayOf(key);
  return events
    .filter((e) => (e.weekdays.length > 0 ? e.weekdays.includes(weekday) : e.onDate === key))
    .sort((a, b) => a.startMinute - b.startMinute || a.title.localeCompare(b.title));
}

/**
 * A time of day from minutes past midnight, on a 24-hour clock.
 *
 * Never am/pm: Estonia writes the time this way and so does every country whose
 * language this app teaches, and a reading that changes shape with the
 * browser's locale is one a teacher and a student cannot compare
 * (`lib/time/clock.ts`).
 */
export function atMinute(minute: number): string {
  const safe = ((Math.round(minute) % 1440) + 1440) % 1440;
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

/** "18:00 to 19:30", the span an event covers. */
export function span(startMinute: number, durationMinutes: number): string {
  return `${atMinute(startMinute)} to ${atMinute(startMinute + Math.max(0, durationMinutes))}`;
}

/**
 * How an event's repeat reads, in as few words as it takes.
 *
 * "Every Monday and Wednesday" rather than a row of checkbox states, and "Every
 * weekday" rather than five day names, because the point of the line is to be
 * read at a glance under a title.
 */
export function repeatLabel(weekdays: readonly number[]): string {
  const days = [...new Set(weekdays)].filter((d) => d >= 0 && d <= 6).sort();
  if (days.length === 0) return "Once";
  if (days.length === 7) return "Every day";
  if (days.length === 5 && days.every((d) => d >= 1 && d <= 5)) return "Every weekday";

  const names = days.map((d) => WEEKDAY_LONG[d]!);
  const last = names.pop()!;
  return names.length === 0 ? `Every ${last}` : `Every ${names.join(", ")} and ${last}`;
}

/** A stored string, or the fallback when it is not a kind this app offers. */
export function kindFrom(value: string | null | undefined): EventKind {
  return EVENT_KINDS.includes(value as EventKind) ? (value as EventKind) : "OTHER";
}
