/*
  A DAILY REMINDER IS A WALL CLOCK TIME, AND IT IS THE LEARNER'S WALL CLOCK.

  This used to be an absolute instant, and it was the server's instant. The
  route read "18:00" off the query string, called `setHours(18, 0)` — which
  sets the hour in the *Node process's* timezone — and then wrote the result
  back out through `getUTCHours()` as a `Z`-suffixed `DTSTART`. Internally
  consistent, and wrong from the first character: nobody had asked what 18:00
  meant to the person who picked it.

  On Vercel, which is the deployment the README is written around, Node runs
  with TZ=UTC. Estonia is UTC+2 in winter and UTC+3 in summer. So an Estonian
  learner — the entire audience of this app, by design — who asked to be
  reminded at 18:00 was reminded at 20:00, or at 21:00 half the year, every
  day, for ever, with nothing on any screen or in the file admitting a
  timezone had been assumed at all.

  And a single `Z` instant is the wrong shape for this even when the offset is
  right, which is the part worth keeping in mind if anybody is tempted to fix
  it by converting more carefully. `RRULE:FREQ=DAILY` from an absolute instant
  keeps the same UTC offset for ever; Estonia moves its clocks twice a year,
  so a correctly converted 18:00 becomes 17:00 or 19:00 in March and October.

  A floating time is the shape RFC 5545 has for exactly this. A `DTSTART` with
  no `Z` and no `TZID` means "this wall clock reading, wherever the calendar is
  read", which is what a study reminder is: 18:00 at home, 18:00 on the train
  in Berlin, 18:00 after the clocks change. It also needs no `VTIMEZONE` block
  and asks the browser for nothing, so there is no timezone to get wrong.

  Pinning it to Europe/Tallinn with a `VTIMEZONE` was the other candidate and
  is worse in a way that is easy to miss: this app teaches Estonian to people
  who are mostly not in Estonia yet.
*/

/** A reminder as it was asked for: a wall clock reading and nothing else. */
export interface ReminderTime {
  hour: number;
  minute: number;
}

/**
 * Reads "HH:MM" off a query string.
 *
 * Clamped rather than rejected, and defaulted to early evening, because this
 * builds a file rather than a record: there is no screen to show an error on,
 * and a reminder at six is a better answer to a malformed parameter than a
 * download that fails.
 */
export function parseReminderTime(value: string | null | undefined): ReminderTime {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? "");
  return {
    hour: Math.min(23, Math.max(0, Number(match?.[1] ?? 18))),
    minute: Math.min(59, Math.max(0, Number(match?.[2] ?? 0))),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A floating local timestamp: no `Z`, no `TZID`, read on the reader's clock. */
function floating(day: Date, hour: number, minute: number): string {
  return (
    `${day.getUTCFullYear()}${pad(day.getUTCMonth() + 1)}${pad(day.getUTCDate())}T` +
    `${pad(hour)}${pad(minute)}00`
  );
}

/** An absolute UTC timestamp, for `DTSTAMP`, which really is an instant. */
function utc(at: Date): string {
  return (
    `${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}T` +
    `${pad(at.getUTCHours())}${pad(at.getUTCMinutes())}${pad(at.getUTCSeconds())}Z`
  );
}

/** iCalendar escaping: commas, semicolons and backslashes are structural. */
export function escapeIcsText(text: string): string {
  return text.replace(/([\\,;])/g, "\\$1").replace(/\n/g, "\\n");
}

export interface ReminderInput {
  /** Stable across regenerations, so re-adding replaces rather than duplicates. */
  uid: string;
  at: ReminderTime;
  /** Cards a day, for the description. */
  goal: number;
  /** Where the reminder should take them. */
  url: string;
  now: Date;
}

/**
 * The whole `.ics` file, as text.
 *
 * Pure, and out here rather than in the route, because the thing that was
 * wrong with it is exactly the thing a unit test can hold still: what hour
 * comes out for a given hour in. The route needed a session to reach, so the
 * bug lived somewhere no test could see it.
 */
export function buildReminderIcs(input: ReminderInput): string {
  /*
    The start date is today's, in UTC.

    It only decides which day the series opens on, and a daily rule covers
    every day after it, so a learner far enough east or west that their own
    date differs gets their first reminder a day either side and every one
    after that on time. Reading the browser's date to shave that off would
    mean a script on the settings page to build a link that is otherwise a
    plain anchor, which is a lot of machinery for one day at the start of a
    reminder somebody will keep for months.
  */
  const day = input.now;
  const start = floating(day, input.at.hour, input.at.minute);

  // Ten minutes, floating like the start. An end in a different frame from its
  // start is the kind of thing calendars interpret rather than reject.
  const endMinutes = input.at.hour * 60 + input.at.minute + 10;
  const end = floating(
    // Past midnight the event runs into the next day, which is a real case at
    // 23:55 and silently produces "25:05" without this.
    new Date(day.getTime() + (endMinutes >= 24 * 60 ? 24 * 60 * 60_000 : 0)),
    Math.floor((endMinutes % (24 * 60)) / 60),
    endMinutes % 60,
  );

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kodukeel//Estonian study//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    // The one genuine instant in the file: when this was written, not when it
    // fires. It is absolute because it is a fact about a moment in the past.
    `DTSTAMP:${utc(input.now)}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    "RRULE:FREQ=DAILY",
    "SUMMARY:Eesti keel, review",
    `DESCRIPTION:${escapeIcsText(`${input.goal} cards keeps the streak. Ten minutes.`)}`,
    `URL:${input.url}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT0M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Eesti keel, review",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
