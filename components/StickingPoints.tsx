"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { BookOpen, Compass, EyeOff, Undo2 } from "lucide-react";
import { setCardSuspended } from "@/app/actions";
import { Chip } from "@/components/ui";
import { stickingNote, type StickingPoint } from "@/lib/stats/sticking";

const TYPE_LABEL: Record<string, string> = {
  RECOGNITION: "Estonian → English",
  PRODUCTION: "English → Estonian",
  CASE_FORM: "Case form",
  GRADATION: "Gradation",
  GOVERNMENT: "Verb government",
  CLOZE: "Fill the gap",
  CONJUGATION: "Conjugation",
};

/**
 * The handful of cards that keep coming back.
 *
 * The order of the actions is the argument this component is making. A card
 * that has lapsed five times is usually not a memory failure — it is a case the
 * learner has not understood, or a gloss doing two jobs — so the explanation
 * and the dictionary entry come first, and setting it aside comes last.
 *
 * Suspending is reversible here on the spot, because the honest version of
 * "stop showing me this" is "stop showing me this for now".
 */
export function StickingPoints({ points }: { points: StickingPoint[] }) {
  // Snapshotted on mount. Setting a card aside revalidates this page, and the
  // list is built from unsuspended cards — so without a snapshot the row would
  // vanish the instant it was clicked, taking "put it back" with it. The list
  // is honest again on the next load; within one visit the action is
  // reversible, which is what "set aside" ought to mean.
  const [rows] = useState(points);
  const [suspended, setSuspended] = useState<Record<string, boolean>>({});
  const [pending, start] = useTransition();

  const toggle = (id: string, next: boolean) => {
    setSuspended((s) => ({ ...s, [id]: next }));
    start(async () => {
      const result = await setCardSuspended(id, next);
      // Put the row back the way it was if the write did not land.
      if (!result?.ok) setSuspended((s) => ({ ...s, [id]: !next }));
    });
  };

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((point) => {
        const isSuspended = suspended[point.id] ?? false;
        const word = point.lemma ?? point.front;
        return (
          <li
            key={point.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--r)] px-4 py-3"
            style={{
              background: isSuspended ? "var(--raised)" : "var(--surface)",
              border: "1px solid var(--rule)",
              opacity: isSuspended ? 0.7 : 1,
            }}
          >
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-2">
                <Link
                  href={`/dictionary?q=${encodeURIComponent(word)}`}
                  lang="et"
                  className="est text-md font-semibold hover:underline"
                  style={{ color: "var(--ink)" }}
                >
                  {word}
                </Link>
                <span className="text-xs" style={{ color: "var(--ink-3)" }}>
                  {TYPE_LABEL[point.cardType] ?? point.cardType}
                </span>
                {point.reason === "lapses"
                  ? <Chip tone="again">{point.lapses} lapses</Chip>
                  : <Chip tone="hard">{point.accuracy}%</Chip>}
              </p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--ink-2)" }}>
                {isSuspended ? "Set aside — it will not come up until you put it back." : stickingNote(point)}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {point.targetCase && (
                <Link
                  href={`/grammar/${point.targetCase.toLowerCase()}`}
                  className="press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-ui hover:-translate-y-px"
                  style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
                >
                  <Compass size={12} aria-hidden /> The {point.targetCase.toLowerCase()}
                </Link>
              )}
              <Link
                href={`/dictionary?q=${encodeURIComponent(word)}`}
                className="press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-ui hover:-translate-y-px"
                style={{ background: "var(--raised)", color: "var(--ink-2)" }}
              >
                <BookOpen size={12} aria-hidden /> Entry
              </Link>
              <button
                type="button"
                disabled={pending}
                onClick={() => toggle(point.id, !isSuspended)}
                className="press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-ui hover:-translate-y-px disabled:opacity-50"
                style={{ background: "transparent", color: "var(--ink-3)" }}
              >
                {isSuspended
                  ? <><Undo2 size={12} aria-hidden /> Put it back</>
                  : <><EyeOff size={12} aria-hidden /> Set aside</>}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
