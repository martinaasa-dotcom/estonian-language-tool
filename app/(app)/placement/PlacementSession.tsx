"use client";

import { useCallback, useEffect, useState } from "react";
import { Compass } from "lucide-react";
import { savePlacement } from "@/app/actions";
import { ButtonLink } from "@/components/Button";
import { Et } from "@/components/Et";
import { Speak } from "@/components/Speak";
import { Card, Empty, Meter, Page } from "@/components/ui";
import {
  PER_LEVEL, passed, placementSummary,
  type PlacementStage, type StageScore,
} from "@/lib/collections/placement";
import { LEVEL_INFO, type Level } from "@/lib/collections/syllabus";

/**
 * Climbs the placement ladder.
 *
 * Every question is already here, so stopping early costs nothing: when a level
 * is failed the session simply does not continue to the next one, which is what
 * makes a beginner's test four questions long and a C1 speaker's twenty.
 *
 * The stage list is snapshotted on mount for the same reason every other session
 * does it — `savePlacement` is a Server Action and Next re-runs the page after
 * one, which would otherwise hand down a freshly built, differently seeded
 * ladder while the learner was mid-answer.
 */
export function PlacementSession({
  stages: initialStages, current,
}: {
  stages: PlacementStage[];
  current: string | null;
}) {
  const [stages] = useState(initialStages);
  const [stage, setStage] = useState(0);
  const [question, setQuestion] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [scores, setScores] = useState<StageScore[]>([]);
  const [correctHere, setCorrectHere] = useState(0);
  const [done, setDone] = useState<{ level: Level; scores: StageScore[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = useCallback(async (finalScores: StageScore[]) => {
    setSaving(true);
    const result = await savePlacement(finalScores);
    setSaving(false);
    if (result.ok) setDone({ level: result.level, scores: finalScores });
    else setError(result.error);
  }, []);

  const answer = useCallback((index: number) => {
    if (chosen !== null) return;
    const currentStage = stages[stage];
    const q = currentStage?.questions[question];
    if (!currentStage || !q) return;

    setChosen(index);
    const right = index === q.answer ? 1 : 0;
    const tally = correctHere + right;

    window.setTimeout(() => {
      setChosen(null);
      if (question + 1 < currentStage.questions.length) {
        setCorrectHere(tally);
        setQuestion((n) => n + 1);
        return;
      }

      const score: StageScore = {
        level: currentStage.level,
        correct: tally,
        asked: currentStage.questions.length,
      };
      const next = [...scores, score];
      setScores(next);
      setCorrectHere(0);
      setQuestion(0);

      // The whole point of a ladder: a failed rung ends the climb.
      if (!passed(score) || stage + 1 >= stages.length) void finish(next);
      else setStage((n) => n + 1);
    }, 450);
  }, [chosen, correctHere, finish, question, scores, stage, stages]);

  useEffect(() => {
    if (done || chosen !== null) return;
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= 4) { e.preventDefault(); answer(n - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer, chosen, done]);

  if (stages.length === 0) {
    return (
      <Page title="Where to start" lead="A quick check of what you already know.">
        <Empty
          title="Not enough words to place you yet"
          body="This needs a full set of words at each level in the dictionary."
          action={<ButtonLink href="/learn">Go to the path</ButtonLink>}
        />
      </Page>
    );
  }

  if (done) {
    const info = LEVEL_INFO[done.level];
    return (
      <Page title="Where to start" eyebrow="Placement">
        <Card className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-sm" style={{ color: "var(--accent-deep)" }}>
            <Compass size={16} aria-hidden /> Your starting point
          </div>
          <h2 className="text-3xl">{done.level} · {info.title}</h2>
          <p className="text-lg">{info.summary}</p>
          <p style={{ color: "var(--ink-2)" }}>{placementSummary(done.level, done.scores)}</p>
          <ul className="flex flex-wrap gap-2 text-sm">
            {done.scores.map((s) => (
              <li
                key={s.level}
                className="rounded-[var(--r-sm)] px-2.5 py-1"
                style={{
                  background: passed(s) ? "var(--mint-soft)" : "var(--peach-soft)",
                  color: "var(--ink)",
                }}
              >
                {s.level}: {s.correct}/{s.asked}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/learn">Start the course at {done.level}</ButtonLink>
            <ButtonLink href="/placement" variant="ghost">Take it again</ButtonLink>
          </div>
        </Card>
      </Page>
    );
  }

  const currentStage = stages[stage];
  const q = currentStage?.questions[question];
  if (!currentStage || !q) return null;

  const askedSoFar = scores.reduce((n, s) => n + s.asked, 0) + question;
  const ceiling = stages.length * PER_LEVEL;

  return (
    <Page
      title="Where to start"
      eyebrow="Placement"
      lead="Four words per level. It stops as soon as a level gets hard, so this is usually short."
    >
      <div className="flex flex-col gap-5">
        <Meter pct={Math.round((askedSoFar / ceiling) * 100)} label={`${askedSoFar} questions answered`} />
        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between text-sm" style={{ color: "var(--ink-3)" }}>
            <span>What does this mean?</span>
            <span>{currentStage.level}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Et className="text-3xl">{q.lemma}</Et>
            <Speak text={q.lemma} size={18} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {q.options.map((option, i) => {
              const settled = chosen !== null;
              const isAnswer = i === q.answer;
              return (
                <button
                  key={option}
                  type="button"
                  disabled={settled}
                  onClick={() => answer(i)}
                  className="choice-btn flex min-h-[44px] items-center gap-3 rounded-[var(--r-sm)] border p-3 text-left"
                  style={settled ? {
                    borderColor: isAnswer ? "var(--mint)" : "var(--rule)",
                    background: isAnswer ? "var(--mint-soft)" : chosen === i ? "var(--peach-soft)" : "var(--surface)",
                  } : undefined}
                >
                  <span
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-[var(--r-sm)] text-xs"
                    style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  {option}
                </button>
              );
            })}
          </div>
          <p className="text-xs" style={{ color: "var(--ink-3)" }}>
            This checks recognition only, so it places you at the highest level you pass rather than
            the one above. You can start anywhere on the path whatever it says.
            {current && ` You are currently set to ${current}.`}
          </p>
          {saving && <p className="text-sm" style={{ color: "var(--ink-3)" }}>Working out where to start you…</p>}
          {error && (
            <p className="text-sm" role="alert" style={{ color: "var(--peach-ink)" }}>{error}</p>
          )}
        </Card>
      </div>
    </Page>
  );
}
