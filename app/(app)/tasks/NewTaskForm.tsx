"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { createTask } from "@/app/actions";
import { Button } from "@/components/Button";
import { Card } from "@/components/ui";

const TAGS = [
  ["HOMEWORK", "Homework"],
  ["GRAMMAR", "Grammar"],
  ["VOCABULARY", "Vocabulary"],
  ["LISTENING", "Listening"],
  ["SPEAKING", "Speaking"],
] as const;

export function NewTaskForm() {
  const [title, setTitle] = useState("");
  const [tag, setTag] = useState<string>("HOMEWORK");
  const [dueAt, setDueAt] = useState("");
  const [week, setWeek] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const submit = () => {
    setError(null);
    start(async () => {
      const result = await createTask({
        title,
        tag,
        dueAt: dueAt || null,
        classWeek: week ? Number(week) : null,
      });
      if (!result.ok) setError(result.error ?? "Could not save that.");
      else {
        setTitle("");
        setDueAt("");
        /*
          `createTask` calls `revalidatePath("/tasks")`, which marks the cached
          render stale, and asking for the new one is a separate thing. Most of
          the time the action's response carries it and the list updates; twice
          in CI it did not, and a task that was saved was not on the screen
          fifteen seconds later, which for the reader is a task they have to
          type again. ClassForms, WeekPicker and AddUnitButton all ask for it
          out loud after a write; this form was the one that did not.
        */
        router.refresh();
      }
    });
  };

  const field = {
    borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)",
  } as const;
  const control = "rounded-full border px-4 py-2.5 text-sm outline-none";

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
          placeholder="What needs doing? e.g. Exercise 4B, partitive plural"
          aria-label="Task title"
          className="w-full rounded-[var(--r-lg)] border px-5 py-3 text-base outline-none"
          style={field}
        />
        <div className="flex flex-wrap gap-2">
          <select
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            aria-label="Task type"
            className={control}
            style={field}
          >
            {TAGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            aria-label="Due date"
            className={control}
            style={field}
          />
          <input
            type="number"
            min={1}
            max={60}
            value={week}
            onChange={(e) => setWeek(e.target.value)}
            placeholder="Week"
            aria-label="Class week"
            className={`w-24 ${control}`}
            style={field}
          />
          <Button variant="primary" onClick={submit} disabled={pending || !title.trim()}>
            <Plus size={15} aria-hidden /> Add
          </Button>
        </div>
        {error && <p className="text-xs" style={{ color: "var(--again-ink)" }}>{error}</p>}
      </div>
    </Card>
  );
}
