"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setRoundPace } from "@/app/actions";
import { ChoiceCard, ChoiceGroup } from "@/components/Choice";
import { ROUND_PACES, roundLength, secondsFor, type RoundPace } from "@/lib/ux/roundClock";

/** The Case Sprint's own base, which is the one most people meet first. */
const SPRINT_BASE_S = 60;

/**
 * How long a timed round runs.
 *
 * Each option says what it does to the sprint as well as what it is, because
 * "five times as long" is a ratio and "five minutes" is the thing somebody is
 * choosing. The quest stretches from its own two minutes by the same figure.
 */
export function RoundPacePanel({ current }: { current: RoundPace }) {
  const [value, setValue] = useState(current);
  const [pending, start] = useTransition();
  const router = useRouter();

  const pick = (next: RoundPace) => {
    setValue(next);
    start(async () => {
      await setRoundPace(next);
      router.refresh();
    });
  };

  return (
    <ChoiceGroup ariaLabel="How long a timed round runs" className="grid gap-2 sm:grid-cols-2">
      {ROUND_PACES.map((option) => (
        <ChoiceCard
          key={option.id}
          layout="stacked"
          disabled={pending}
          selected={value === option.id}
          onSelect={() => pick(option.id)}
          title={option.label}
          detail={`${roundLength(secondsFor(SPRINT_BASE_S, option.id))} in the sprint. ${option.detail}`}
        />
      ))}
    </ChoiceGroup>
  );
}
