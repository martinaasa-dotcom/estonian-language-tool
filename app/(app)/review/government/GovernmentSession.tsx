"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Scale, X } from "lucide-react";
import Link from "next/link";
import { addToDeck } from "@/app/actions";
import { Button, ButtonLink } from "@/components/Button";
import { Chip, Stat } from "@/components/ui";
import { Speak } from "@/components/Speak";
import { CASES } from "@/lib/estonian/cases";
import type { CaseKey } from "@/lib/estonian/types";

export interface GovernmentQuestion {
  lexemeId: string;
  lemma: string;
  translation: string;
  cefr: string | null;
  answer: CaseKey;
  answerEn: string;
  answerEt: string;
  example: string | null;
  maskedExample: string | null;
  gloss: string | null;
  experiencer: boolean;
  inDeck: boolean;
  options: CaseKey[];
}

const caseLabel = (key: CaseKey) => CASES.find((c) => c.key === key);

/**
 * Multiple choice rather than free entry, deliberately. The skill being drilled
 * is discrimination between a handful of cases that all feel plausible to an
 * English speaker, not recall of a case name — and typing "allative" tests
 * spelling.
 */
export function GovernmentSession({ questions }: { questions: GovernmentQuestion[] }) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<CaseKey | null>(null);
  const [correct, setCorrect] = useState(0);
  const [added, setAdded] = useState<string | null>(null);
  const startedAt = useRef(Date.now());

  const question = questions[index];
  const finished = !question;
  const revealed = picked !== null;

  const choose = useCallback((option: CaseKey) => {
    if (!question || picked) return;
    setPicked(option);
    if (option === question.answer) setCorrect((c) => c + 1);
  }, [question, picked]);

  const next = useCallback(() => {
    setPicked(null);
    setAdded(null);
    setIndex((i) => i + 1);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (finished || !question) return;
      if (revealed && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); next(); return; }
      if (revealed) return;
      const n = Number(e.key);
      const option = question.options[n - 1];
      if (option) { e.preventDefault(); choose(option); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finished, question, revealed, choose, next]);

  if (finished) {
    const minutes = Math.max(1, Math.round((Date.now() - startedAt.current) / 60000));
    const accuracy = Math.round((correct / questions.length) * 100);
    return (
      <div className="mx-auto max-w-2xl px-5 py-16 md:px-10">
        <h1 className="est text-[32px] font-bold tracking-tight" style={{ color: "var(--ink)" }}>
          Round complete
        </h1>
        <p className="mt-2 text-[15px]" style={{ color: "var(--ink-2)" }}>
          Rektsioon is memorised per verb, not derived — so a round every few days beats an hour
          once.
        </p>
        <div
          className="mt-8 grid grid-cols-3 gap-6 rounded-lg border p-6"
          style={{ borderColor: "var(--rule)", background: "var(--surface)" }}
        >
          <Stat value={questions.length} label="Verbs" />
          <Stat value={`${accuracy}%`} label="Right" tone={accuracy >= 80 ? "var(--good)" : "var(--hard)"} />
          <Stat value={`${minutes}m`} label="Time" />
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/" variant="primary">Back to Today</ButtonLink>
          <ButtonLink href="/review/government">Another round</ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-5 py-6 md:px-10 md:py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link href="/" aria-label="End session" className="rounded p-1" style={{ color: "var(--ink-3)" }}>
          <X size={19} aria-hidden />
        </Link>
        <div className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: "var(--raised)" }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${(index / questions.length) * 100}%`, background: "var(--accent)" }}
            role="progressbar"
            aria-valuenow={index}
            aria-valuemin={0}
            aria-valuemax={questions.length}
            aria-label="Round progress"
          />
        </div>
        <span className="tnum text-[13px]" style={{ color: "var(--ink-3)" }}>
          {questions.length - index} left
        </span>
      </div>

      <div
        className="rounded-xl border"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow)" }}
      >
        <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3" style={{ borderColor: "var(--rule-soft)" }}>
          <Chip tone="accent"><Scale size={12} aria-hidden /> Rektsioon</Chip>
          {question.cefr && <Chip>{question.cefr}</Chip>}
          {!question.inDeck && <Chip tone="good">new to you</Chip>}
        </div>

        <div className="px-6 py-8 text-center">
          <div className="flex items-center justify-center gap-2">
            <p lang="et" className="est text-[34px] font-semibold" style={{ color: "var(--ink)" }}>
              {question.lemma}
            </p>
            <Speak text={question.lemma} />
          </div>
          <p className="mt-1 text-[14px]" style={{ color: "var(--ink-3)" }}>{question.translation}</p>

          {question.maskedExample && !revealed && (
            <p lang="et" className="est mt-5 text-[19px]" style={{ color: "var(--ink-2)" }}>
              {question.maskedExample}
            </p>
          )}

          <p className="mt-5 text-[14px]" style={{ color: "var(--ink-2)" }}>
            Which case does it take?
          </p>
        </div>

        <div className="px-4 pb-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {question.options.map((option, i) => {
              const spec = caseLabel(option);
              const isAnswer = option === question.answer;
              const isPicked = option === picked;

              const tone = !revealed
                ? { background: "var(--raised)", color: "var(--ink)", borderColor: "var(--rule)" }
                : isAnswer
                  ? { background: "var(--good-soft)", color: "var(--good)", borderColor: "transparent" }
                  : isPicked
                    ? { background: "var(--again-soft)", color: "var(--again)", borderColor: "transparent" }
                    : { background: "transparent", color: "var(--ink-3)", borderColor: "var(--rule-soft)" };

              return (
                <button
                  key={option}
                  type="button"
                  disabled={revealed}
                  onClick={() => choose(option)}
                  className="flex items-center gap-2.5 rounded-md border px-3.5 py-3 text-left transition-opacity hover:opacity-85 disabled:cursor-default"
                  style={tone}
                >
                  <kbd className="tnum text-[11px] opacity-60">{i + 1}</kbd>
                  <span className="min-w-0">
                    <span className="block text-[14.5px] font-medium">{spec?.en}</span>
                    <span lang="et" className="block text-[12.5px] opacity-75">{spec?.et}</span>
                  </span>
                  {revealed && isAnswer && <Check size={16} className="ml-auto shrink-0" aria-hidden />}
                </button>
              );
            })}
          </div>
        </div>

        {revealed && (
          <div className="border-t px-6 py-5" style={{ borderColor: "var(--rule-soft)" }} aria-live="polite">
            {question.example && (
              <div className="flex flex-wrap items-center gap-2">
                <p lang="et" className="est text-[20px] font-semibold" style={{ color: "var(--accent)" }}>
                  {question.example}
                </p>
                <Speak text={question.example} />
              </div>
            )}
            {question.gloss && (
              <p className="mt-1 text-[14px]" style={{ color: "var(--ink-2)" }}>{question.gloss}</p>
            )}
            <p className="mt-2 text-[13px]" style={{ color: "var(--ink-3)" }}>
              {question.experiencer
                ? `An experiencer construction: the person goes in the ${question.answerEn.toLowerCase()} and the thing is the grammatical subject.`
                : `${question.lemma} governs the ${question.answerEn.toLowerCase()} (${question.answerEt}). English gives you no clue here, so it has to be learned with the verb.`}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" onClick={next} autoFocus>
                Next <kbd className="ml-1 opacity-70">↵</kbd>
              </Button>
              {!question.inDeck && (
                <Button
                  disabled={added === question.lexemeId}
                  onClick={async () => {
                    await addToDeck(question.lexemeId, ["RECOGNITION", "GOVERNMENT"], "DICTIONARY");
                    setAdded(question.lexemeId);
                  }}
                >
                  {added === question.lexemeId ? "Added to your deck" : "Add to my deck"}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <p className="mt-4 text-center text-[11.5px]" style={{ color: "var(--ink-3)" }}>
        {correct}/{index + (revealed ? 1 : 0)} right · 1–4 to answer
      </p>
    </div>
  );
}
