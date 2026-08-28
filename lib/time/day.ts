/**
 * Calendar days, in the learner's own timezone.
 *
 * A streak is a human unit: it breaks at *their* midnight, not UTC's. Using
 * `toISOString().slice(0, 10)` — the obvious shortcut — silently shifts the day
 * boundary for anyone west of Greenwich, so someone in New York studying at
 * 8pm would have it counted as tomorrow. Estonia is UTC+2/+3, which makes the
 * bug invisible where the app was written and real everywhere else.
 *
 * Framework-free and pure, so both the server and the browser can agree on a
 * day key without either one guessing.
 */

/** `YYYY-MM-DD` for the local calendar day a timestamp falls in. */
export function dayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The local day `n` days before `from` (negative `n` moves forward). */
export function shiftDay(from: Date, n: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() - n);
  return d;
}

/** Midnight at the start of the local day `date` falls in. */
export function startOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Local day keys from `days - 1` days ago up to today, oldest first. */
export function recentDayKeys(days: number, from: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(dayKey(shiftDay(from, i)));
  return out;
}

/** How many whole local days lie between two timestamps (`b - a`). */
export function daysBetween(a: Date, b: Date): number {
  const ms = startOfDay(b).getTime() - startOfDay(a).getTime();
  return Math.round(ms / 86_400_000);
}
