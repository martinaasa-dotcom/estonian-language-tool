import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { dayClock } from "@/lib/time/day";
import { readSetting, SETTING_KEYS } from "@/lib/settings/store";
import { kindFrom, weekOf, type StudyEvent } from "@/lib/ux/schedule";
import { Page, Stack } from "@/components/ui";
import { CalendarWeek } from "./CalendarWeek";

export const metadata = { title: "Calendar" };

export const dynamic = "force-dynamic";

/**
 * THE LEARNER'S OWN ESTONIAN WEEK.
 *
 * Almost everybody using this is also sitting in a class, and until now the two
 * halves of their week lived in different places: the app knew what was due and
 * nothing at all about the Monday evening that produced it. This is the other
 * half, asked for directly: "I have Estonian class on Monday and Wednesday so I
 * want to add that to the built in calendar and then schedule when I do my
 * homework or review on Tuesday and Thursday."
 *
 * ONLY THIS. It is deliberately not a general calendar, and the request said so
 * first: a place to "only keep their estonian calendar events and tasks". A
 * learner's dentist appointment belongs in the calendar they already have.
 *
 * `/tasks` and `/week` were cut in `docs/13-mvp-status.md` §24, and this is not
 * them coming back. Those were a to-do list and a class calendar a teacher set
 * and a learner alone never filled, so they were furniture. This is filled by
 * the person reading it, which is the whole difference.
 *
 * TWO SHAPES OF THING, ONE WEEK. An **event** happens at a time and usually
 * every week, and is `StudyEvent`. A **reminder** is due on a day and is
 * `Task`, which is the row Today already draws and `lib/ux/agenda.ts` already
 * buckets, so a note a learner writes lands where a teacher's assignment does
 * rather than in a second list beside it.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const ownerId = await requireUserId();
  const { w } = await searchParams;

  // Whole weeks only, and bounded: the query strings that reach a page are
  // whatever somebody types, and a calendar four thousand weeks out is a page
  // nobody asked for rendered from a number nobody meant.
  const offset = Math.max(-52, Math.min(52, Number.parseInt(w ?? "0", 10) || 0));

  const [zone, events, tasks] = await Promise.all([
    readSetting(ownerId, SETTING_KEYS.timeZone),
    prisma.studyEvent.findMany({
      where: { ownerId },
      orderBy: [{ startMinute: "asc" }, { id: "asc" }],
      take: 200,
    }),
    prisma.task.findMany({
      where: { ownerId, dueAt: { not: null } },
      orderBy: [{ dueAt: "asc" }, { id: "asc" }],
      take: 200,
    }),
  ]);

  /*
    The learner's own zone, never the deployment's. A week boundary is their
    midnight: 22:00 UTC on a Sunday is Monday in Tallinn and still Sunday in
    New York, and a calendar that got that wrong would put a Monday class in
    the wrong column for half the world. See lib/time/day.ts.
  */
  const clock = dayClock(zone);
  const now = new Date();
  const days = weekOf(clock, now, offset);

  const rows: StudyEvent[] = events.map((e) => ({
    id: e.id,
    title: e.title,
    notes: e.notes,
    kind: kindFrom(e.kind),
    startMinute: e.startMinute,
    durationMinutes: e.durationMinutes,
    weekdays: e.weekdays,
    onDate: e.onDate,
  }));

  return (
    <Page
      title="Calendar"
      lead="Your Estonian week: classes, study slots and what is due."
    >
      <Stack>
        <CalendarWeek
          days={days}
          today={clock.dayKey(now)}
          offset={offset}
          events={rows}
          reminders={tasks.map((t) => ({
            id: t.id,
            title: t.title,
            notes: t.notes,
            // The day key rather than the instant, because `dueAt` is stored at
            // midnight UTC (that is what `<input type="date">` sends) and the
            // column it belongs in is a question about the learner's own day.
            dueKey: t.dueAt ? t.dueAt.toISOString().slice(0, 10) : null,
            completed: t.completed,
            /* A teacher's assignment is not the learner's to delete. */
            mine: t.classWeek === null,
          }))}
        />
      </Stack>
    </Page>
  );
}
