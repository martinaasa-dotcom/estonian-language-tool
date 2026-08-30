/**
 * Calendar days, in the learner's own timezone.
 *
 * A streak is a human unit: it breaks at *their* midnight, not UTC's. Using
 * `toISOString().slice(0, 10)` — the obvious shortcut — silently shifts the day
 * boundary for anyone west of Greenwich, so someone in New York studying at
 * 8pm would have it counted as tomorrow. Estonia is UTC+2/+3, which makes the
 * bug invisible where the app was written and real everywhere else.
 *
 * THAT WAS ONLY HALF THE FIX, AND THE HALF THAT SHOWS UP IN A BROWSER.
 *
 * `getFullYear()` reads the day boundary of whichever process is running, and
 * every screen that leads with a day boundary is rendered on the server: the
 * streak, the daily goal, the quests, the week strip on Today, the heatmap.
 * On Vercel that process is UTC, so "the learner's own calendar day" was UTC's
 * calendar day wearing a different name, and the shortcut this file was
 * written to forbid was being taken one layer down.
 *
 * It is not a rounding error. A learner in Tallinn who studied on Monday
 * morning, again at one in the morning on Tuesday and again on Wednesday
 * morning has kept a three-day streak. Those three sittings fall in two UTC
 * days with a hole between them, so the app reported a streak of 1 — and, if
 * they had banked a shield, silently spent it to bridge a Tuesday they had not
 * missed. That is the worst shape this bug has: the app quietly pays a
 * penalty on the learner's behalf for something they did.
 *
 * So a day boundary now needs a timezone, and the way to get one is
 * `dayClock(zone)`. The free functions below are the same thing bound to the
 * running process's zone, which is the right answer in a browser (where the
 * process *is* the learner) and the wrong one on a server, so server code
 * takes a clock. The learner's zone is reported by their browser and stored
 * under `SETTING_KEYS.timeZone`; with none stored the clock falls back to the
 * process, which is exactly the behaviour this file had before.
 *
 * Framework-free and pure: `Intl` is the platform, so both the server and the
 * browser can agree on a day key without either one guessing.
 */

/** `YYYY-MM-DD`. */
export type DayKey = string;

/**
 * An IANA timezone name, or `undefined` for the running process's own zone.
 *
 * Never trusted blind: it arrives from a browser and is stored, so anything
 * `Intl` will not accept is treated as absent rather than thrown at a
 * formatter on the render path. See `isTimeZone`.
 */
export type Zone = string | undefined;

/** Whether `Intl` recognises this as a timezone, so a stored value can be trusted. */
export function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** A stored zone, or `undefined` when it is missing or no longer a real zone. */
export function normaliseZone(value: unknown): Zone {
  return isTimeZone(value) ? value : undefined;
}

/*
  Formatters are memoised because a heatmap asks for one day key per review and
  a busy learner's chart is thousands of rows. Constructing an
  `Intl.DateTimeFormat` is the expensive part; formatting with one is not. The
  map is keyed on the zone name and there is one entry per zone a process ever
  sees, which is one on a server and one on a phone.
*/
const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(zone: Zone): Intl.DateTimeFormat {
  const key = zone ?? "";
  const cached = formatters.get(key);
  if (cached) return cached;
  const made = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  formatters.set(key, made);
  return made;
}

interface ZonedParts {
  year: number; month: number; day: number;
  hour: number; minute: number; second: number;
}

/**
 * The wall clock in `zone` at the instant `date`.
 *
 * Read through `formatToParts` rather than by formatting and re-parsing a
 * string, because a locale decides what a formatted date looks like and no
 * locale decides what a part is called.
 */
function partsIn(date: Date, zone: Zone): ZonedParts {
  const out: Record<string, number> = {};
  for (const part of partsFormatter(zone).formatToParts(date)) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  return {
    year: out.year ?? date.getFullYear(),
    month: out.month ?? date.getMonth() + 1,
    day: out.day ?? date.getDate(),
    // "24" is what h23 never produces, but a runtime that disagrees should
    // land on midnight rather than on a day boundary an hour into tomorrow.
    hour: (out.hour ?? date.getHours()) % 24,
    minute: out.minute ?? date.getMinutes(),
    second: out.second ?? date.getSeconds(),
  };
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** Every day boundary in one zone. Server code takes one of these. */
export interface DayClock {
  /** `YYYY-MM-DD` for the calendar day a timestamp falls in. */
  dayKey(date?: Date): DayKey;
  /**
   * The hour on the wall clock, 0 to 23.
   *
   * Two badges turn on it — "review before 7am" and "review after 11pm" — and
   * both were reading the deployment's hour, so a learner in Tallinn earned
   * the early bird for studying at nine in the morning and the night owl for
   * studying at two in the afternoon.
   */
  hourOf(date?: Date): number;
  /** The instant of local midnight at the start of the day `date` falls in. */
  startOfDay(date?: Date): Date;
  /** The instant of local midnight `n` days before `from` (negative moves forward). */
  shiftDay(from: Date, n: number): Date;
  /** Day keys from `days - 1` days ago up to today, oldest first. */
  recentDayKeys(days: number, from?: Date): DayKey[];
  /** How many whole calendar days lie between two timestamps (`b - a`). */
  daysBetween(a: Date, b: Date): number;
  /** The zone this clock was given, or `undefined` for the process's own. */
  readonly zone: Zone;
  /**
   * The IANA name this clock actually reads, never undefined.
   *
   * Postgres knows the same names, so a query that has to bucket by day in the
   * database (the streak's, which would otherwise load a year of rows to count
   * distinct days) can be told the same zone this clock uses and come back
   * with keys that agree with it.
   */
  readonly zoneName: string;
}

/**
 * Day boundaries in `zone`.
 *
 * An unrecognised zone is treated as absent rather than as an error: this runs
 * on the render path of the busiest page in the app, and a learner whose
 * stored zone stopped existing between two releases of the IANA database
 * should see the previous behaviour, not a 500.
 */
export function dayClock(zone?: unknown): DayClock {
  const tz = normaliseZone(zone);

  const keyOf = (date: Date): DayKey => {
    const p = partsIn(date, tz);
    return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
  };

  /*
    Local midnight as an instant, found by subtracting the wall clock's own
    time of day. It never has to name the zone's offset, which is what keeps
    it right across a DST change: the offset that applies is the one in force
    at `date`, and reading the wall clock there is how you get it.

    On a spring-forward day midnight itself may not exist in some zones; this
    lands on the first instant that does, which is what a day boundary means
    there anyway.
  */
  const startOf = (date: Date): Date => {
    const p = partsIn(date, tz);
    const intoDay =
      p.hour * 3_600_000 + p.minute * 60_000 + p.second * 1000 + date.getMilliseconds();
    return new Date(date.getTime() - intoDay);
  };

  /*
    Days are stepped from midday rather than from midnight. A day is not always
    24 hours long — a DST change makes one 23 and another 25 — so adding
    `n * 86_400_000` to a midnight can land on the previous day's 23:00 and
    skip a day out of a heatmap. Midday has twelve hours of slack either side,
    which is more than any real offset change.
  */
  const shift = (from: Date, n: number): Date => {
    const midday = new Date(startOf(from).getTime() + 12 * 3_600_000);
    return startOf(new Date(midday.getTime() - n * 86_400_000));
  };

  return {
    zone: tz,
    zoneName: tz ?? new Intl.DateTimeFormat().resolvedOptions().timeZone,
    dayKey: (date = new Date()) => keyOf(date),
    hourOf: (date = new Date()) => partsIn(date, tz).hour,
    startOfDay: (date = new Date()) => startOf(date),
    shiftDay: shift,
    recentDayKeys(days, from = new Date()) {
      const out: DayKey[] = [];
      for (let i = days - 1; i >= 0; i--) out.push(keyOf(shift(from, i)));
      return out;
    },
    daysBetween(a, b) {
      return Math.round((startOf(b).getTime() - startOf(a).getTime()) / 86_400_000);
    },
  };
}

/**
 * The same boundaries, in whatever zone this process runs in.
 *
 * Correct in a browser, where the process is the learner. On a server it is
 * the deployment's zone, so anything rendered for one person takes a
 * `dayClock` instead — see the header.
 */
const processClock = dayClock();

/** `YYYY-MM-DD` for the local calendar day a timestamp falls in. */
export function dayKey(date: Date = new Date()): DayKey {
  return processClock.dayKey(date);
}

/** The local day `n` days before `from` (negative `n` moves forward). */
export function shiftDay(from: Date, n: number): Date {
  return processClock.shiftDay(from, n);
}

/** Midnight at the start of the local day `date` falls in. */
export function startOfDay(date: Date = new Date()): Date {
  return processClock.startOfDay(date);
}

/** Local day keys from `days - 1` days ago up to today, oldest first. */
export function recentDayKeys(days: number, from: Date = new Date()): DayKey[] {
  return processClock.recentDayKeys(days, from);
}

/** How many whole local days lie between two timestamps (`b - a`). */
export function daysBetween(a: Date, b: Date): number {
  return processClock.daysBetween(a, b);
}
