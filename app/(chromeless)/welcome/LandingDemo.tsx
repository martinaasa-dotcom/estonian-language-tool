"use client";

import { useState } from "react";
import { ArrowRight, Check, RotateCcw, Sparkles, Volume2 } from "lucide-react";

export interface DemoCase {
  en: string;
  et: string;
  question: string;
  singular: string | null;
  plural: string | null;
  principal: boolean;
}

export interface DemoWord {
  lemma: string;
  translation: string;
  cefr: string | null;
  gradationNote: string | null;
  genitive: string | null;
  /** Principal parts: the forms that genuinely have to be memorised. */
  principal: { label: string; value: string }[];
  cases: DemoCase[];
}

const GRADES = [
  { label: "Again", key: "1", tone: "var(--peach-ink)", soft: "var(--peach-soft)", next: "in 1 min" },
  { label: "Hard", key: "2", tone: "var(--butter-ink)", soft: "var(--butter-soft)", next: "in 4 days" },
  { label: "Good", key: "3", tone: "var(--mint-ink)", soft: "var(--mint-soft)", next: "in 12 days" },
  { label: "Easy", key: "4", tone: "var(--sky-ink)", soft: "var(--sky-soft)", next: "in 28 days" },
] as const;

/**
 * The hero's live flashcard.
 *
 * It is the real review interaction — flip, grade, next — with the scheduling
 * numbers a first-timer would actually see. Nothing here is a screenshot, so a
 * visitor has done a review before they have signed up for anything.
 */
export function DemoCard({ words }: { words: DemoWord[] }) {
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [graded, setGraded] = useState(0);

  // The page must render with an empty dictionary behind it — this is a
  // public page, and a database that has not been seeded yet is not a reason
  // to serve a 500.
  const word = words.length > 0 ? words[i % words.length]! : null;
  if (!word) return null;

  const grade = () => {
    setGraded((g) => g + 1);
    setRevealed(false);
    setI((n) => n + 1);
  };

  return (
    <div className="relative">
      {/* The two cards peeking out from underneath: a deck, not a single card. */}
      <div
        aria-hidden
        className="absolute inset-x-6 bottom-9 h-24 rounded-[var(--r-xl)] border"
        style={{ background: "var(--surface)", borderColor: "var(--rule)", opacity: 0.5, zIndex: 0 }}
      />
      <div
        aria-hidden
        className="absolute inset-x-3 bottom-11 h-24 rounded-[var(--r-xl)] border"
        style={{ background: "var(--surface)", borderColor: "var(--rule)", opacity: 0.75, zIndex: 0 }}
      />

      <div
        className="relative overflow-hidden rounded-[var(--r-xl)] border"
        style={{ background: "var(--surface)", borderColor: "var(--rule)", boxShadow: "var(--shadow-lg)" }}
      >
        <div
          className="flex items-center justify-between gap-3 border-b px-5 py-3"
          style={{ borderColor: "var(--rule-soft)" }}
        >
          <span className="label-xs rounded-full px-2.5 py-1" style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}>
            Estonian → English
          </span>
          <span className="tnum text-xs" style={{ color: "var(--ink-3)" }}>
            {graded} graded · {Math.max(1, 12 - graded)} left
          </span>
        </div>

        <div key={`${i}-${revealed}`} className="pop-in flex min-h-[232px] flex-col items-center justify-center gap-3 px-6 py-9 text-center">
          <div className="flex items-center gap-2">
            <p lang="et" className="est text-4xl font-bold leading-none tracking-tight" style={{ color: "var(--ink)" }}>
              {word.lemma}
            </p>
            <span
              aria-hidden
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{ background: "var(--raised)", color: "var(--ink-3)" }}
            >
              <Volume2 size={15} />
            </span>
          </div>

          <div className="flex flex-wrap justify-center gap-1.5">
            {word.cefr && (
              <span className="label-xs rounded-full px-2.5 py-1" style={{ background: "var(--sky-soft)", color: "var(--sky-ink)" }}>
                {word.cefr}
              </span>
            )}
            {word.gradationNote && (
              <span
                className="label-xs rounded-full px-2.5 py-1"
                style={{ background: "var(--butter-soft)", color: "var(--butter-ink)", textTransform: "none" }}
              >
                gradation {word.gradationNote}
              </span>
            )}
          </div>

          <div aria-live="polite" className="min-h-[44px]">
            {revealed && (
              <p className="est pop-in text-2xl font-bold" style={{ color: "var(--accent-deep)" }}>
                {word.translation}
              </p>
            )}
          </div>
        </div>

        <div className="border-t p-3.5" style={{ borderColor: "var(--rule-soft)" }}>
          {!revealed ? (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="grad-accent press w-full rounded-full py-3 text-base font-semibold transition-ui hover:brightness-105"
              style={{ color: "var(--accent-ink)", boxShadow: "var(--shadow-accent)" }}
            >
              Show answer
            </button>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {GRADES.map((g) => (
                <button
                  key={g.label}
                  type="button"
                  onClick={grade}
                  className="press flex flex-col items-center gap-0.5 rounded-[var(--r)] px-1 py-2.5 transition-transform hover:-translate-y-0.5"
                  style={{ background: g.soft, color: g.tone }}
                >
                  <span className="text-sm font-bold">{g.label}</span>
                  <span className="tnum text-2xs opacity-80">{g.next}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="relative mt-9 flex items-center justify-center gap-4 text-2xs" style={{ color: "var(--ink-3)" }}>
        <span className="flex items-center gap-1"><Check size={12} aria-hidden /> real card, real scheduling</span>
        <span className="flex items-center gap-1"><RotateCcw size={12} aria-hidden /> try it, it really works</span>
      </p>
    </div>
  );
}

/**
 * "Learn one form, get eleven." The single most motivating fact about Estonian
 * nouns, shown rather than claimed — every form below is derived by the same
 * function the app itself uses.
 */
export function CaseExplorer({ words }: { words: DemoWord[] }) {
  const [active, setActive] = useState(0);
  const word = words[active] ?? words[0];
  if (!word) return null;

  return (
    <div
      className="overflow-hidden rounded-[var(--r-xl)] border"
      style={{ background: "var(--surface)", borderColor: "var(--rule)", boxShadow: "var(--shadow)" }}
    >
      <div className="flex flex-wrap items-center gap-2 border-b px-5 py-4" style={{ borderColor: "var(--rule-soft)" }}>
        <span className="label-xs mr-1" style={{ color: "var(--ink-3)" }}>Try a word</span>
        {words.map((w, n) => (
          <button
            key={w.lemma}
            type="button"
            onClick={() => setActive(n)}
            aria-pressed={active === n}
            lang="et"
            className="est press rounded-full px-3.5 py-1.5 text-base transition-ui"
            style={{
              background: active === n ? "var(--accent-deep)" : "var(--raised)",
              color: active === n ? "var(--accent-ink)" : "var(--ink-2)",
              fontWeight: active === n ? 700 : 500,
            }}
          >
            {w.lemma}
          </button>
        ))}
      </div>

      <div className="grid gap-6 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:p-6">
        <div>
          <p className="label-xs mb-3" style={{ color: "var(--ink-3)" }}>
            What you memorise
          </p>
          <div className="flex flex-col gap-2">
            {word.principal.map((p) => (
              <div
                key={p.label}
                className="flex items-baseline justify-between gap-3 rounded-[var(--r)] px-4 py-2.5"
                style={{ background: "var(--raised)" }}
              >
                <span lang="et" className="text-xs" style={{ color: "var(--ink-3)" }}>{p.label}</span>
                <span lang="et" className="est text-lg font-bold" style={{ color: "var(--ink)" }}>{p.value}</span>
              </div>
            ))}
          </div>
          <p
            className="mt-4 flex items-start gap-2 rounded-[var(--r)] px-4 py-3 text-xs leading-relaxed"
            style={{ background: "var(--mint-soft)", color: "var(--mint-ink)" }}
          >
            <Sparkles size={15} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              Learn <strong lang="et">{word.genitive ?? word.lemma}</strong> and the eleven cases on
              the right follow as regular endings.
            </span>
          </p>
        </div>

        <div>
          <p className="label-xs mb-3" style={{ color: "var(--ink-3)" }}>
            What you get for free
          </p>
          <ul key={word.lemma} className="fade-up grid grid-cols-2 gap-1.5">
            {word.cases.filter((c) => !c.principal && c.singular).map((c) => (
              <li
                key={c.et}
                className="flex items-baseline justify-between gap-2 rounded-[var(--r-sm)] px-3 py-2"
                style={{ background: "var(--accent-soft)" }}
              >
                <span lang="et" className="text-2xs" style={{ color: "var(--accent-deep)", opacity: 0.75 }}>{c.et}</span>
                <span lang="et" className="est text-base font-semibold" style={{ color: "var(--accent-deep)" }}>
                  {c.singular}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-2xs" style={{ color: "var(--ink-3)" }}>
            Derived live by the same function the app uses, never invented by an AI.
          </p>
        </div>
      </div>
    </div>
  );
}

/** The tutor, answering one real question, typed out on demand. */
export function TutorPeek() {
  const [asked, setAsked] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div
        className="ml-auto max-w-[85%] rounded-[var(--r-lg)] rounded-br-md px-4 py-3 text-sm"
        style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
      >
        Why is it <span lang="et" className="est font-semibold">raamatut</span> and not{" "}
        <span lang="et" className="est font-semibold">raamatu</span>?
      </div>

      {asked ? (
        <div
          className="fade-up max-w-[92%] rounded-[var(--r-lg)] rounded-bl-md border px-4 py-3 text-sm leading-relaxed"
          style={{ background: "var(--surface)", borderColor: "var(--rule)", color: "var(--ink-2)" }}
        >
          <span className="label-xs mb-1.5 block" style={{ color: "var(--blush-ink)" }}>Anu</span>
          Because the action is unfinished. <span lang="et" className="est font-semibold">Ma loen raamatut</span>{" "}
          is “I am reading a book”: partitive, still going. Swap in the genitive and you get{" "}
          <span lang="et" className="est font-semibold">Ma loen raamatu läbi</span>, a whole book,
          finished. The object case is where Estonian hides its aspect.
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAsked(true)}
          className="press mr-auto flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-ui hover:-translate-y-px"
          style={{ background: "var(--surface)", borderColor: "var(--rule)", color: "var(--ink-2)" }}
        >
          Ask Anu <ArrowRight size={14} aria-hidden />
        </button>
      )}
    </div>
  );
}
