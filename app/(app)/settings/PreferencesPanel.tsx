"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Keyboard, PenLine } from "lucide-react";
import { setLeaderboardPreferences, setLetterBar, setReviewMode } from "@/app/actions";
import { Button } from "@/components/Button";
import { ChoiceCard, ChoiceGroup } from "@/components/Choice";
import { LetterSample } from "@/components/DiacriticBar";
import type { ReviewMode } from "@/lib/settings/store";
import { LETTER_BAR_CHOICES, type LetterBar } from "@/lib/ux/letterBar";

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
 * The Estonian letter bar, on or off.
 *
 * The one screen that can turn it back on, so it is worth it being findable:
 * the bar itself carries the way out, and somebody who took it needs somewhere
 * obvious to change their mind. It draws the six letters it is talking about
 * rather than naming them, because "the diacritic bar" means nothing to
 * somebody who has met it once under a text box.
 *
 * The whole section is `letters-choice`, which is the same media query the bar
 * is drawn under. On a phone there is no bar and so no question, and a heading
 * over an answered-for-you choice is worse than no heading.
 */
export function LetterBarPanel({ current }: { current: LetterBar }) {
  const [value, setValue] = useState(current);
  const [pending, start] = useTransition();
  const root = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const pick = (next: LetterBar) => {
    setValue(next);
    // The bars on this very page, immediately. The refresh re-renders the same
    // attribute from the setting a moment later, so the two cannot disagree.
    root.current?.closest("[data-letters]")?.setAttribute("data-letters", next);
    start(async () => {
      await setLetterBar(next);
      router.refresh();
    });
  };

  return (
    <div ref={root}>
      <ChoiceGroup ariaLabel="Typing Estonian" className="grid gap-2 sm:grid-cols-2">
        {LETTER_BAR_CHOICES.map((o) => (
          <ChoiceCard
            key={o.value}
            layout="stacked"
            disabled={pending}
            selected={value === o.value}
            onSelect={() => pick(o.value)}
            title={o.label}
            detail={<><LetterSample lit={o.value === "on"} />{o.detail}</>}
          />
        ))}
      </ChoiceGroup>
    </div>
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
