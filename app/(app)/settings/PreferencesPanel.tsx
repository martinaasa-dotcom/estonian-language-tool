"use client";

import { useState, useTransition } from "react";
import { Keyboard, PenLine } from "lucide-react";
import { setLeaderboardPreferences, setReviewMode } from "@/app/actions";
import { Button } from "@/components/Button";
import { ChoiceCard, ChoiceGroup } from "@/components/Choice";
import type { ReviewMode } from "@/lib/settings/store";

const MODES: { value: ReviewMode; label: string; detail: string; icon: typeof PenLine }[] = [
  {
    value: "type",
    label: "Type the answer",
    detail: "Stronger recall, and near misses are explained: a dropped õ is told apart from a wrong word.",
    icon: PenLine,
  },
  {
    value: "flip",
    label: "Flip the card",
    detail: "Classic flashcards: see the front, judge yourself, grade it. Faster, easier to fool yourself with.",
    icon: Keyboard,
  },
];

export function ReviewModePanel({ current }: { current: ReviewMode }) {
  const [mode, setMode] = useState(current);
  const [, start] = useTransition();

  const pick = (next: ReviewMode) => {
    setMode(next);
    start(() => { void setReviewMode(next); });
  };

  return (
    <ChoiceGroup ariaLabel="How review asks" className="grid gap-2 sm:grid-cols-2">
      {MODES.map((m) => (
        <ChoiceCard
          key={m.value}
          layout="stacked"
          selected={mode === m.value}
          onSelect={() => pick(m.value)}
          icon={<m.icon size={16} aria-hidden />}
          title={m.label}
          detail={m.detail}
        />
      ))}
    </ChoiceGroup>
  );
}

/**
 * The class leaderboard opt-in.
 *
 * Off unless someone deliberately turns it on, and the name is theirs to choose
 * — no email, no Google account name, nothing they did not type here.
 */
export function LeaderboardPanel({ currentName, optedIn }: { currentName: string; optedIn: boolean }) {
  const [name, setName] = useState(currentName);
  const [joined, setJoined] = useState(optedIn);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = (next: boolean) => {
    start(async () => {
      const result = await setLeaderboardPreferences({ displayName: name, optIn: next });
      if (!result.ok) { setMessage(result.error); return; }
      setJoined(next);
      setMessage(next ? "You're on the board." : "Removed from the board.");
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="display-name" className="label-xs" style={{ color: "var(--ink-3)" }}>
        Name shown on the board
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="display-name"
          value={name}
          maxLength={32}
          onChange={(e) => setName(e.target.value)}
          placeholder="Whatever your class calls you"
          className="min-w-0 flex-1 rounded-[var(--r)] border px-3.5 py-2.5 text-base"
          style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
        />
        <Button
          variant={joined ? "secondary" : "primary"}
          disabled={pending || (!joined && name.trim().length === 0)}
          onClick={() => save(!joined)}
        >
          {joined ? "Leave the board" : "Join the board"}
        </Button>
      </div>
      {message && (
        <p role="status" className="text-xs" style={{ color: "var(--ink-3)" }}>{message}</p>
      )}
      <p className="text-xs" style={{ color: "var(--ink-3)" }}>
        Sharing this puts your chosen name and your XP for the week in front of everyone else who has
        opted in. Nothing else, not your email, not your words, not your history, is visible to
        them, and leaving removes you immediately.
      </p>
    </div>
  );
}
