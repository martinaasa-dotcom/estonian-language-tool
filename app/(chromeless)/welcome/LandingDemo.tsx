"use client";

import { useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";

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
  genitive: string | null;
  /** Principal parts: the forms that genuinely have to be memorised. */
  principal: { label: string; value: string }[];
  cases: DemoCase[];
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
            className="press rounded-full px-3.5 py-1.5 text-base transition-ui"
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
                <span lang="et" className="text-lg font-bold" style={{ color: "var(--ink)" }}>{p.value}</span>
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
                {/* No opacity: `--accent-deep` on `--accent-soft` is 5.16, and three
                    quarters of it is 3.25. This is the Estonian name of the case,
                    which is the label this app leads with everywhere else. */}
                <span lang="et" className="text-2xs" style={{ color: "var(--accent-deep)" }}>{c.et}</span>
                <span lang="et" className="text-base font-semibold" style={{ color: "var(--accent-deep)" }}>
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
        Why is it <span lang="et" className="font-semibold">raamatut</span> and not{" "}
        <span lang="et" className="font-semibold">raamatu</span>?
      </div>

      {asked ? (
        <div
          className="fade-up max-w-[92%] rounded-[var(--r-lg)] rounded-bl-md border px-4 py-3 text-sm leading-relaxed"
          style={{ background: "var(--surface)", borderColor: "var(--rule)", color: "var(--ink-2)" }}
        >
          <span className="label-xs mb-1.5 block" style={{ color: "var(--blush-ink)" }}>Anu</span>
          Because the action is unfinished. <span lang="et" className="font-semibold">Ma loen raamatut</span>{" "}
          is “I am reading a book”: partitive, still going. Swap in the genitive and you get{" "}
          <span lang="et" className="font-semibold">Ma loen raamatu läbi</span>, a whole book,
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
