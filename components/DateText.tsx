import { LocalDate } from "./LocalDate";
import type { Zone } from "@/lib/time/day";

/**
 * A date written on the server, and rewritten by the reader's browser.
 *
 * `LocalDate` is the client half and needs a `fallback`: the string the server
 * put in the HTML, which the first client render has to match exactly or React
 * has a hydration mismatch on its hands. That means every caller writes its
 * options twice, once for the client formatter and once for the fallback, and
 * two copies of a format is where two copies drift. `app/(app)/page.tsx` has
 * that pair written out by hand and it is correct; the point of this component
 * is that the next one does not have to be.
 *
 * IT ALSO TAKES THE ZONE, WHICH IS THE HALF THAT WAS ACTUALLY WRONG. Four
 * screens formatted a date with `formatDateTime`, which pins the hour to 24
 * and leaves everything else to the runtime: on Vercel that is UTC and the
 * deployment's locale, so a learner in Tallinn who sat a paper at 01:30 on the
 * third read "2 Sept, 22:30" on the exam hub, the result page, their own
 * reports and the level check. The wrong hour is a nuisance; the wrong day on
 * a page whose subject is when something happened is a different thing.
 *
 * So the server writes it in the learner's own zone, which it knows from
 * `learnerDayClock`, and only the *shape* of the reading is the deployment's
 * until the browser has said otherwise. That is the split `lib/time/clock.ts`
 * describes: the hour is ours, the date's shape is the reader's.
 */
export interface DateTextProps {
  /** The instant. A Date cannot cross to a client component, so it is an ISO string here. */
  iso: string;
  /** The learner's zone, from `learnerDayClock`. Undefined falls back to the process's. */
  zone?: Zone;
  options: Intl.DateTimeFormatOptions;
}

/**
 * 24-hour wherever an hour is asked for.
 *
 * `hourCycle: "h23"` rather than `hour12: false`, which renders midnight as
 * "24:00" in en-US. It is applied here rather than left to each caller for the
 * reason `formatTime` exists: a reading that changes shape with the browser's
 * locale is one a teacher and a student cannot compare.
 */
function pinned(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions {
  return options.hour === undefined ? options : { hourCycle: "h23", ...options };
}

export function DateText({ iso, zone, options }: DateTextProps) {
  const format = pinned(options);
  return (
    <LocalDate
      iso={iso}
      zone={zone}
      options={format}
      fallback={new Intl.DateTimeFormat(undefined, { timeZone: zone, ...format }).format(new Date(iso))}
    />
  );
}

/** What `formatDateTime` asked for, which is what all four call sites wanted. */
export const DATE_AND_TIME: Intl.DateTimeFormatOptions = {
  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
};
