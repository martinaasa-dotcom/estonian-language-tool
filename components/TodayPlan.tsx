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
export function TodayPlan({ tasks, clock, now, className }: {
  tasks: TaskView[];
  clock: DayClock;
  now: Date;
  className?: string;
}) {
  const groups: AgendaGroup<TaskView>[] = agenda(tasks, dueDate, clock, now, SHOWN);
  // The count worth putting beside a heading is the one that costs something.
  const late = overdueCount(tasks, dueDate, clock, now);

  return (
    <Card className={className}>
      <SectionTitle
        hint={late > 0 ? `${late} late` : tasks.length > 0 ? `${tasks.length} left` : undefined}
      >
        On today
      </SectionTitle>


      {tasks.length === 0 ? (
        <Empty />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <div key={group.bucket}>
              {/*
                The late group gets no heading, which is the one exception and
                the reason for it is that a heading has to add something. The
                panel's own hint counts them and every row underneath says
                "Overdue" against its date. That is twice; a heading and the
                chip that used to sit on each row made it four.
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

        </div>
      )}
    </Card>
  );
}

/** Everything Today fetched, since there is no longer a second page to send the rest to. */
const SHOWN = 12;

/** `TaskView` carries its date as the ISO string a client component can hold. */
const dueDate = (task: TaskView) => (task.dueAt ? new Date(task.dueAt) : null);

/**
 * The empty state, which is the one most people see and so is the one worth
 * writing properly. It says what the panel is for rather than that it is empty.
 */
function Empty() {
  return (
    <p className="text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
      Nothing from your class is waiting. When a teacher assigns a unit, it turns up here on the
      morning it is due.
    </p>
  );
}
