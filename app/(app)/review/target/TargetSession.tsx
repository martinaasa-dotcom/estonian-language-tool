"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Crosshair, Timer, Trophy } from "lucide-react";
import { plainAskLine } from "@/lib/estonian/plainAsk";
import { gradeCard } from "@/app/actions";
import { Button, ButtonLink } from "@/components/Button";
import { Chip, Page, StatTile } from "@/components/ui";
import { useFeedbackSound } from "@/components/AudioPrefs";
import type { TargetQuestion } from "@/lib/progress/target";
import { OPTION_CLASS, optionState } from "@/lib/ux/verdict";

/** Seconds for the first shot. */
const START_S = 8;
/** The least time a shot ever gets, however far in you are. */
const FLOOR_S = 3.5;
/** How much of a second each hit takes off the clock. */
const STEP_S = 0.25;

/**
 * TARGET.
 *
 * One question at a time against a shrinking clock. A hit takes a quarter of a
 * second off the next shot, so the round tightens around whoever is playing it
 * rather than around a difficulty somebody picked: a learner who knows their
 * endings ends up with three and a half seconds a question, and one who does
 * not never gets there.
 *
 * A MISS COSTS THE SHOT AND NOT THE ROUND. The right answer is shown, the
 * clock resets, and the next question comes. Ending a round on the first wrong
 * answer would make this a test, and the deck already has three of those; what
 * this is for is speed on things the learner half knows.
 *
 * Every answer grades through `gradeCard` (ADR-016) so the scheduler sees what
 * was practiced: a hit is Good, a miss is Again, and running out of time is
 * Again too, because not producing a form inside eight seconds is not knowing
 * it yet.
 */
export function TargetSession({ questions: initialQuestions }: { questions: TargetQuestion[] }) {
  // Snapshotted on mount: `gradeCard` refreshes this route's Server Component,
  // and a round whose questions changed under the player is a different round.
  const [questions] = useState(initialQuestions);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"ready" | "running" | "done">("ready");
  const [picked, setPicked] = useState<number | null>(null);
  const [hits, setHits] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [left, setLeft] = useState(START_S);
  const sound = useFeedbackSound();
  const shownAt = useRef(Date.now());

  const question = questions[index];
  const allowed = Math.max(FLOOR_S, START_S - hits * STEP_S);

  const answer = useCallback((choice: number | null) => {
    if (!question || picked !== null) return;
    const right = choice !== null && choice === question.answer;

    setPicked(choice ?? -1);
    sound(right ? "right" : "wrong");
    if (right) {
      setHits((h) => h + 1);
      setStreak((s) => { const next = s + 1; setBest((b) => Math.max(b, next)); return next; });
    } else {
      setStreak(0);
    }
    if (question.cardId) void gradeCard(question.cardId, right ? 3 : 1, Date.now() - shownAt.current);

    // A hit moves on quickly; a miss holds, because the correction is the one
    // moment in a round worth slowing down for.
    window.setTimeout(() => {
      setPicked(null);
      setLeft(Math.max(FLOOR_S, START_S - (right ? hits + 1 : hits) * STEP_S));
      shownAt.current = Date.now();
      setIndex((i) => i + 1);
    }, right ? 480 : 1500);
  }, [question, picked, sound, hits]);

  useEffect(() => {
    if (phase !== "running" || picked !== null) return;
    if (!question) { setPhase("done"); return; }
    if (left <= 0) { answer(null); return; }
    const t = setTimeout(() => setLeft((s) => Math.max(0, Math.round((s - 0.1) * 10) / 10)), 100);
    return () => clearTimeout(t);
  }, [phase, left, picked, question, answer]);

  /* Keys 1 to 4, because a round measured in seconds is one a keyboard should
     win. The same keys the review screen's multiple choice uses. */
  useEffect(() => {
    if (phase !== "running") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= (question?.options.length ?? 0)) { e.preventDefault(); answer(n - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, question, answer]);

  if (phase === "ready") {
    return (
      <Page title="Target" lead="Hit the right form before the clock does.">
        <div className="mx-auto flex max-w-md flex-col items-center gap-5 text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full quest-pulse"
            style={{ background: "var(--peach-soft)", color: "var(--peach-ink)" }}>
            <Crosshair size={34} aria-hidden />
          </span>
          <p className="max-w-[44ch] text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
            Most of these are endings rather than meanings: four forms of one word,
            and only the question word tells you which. Every hit takes a quarter
            of a second off the next shot.
          </p>
          <Button variant="primary" size="lg"
            onClick={() => { setPhase("running"); setLeft(START_S); shownAt.current = Date.now(); }}>
            Start
          </Button>
          <ButtonLink href="/practice">Back to practice</ButtonLink>
        </div>
      </Page>
    );
  }

  if (phase === "done") {
    const asked = Math.min(index, questions.length);
    const accuracy = asked > 0 ? Math.round((hits / asked) * 100) : 0;
    return (
      <Page title="Target" lead="Round over.">
        <div className="mx-auto flex max-w-md flex-col items-center gap-5 text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full quest-pop"
            style={{ background: "var(--mint-soft)", color: "var(--mint-ink)" }}>
            <Trophy size={34} aria-hidden />
          </span>
          <div className="grid w-full grid-cols-3 gap-3">
            <StatTile value={hits} label="Hit" tone="mint" />
            <StatTile value={`${accuracy}%`} label="Accuracy" tone={accuracy >= 70 ? "mint" : "butter"} />
            <StatTile value={best} label="Best run" tone="blush" />
          </div>
          <p className="max-w-[42ch] text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
            Every one of those went into the schedule, so what you missed comes back sooner.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <ButtonLink href="/practice" size="lg">Back to practice</ButtonLink>
            <ButtonLink href="/review/target" variant="primary" size="lg">Again</ButtonLink>
          </div>
        </div>
      </Page>
    );
  }

  if (!question) return null;
  const pct = (left / allowed) * 100;
  const answered = picked !== null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-5 py-6 md:px-10 md:py-10">
      <h1 className="sr-only">Target</h1>

      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold tabular-nums"
          style={{ color: left <= 2 ? "var(--again-ink)" : "var(--ink-2)" }}>
          <Timer size={15} aria-hidden /> {left.toFixed(1)}s
        </span>
        <span className="flex items-center gap-3">
          {streak >= 3 && (
            <span key={streak} className="text-sm font-bold quest-pop" style={{ color: "var(--blush-ink)" }}>
              {streak} in a row
            </span>
          )}
          <Chip tone="good">{hits} hit</Chip>
        </span>
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--raised)" }}>
        <div className="h-full rounded-full"
          style={{
            width: `${Math.max(0, pct)}%`,
            background: left <= 2 ? "var(--again-ink)" : "var(--peach-ink)",
            transition: "width 100ms linear",
          }} />
      </div>

      <div key={question.lemma + index} className="quest-card mt-8 flex flex-col items-center gap-2 text-center">
        <p lang="et" className="text-4xl font-bold tracking-tight" style={{ color: "var(--ink)" }}>
          {question.lemma}
        </p>
        {question.question ? (
          <>
            <p lang="et" className="text-xl font-semibold" style={{ color: "var(--peach-ink)" }}>
              {question.question}
            </p>
            {/* The question word is what an Estonian says; the line under it is
                what it means, for somebody who has not learned that yet. Kept
                to one line, since this round is timed. */}
            {question.caseKey && plainAskLine(question.caseKey) && (
              <p className="text-[13.5px]" style={{ color: "var(--ink-2)" }}>
                {plainAskLine(question.caseKey)}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm" style={{ color: "var(--ink-3)" }}>What does it mean?</p>
        )}
      </div>

      <div className="mt-7 grid gap-2.5 sm:grid-cols-2">
        {question.options.map((option, i) => {
          const isAnswer = i === question.answer;
          const chose = picked === i;
          return (
            <button
              key={option}
              type="button"
              disabled={answered}
              onClick={() => answer(i)}
              className={`choice-btn ${answered ? OPTION_CLASS[optionState(isAnswer, chose)] : ""} flex min-h-[3.75rem] items-center gap-3 rounded-[var(--r-lg)] border px-4 text-left`}
            >
              <kbd className="rounded-md px-1.5 py-0.5 text-2xs font-semibold key-cap">{i + 1}</kbd>
              <span
                lang={question.kind === "case" ? "et" : "en"}
                className="flex-1 text-lg font-semibold"
              >
                {option}
              </span>
            </button>
          );
        })}
      </div>

      {answered && question.caseEt && (
        <p className="mt-4 text-center text-sm" role="status" style={{ color: "var(--ink-2)" }}>
          <span lang="et" className="font-semibold">{question.options[question.answer]}</span>
          {" is the "}
          <span lang="et" className="font-semibold">{question.caseEt}</span>
          {question.question && <>, which answers <span lang="et">{question.question}</span></>}
        </p>
      )}
    </div>
  );
}
