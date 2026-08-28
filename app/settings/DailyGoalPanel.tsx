"use client";

import { useState, useTransition } from "react";
import { setDailyGoal } from "@/app/actions";
import { Chip } from "@/components/ui";

const PRESETS = [
  { label: "Casual", value: 10 },
  { label: "Regular", value: 15 },
  { label: "Serious", value: 25 },
  { label: "Intense", value: 40 },
] as const;

export function DailyGoalPanel({ currentGoal }: { currentGoal: number }) {
  const [goal, setGoal] = useState(currentGoal);
  const [pending, startTransition] = useTransition();

  const pick = (value: number) => {
    setGoal(value);
    startTransition(() => { void setDailyGoal(value); });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((p) => (
        <button
          key={p.value}
          type="button"
          disabled={pending}
          onClick={() => pick(p.value)}
          aria-pressed={goal === p.value}
        >
          <Chip tone={goal === p.value ? "accent" : "neutral"}>
            {p.label} · {p.value}/day
          </Chip>
        </button>
      ))}
    </div>
  );
}
