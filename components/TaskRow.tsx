"use client";

import { useTransition } from "react";
import { Check, Trash2 } from "lucide-react";
import { deleteTask, toggleTask } from "@/app/actions";
import { Chip } from "@/components/ui";

export interface TaskView {
  id: string;
  title: string;
  tag: string;
  completed: boolean;
  classWeek: number | null;
  dueAt: string | null;
}

const TAG_LABEL: Record<string, string> = {
  HOMEWORK: "Homework",
  GRAMMAR: "Grammar",
  VOCABULARY: "Vocabulary",
  LISTENING: "Listening",
  SPEAKING: "Speaking",
};

export function TaskRow({ task, showDelete }: { task: TaskView; showDelete?: boolean }) {
  const [pending, start] = useTransition();
  const due = task.dueAt ? new Date(task.dueAt) : null;
  const overdue = due !== null && !task.completed && due < new Date();

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
          className="truncate text-[14.5px]"
          style={{
            color: task.completed ? "var(--ink-3)" : "var(--ink)",
            textDecoration: task.completed ? "line-through" : "none",
          }}
        >
          {task.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]" style={{ color: "var(--ink-3)" }}>
          <span>{TAG_LABEL[task.tag] ?? task.tag}</span>
          {task.classWeek !== null && <span>Week {task.classWeek}</span>}
          {due && (
            <span style={{ color: overdue ? "var(--again)" : undefined }}>
              {overdue ? "Overdue · " : "Due "}
              {due.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
            </span>
          )}
        </div>
      </div>

      {overdue && <Chip tone="again">Late</Chip>}

      {showDelete && (
        <button
          type="button"
          onClick={() => start(() => void deleteTask(task.id))}
          aria-label={`Delete task "${task.title}"`}
          className="shrink-0 rounded p-1.5 transition-opacity hover:opacity-60"
          style={{ color: "var(--ink-3)" }}
        >
          <Trash2 size={15} aria-hidden />
        </button>
      )}
    </li>
  );
}
