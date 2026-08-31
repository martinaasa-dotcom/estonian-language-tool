"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Scale, X } from "lucide-react";
import Link from "next/link";
import { addToDeck, gradeCard } from "@/app/actions";
import { Button, ButtonLink } from "@/components/Button";
import { Chip, Stat } from "@/components/ui";
import { Speak } from "@/components/Speak";
import { CASES } from "@/lib/estonian/cases";
import type { CaseKey } from "@/lib/estonian/types";

export interface GovernmentQuestion {
  /** The card this question practises, when the verb is already in the deck. */
  cardId: string | null;
  lexemeId: string;
  lemma: string;
  translation: string;
  cefr: string | null;
  answer: CaseKey;
  answerEn: string;
  answerEt: string;
  /** The other cases this word governs, kept out of the options and named after. */
  alsoGoverned: CaseKey[];
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
export function GovernmentSession({ questions: initialQuestions }: { questions: GovernmentQuestion[] }) {
  /*
    Snapshotted once on mount, never updated from later props. gradeCard() is a
    Server Action and Next refreshes this route's Server Component after every
    call, which hands down a freshly computed question set: the word under the
    learner's feedback would change while they were still reading it. The set
    the page found on first load is the only one this session should know
    about. ReviewSession froze its queue for the same reason; these four modes
    started grading in this change and inherited the hazard with it.
  */
  const [questions] = useState(initialQuestions);
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
    const right = option === question.answer;
    if (right) setCorrect((c) => c + 1);
    // ADR-016: the same review log as every other mode, so rektsioon practice
    // moves the schedule instead of scoring itself.
    if (question.cardId) void gradeCard(question.cardId, right ? 3 : 1, 0).catch(() => {});
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
        <h1 className="text-[32px] font-bold tracking-tight" style={{ color: "var(--ink)" }}>
          Round complete
        </h1>
        <p className="mt-2 text-[15px]" style={{ color: "var(--ink-2)" }}>
          Rektsioon is memorised per verb, not derived, so a round every few days beats an hour
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
      {/* The heading a session screen has no room to draw. See the same line
          in the other five modes: an `Empty` state and a finished state each
          carry one, so the only screen without a heading was the one a learner
          spends the round on. */}
      <h1 className="sr-only">Verb government</h1>
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
        <span className="tnum text-sm" style={{ color: "var(--ink-3)" }}>
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
            <p lang="et" className="text-3xl font-semibold" style={{ color: "var(--ink)" }}>
              {question.lemma}
            </p>
            <Speak text={question.lemma} />
          </div>
          <p className="mt-1 text-[13.5px]" style={{ color: "var(--ink-3)" }}>{question.translation}</p>

          {question.maskedExample && !revealed && (
            <p lang="et" className="mt-5 text-[19px]" style={{ color: "var(--ink-2)" }}>
              {question.maskedExample}
            </p>
          )}

          <p className="mt-5 text-[13.5px]" style={{ color: "var(--ink-2)" }}>
            Which question does it answer?
          </p>
        </div>

        <div className="px-4 pb-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {question.options.map((option, i) => {
              const spec = caseLabel(option);
              const isAnswer = option === question.answer;
              const isPicked = option === picked;

              const tone = !revealed
                ? { "--choice-bg": "var(--raised)", color: "var(--ink)" } as React.CSSProperties
                : isAnswer
                  /* The ink, not the hue: see the same table in
                     review/pairs/PairsSession.tsx. A hue set as text on its
                     own tint measures about 2.5:1, which is what every hue
                     having an ink is for. */
                  ? { background: "var(--good-soft)", color: "var(--good-ink)", borderColor: "transparent" }
                  : isPicked
                    ? { background: "var(--again-soft)", color: "var(--again-ink)", borderColor: "transparent" }
                    : { background: "transparent", color: "var(--ink-3)", borderColor: "var(--rule-soft)" };

              return (
                <button
                  key={option}
                  type="button"
                  disabled={revealed}
                  onClick={() => choose(option)}
                  className="choice-btn flex items-center gap-2.5 rounded-md border px-3.5 py-3 text-left disabled:cursor-default"
                  style={tone}
                >
                  {/* One character at 60%, which measured 4.12:1 against a
                      bar of 4.5 on the unrevealed option alone. */}
                  <kbd className="tnum text-2xs">{i + 1}</kbd>
                  <span className="min-w-0">
                    {/* The question leads because the dictionary records
                        government as the question a verb answers, and because
                        that is how the answer is said out loud: "aitama" takes
                        "keda?", not "the partitive". */}
                    <span lang="et" className="block text-base font-medium">{spec?.question}</span>
                    <span lang="et" className="block text-[12.5px]">{spec?.et}</span>
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
                <p lang="et" className="text-lg font-semibold" style={{ color: "var(--accent-deep)" }}>
                  {question.example}
                </p>
                <Speak text={question.example} />
              </div>
            )}
            {question.gloss && (
              <p className="mt-1 text-[13.5px]" style={{ color: "var(--ink-2)" }}>{question.gloss}</p>
            )}
            <p className="mt-2 text-sm" style={{ color: "var(--ink-3)" }}>
              {question.experiencer
                ? `An experiencer construction: the person goes in the ${question.answerEt} and the thing is the grammatical subject.`
                : `${question.lemma} governs the ${question.answerEt}, the ${question.answerEn.toLowerCase()}. English gives you no clue here, so it has to be learned with the verb.`}
            </p>
            {/*
              A verb often governs more than one case, in different senses.
              Those are true of it, so they are kept out of the options rather
              than offered as wrong answers, and saying so here is the useful
              half: a learner who was reaching for one of them was not wrong,
              they were thinking of the other sense.
            */}
            {question.alsoGoverned.length > 0 && (
              <p className="mt-1.5 text-sm" style={{ color: "var(--ink-3)" }}>
                It takes{" "}
                {question.alsoGoverned.map((key, i) => (
                  <span key={key}>
                    {i > 0 && (i === question.alsoGoverned.length - 1 ? " and " : ", ")}
                    the <span lang="et">{caseLabel(key)?.et}</span>
                  </span>
                ))}{" "}
                {question.alsoGoverned.length === 1
                  ? "too, in another sense, so it is kept out of the answers rather than offered as a wrong one."
                  : "too, in other senses, so those are kept out of the answers rather than offered as wrong ones."}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" onClick={next} autoFocus>
                Next <kbd className="ml-1">↵</kbd>
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
        {correct}/{index + (revealed ? 1 : 0)} right · keys 1 to 4 to answer
      </p>
    </div>
  );
}
