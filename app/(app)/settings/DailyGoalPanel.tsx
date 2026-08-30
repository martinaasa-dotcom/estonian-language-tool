"use client";

import { useState, useTransition } from "react";
import { setDailyGoal } from "@/app/actions";
import { ChoiceChip, ChoiceGroup } from "@/components/Choice";

const PRESETS = [
  { label: "Casual", value: 10 },
  { label: "Regular", value: 15 },
  { label: "Serious", value: 25 },
  { label: "Intense", value: 40 },
] as const;

export function DailyGoalPanel({ currentGoal }: { currentGoal: number }) {
  const [goal, setGoal] = useState(currentGoal);
  const [, startTransition] = useTransition();

  const pick = (value: number) => {
    setGoal(value);
    startTransition(() => { void setDailyGoal(value); });
  };

  return (
    /*
      No `disabled` while the write is in flight. The chosen preset is local
      state and moves on the click, so disabling the row only made the answer
      you just gave un-hoverable for a moment, which reads as the control
      breaking rather than as it working.
    */
    <ChoiceGroup ariaLabel="Daily goal" className="flex flex-wrap items-center gap-2">
      {PRESETS.map((p) => (
        <ChoiceChip key={p.value} selected={goal === p.value} onSelect={() => pick(p.value)}>
          {p.label} · {p.value}/day
        </ChoiceChip>
      ))}
    </ChoiceGroup>
  );
}
