"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  CircleAlert, Clock, Coffee, Ear, FileWarning, Headphones, Loader2, Mic, PenLine, RotateCcw,
  Send, TriangleAlert, VolumeX, WifiOff,
} from "lucide-react";
import { submitExam } from "@/app/actions";
import { Button } from "@/components/Button";
import { DiacriticBar } from "@/components/DiacriticBar";
import { EstonianInput } from "@/components/EstonianInput";
import { Recorder } from "@/components/Recorder";
import { Speak, SpeakPair } from "@/components/Speak";
import { Card, Chip, Meter, Note, SectionTitle } from "@/components/ui";
import { partOf } from "@/lib/exam/paper";
import type { ExamItem, ExamTask, MustUseWord, Paper } from "@/lib/exam/paper";
import type { Response } from "@/lib/exam/score";
import { usesRequiredWord, wordsOf } from "@/lib/exam/written";
import {
  BREAK_MINUTES, LISTEN_PLAYS, PASS_PCT, READ_QUESTIONS_SECONDS, speakingCriteria, writtenMinutes,
} from "@/lib/exam/spec";
import { SKILL_ET } from "@/lib/exam/types";
import { answeredIn, clearSitting, loadSitting, saveSitting, type SavedSitting } from "./resume";

/**
 * Sitting the paper.
 *
 * Four parts, in the order the real examination sets them, each on its own
 * clock. The clock is not decoration: the thing that fails most candidates is
 * the reading part at fifty minutes rather than the reading part, and a mock
 * without a timer teaches somebody they are ready when they are only capable.
 *
 * NOTHING IS MARKED HERE. The answers go to `submitExam`, which rebuilds this
 * exact paper from its seed on the server and marks it there. A client that
 * marked its own paper would be a client that could award itself a pass, and a
 * result nobody can trust is worse than no result.
 */
export function ExamSession({ paper: initialPaper, fillRate }: {
  paper: Paper;
  fillRate: number;
}) {
  /*
    Snapshotted once. Submitting is a Server Action and Next refreshes this
    route's Server Component afterwards, which would hand down a freshly built
    paper; the questions must not change under somebody halfway through
    answering them. The same freeze every review session makes, and it matters
    more here because a changed question mid-paper invalidates the sitting
    rather than one card.
  */
  const [paper] = useState(initialPaper);
  const router = useRouter();

  const [started, setStarted] = useState(false);
  const [partIndex, setPartIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, Response>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  /** Epoch ms each part's clock runs out at, so a resumed part keeps its own. */
  const [deadlines, setDeadlines] = useState<Record<number, number>>({});
  /** Epoch ms the break between the written half and the spoken part ends. */
  const [breakUntil, setBreakUntil] = useState<number | null>(null);
  const [resumable, setResumable] = useState<SavedSitting | null>(null);
  const startedAt = useRef(Date.now());

  const part = paper.parts[partIndex];
  const last = partIndex === paper.parts.length - 1;

  const setResponse = useCallback((itemId: string, response: Response) => {
    setResponses((current) => ({ ...current, [itemId]: response }));
  }, []);

  // ── Not losing three hours of work ─────────────────────────────────────────

  /*
    Looked for once, on mount, and offered rather than restored. Dropping
    somebody straight back into a half finished paper they had forgotten about
    is a worse surprise than the loss it prevents, and the resume card can say
    how much time is left before they choose.
  */
  useEffect(() => {
    const saved = loadSitting(initialPaper.level, initialPaper.seed);
    if (saved && answeredIn(saved) > 0) setResumable(saved);
  }, [initialPaper.level, initialPaper.seed]);

  useEffect(() => {
    if (!started) return;
    saveSitting({
      level: paper.level,
      seed: paper.seed,
      partIndex,
      responses,
      deadlines,
      startedAt: startedAt.current,
      breakUntil,
    });
  }, [started, paper.level, paper.seed, partIndex, responses, deadlines, breakUntil]);

  // ── The clock ──────────────────────────────────────────────────────────────
  const minutes = part?.spec.minutes ?? 0;
  const [now, setNow] = useState(() => Date.now());

  /*
    Set once per part, when the part is first opened, and never reset. It used to
    be recomputed from `Date.now()` in an effect keyed on the part, which is the
    same thing right up until the paper is resumed: a restored sitting would have
    quietly handed back the fifty minutes of reading somebody had already spent.
  */
  useEffect(() => {
    if (!started || breakUntil !== null || !part) return;
    setDeadlines((current) => (
      current[partIndex] !== undefined
        ? current
        : { ...current, [partIndex]: Date.now() + part.spec.minutes * 60_000 }
    ));
  }, [started, breakUntil, part, partIndex]);

  useEffect(() => {
    if (!started) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    setNow(Date.now());
    return () => window.clearInterval(timer);
  }, [started]);

  const deadline = deadlines[partIndex];
  const remaining = deadline === undefined
    ? minutes * 60
    : Math.max(0, Math.round((deadline - now) / 1000));
  const expired = deadline !== undefined && remaining === 0;

  /**
   * What the invigilator would be saying.
   *
   * A clock in the corner is something you have to remember to look at, and the
   * part of a real examination people describe afterwards is the announcement
   * at five minutes. Three states, so the live region below changes three times
   * rather than sixty times a minute.
   */
  const warning: "none" | "soon" | "last" | "gone" =
    deadline === undefined ? "none"
      : remaining === 0 ? "gone"
        : remaining <= 60 ? "last"
          : remaining <= 300 ? "soon"
            : "none";

  const answered = useMemo(() => {
    if (!part) return 0;
    return part.tasks.reduce(
      (sum, task) => sum + task.items.filter((item) => responses[item.id]).length,
      0,
    );
  }, [part, responses]);
  const questions = part?.tasks.reduce((sum, task) => sum + task.items.length, 0) ?? 0;

  async function hand() {
    setSubmitting(true);
    setError(null);
    const result = await submitExam({
      level: paper.level,
      seed: paper.seed,
      startedAt: startedAt.current,
      responses,
    }).catch(() => null);

    if (!result?.ok) {
      setSubmitting(false);
      setError(
        result?.error ??
        "You need a connection to hand this in, and you don't have one right now. Your answers are still here on the page.",
      );
      return;
    }
    // Only once the paper is safely marked. Clearing it before the round trip
    // would throw the answers away on exactly the failure the note above is for.
    clearSitting(paper.level, paper.seed);
    router.push(`/exam/result/${result.id}`);
  }

  /** Leaving a part, which on the real paper you cannot undo. */
  function advance() {
    setConfirming(false);
    const next = paper.parts[partIndex + 1];
    // The written parts are sat first and the spoken part follows a short break,
    // which is how the day is actually run. Straight from ninety minutes of
    // writing into a microphone is not the same test.
    if (next?.spec.skill === "speaking") setBreakUntil(Date.now() + BREAK_MINUTES * 60_000);
    setPartIndex((i) => i + 1);
  }

  if (!started) {
    return (
      <Brief
        paper={paper}
        fillRate={fillRate}
        resumable={resumable}
        onResume={() => {
          if (!resumable) return;
          setResponses(resumable.responses);
          setPartIndex(resumable.partIndex);
          setDeadlines(resumable.deadlines ?? {});
          setBreakUntil(resumable.breakUntil);
          startedAt.current = resumable.startedAt;
          setStarted(true);
        }}
        onDiscard={() => {
          clearSitting(paper.level, paper.seed);
          setResumable(null);
        }}
        onStart={() => { startedAt.current = Date.now(); setStarted(true); }}
      />
    );
  }

  if (!part) return null;

  if (breakUntil !== null) {
    return (
      <Break
        until={breakUntil}
        now={now}
        nextLabel={part.spec.label}
        onResume={() => setBreakUntil(null)}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-6 md:px-10 md:py-10">
      <header
        className="sticky top-0 z-10 -mx-5 mb-6 border-b px-5 py-3 md:-mx-10 md:px-10"
        style={{ background: "var(--ground)", borderColor: "var(--rule)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="label-xs" style={{ color: "var(--ink-3)" }}>
              {paper.level} · part {partIndex + 1} of {paper.parts.length} · {SKILL_ET[part.spec.skill]}
            </p>
            <h1 className="text-xl font-bold" style={{ color: "var(--ink)" }}>
              {part.spec.label}
            </h1>
          </div>
          <div className="text-right">
            {/*
              No `aria-live` on the clock itself. It had one, and a region that
              changes every second announces every second: a screen reader user
              sitting a fifty minute part was read three thousand numbers over
              whatever they were trying to answer. The warnings below are the
              live region, and they change three times in the whole part.
            */}
            <p
              className="tnum text-2xl font-bold leading-none"
              style={{ color: warning === "gone" || warning === "last" ? "var(--peach-ink)" : "var(--ink)" }}
              role="timer"
            >
              <Clock size={16} className="mr-1.5 inline" aria-hidden />
              {formatRemaining(remaining)}
            </p>
            <p className="text-2xs mt-1" style={{ color: "var(--ink-3)" }}>
              {answered} of {questions} answered
            </p>
          </div>
        </div>
        <div className="mt-2">
          <Meter
            pct={questions === 0 ? 0 : (answered / questions) * 100}
            label={`${answered} of ${questions} questions answered`}
            height={4}
          />
        </div>
      </header>

      {/*
        One live region for the whole part, announcing at the two thresholds an
        invigilator calls and again when the time goes. It is the clock's
        accessible half: `role="timer"` above says what it is, this says when it
        matters.
      */}
      <p className="sr-only" aria-live="polite">
        {warning === "gone"
          ? "Time is up on this part."
          : warning === "last"
            ? "One minute left."
            : warning === "soon"
              ? "Five minutes left."
              : ""}
      </p>

      {expired ? (
        <div className="mb-5">
          <Note tone="again">
            <TriangleAlert size={14} className="mr-1.5 inline" aria-hidden />
            Time&apos;s up. This part is closed now, the way it would be in a real exam hall. Anything
            you left blank scores nothing.{" "}
            {last ? "Hand in below." : "Move on when you are ready."}
          </Note>
        </div>
      ) : warning === "last" ? (
        <div className="mb-5">
          <Note tone="hard">
            <TriangleAlert size={14} className="mr-1.5 inline" aria-hidden />
            One minute left on this part.
          </Note>
        </div>
      ) : warning === "soon" ? (
        <div className="mb-5">
          <Note tone="neutral">
            <Clock size={14} className="mr-1.5 inline" aria-hidden />
            Five minutes left on this part.
          </Note>
        </div>
      ) : null}

      {/*
        One `fieldset` rather than a `disabled` prop threaded through every
        question shape. It closes radios, text boxes, the composition, the word
        tiles, the play buttons and the microphone in one, which is the point:
        the thing that must not happen when the time goes is that one shape of
        question stays answerable because somebody forgot to pass a flag down to
        it.
      */}
      <fieldset disabled={expired} className="min-w-0">
        {part.tasks.map((task, index) => (
          <TaskBlock
            key={task.spec.id}
            task={task}
            number={index + 1}
            responses={responses}
            onAnswer={setResponse}
            frozen={expired}
          />
        ))}
      </fieldset>

      {error && (
        <div className="mb-4">
          <Note tone="again">
            <CircleAlert size={14} className="mr-1.5 inline" aria-hidden />
            {error}
          </Note>
        </div>
      )}

      {confirming && (
        <div className="mb-4">
          <Note tone="hard">
            <TriangleAlert size={14} className="mr-1.5 inline" aria-hidden />
            {questions - answered === 1
              ? "One question on this part is still blank."
              : `${questions - answered} questions on this part are still blank.`}{" "}
            {last
              ? "Handing in now means they score nothing."
              : "You can't come back to this part once you leave it."}{" "}
            A guess beats a blank here, and it costs you nothing.
            <span className="mt-3 flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Go back and fill them in
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setConfirming(false); if (last) void hand(); else advance(); }}
              >
                {last ? "Hand in anyway" : "Leave them blank and move on"}
              </Button>
            </span>
          </Note>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5" style={{ borderColor: "var(--rule)" }}>
        <p className="text-sm" style={{ color: "var(--ink-3)" }}>
          {last
            ? `Handing in marks the whole paper. You need ${PASS_PCT} percent to pass, and no part can be a zero.`
            : paper.parts[partIndex + 1]?.spec.skill === "speaking"
              ? `Moving on ends the written half. There's a ${BREAK_MINUTES} minute break, then the spoken part.`
              : "Moving on ends this part. You can't come back to it, just like the real exam."}
        </p>
        {last ? (
          <Button
            variant="primary"
            onClick={() => {
              if (answered < questions && !confirming) { setConfirming(true); return; }
              void hand();
            }}
            disabled={submitting}
          >
            {submitting
              ? <><Loader2 size={15} className="animate-spin" aria-hidden /> Marking</>
              : <><Send size={15} aria-hidden /> Hand in</>}
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={() => {
              if (answered < questions && !confirming) { setConfirming(true); return; }
              advance();
            }}
          >
            Next part: {paper.parts[partIndex + 1]?.spec.label}
          </Button>
        )}
      </div>
    </div>
  );
}

function formatRemaining(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ── The break ────────────────────────────────────────────────────────────────

/**
 * The gap between the written half and the spoken part.
 *
 * The Board's own description of an examination day is the written parts first,
 * two to three hours of them depending on the level, and the spoken part after a
 * short break. This app ran the four parts back to back, which quietly made the
 * spoken part a test of stamina rather than of speaking: nobody is at their best
 * talking into a microphone straight off the end of ninety minutes of writing,
 * and nobody has to be.
 *
 * Ten minutes is ours, because the Board publishes "a short break" and no
 * number, and the screen says so. It can be ended early, and the clock on the
 * spoken part does not start until it is.
 */
function Break({ until, now, nextLabel, onResume }: {
  until: number; now: number; nextLabel: string; onResume: () => void;
}) {
  const left = Math.max(0, Math.round((until - now) / 1000));
  const over = left === 0;

  return (
    <div className="mx-auto max-w-2xl px-5 py-12 md:px-10 md:py-16">
      <p className="label-xs mb-2" style={{ color: "var(--accent-deep)" }}>
        Between the halves
      </p>
      <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--ink)" }}>
        <Coffee size={26} className="mr-2 inline" aria-hidden />
        Break
      </h1>
      <p className="mt-3 max-w-[56ch] text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
        The written half is done, and its clock has stopped. On the real exam day, a short break
        comes before the spoken part, so this is it. Stand up, get some water, and come back for{" "}
        {nextLabel.toLowerCase()}.
      </p>

      <p
        className="tnum mt-8 text-5xl font-bold"
        style={{ color: over ? "var(--mint-ink)" : "var(--ink)" }}
        role="timer"
      >
        {formatRemaining(left)}
      </p>
      <p className="mt-2 text-sm" style={{ color: "var(--ink-3)" }}>
        {over
          ? "The break is over whenever you are."
          : `${BREAK_MINUTES} minutes. The real exam board just says "a short break" with no number, so we picked one. Go early if you're ready.`}
      </p>

      <p className="sr-only" aria-live="polite">{over ? "The break is over." : ""}</p>

      <div className="mt-8">
        <Button variant="primary" size="lg" onClick={onResume}>
          Start the spoken part
        </Button>
      </div>
    </div>
  );
}

// ── The briefing ─────────────────────────────────────────────────────────────

/**
 * What the paper is, before the clock starts.
 *
 * The honest disclosures are here rather than buried at the end, because the
 * moment they matter is the moment somebody decides how much weight to give the
 * result they are about to get.
 */
function Brief({ paper, fillRate, resumable, onResume, onDiscard, onStart }: {
  paper: Paper;
  fillRate: number;
  resumable: SavedSitting | null;
  onResume: () => void;
  onDiscard: () => void;
  onStart: () => void;
}) {
  const speaking = partOf(paper, "speaking");
  const resumePart = resumable ? paper.parts[resumable.partIndex] : undefined;
  const resumeLeft = resumable && resumePart
    ? Math.max(0, Math.round(((resumable.deadlines?.[resumable.partIndex] ?? 0) - Date.now()) / 1000))
    : 0;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 md:px-10 md:py-12">
      {resumable && resumePart && (
        <div className="mb-6">
          <Card tone="accent">
            <p className="text-md font-semibold" style={{ color: "var(--ink)" }}>
              <RotateCcw size={16} className="mr-2 inline" aria-hidden />
              You left this paper part way through
            </p>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
              {answeredIn(resumable)} answered so far. You were on {resumePart.spec.label.toLowerCase()}.{" "}
              {resumeLeft > 0
                ? `${formatRemaining(resumeLeft)} is left on that part. The clock kept running while you were away, just like it would in a real exam hall.`
                : "That part's time ran out while you were away. It'll open closed, just like it would in a real exam hall."}
            </p>
            <span className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" size="sm" onClick={onResume}>Carry on</Button>
              <Button variant="ghost" size="sm" onClick={onDiscard}>
                Throw it away and start fresh
              </Button>
            </span>
          </Card>
        </div>
      )}
      <p className="label-xs mb-2" style={{ color: "var(--accent-deep)" }}>
        {paper.spec.official ? "Mock state examination" : "Not a state examination"}
      </p>
      <h1 className="text-3xl font-bold tracking-tight md:text-4xl" style={{ color: "var(--ink)" }}>
        {paper.level}
      </h1>
      <p className="mt-3 max-w-[62ch] text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
        {paper.spec.summary}
      </p>

      <ul className="mt-6 grid gap-3">
        {paper.parts.map((part, index) => (
          <Card as="li" key={part.spec.skill} className="!py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>
                <span className="label-xs mr-2" style={{ color: "var(--ink-3)" }}>
                  Part {index + 1}
                </span>
                <span className="text-md font-semibold" style={{ color: "var(--ink)" }}>
                  {part.spec.label}
                </span>
                <span className="ml-2 text-sm" style={{ color: "var(--ink-3)" }}>
                  {SKILL_ET[part.spec.skill]}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <Chip>{part.spec.minutes} min</Chip>
                <Chip tone="accent">{part.spec.points} points</Chip>
              </span>
            </div>
            <ul className="mt-2 grid gap-1">
              {part.tasks.map((task) => (
                <li key={task.spec.id} className="text-sm" style={{ color: "var(--ink-2)" }}>
                  {task.spec.title}
                  <span style={{ color: "var(--ink-3)" }}>
                    {" · "}stands for {task.spec.standsFor}
                  </span>
                  {task.fallbackFrom && (
                    <span style={{ color: "var(--butter-ink)" }}>
                      {" · "}made from single words, not full sentences, since we don&apos;t have a
                      recorded sentence for this one yet
                    </span>
                  )}
                  {task.shortfall > 0 && (
                    <span style={{ color: "var(--peach-ink)" }}>
                      {" · "}{task.shortfallReason}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </ul>

      <div className="mt-6 grid gap-3">
        <Note tone="sky">
          {writtenMinutes(paper.spec)} minutes of written paper, then a {BREAK_MINUTES} minute
          break, then {speaking?.spec.minutes ?? 15} minutes of speaking. That&apos;s the order, and
          that&apos;s the whole day. Each part runs on its own clock, and once you leave a part you
          can&apos;t go back to it. When a part&apos;s time runs out, it closes. Your answers are saved on
          this device as you go, so closing the tab or reloading won&apos;t lose your paper, and the
          clock keeps running even while it is closed.
        </Note>
        <Note tone="neutral">
          <PenLine size={14} className="mr-1.5 inline" aria-hidden />
          The real writing part is just two pieces of writing, and the clock is only for those two.
          The grammar questions after them are ours, not the real exam&apos;s: a real examiner checks
          your grammar by reading what you wrote, and nothing here can do that. They come last, so
          use whatever time the two texts leave you.
        </Note>
        <Note tone="neutral">
          <Headphones size={14} className="mr-1.5 inline" aria-hidden />
          Each recording plays {LISTEN_PLAYS} times and no more, just like the real exam. Every
          listening task gives you {READ_QUESTIONS_SECONDS} seconds to read the questions before
          the audio starts.
          {/* A fact about the C1 paper, printed unconditionally, so the A2
              briefing carried a caveat about a paper the candidate is not
              sitting. */}
          {paper.level === "C1" && (
            <> The real C1 paper plays one task only once. We don&apos;t do that here, so this
            listening part is a little easier than the real thing.</>
          )}
        </Note>
        <Note tone="neutral">
          <WifiOff size={14} className="mr-1.5 inline" aria-hidden />
          Unlike everyday review, this needs a live connection. The recordings load as you play
          them, and the paper is marked on our server, so make sure you&apos;re somewhere with signal.
          If handing in fails, your answers stay right here on the page, and you can just press the
          button again.
        </Note>
        <Note tone="neutral">
          <Mic size={14} className="mr-1.5 inline" aria-hidden />
          You mark the spoken part yourself. We tested a speech recognizer for Estonian and it
          wasn&apos;t accurate enough, so instead you record yourself, listen back, and tick off what
          you managed. Your result will show which quarter of your score came from this part. The
          real spoken exam opens with a few minutes of chat with the examiner before the tasks
          start. There&apos;s no examiner here, so we go straight to the first task.
        </Note>
        {paper.substituted && (
          <Note tone="hard">
            <FileWarning size={14} className="mr-1.5 inline" aria-hidden />
            Some tasks use single words instead of full sentences. We don&apos;t have a recorded
            sentence for every word yet, so those tasks fall back to a version we can always build.
            Each one says so above. This makes the paper a little easier than the one it&apos;s
            copying, which is worth knowing before you look at your score.
          </Note>
        )}
        {paper.thin && (
          <Note tone="again">
            <FileWarning size={14} className="mr-1.5 inline" aria-hidden />
            The dictionary could only fill {fillRate} percent of this paper, so some tasks are
            shorter than a full paper. Each part is marked on what was actually set, not on what
            should have been there, and your result will explain the shortfall. Add more words to
            your deck and this fills in over time. Running this yourself? Adding an Ekilex key
            fills it in right away.
          </Note>
        )}
      </div>

      <div className="mt-8">
        <Button variant="primary" size="lg" onClick={onStart}>
          Start the clock
        </Button>
      </div>
    </div>
  );
}

// ── One task ─────────────────────────────────────────────────────────────────

function TaskBlock({ task, number, responses, onAnswer, frozen }: {
  task: ExamTask;
  number: number;
  responses: Record<string, Response>;
  onAnswer: (itemId: string, response: Response) => void;
  /** The part's time has gone, so nothing here should still be counting down. */
  frozen: boolean;
}) {
  const audible = task.items.some(
    (item) => item.kind === "dictation" || item.kind === "listen-choose",
  );
  /*
    The pause before a listening task, which every specification describes and
    which this app did not have: the recordings used to be playable the instant
    the part opened, so the first one arrived while the learner was still finding
    out what they were being asked. Skippable, because the point is to teach the
    shape of the part rather than to make somebody sit out half a minute they
    have already used.
  */
  const [reading, setReading] = useState(audible);
  const [left, setLeft] = useState(READ_QUESTIONS_SECONDS);

  useEffect(() => {
    if (!reading || frozen) return;
    const ends = Date.now() + READ_QUESTIONS_SECONDS * 1000;
    const timer = window.setInterval(() => {
      const seconds = Math.max(0, Math.round((ends - Date.now()) / 1000));
      setLeft(seconds);
      if (seconds === 0) setReading(false);
    }, 250);
    return () => window.clearInterval(timer);
  }, [reading, frozen]);

  return (
    <section className="mb-8">
      <SectionTitle hint={`${task.spec.raw} marks`}>
        Task {number}: {task.spec.title}
      </SectionTitle>
      <p className="mb-4 max-w-[62ch] text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
        {task.spec.instruction}
      </p>

      {/*
        Only while the pause is running. Once it is over the task's own
        instruction has already said how many plays there are, and a second
        notice saying it again is a line of furniture above every listening
        question on the paper.
      */}
      {audible && reading && task.items.length > 0 && (
        <div className="mb-4">
          <Note tone="hard">
            <Ear size={14} className="mr-1.5 inline" aria-hidden />
            Read the questions first. The recordings unlock in{" "}
            <span className="tnum font-semibold">{left}</span> seconds, just like on the real exam.
            <span className="mt-3 flex">
              <Button variant="ghost" size="sm" onClick={() => setReading(false)}>
                I&apos;ve read them, unlock the recordings
              </Button>
            </span>
          </Note>
        </div>
      )}

      {task.shortfall > 0 && (
        <div className="mb-4">
          <Note tone="neutral">{task.shortfallReason}</Note>
        </div>
      )}

      {task.items.length === 0 ? (
        <Note tone="neutral">
          We couldn&apos;t set anything for this task, so it carries no marks. The part is marked
          on what&apos;s left.
        </Note>
      ) : (
        <ol className="grid gap-4">
          {task.items.map((item, index) => (
            <li key={item.id}>
              <Card className="!py-4">
                <ItemView
                  item={item}
                  number={index + 1}
                  marks={task.spec.raw}
                  choices={task.choices}
                  response={responses[item.id]}
                  canPlay={!reading}
                  onAnswer={(next) => onAnswer(item.id, next)}
                />
              </Card>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ── One question ─────────────────────────────────────────────────────────────

function ItemView({ item, number, marks, choices, response, canPlay, onAnswer }: {
  item: ExamItem;
  number: number;
  /** The marks this task carries, which is how many criteria the spoken task offers. */
  marks: number;
  choices?: { id: string; label: string; gloss: string }[];
  response: Response | undefined;
  /** False while the task's reading pause is still running. */
  canPlay: boolean;
  onAnswer: (response: Response) => void;
}) {
  const stem = (
    <span className="label-xs mr-2 shrink-0" style={{ color: "var(--ink-3)" }}>{number}</span>
  );

  switch (item.kind) {
    case "match-usage":
      return (
        <div>
          <p className="mb-3 text-md leading-relaxed" style={{ color: "var(--ink)" }} lang="et">
            {stem}{item.sentence}
          </p>
          <Options
            name={item.id}
            options={(choices ?? []).map((c) => ({ value: c.id, label: c.label, hint: c.gloss }))}
            selected={response?.kind === "chosen" ? response.value : null}
            onSelect={(value) => onAnswer({ kind: "chosen", value })}
            columns
          />
        </div>
      );

    case "gap-choice":
      return (
        <div>
          <p className="mb-3 text-md leading-relaxed" style={{ color: "var(--ink)" }} lang="et">
            {stem}{item.sentence}
          </p>
          <Options
            name={item.id}
            options={item.options.map((value) => ({ value, label: value }))}
            selected={response?.kind === "chosen" ? response.value : null}
            onSelect={(value) => onAnswer({ kind: "chosen", value })}
            columns
          />
        </div>
      );

    case "listen-choose":
      return (
        <Audible item={item} number={number} response={response} canPlay={canPlay} onAnswer={onAnswer}>
          <Options
            name={item.id}
            options={item.options.map((value) => ({ value, label: value }))}
            selected={response?.kind === "chosen" ? response.value : null}
            onSelect={(value) => onAnswer({ kind: "chosen", value })}
          />
        </Audible>
      );

    case "gloss-choice":
      return (
        <div>
          <p className="mb-3 text-md" style={{ color: "var(--ink)" }}>
            {stem}
            <span className="font-semibold" lang="et">{item.word}</span>
          </p>
          <Options
            name={item.id}
            options={item.options.map((value) => ({ value, label: value }))}
            selected={response?.kind === "chosen" ? response.value : null}
            onSelect={(value) => onAnswer({ kind: "chosen", value })}
            columns
            english
          />
        </div>
      );

    case "form-choice":
      return (
        <div>
          <p className="mb-3 text-md" style={{ color: "var(--ink)" }}>
            {stem}
            <span className="font-semibold" lang="et">{item.lemma}</span>
            <span style={{ color: "var(--ink-3)" }}> {item.translation}</span>
            <span className="ml-2">
              in the <span lang="et">{item.caseEt}</span>
              <span lang="et" style={{ color: "var(--accent-deep)" }}> {item.caseQuestion}</span>
              <span style={{ color: "var(--ink-3)" }}> the {item.caseEn.toLowerCase()}</span>
            </span>
          </p>
          <Options
            name={item.id}
            options={item.options.map((value) => ({ value, label: value }))}
            selected={response?.kind === "chosen" ? response.value : null}
            onSelect={(value) => onAnswer({ kind: "chosen", value })}
            columns
          />
        </div>
      );

    case "government":
      return (
        <div>
          <p className="mb-1 text-md" style={{ color: "var(--ink)" }}>
            {stem}
            <span className="font-semibold" lang="et">{item.lemma}</span>
            <span style={{ color: "var(--ink-3)" }}> {item.translation}</span>
          </p>
          {item.cue && (
            <p className="mb-3 text-sm" style={{ color: "var(--ink-3)" }} lang="et">{item.cue}</p>
          )}
          <Options
            name={item.id}
            options={item.options.map((o) => ({ value: o.key, label: o.et, hint: o.question }))}
            selected={response?.kind === "chosen" ? response.value : null}
            onSelect={(value) => onAnswer({ kind: "chosen", value })}
            columns
          />
        </div>
      );

    case "case-form":
      return (
        <div>
          <p className="mb-3 text-md" style={{ color: "var(--ink)" }}>
            {stem}
            <span className="font-semibold" lang="et">{item.lemma}</span>
            <span style={{ color: "var(--ink-3)" }}> {item.translation}</span>
            <span className="ml-2">
              in the <span lang="et">{item.caseEt}</span>
              <span lang="et" style={{ color: "var(--accent-deep)" }}> {item.caseQuestion}</span>
              <span style={{ color: "var(--ink-3)" }}> the {item.caseEn.toLowerCase()}</span>
            </span>
          </p>
          <EstonianInput
            value={response?.kind === "typed" ? response.value : ""}
            onChange={(value) => onAnswer({ kind: "typed", value })}
            ariaLabel={`${item.caseEt} of ${item.lemma}, the ${item.caseEn.toLowerCase()}`}
            placeholder="Write the form"
          />
        </div>
      );

    case "dictation":
      return (
        <Audible item={item} number={number} response={response} canPlay={canPlay} onAnswer={onAnswer} slow>
          <EstonianInput
            value={response?.kind === "typed" ? response.value : ""}
            onChange={(value) => onAnswer({ kind: "typed", value })}
            ariaLabel={`Recording ${number}, written down`}
            placeholder="Write what you hear"
          />
        </Audible>
      );

    case "order":
      return (
        <OrderQuestion
          item={item}
          number={number}
          built={response?.kind === "ordered" ? response.value : []}
          onBuild={(value) => onAnswer({ kind: "ordered", value })}
        />
      );

    case "message":
      return (
        <MessageQuestion
          item={item}
          text={response?.kind === "composed" ? response.value : ""}
          onWrite={(value) => onAnswer({ kind: "composed", value })}
        />
      );

    case "compose":
      return (
        <ComposeQuestion
          item={item}
          response={response?.kind === "composed" ? response : null}
          onWrite={(value, variant) => onAnswer({ kind: "composed", value, variant })}
        />
      );

    case "speak":
      return (
        <SpeakQuestion
          item={item}
          marks={marks}
          response={response?.kind === "spoken" ? response : null}
          onMark={(next) => onAnswer(next)}
        />
      );
  }
}

/**
 * A listening question, and what to do when the recording will not play.
 *
 * `Speak` removes itself when the speech proxy cannot produce audio, which on
 * every other screen loses a pronunciation button and here would leave a
 * question with no way to answer it. Marking that wrong would charge the
 * learner for an outage of ours, so the item reports itself unheard and the
 * server leaves it out of the marks entirely. The learner is told, in the same
 * words the result will use.
 */
function Audible({ item, number, response, canPlay, onAnswer, slow, children }: {
  item: Extract<ExamItem, { kind: "dictation" | "listen-choose" }>;
  number: number;
  response: Response | undefined;
  canPlay: boolean;
  onAnswer: (response: Response) => void;
  slow?: boolean;
  children: ReactNode;
}) {
  const [gone, setGone] = useState(false);
  /*
    Counted here rather than in `Speak`, because the budget belongs to the
    question and not to a button: the dictation offers a slow play as well, and
    two buttons each keeping their own count would quietly hand out four plays.
    Incremented only when a play actually happened, so a clip that would not load
    costs nothing and takes the unheard path below instead.
  */
  const [played, setPlayed] = useState(0);
  const spent = played >= LISTEN_PLAYS;
  const unheard = gone || response?.kind === "unheard";

  const lose = () => {
    setGone(true);
    onAnswer({ kind: "unheard" });
  };

  if (unheard) {
    return (
      <div>
        <p className="mb-2 text-sm" style={{ color: "var(--ink-2)" }}>
          <span className="label-xs mr-2" style={{ color: "var(--ink-3)" }}>{number}</span>
          <VolumeX size={14} className="mr-1.5 inline" aria-hidden />
          The recording wouldn&apos;t play, so this question is left out of the marks rather than
          counted against you.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3 flex flex-wrap items-center gap-2 text-sm" style={{ color: "var(--ink-2)" }}>
        <span className="label-xs" style={{ color: "var(--ink-3)" }}>{number}</span>
        {slow ? (
          <SpeakPair
            text={item.answer}
            label={`Play recording ${number}`}
            slowLabel={`Play recording ${number} slowly`}
            disabled={!canPlay || spent}
            onPlay={() => setPlayed((n) => n + 1)}
            onUnavailable={lose}
          />
        ) : (
          <Speak
            text={item.answer}
            label={`Play recording ${number}`}
            disabled={!canPlay || spent}
            onPlay={() => setPlayed((n) => n + 1)}
            onUnavailable={lose}
          />
        )}
        <span>
          {item.unit === "word"
            ? "One word."
            : item.kind === "dictation"
              ? `${item.words} words.`
              : "Play it, then choose what you heard."}
          {" "}
          {/*
            Nothing per question while the pause is running: the task says once,
            at the top, that the recordings are shut, and repeating it on all
            sixteen questions of a listening part is noise where the answer
            options need to be readable.
          */}
          {canPlay && (
            <span
              className="tnum"
              style={{ color: spent ? "var(--peach-ink)" : "var(--ink-3)" }}
            >
              {spent
                ? "Both plays used, same as the real exam. Answer with what you heard."
                : `${LISTEN_PLAYS - played} of ${LISTEN_PLAYS} plays left.`}
            </span>
          )}
        </span>
      </p>
      {children}
    </div>
  );
}

/** A radio group that looks like a set of cards and behaves like a radio group. */
function Options({ name, options, selected, onSelect, columns, english }: {
  name: string;
  options: { value: string; label: string; hint?: string }[];
  selected: string | null;
  onSelect: (value: string) => void;
  columns?: boolean;
  /** The options are English glosses rather than Estonian, so do not tag them. */
  english?: boolean;
}) {
  return (
    <div className={`grid gap-2 ${columns ? "sm:grid-cols-2" : ""}`} role="radiogroup">
      {options.map((option) => {
        const active = selected === option.value;
        return (
          <label
            key={option.value}
            className="choice-btn flex min-h-[44px] cursor-pointer items-center gap-3 rounded-[var(--r)] border px-3 py-2.5 text-sm"
            style={active ? {
              borderColor: "var(--accent)",
              background: "var(--accent-soft)",
              color: "var(--accent-deep)",
            } : { color: "var(--ink)" }}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={active}
              onChange={() => onSelect(option.value)}
              className="size-4 shrink-0 accent-[var(--accent)]"
            />
            <span className="min-w-0">
              <span lang={english ? undefined : "et"}>
                {option.label}
              </span>
              {option.hint && (
                <span className="ml-2 text-xs" style={{ color: "var(--ink-3)" }}>{option.hint}</span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/** Tap the words in order. Tapping a placed word takes it back. */
function OrderQuestion({ item, number, built, onBuild }: {
  item: Extract<ExamItem, { kind: "order" }>;
  number: number;
  built: string[];
  onBuild: (next: string[]) => void;
}) {
  const remaining = useMemo(() => {
    const pool = [...item.tiles];
    for (const word of built) {
      const at = pool.indexOf(word);
      if (at !== -1) pool.splice(at, 1);
    }
    return pool;
  }, [item.tiles, built]);

  return (
    <div>
      <p className="mb-3 text-sm" style={{ color: "var(--ink-2)" }}>
        <span className="label-xs mr-2" style={{ color: "var(--ink-3)" }}>{number}</span>
        Tap the words in order. Tap one you&apos;ve placed to take it back.
      </p>
      <div
        className="mb-3 flex min-h-[52px] flex-wrap items-center gap-2 rounded-[var(--r)] border border-dashed p-3"
        style={{ borderColor: "var(--rule)", background: "var(--raised)" }}
        lang="et"
      >
        {built.length === 0
          ? <span className="text-sm" style={{ color: "var(--ink-3)" }}>Your sentence goes here.</span>
          : built.map((word, index) => (
            <button
              key={`${word}-${index}`}
              type="button"
              onClick={() => onBuild(built.filter((_, i) => i !== index))}
              className="press min-h-[44px] rounded-[var(--r-sm)] px-3 py-2 text-md transition-ui hover:-translate-y-0.5"
              style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
            >
              {word}
            </button>
          ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {remaining.map((word, index) => (
          <button
            key={`${word}-${index}`}
            type="button"
            onClick={() => onBuild([...built, word])}
            className="choice-btn min-h-[44px] rounded-[var(--r-sm)] border px-3 py-2 text-md"
            style={{ color: "var(--ink)" }}
            lang="et"
          >
            {word}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The words a written task has to use, ticked off as they are used.
 *
 * `usesRequiredWord` is imported from the marking rather than reimplemented,
 * which is the whole point of it being exported: a chip that lit up on a rule of
 * its own would be telling somebody they had a mark the server was not going to
 * give them. Estonian inflects, so `raamatust` lights `raamat`, exactly as it
 * scores it, and `kirjutan` lights nothing, exactly as it scores that.
 */
function RequiredWords({ words, text }: { words: MustUseWord[]; text: string }) {
  if (words.length === 0) return null;
  const used = words.filter((word) => usesRequiredWord(word, text)).length;

  return (
    <p className="mt-2 flex flex-wrap items-center gap-2 text-sm" style={{ color: "var(--ink-2)" }}>
      <span>
        Use every one of these{" "}
        <span className="tnum" style={{ color: used === words.length ? "var(--mint-ink)" : "var(--ink-3)" }}>
          {used} of {words.length} used
        </span>
      </span>
      {words.map((word) => {
        const done = usesRequiredWord(word, text);
        return (
          // `wrap`, because this chip carries a full dictionary gloss rather
          // than a label, and a gloss is as long as the word needs.
          <Chip key={word.lexemeId} tone={done ? "good" : "neutral"} caseSensitive>
            <span lang="et">{word.lemma}</span>
            <span style={{ opacity: 0.75 }}>{word.translation}</span>
          </Chip>
        );
      })}
    </p>
  );
}

/** How far a written answer is through the length that carries its marks. */
function LengthMeter({ text, minWords }: { text: string; minWords: number }) {
  const words = wordsOf(text).length;
  const there = words >= minWords;
  return (
    <>
      <div className="mt-2">
        <Meter
          pct={minWords === 0 ? 100 : Math.min(100, (words / minWords) * 100)}
          label={`${words} of ${minWords} words written`}
          tone={there ? "var(--mint)" : "var(--accent)"}
          height={4}
        />
      </div>
      <p className="mt-2 text-xs" style={{ color: there ? "var(--mint-ink)" : "var(--ink-3)" }}>
        {words} of {minWords} words{there ? ". That's enough" : ""}. Length is most of your mark
        here, and the required words above make up the rest. Write half the length and you still
        get about half those marks, not none. No model judges your Estonian.
      </p>
    </>
  );
}

/**
 * The short message, which is the task the real writing part opens with.
 *
 * `teate koostamine`: a situation, and the points the message has to cover. The
 * points are printed because the real task prints them and somebody practicing
 * this needs to learn to answer all three; they are not marked, and the screen
 * says so rather than implying a machine read them.
 */
function MessageQuestion({ item, text, onWrite }: {
  item: Extract<ExamItem, { kind: "message" }>;
  text: string;
  onWrite: (next: string) => void;
}) {
  return (
    <div>
      <p className="text-md leading-relaxed" style={{ color: "var(--ink)" }}>{item.prompt}</p>
      <ul className="mt-2 grid gap-1 text-sm" style={{ color: "var(--ink-2)" }}>
        {item.cover.map((point) => (
          <li key={point} className="flex items-start gap-2">
            <span aria-hidden style={{ color: "var(--accent)" }}>&middot;</span>
            {point}
          </li>
        ))}
      </ul>
      <RequiredWords words={item.mustUse} text={text} />

      <textarea
        value={text}
        onChange={(event) => onWrite(event.target.value)}
        rows={5}
        aria-label={`Write ${item.scenario}`}
        placeholder="Write in Estonian."
        className="mt-3 w-full rounded-[var(--r-lg)] border px-4 py-3 text-md leading-relaxed focus:shadow-[var(--shadow)]"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
        lang="et"
      />
      <div className="mt-2">
        <DiacriticBar />
      </div>
      <LengthMeter text={text} minWords={item.minWords} />
      <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>
        Check for yourself whether you covered all three points when you read it back. A machine
        can&apos;t tell without judging your Estonian, and nothing here does that.
      </p>
    </div>
  );
}

/** The free writing task. Length and the named words are what carry the marks. */
function ComposeQuestion({ item, response, onWrite }: {
  item: Extract<ExamItem, { kind: "compose" }>;
  response: Extract<Response, { kind: "composed" }> | null;
  onWrite: (next: string, variant: number) => void;
}) {
  const text = response?.value ?? "";
  const chosen = response?.variant ?? 0;
  const ref = useRef<HTMLTextAreaElement>(null);
  const brief = item.variants?.[chosen] ?? item.variants?.[0];

  return (
    <div>
      {/*
        The choice the real paper offers: "kas a) jutt etteantud teemal, või
        b) isiklik kiri". Both are marked identically here, on length and on the
        words the task named, so picking one changes what you write and not what
        it is worth. Switching keeps the text: somebody who has written eighty
        words and then decides it is really a letter should not lose them.
      */}
      {item.variants && item.variants.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Which to write">
          {item.variants.map((variant, index) => (
            <label
              key={variant.label}
              className="choice-btn flex min-h-[44px] cursor-pointer items-center gap-2 rounded-[var(--r)] border px-3 py-2 text-sm"
              style={chosen === index ? {
                borderColor: "var(--accent)",
                background: "var(--accent-soft)",
                color: "var(--accent-deep)",
              } : { color: "var(--ink)" }}
            >
              <input
                type="radio"
                name={`${item.id}-variant`}
                checked={chosen === index}
                onChange={() => onWrite(text, index)}
                className="size-4 shrink-0 accent-[var(--accent)]"
              />
              {variant.label}
            </label>
          ))}
        </div>
      )}

      <p className="text-md leading-relaxed" style={{ color: "var(--ink)" }}>
        {brief?.prompt ?? item.prompt}
      </p>
      <RequiredWords words={item.mustUse} text={text} />

      <textarea
        ref={ref}
        value={text}
        onChange={(event) => onWrite(event.target.value, chosen)}
        rows={10}
        aria-label={`Write about ${item.topic}`}
        placeholder="Write in Estonian."
        className="mt-3 w-full rounded-[var(--r-lg)] border px-4 py-3 text-md leading-relaxed focus:shadow-[var(--shadow)]"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
        lang="et"
      />
      <div className="mt-2">
        <DiacriticBar />
      </div>
      <LengthMeter text={text} minWords={item.minWords} />
    </div>
  );
}

/** Record, listen back, mark yourself. Nothing here scores a recording. */
function SpeakQuestion({ item, marks, response, onMark }: {
  item: Extract<ExamItem, { kind: "speak" }>;
  marks: number;
  response: Extract<Response, { kind: "spoken" }> | null;
  onMark: (next: Response) => void;
}) {
  // One criterion per mark, so ticking six of eight really is six marks of eight.
  const criteria = speakingCriteria(marks);
  const ticked = response?.criteria ?? criteria.map(() => false);
  const recorded = response?.recorded ?? false;

  const update = (next: Partial<{ recorded: boolean; criteria: boolean[] }>) => {
    onMark({
      kind: "spoken",
      recorded: next.recorded ?? recorded,
      criteria: next.criteria ?? ticked,
    });
  };

  return (
    <div>
      <p className="text-md leading-relaxed" style={{ color: "var(--ink)" }}>{item.prompt}</p>
      <p className="mt-1 text-sm" style={{ color: "var(--ink-3)" }}>
        Aim for about {item.seconds} seconds.
      </p>
      <p className="mt-2 flex flex-wrap items-center gap-2 text-sm" style={{ color: "var(--ink-2)" }}>
        <span>Idea card:</span>
        {item.ideas.map((idea) => (
          <Chip key={idea.lexemeId} caseSensitive>
            <span lang="et">{idea.lemma}</span>
            <span style={{ opacity: 0.75 }}>{idea.translation}</span>
          </Chip>
        ))}
      </p>

      <div className="mt-4">
        <Recorder targetSeconds={item.seconds} onRecorded={() => update({ recorded: true })} />
      </div>

      <fieldset className="mt-5">
        <legend className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>
          Listen back and tick what you managed. Each one is a mark.
        </legend>
        <div className="grid gap-1.5">
          {criteria.map((criterion, index) => (
            <label
              key={criterion}
              className="choice-btn flex min-h-[44px] cursor-pointer items-center gap-3 rounded-[var(--r)] px-3 py-2 text-sm"
              /* Chosen is accent here as it is on every other option in this
                 paper: a tick is a selection, and mint is what a marked answer
                 wears, which nothing on the spoken part can be (ADR-018). */
              style={ticked[index]
                ? { "--choice-bg": "var(--accent-soft)", borderColor: "var(--accent)", color: "var(--accent-deep)" } as React.CSSProperties
                : { "--choice-bg": "var(--raised)", color: "var(--ink)" } as React.CSSProperties}
            >
              <input
                type="checkbox"
                checked={Boolean(ticked[index])}
                disabled={!recorded}
                onChange={(event) => {
                  const next = [...ticked];
                  next[index] = event.target.checked;
                  update({ criteria: next });
                }}
                className="size-4 shrink-0 accent-[var(--accent)]"
              />
              <span>{criterion}</span>
            </label>
          ))}
        </div>
        {!recorded && (
          <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
            Record something first. Ticking boxes for something you haven&apos;t done isn&apos;t
            really judging yourself, and this task would score nothing anyway.
          </p>
        )}
      </fieldset>
    </div>
  );
}
