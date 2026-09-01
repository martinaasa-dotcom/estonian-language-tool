"use client";

import { useTransition } from "react";
import { Check } from "lucide-react";
import { toggleTask } from "@/app/actions";
import { Chip } from "@/components/ui";
import { bucketFor } from "@/lib/ux/agenda";
import { dayClock } from "@/lib/time/day";

export interface TaskView {
  id: string;
  title: string;
  tag: string;
  completed: boolean;
  dueAt: string | null;
}

const TAG_LABEL: Record<string, string> = {
  HOMEWORK: "Homework",
  GRAMMAR: "Grammar",
  VOCABULARY: "Vocabulary",
  LISTENING: "Listening",
  SPEAKING: "Speaking",
};

export function TaskRow({ task }: { task: TaskView }) {
  const [pending, start] = useTransition();
  const due = task.dueAt ? new Date(task.dueAt) : null;
  /*
    Late by the calendar, not by the clock, and through the same function the
    agenda headings use so a row and the heading above it cannot disagree.

    `due < new Date()` was the old rule and it was wrong every single day. A due
    date is typed into `<input type="date">` and stored at midnight UTC, so a
    task due today was already "Overdue" at three in the morning in Tallinn, and
    at midnight anywhere. Something due today is due today.

    `dayClock()` with no zone is the process's, which in a client component is
    the browser's, which is the learner's. That is the one place in this app
    where reaching for the process clock is the correct thing to do.
  */
  const overdue = !task.completed && bucketFor(due, dayClock(), new Date()) === "overdue";

  return (
    <li
      className="lift flex items-center gap-3 rounded-[var(--r-lg)] border px-4 py-3.5"
      style={{
        borderColor: "var(--rule)", background: "var(--surface)",
        boxShadow: "var(--shadow-sm)", opacity: pending ? 0.5 : 1,
      }}
    >
      <button
        type="button"
        onClick={() => start(() => void toggleTask(task.id))}
        aria-label={task.completed ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
        className="press flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
        style={{
          borderColor: task.completed ? "var(--good)" : "var(--rule)",
          background: task.completed ? "var(--good)" : "transparent",
        }}
      >
        {task.completed && <Check size={13} strokeWidth={3} color="var(--surface)" aria-hidden />}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className="truncate text-base"
          style={{
            color: task.completed ? "var(--ink-3)" : "var(--ink)",
            textDecoration: task.completed ? "line-through" : "none",
          }}
        >
          {task.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: "var(--ink-3)" }}>
          <span>{TAG_LABEL[task.tag] ?? task.tag}</span>
          {due && (
            <span style={{ color: overdue ? "var(--again-ink)" : undefined }}>
              {overdue ? "Overdue · " : "Due "}
              {due.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
            </span>
          )}
        </div>
      </div>

      {overdue && <Chip tone="again">Late</Chip>}

    </li>
  );
}
