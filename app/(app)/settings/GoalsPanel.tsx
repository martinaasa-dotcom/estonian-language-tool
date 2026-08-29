"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { saveLearningGoals } from "@/app/actions";
import { Button } from "@/components/Button";
import { icon } from "@/components/icons";
import { Chip } from "@/components/ui";
import { DEADLINES, REASONS, TARGETS, deadlineFrom, weeksUntil, type Goals } from "@/lib/assessment/goals";
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
  const [reason, setReason] = useState(current.reason);
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
      await saveLearningGoals({ reason, target, deadline, daysPerWeek: days, note });
      setSaved(true);
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>Why you are learning</p>
        <div className="flex flex-wrap gap-2">
          {REASONS.map((r) => {
            const Icon = icon(r.icon);
            const on = reason === r.id;
            return (
              <button key={r.id} type="button" onClick={() => setReason(on ? null : r.id)} aria-pressed={on}>
                <Chip tone={on ? "accent" : "neutral"}>
                  <Icon size={12} aria-hidden /> {r.label}
                </Chip>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>Where you want to get to</p>
        <div className="flex flex-wrap gap-2">
          {TARGETS.map((t) => (
            <button key={t.band} type="button" onClick={() => setTarget(t.band)} aria-pressed={target === t.band} title={t.can}>
              <Chip tone={target === t.band ? "accent" : "neutral"}>{t.band} · {t.label}</Chip>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>
          By when {weeks === null ? "" : `· ${weeks} weeks away`}
        </p>
        <div className="flex flex-wrap gap-2">
          {DEADLINES.map((d) => {
            const value = deadlineFrom(d, new Date());
            const on = value === null ? deadline === null : weeks !== null && Math.abs(weeks - (weeksUntil(value, new Date()) ?? 0)) <= 1;
            return (
              <button key={d.id} type="button" onClick={() => setDeadline(value)} aria-pressed={on}>
                <Chip tone={on ? "accent" : "neutral"}>{d.label}</Chip>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>Days a week you practise</p>
        <div className="flex flex-wrap gap-2">
          {[2, 3, 4, 5, 6, 7].map((n) => (
            <button key={n} type="button" onClick={() => setDays(n)} aria-pressed={days === n}>
              <Chip tone={days === n ? "accent" : "neutral"}>{n}</Chip>
            </button>
          ))}
        </div>
      </div>

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
          className="w-full rounded-[var(--r-lg)] border px-4 py-3 text-base outline-none"
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
