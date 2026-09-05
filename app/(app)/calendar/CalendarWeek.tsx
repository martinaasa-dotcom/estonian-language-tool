"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellPlus, CalendarPlus, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { Button } from "@/components/Button";
import { Card, SectionTitle } from "@/components/ui";
import { ChoiceChip, ChoiceGroup } from "@/components/Choice";
import { addReminder, addStudyEvent, deleteReminder, deleteStudyEvent } from "@/app/actions";
import {
  EVENT_KINDS, KIND_LABEL, KIND_TONE, WEEKDAY_LONG, WEEKDAY_SHORT,
  eventsOn, repeatLabel, span, weekdayOf, type EventKind, type StudyEvent,
} from "@/lib/ux/schedule";

export interface Reminder {
  id: string;
  title: string;
  notes: string | null;
  dueKey: string | null;
  completed: boolean;
  mine: boolean;
}

/**
 * A week, one column per day, with a form under it.
 *
 * A WEEK RATHER THAN A MONTH, and that is the whole layout decision. What a
 * learner asked this for is "class on Monday and Wednesday, homework on Tuesday
 * and Thursday", which is a question about a week; a month grid answers "what
 * is the 14th" instead, and it cannot show a time without a cell so small
 * nothing fits in it. A week also survives a phone, where a month does not: the
 * columns stack.
 *
 * Times are minutes from midnight and are drawn as written text rather than as
 * a positioned grid of hours. An hour grid is what a desktop calendar draws and
 * it needs the height of a screen to be readable; this is a list per day, which
 * says the same thing in the space a phone has.
 */
export function CalendarWeek({
  days, today, offset, events, reminders,
}: {
  days: string[];
  today: string;
  offset: number;
  events: StudyEvent[];
  reminders: Reminder[];
}) {
  /*
    WHICH BUTTON OPENED IT, NOT WHETHER ONE DID.

    The panel is one form for both shapes and that is still the right call: a
    learner adding "class, Mondays, six o'clock" and one adding "hand in the
    essay on Friday" are doing the same thing. What was wrong was the door.
    There was one button and it said "Add to this week", so somebody looking
    for a task or a reminder saw neither word anywhere on the screen and
    reported the calendar as having no way to add one. Both words are on the
    second button, because they are the same row (`Task`) under two names and
    which one somebody reaches for is not ours to decide.

    So two buttons onto one form, each landing it on the right kind. `null`
    means the form is closed.
  */
  const [adding, setAdding] = useState<EventKind | "REMINDER" | null>(null);

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle hint={weekLabel(days, offset)}>This week</SectionTitle>
          <div className="flex items-center gap-2">
            <WeekStep to={offset - 1} label="Previous week"><ChevronLeft size={16} aria-hidden /></WeekStep>
            {offset !== 0 && (
              <Link href="/calendar" className="tap-tint rounded-full px-3 py-1.5 text-xs font-semibold"
                style={{ color: "var(--accent-deep)" }}>
                Today
              </Link>
            )}
            <WeekStep to={offset + 1} label="Next week"><ChevronRight size={16} aria-hidden /></WeekStep>
          </div>
        </div>

        {/*
        SEVEN COLUMNS NEED THE WIDTH FOR SEVEN COLUMNS, and at 768 they do not
        have it. Measured: the week grid there gives each day card so little
        room that an event row comes out **17 pixels wide**, and the delete
        button inside it is 44, which is the tap-target floor and not
        negotiable, so the icon was drawn 13px outside the row it belongs to.
        `scripts/test-containment.mjs` failed on it four times over, at 768 in
        both passes and at 360 in both themes.

        A week is a list of days before it is a grid of them, so below the
        width where the grid is honest it stays a list, which is what a phone
        already showed. 1280 is where seven columns first leave room for a
        title beside the control: at 1024 the row is 55px and the button and
        its gap take 50 of them.
      */}
      <div className="mt-4 grid gap-2 xl:grid-cols-7">
          {days.map((key) => (
            <DayColumn
              key={key}
              dayKey={key}
              isToday={key === today}
              events={eventsOn(events, key)}
              reminders={reminders.filter((r) => r.dueKey === key)}
            />
          ))}
        </div>
      </Card>

      {adding ? (
        <AddPanel days={days} opensAs={adding} onDone={() => setAdding(null)} />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="lg" onClick={() => setAdding("REMINDER")}>
            <BellPlus size={16} aria-hidden /> Add a task or reminder
          </Button>
          {/*
            A reminder is a `Task`, which is the row Today already draws and
            `lib/ux/agenda.ts` already buckets, so a note written here lands
            where a teacher's assignment does rather than in a second list
            beside it. Which is exactly why it needs its own button: the two
            are one form and two different things to want.
          */}
          <Button variant="primary" size="lg" onClick={() => setAdding("CLASS")}>
            <CalendarPlus size={16} aria-hidden /> Add a class or study slot
          </Button>
        </div>
      )}
    </>
  );
}

function WeekStep({ to, label, children }: { to: number; label: string; children: React.ReactNode }) {
  return (
    <Link
      href={to === 0 ? "/calendar" : `/calendar?w=${to}`}
      aria-label={label}
      className="tap-tint flex min-h-11 min-w-11 items-center justify-center rounded-full"
      style={{ color: "var(--ink-2)" }}
    >
      {children}
    </Link>
  );
}

function DayColumn({ dayKey, isToday, events, reminders }: {
  dayKey: string; isToday: boolean; events: StudyEvent[]; reminders: Reminder[];
}) {
  const weekday = weekdayOf(dayKey);
  const empty = events.length === 0 && reminders.length === 0;

  return (
    <div
      // A stable hook for the suite, because "the third div in the grid" is a
      // fact about today's markup and this page has several grids on it.
      data-day={dayKey}
      /*
        `min-w-0`, because a grid item's automatic minimum is its min-content
        and this card's min-content is the longest event title on it: a
        `truncate` paragraph is `white-space: nowrap`, and `overflow: hidden`
        clips what is drawn without reducing what the box asks for. So one long
        title made every day in the week 382px wide inside a 360px phone, and
        the `min-w-0` already on the text block could not help, since that
        floors a flex item rather than capping what the column is sized to.
        The same fault the shell had against `main`, one container in.
      */
      className="min-w-0 rounded-[var(--r)] border p-2.5"
      style={{
        borderColor: isToday ? "var(--accent)" : "var(--rule-soft)",
        background: isToday ? "var(--accent-soft)" : "var(--surface)",
      }}
    >
      <p className="label-xs" style={{ color: isToday ? "var(--accent-deep)" : "var(--ink-3)" }}>
        {/* The short name is for a column, so it arrives with the columns. */}
        <span className="xl:hidden">{WEEKDAY_LONG[weekday]}</span>
        <span className="hidden xl:inline">{WEEKDAY_SHORT[weekday]}</span>{" "}
        {Number(dayKey.slice(8, 10))}
      </p>

      <ul className="mt-2 flex flex-col gap-1.5">
        {events.map((e) => <EventRow key={e.id} event={e} />)}
        {reminders.map((r) => <ReminderRow key={r.id} reminder={r} />)}
      </ul>

      {/* Said plainly rather than left blank: an empty column and a column that
          failed to load look the same, and on a phone the difference matters. */}
      {empty && <p className="mt-1 text-2xs" style={{ color: "var(--ink-3)" }}>Nothing</p>}
    </div>
  );
}

function EventRow({ event }: { event: StudyEvent }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <li
      className="rounded-[var(--r-sm)] px-2 py-1.5"
      style={{ background: `var(--${KIND_TONE[event.kind]}-soft)` }}
    >
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold" style={{ color: "var(--ink)" }}>{event.title}</p>
          <p className="text-2xs" style={{ color: "var(--ink-2)" }}>
            {span(event.startMinute, event.durationMinutes)}
          </p>
        </div>
        <button
          type="button"
          aria-label={`Remove ${event.title}`}
          disabled={pending}
          onClick={() => start(async () => { await deleteStudyEvent(event.id); router.refresh(); })}
          className="tap-tint rounded-full p-1"
          style={{ color: "var(--ink-3)" }}
        >
          <Trash2 size={12} aria-hidden />
        </button>
      </div>
      {event.notes && <p className="mt-0.5 text-2xs" style={{ color: "var(--ink-3)" }}>{event.notes}</p>}
    </li>
  );
}

function ReminderRow({ reminder }: { reminder: Reminder }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <li className="rounded-[var(--r-sm)] px-2 py-1.5" style={{ background: "var(--raised)" }}>
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0">
          <p
            className="truncate text-xs font-semibold"
            style={{
              color: reminder.completed ? "var(--ink-3)" : "var(--ink)",
              textDecoration: reminder.completed ? "line-through" : undefined,
            }}
          >
            {reminder.title}
          </p>
          {/*
            Plain text rather than a `Chip`, which the containment sweep caught
            bleeding 11px out of this row at 768px. A week column at that width
            is about ninety pixels and a chip is a padded inline-flex box with
            an intrinsic minimum: it cannot shrink into the space, so it hangs
            out of it. The row already says what it is by where it sits.

            Block and truncating rather than inline, and without the uppercase
            tracking the first attempt kept: an inline run still measured 2px
            over, because `min-w-0` lets the column shrink and does nothing
            about the text inside it. `truncate` is a way out somebody chose,
            which is what the sweep accepts.
          */}
          <span
            className="block truncate text-2xs font-semibold"
            style={{ color: reminder.completed ? "var(--good-ink)" : "var(--hard-ink)" }}
          >
            {reminder.completed ? "Done" : "To do"}
          </span>
        </div>
        {reminder.mine && (
          <button
            type="button"
            aria-label={`Remove ${reminder.title}`}
            disabled={pending}
            onClick={() => start(async () => { await deleteReminder(reminder.id); router.refresh(); })}
            className="tap-tint rounded-full p-1"
            style={{ color: "var(--ink-3)" }}
          >
            <Trash2 size={12} aria-hidden />
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * One form for both shapes, because a learner adding "class, Mondays, six
 * o'clock" and one adding "hand in the essay on Friday" are doing the same
 * thing and should not have to find two buttons for it.
 *
 * What tells them apart is whether any weekday is ticked: repeat days make it
 * an event, and no repeat days plus a date makes it a reminder unless a time
 * was given, in which case it is a one-off event. That is stated on the screen
 * rather than inferred silently.
 */
function AddPanel({ days, opensAs, onDone }: {
  days: string[];
  /** Which button opened it, so the form lands on what was asked for. */
  opensAs: EventKind | "REMINDER";
  onDone: () => void;
}) {
  const [kind, setKind] = useState<EventKind | "REMINDER">(opensAs);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("18:00");
  const [minutes, setMinutes] = useState(90);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [date, setDate] = useState(days[0] ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const isReminder = kind === "REMINDER";

  const submit = () => {
    setError(null);
    start(async () => {
      const result = isReminder
        ? await addReminder({ title, dueAt: date })
        : await addStudyEvent({
            title,
            kind,
            startMinute: minuteOf(time),
            durationMinutes: minutes,
            weekdays,
            onDate: weekdays.length > 0 ? null : date,
          });
      if (!result.ok) {
        setError(("error" in result && result.error) || "That did not save.");
        return;
      }
      setTitle("");
      setWeekdays([]);
      router.refresh();
      onDone();
    });
  };

  return (
    <Card>
      <SectionTitle hint="classes, study slots, things due">
        {isReminder ? "Add a task or reminder" : "Add to your week"}
      </SectionTitle>

      <ChoiceGroup ariaLabel="What kind of thing" className="mt-3 flex flex-wrap gap-2">
        {EVENT_KINDS.map((k) => (
          <ChoiceChip key={k} selected={kind === k} onSelect={() => setKind(k)}>
            {KIND_LABEL[k]}
          </ChoiceChip>
        ))}
        <ChoiceChip selected={isReminder} onSelect={() => setKind("REMINDER")}>Task or reminder</ChoiceChip>
      </ChoiceGroup>

      <label className="mt-4 block">
        <span className="label-xs" style={{ color: "var(--ink-3)" }}>What is it</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={isReminder ? "Hand in the essay" : "Eesti keel B1"}
          className="mt-1 w-full rounded-[var(--r)] border px-3 py-2.5 text-base"
          style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
        />
      </label>

      {!isReminder && (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label-xs" style={{ color: "var(--ink-3)" }}>Starts</span>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="mt-1 w-full rounded-[var(--r)] border px-3 py-2.5 text-base"
                style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
              />
            </label>
            <label className="block">
              <span className="label-xs" style={{ color: "var(--ink-3)" }}>For how long</span>
              <select
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                className="mt-1 w-full rounded-[var(--r)] border px-3 py-2.5 text-base"
                style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
              >
                {[30, 45, 60, 90, 120, 180].map((m) => (
                  <option key={m} value={m}>{m < 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? "" : "s"}`}</option>
                ))}
              </select>
            </label>
          </div>

          <p className="mt-4 label-xs" style={{ color: "var(--ink-3)" }}>Repeats on</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={weekdays.includes(d)}
                onClick={() => setWeekdays((w) => w.includes(d) ? w.filter((x) => x !== d) : [...w, d])}
                className="choice-btn min-h-11 rounded-full px-3 text-sm font-semibold"
                style={weekdays.includes(d)
                  ? { ["--choice-bg" as string]: "var(--accent-soft)", color: "var(--accent-deep)" }
                  : undefined}
              >
                {WEEKDAY_SHORT[d]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs" style={{ color: "var(--ink-3)" }}>
            {weekdays.length > 0 ? repeatLabel(weekdays) : "Leave these blank for a one-off, and pick a date."}
          </p>
        </>
      )}

      {(isReminder || weekdays.length === 0) && (
        <label className="mt-3 block">
          <span className="label-xs" style={{ color: "var(--ink-3)" }}>
            {isReminder ? "Due" : "On"}
          </span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full max-w-full rounded-[var(--r)] border px-3 py-2.5 text-base"
            style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
          />
        </label>
      )}

      {error && (
        <p className="mt-3 text-sm" style={{ color: "var(--again-ink)" }} role="status">{error}</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={onDone} disabled={pending}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={pending || !title.trim()}>
          {pending ? "Saving" : "Add it"}
        </Button>
      </div>
    </Card>
  );
}

/** "18:30" to minutes from midnight. Anything else is six in the evening. */
function minuteOf(value: string): number {
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 18 * 60;
  return Math.min(1439, Math.max(0, (h ?? 0) * 60 + (m ?? 0)));
}

/** "1 to 7 September", the week a column of days covers. */
function weekLabel(days: string[], offset: number): string {
  const first = days[0];
  const last = days[6];
  if (!first || !last) return "";
  const when = offset === 0 ? "this week" : offset < 0 ? `${-offset} back` : `${offset} ahead`;
  return `${first.slice(5)} to ${last.slice(5)} · ${when}`;
}
