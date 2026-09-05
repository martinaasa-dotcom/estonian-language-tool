"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, EyeOff, Keyboard, PenLine } from "lucide-react";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import {
  setClassDisplayName, setLetterBar, setResearchParticipation, setReviewMode,
} from "@/app/actions";
import { Button } from "@/components/Button";
import { ChoiceCard, ChoiceGroup } from "@/components/Choice";
import { LetterSample } from "@/components/DiacriticBar";
import type { ReviewMode } from "@/lib/settings/store";
import { LETTER_BAR_CHOICES, type LetterBar } from "@/lib/ux/letterBar";
import type { Participation } from "@/lib/research/participation";

const MODES: { value: ReviewMode; label: string; detail: string; icon: typeof PenLine }[] = [
  {
    value: "type",
    label: "Type the answer",
    detail: "Stronger recall. Near misses get explained too, so a dropped õ isn't marked the same as a wrong word.",
    icon: PenLine,
  },
  {
    value: "flip",
    label: "Pick the answer",
    /*
      IT NO LONGER SAYS "JUDGE YOURSELF", BECAUSE IT NO LONGER DOES.

      This read "Classic flashcards: see the front, judge yourself, grade it.
      Faster, easier to fool yourself with", and the last four words were the
      problem rather than the honesty. A card whose answer the dictionary
      vouches for is marked by the app now, whichever option is chosen here,
      and this one asks for a tap instead of typing rather than asking for a
      verdict. See `askFor`.
    */
    detail: "Four forms of the same word, one tap. Lighter than typing on a phone, and still marked for you.",
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
 * The name a class sees.
 *
 * This was an opt-in to a board of everybody on the deployment who had ticked
 * the same box, and that board is gone: sign-up here is open, so it drew a
 * table of strangers ranked by owner id, and it was the one surface where a
 * stranger chose what every other stranger read. See the note in
 * `app/(app)/progress/page.tsx`.
 *
 * What is left is the half that was always real. A class board shows the name
 * typed here rather than a Google account name, so being on one never means
 * publishing an email address or a legal name nobody chose to share, and
 * joining the class is the consent (ADR-019). There is nothing to opt into
 * from this screen any more, which is why the button went with the board.
 */
export function ClassNamePanel({ currentName }: { currentName: string }) {
  const [name, setName] = useState(currentName);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () => {
    start(async () => {
      const result = await setClassDisplayName({ displayName: name });
      setMessage(result.ok ? "Saved." : result.error);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="display-name" className="label-xs" style={{ color: "var(--ink-3)" }}>
        Name your class sees
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="display-name"
          value={name}
          maxLength={32}
          onChange={(e) => setName(e.target.value)}
          placeholder="Whatever your class calls you"
          className="field min-w-0 flex-1 text-base"
          style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
        />
        <Button
          variant="primary"
          disabled={pending || name.trim() === currentName.trim()}
          onClick={save}
        >
          Save
        </Button>
      </div>
      {message && (
        <p role="status" className="text-xs" style={{ color: "var(--ink-3)" }}>{message}</p>
      )}
      <p className="text-xs" style={{ color: "var(--ink-3)" }}>
        Used to greet you, and shown beside your XP for the week if you join a class. Nothing else,
        not your email, not your words, not your history, goes with it. Leaving the class takes it
        back off.
      </p>
    </div>
  );
}

const PARTICIPATION: { value: Participation; label: string; detail: string; icon: typeof BarChart3 }[] = [
  {
    value: "in",
    label: "Count my answers",
    detail:
      "Adds them to the totals. Nothing is published that fewer than ten people are behind, and nothing in it can be traced back to one person.",
    icon: BarChart3,
  },
  {
    value: "out",
    label: "Leave mine out",
    detail:
      "Your answers are skipped when the totals are worked out. Everything else in the app carries on exactly as it did.",
    icon: EyeOff,
  },
];

/**
 * Whether this learner's answers are counted in the anonymous statistics.
 *
 * Two cards rather than a switch, because "on" and "off" do not say what is
 * being turned off, and this is the one setting on the page where somebody may
 * want to read a sentence before deciding. Both sides are stated in what they
 * do rather than in what they protect: a card that says "protect my privacy"
 * against one that says "help research" is not a choice, it is a nudge with two
 * labels on it.
 */
export function ResearchPanel({ current, exported }: { current: Participation; exported: boolean }) {
  const [value, setValue] = useState(current);
  const [, start] = useTransition();

  const pick = (next: Participation) => {
    setValue(next);
    start(() => { void setResearchParticipation(next); });
  };

  return (
    <div className="flex flex-col gap-3">
      <ChoiceGroup ariaLabel="Anonymous statistics" className="grid gap-2 sm:grid-cols-2">
        {PARTICIPATION.map((p) => (
          <ChoiceCard
            key={p.value}
            layout="stacked"
            selected={value === p.value}
            onSelect={() => pick(p.value)}
            icon={<p.icon size={16} aria-hidden />}
            title={p.label}
            detail={p.detail}
          />
        ))}
      </ChoiceGroup>
      <p className="text-xs" style={{ color: "var(--ink-3)" }}>
        {exported
          ? "Which grammar learners here get wrong, counted across everybody, so that whoever teaches Estonian can see it. Which case, which stem change, which word. Never your deck, your searches or a single answer."
          : "This installation is not set up to produce those totals, so nothing is being counted anywhere. Your answer is kept in case that changes."}{" "}
        <Link href="/privacy" className="underline underline-offset-2">How this works</Link>.
      </p>
    </div>
  );
}
