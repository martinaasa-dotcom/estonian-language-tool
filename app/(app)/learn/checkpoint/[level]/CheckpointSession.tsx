"use client";

import { useCallback, useState } from "react";
import { Award } from "lucide-react";
import { recordCheckpoint } from "@/app/actions";
import { Button, ButtonLink } from "@/components/Button";
import { Confetti } from "@/components/Confetti";
import { Et } from "@/components/Et";
import { EstonianInput } from "@/components/EstonianInput";
import { Card, Empty, Meter, Page } from "@/components/ui";
import { checkAnswer, countsAsRecalled } from "@/lib/estonian/answer";
import { BLANK } from "@/lib/estonian/cloze";
import type { CheckpointQuestion } from "@/lib/collections/checkpoint";
import type { Level } from "@/lib/collections/syllabus";

/**
 * Sits a level checkpoint.
 *
 * No feedback until the end, and that is deliberate rather than an omission: a
 * checkpoint measures what the learner can already do, and telling them the
 * answer to question three teaches them something that question eleven then
 * tests. A lesson corrects as it goes; an exam does not.
 *
 * The question list is snapshotted on mount, like every other session here —
 * `recordCheckpoint` is a Server Action and Next re-runs the page after one,
 * which would otherwise deal a freshly seeded paper mid-exam.
 */
export function CheckpointSession({
  level, title, blurb, passMark, initialQuestions,
}: {
  level: Level;
  title: string;
  blurb: string;
  passMark: number;
  initialQuestions: CheckpointQuestion[];
}) {
  const [questions] = useState(initialQuestions);
  const [at, setAt] = useState(0);
  const [typed, setTyped] = useState("");
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState<{ lemma: string; expected: string; given: string }[]>([]);
  const [answers, setAnswers] = useState<
    { id: string; lemma: string; kind: string; correct: boolean; durationMs: number }[]
  >([]);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [done, setDone] = useState<{ passed: boolean; level: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = questions.length;
  const question = questions[at];

  const finish = useCallback(async (
    finalCorrect: number,
    finalAnswers: typeof answers,
  ) => {
    setSaving(true);
    const result = await recordCheckpoint(level, finalCorrect, total, finalAnswers);
    setSaving(false);
    if (!result.ok) { setError(result.error); return; }
    setDone({ passed: result.passed, level: result.level });
  }, [level, total]);

  const submit = useCallback(() => {
    if (!question || saving || done) return;
    const result = checkAnswer(typed, question.answer, "et");
    const ok = countsAsRecalled(result.verdict);
    const tally = correct + (ok ? 1 : 0);
    if (ok) setCorrect(tally);
    else setWrong((w) => [...w, { lemma: question.lemma, expected: question.answer, given: typed.trim() }]);

    const record = {
      // Generated per answer so a retried submit settles rather than
      // double-counting, the same property the offline outbox relies on.
      id: typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${question.id}-${Date.now()}`,
      lemma: question.lemma,
      kind: question.kind,
      correct: ok,
      durationMs: Math.min(Date.now() - startedAt, 600_000),
    };
    const nextAnswers = [...answers, record];
    setAnswers(nextAnswers);
    setStartedAt(Date.now());

    setTyped("");
    if (at + 1 < total) setAt(at + 1);
    else void finish(tally, nextAnswers);
  }, [answers, at, correct, done, finish, question, saving, startedAt, total, typed]);

  if (total === 0) {
    return (
      <Page title={title} lead={blurb}>
        <Empty
          title="Not enough of this level in your dictionary yet"
          body="A checkpoint draws on the whole level. Work through some of its units first."
          action={<ButtonLink href="/learn">Back to the course</ButtonLink>}
        />
      </Page>
    );
  }

  if (done) {
    const pct = Math.round((correct / total) * 100);
    return (
      <Page title={title} eyebrow={`${level} checkpoint`}>
        <Card className="flex flex-col gap-4">
          {done.passed && <Confetti />}
          <div className="flex items-center gap-2 text-sm" style={{ color: "var(--accent-deep)" }}>
            <Award size={16} aria-hidden /> {done.passed ? "Passed" : "Not this time"}
          </div>
          <h2 className="text-3xl tnum">{correct} of {total} · {pct}%</h2>
          <p className="text-lg">
            {done.passed
              ? `${level} is behind you. The course now opens at ${done.level}.`
              : `${passMark}% passes this one. Nothing has changed on your path, and you can take it again whenever you like.`}
          </p>
          {wrong.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm" style={{ color: "var(--ink-soft)" }}>What to look at again:</p>
              <ul className="flex flex-col gap-1 text-sm">
                {wrong.map((w, i) => (
                  <li key={`${w.lemma}-${i}`} className="flex flex-wrap gap-2">
                    <Et className="font-semibold">{w.expected}</Et>
                    <span style={{ color: "var(--ink-3)" }}>
                      {w.given ? <>you wrote <Et>{w.given}</Et></> : "left blank"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/learn">Back to the course</ButtonLink>
            <ButtonLink href="/review" variant="ghost">Review now</ButtonLink>
          </div>
        </Card>
      </Page>
    );
  }

  if (!question) return null;

  return (
    <Page
      title={title}
      eyebrow={`${level} checkpoint`}
      lead={`${blurb} No feedback until the end, so this measures what you can already do.`}
    >
      <div className="flex flex-col gap-5">
        <Meter pct={Math.round((at / total) * 100)} label={`Question ${at + 1} of ${total}`} />
        <Card className="flex flex-col gap-4">
          <span className="text-sm" style={{ color: "var(--ink-soft)" }}>
            Question {at + 1} of {total}
            {question.kind === "gap" ? " · fill the gap" : " · write it in Estonian"}
          </span>
          {question.kind === "gap" ? (
            <>
              <p className="text-xl"><Et>{question.sentence}</Et></p>
              <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                The word is <Et>{question.lemma}</Et> ({question.gloss}), in the form the sentence needs.
              </p>
            </>
          ) : (
            <p className="text-2xl">{question.gloss}</p>
          )}
          <EstonianInput
            key={question.id}
            value={typed}
            onChange={setTyped}
            large
            autoFocus
            ariaLabel="Your answer in Estonian"
            placeholder={question.kind === "gap" ? BLANK : undefined}
            onEnter={submit}
          />
          <Button onClick={submit} className="self-start" disabled={saving}>
            {at + 1 === total ? "Finish" : "Next"}
          </Button>
          {saving && <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Marking…</p>}
          {error && <p className="text-sm" role="alert" style={{ color: "var(--peach-ink)" }}>{error}</p>}
          <p className="text-xs" style={{ color: "var(--ink-3)" }}>
            Passing moves you up a level. Failing changes nothing: a bad evening is not evidence
            that you have lost a level you already had.
          </p>
        </Card>
      </div>
    </Page>
  );
}
