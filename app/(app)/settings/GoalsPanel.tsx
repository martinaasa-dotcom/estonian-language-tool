"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { saveLearningGoals } from "@/app/actions";
import { Button } from "@/components/Button";
import { ChoiceChip, ChoiceGroup } from "@/components/Choice";
import { icon } from "@/components/icons";
import { DEADLINES, REASONS, TARGETS, deadlineFrom, reasonsFor, reasonsToStored, weeksUntil, type Goals } from "@/lib/assessment/goals";
import type { Band } from "@/lib/assessment/types";

/**
 * The goal answers, editable for ever.
 *
 * Asked at first run, and changeable here, because the honest answer to "why
 * are you learning Estonian" changes: somebody who started out of curiosity
 * applies for citizenship, somebody with a June exam moves it to November. The
 * plan on the level check screen is rebuilt from whatever is stored here, so
 * this is the one control that changes what the app tells you about your year.
 */
export function GoalsPanel({ current }: { current: Goals }) {
  // A set rather than one id: almost nobody is learning Estonian for one
  // reason, and first run asks it the same way.
  const [reasons, setReasons] = useState<string[]>(() => reasonsFor(current.reason).map((r) => r.id));
  const [target, setTarget] = useState<Band | null>(current.target);
  const [deadline, setDeadline] = useState<string | null>(current.deadline);
  const [days, setDays] = useState(current.daysPerWeek);
  const [note, setNote] = useState(current.note);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const weeks = weeksUntil(deadline, new Date());

  const save = () => {
    setSaved(false);
    start(async () => {
      await saveLearningGoals({ reason: reasonsToStored(reasons), target, deadline, daysPerWeek: days, note });
      setSaved(true);
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {/*
        Every one of these is a `ChoiceGroup` rather than a row of chips in
        buttons. The chips carried no border, no shadow and no hover, so the one
        screen that decides a learner's year read as a legend rather than a
        form, and the chosen answer was a hue shift of almost no luminance.
      */}
      <ChoiceGroup label="Why you are learning" hint="pick as many as are true" select="many">
        {REASONS.map((r) => {
          const Icon = icon(r.icon);
          const on = reasons.includes(r.id);
          return (
            <ChoiceChip
              key={r.id}
              selected={on}
              /* Pressing a chosen one again clears it: "none of these" is a
                 real answer, and the plan is honest about having no reason. */
              onSelect={() => setReasons((all) => on ? all.filter((id) => id !== r.id) : [...all, r.id])}
              icon={<Icon size={14} aria-hidden />}
            >
              {r.label}
            </ChoiceChip>
          );
        })}
      </ChoiceGroup>

      <ChoiceGroup label="Where you want to get to">
        {TARGETS.map((t) => (
          <ChoiceChip
            key={t.band}
            selected={target === t.band}
            onSelect={() => setTarget(t.band)}
            title={t.can}
          >
            {t.band} · {t.label}
          </ChoiceChip>
        ))}
      </ChoiceGroup>

      <ChoiceGroup label={`By when${weeks === null ? "" : ` · ${weeks} weeks away`}`}>
        {DEADLINES.map((d) => {
          const value = deadlineFrom(d, new Date());
          const on = value === null ? deadline === null : weeks !== null && Math.abs(weeks - (weeksUntil(value, new Date()) ?? 0)) <= 1;
          return (
            <ChoiceChip key={d.id} selected={on} onSelect={() => setDeadline(value)}>
              {d.label}
            </ChoiceChip>
          );
        })}
      </ChoiceGroup>

      <ChoiceGroup label="Days a week you practise">
        {[2, 3, 4, 5, 6, 7].map((n) => (
          <ChoiceChip key={n} even selected={days === n} onSelect={() => setDays(n)}>
            {n}
          </ChoiceChip>
        ))}
      </ChoiceGroup>

      <div>
        <label htmlFor="goal-note-setting" className="label-xs mb-2 block" style={{ color: "var(--ink-3)" }}>
          In your own words
        </label>
        <input
          id="goal-note-setting"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={280}
          placeholder="Something you want to be able to do"
          className="w-full rounded-[var(--r-lg)] border px-4 py-3 text-base"
          style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={save} disabled={pending}>
          {pending ? <><Loader2 size={14} className="animate-spin" aria-hidden /> Saving</> : "Save goals"}
        </Button>
        {saved && !pending && (
          <span className="flex items-center gap-1.5 text-sm" style={{ color: "var(--good-ink)" }}>
            <Check size={14} aria-hidden /> Saved
          </span>
        )}
      </div>
    </div>
  );
}
