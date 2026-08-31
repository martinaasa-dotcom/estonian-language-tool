import Link from "next/link";
import { ArrowRight, CalendarRange } from "lucide-react";
import { agenda, overdueCount, type AgendaGroup } from "@/lib/ux/agenda";
import type { DayClock } from "@/lib/time/day";
import { Card, SectionTitle } from "@/components/ui";
import { TaskRow, type TaskView } from "@/components/TaskRow";

/**
 * WHAT TODAY ACTUALLY ASKS OF YOU.
 *
 * This was a flat list of four tasks ordered by date, with each date printed
 * small on its own row, which is a correct list and is not the answer to the
 * question somebody opens the home page with. Reading it meant reading four
 * dates and working out which of them had already gone, and the one that was a
 * week late looked exactly like the one due on Friday.
 *
 * Headings instead, from `lib/ux/agenda.ts`, late first. Late is the only kind
 * of task that gets worse while you look at it, so it goes at the top and it
 * says so in words rather than in a colour: a red date is not a heading, and a
 * hue that has to carry the whole distinction is the thing the design system
 * forbids.
 *
 * It shows five rows at most and says how many it did not show. A home page
 * panel that grows without limit is a page nobody scrolls to the bottom of, and
 * "and four more" with a way through is the honest shape.
 */
export function TodayPlan({ tasks, classWeek, clock, now, className }: {
  tasks: TaskView[];
  /**
   * The week of their course the learner says they are in, when they have said.
   *
   * It sits here rather than in a panel of its own because this card is already
   * "what is due", and the week is the frame that puts a date on it: a row
   * saying "Week 6" means nothing next to a learner who has lost track of which
   * week they are in. `lib/ux/nav.ts` says the class week lives inside Tasks,
   * and one line here is a signpost to it rather than a second door.
   */
  classWeek: number | null;
  clock: DayClock;
  now: Date;
  className?: string;
}) {
  const groups: AgendaGroup<TaskView>[] = agenda(tasks, dueDate, clock, now, SHOWN);
  const shown = groups.reduce((sum, g) => sum + g.items.length, 0);
  const rest = tasks.length - shown;
  // The count worth putting beside a heading is the one that costs something.
  const late = overdueCount(tasks, dueDate, clock, now);

  return (
    <Card className={className}>
      <SectionTitle
        hint={late > 0 ? `${late} late` : tasks.length > 0 ? `${tasks.length} outstanding` : undefined}
      >
        On today
      </SectionTitle>

      {classWeek !== null && (
        <Link
          href={`/week/${classWeek}`}
          className="tap-tint -mx-1 mb-3 inline-flex items-center gap-1.5 rounded-[var(--r)] px-1 py-0.5 text-sm font-semibold"
          style={{ color: "var(--accent-deep)" }}
        >
          <CalendarRange size={14} aria-hidden />
          Week {classWeek} of your course
          <ArrowRight size={13} aria-hidden />
        </Link>
      )}

      {tasks.length === 0 ? (
        <Empty classWeek={classWeek} />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <div key={group.bucket}>
              {/*
                The late group gets no heading, which is the one exception and
                the reason for it is that a heading has to add something. The
                panel's own hint counts them, and every row underneath already
                says "Overdue" against its date and carries a chip saying the
                same. A fourth sighting of one fact is noise.
              */}
              {group.bucket !== "overdue" && (
                <h3 className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>{group.label}</h3>
              )}
              <ul className="flex flex-col gap-2">
                {group.items.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </ul>
            </div>
          ))}

          <Link
            href="/tasks"
            className="inline-flex items-center gap-1.5 text-sm font-semibold"
            style={{ color: "var(--accent-deep)" }}
          >
            {rest > 0 ? `${rest} more, and everything else` : "All your tasks"}
            <ArrowRight size={13} aria-hidden />
          </Link>
        </div>
      )}
    </Card>
  );
}

/** Five rows, which is about a screen of a phone before anything else is reached. */
const SHOWN = 5;

/** `TaskView` carries its date as the ISO string a client component can hold. */
const dueDate = (task: TaskView) => (task.dueAt ? new Date(task.dueAt) : null);

/**
 * The empty state, which is the one most people see and so is the one worth
 * writing properly. It says what the panel is for rather than that it is empty.
 */
function Empty({ classWeek }: { classWeek: number | null }) {
  return (
    <p className="text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
      {classWeek === null ? "Nothing written down for today. If you are in a class, " : "Nothing written down for today. "}
      <Link href="/tasks" className="font-semibold underline underline-offset-2" style={{ color: "var(--accent-deep)" }}>
        put this week&rsquo;s homework here
      </Link>{" "}
      and it turns up on this page on the morning it is due.
    </p>
  );
}
