"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  CircleAlert, Clock, FileWarning, Loader2, Mic, Send, TriangleAlert, VolumeX, WifiOff,
} from "lucide-react";
import { submitExam } from "@/app/actions";
import { Button } from "@/components/Button";
import { DiacriticBar } from "@/components/DiacriticBar";
import { EstonianInput } from "@/components/EstonianInput";
import { Recorder } from "@/components/Recorder";
import { Speak } from "@/components/Speak";
import { Card, Chip, Meter, Note, SectionTitle } from "@/components/ui";
import type { ExamItem, ExamTask, Paper } from "@/lib/exam/paper";
import type { Response } from "@/lib/exam/score";
import { PASS_PCT, speakingCriteria, writtenMinutes } from "@/lib/exam/spec";
import { SKILL_ET } from "@/lib/exam/types";

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
  const [expired, setExpired] = useState(false);
  const startedAt = useRef(Date.now());

  const part = paper.parts[partIndex];
  const last = partIndex === paper.parts.length - 1;

  const setResponse = useCallback((itemId: string, response: Response) => {
    setResponses((current) => ({ ...current, [itemId]: response }));
  }, []);

  // ── The clock ──────────────────────────────────────────────────────────────
  const minutes = part?.spec.minutes ?? 0;
  const [deadline, setDeadline] = useState<number>(0);
  const [remaining, setRemaining] = useState(minutes * 60);

  useEffect(() => {
    if (!started || !part) return;
    const ends = Date.now() + part.spec.minutes * 60_000;
    setDeadline(ends);
    setRemaining(part.spec.minutes * 60);
    setExpired(false);
  }, [started, part, partIndex]);

  useEffect(() => {
    if (!started || deadline === 0) return;
    const tick = () => {
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) setExpired(true);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [started, deadline]);

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
        "Handing in needs a connection, and yours is not there. Your answers are still on this page.",
      );
      return;
    }
    router.push(`/exam/result/${result.id}`);
  }

  if (!started) {
    return (
      <Brief
        paper={paper}
        fillRate={fillRate}
        onStart={() => { startedAt.current = Date.now(); setStarted(true); }}
      />
    );
  }

  if (!part) return null;

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
            <h1 className="est text-xl font-bold" style={{ color: "var(--ink)" }}>
              {part.spec.label}
            </h1>
          </div>
          <div className="text-right">
            <p
              className="est tnum text-2xl font-bold leading-none"
              style={{ color: remaining <= 60 ? "var(--peach-ink)" : "var(--ink)" }}
              aria-live="polite"
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

      {expired && (
        <div className="mb-5">
          <Note tone="again">
            <TriangleAlert size={14} className="mr-1.5 inline" aria-hidden />
            Time is up on this part. In the hall the paper would be taken away now. Move on when you
            are ready, and anything still blank scores nothing.
          </Note>
        </div>
      )}

      {part.tasks.map((task, index) => (
        <TaskBlock
          key={task.spec.id}
          task={task}
          number={index + 1}
          responses={responses}
          onAnswer={setResponse}
        />
      ))}

      {error && (
        <div className="mb-4">
          <Note tone="again">
            <CircleAlert size={14} className="mr-1.5 inline" aria-hidden />
            {error}
          </Note>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5" style={{ borderColor: "var(--rule)" }}>
        <p className="text-sm" style={{ color: "var(--ink-3)" }}>
          {last
            ? `Handing in marks the whole paper. ${PASS_PCT} percent to pass, and no part may score nothing.`
            : "Moving on ends this part. You cannot come back to it, which is how the real paper works."}
        </p>
        {last ? (
          <Button variant="primary" onClick={hand} disabled={submitting}>
            {submitting
              ? <><Loader2 size={15} className="animate-spin" aria-hidden /> Marking</>
              : <><Send size={15} aria-hidden /> Hand in</>}
          </Button>
        ) : (
          <Button variant="primary" onClick={() => setPartIndex((i) => i + 1)}>
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

// ── The briefing ─────────────────────────────────────────────────────────────

/**
 * What the paper is, before the clock starts.
 *
 * The honest disclosures are here rather than buried at the end, because the
 * moment they matter is the moment somebody decides how much weight to give the
 * result they are about to get.
 */
function Brief({ paper, fillRate, onStart }: {
  paper: Paper; fillRate: number; onStart: () => void;
}) {
  const speaking = paper.parts.find((p) => p.spec.skill === "speaking");
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 md:px-10 md:py-12">
      <p className="label-xs mb-2" style={{ color: "var(--accent-deep)" }}>
        {paper.spec.official ? "Mock state examination" : "Not a state examination"}
      </p>
      <h1 className="est text-3xl font-bold tracking-tight md:text-4xl" style={{ color: "var(--ink)" }}>
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
                <span className="est text-md font-semibold" style={{ color: "var(--ink)" }}>
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
                      {" · "}set from words rather than sentences, because the dictionary here
                      holds no recorded sentence to build the intended task from
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
          {writtenMinutes(paper.spec)} minutes of written paper, then {speaking?.spec.minutes ?? 15}{" "}
          speaking. Each part runs on its own clock and you cannot go back to one you have left,
          which is how the real paper works. Nothing here is saved until you hand in, so sit it in
          one go.
        </Note>
        <Note tone="neutral">
          <WifiOff size={14} className="mr-1.5 inline" aria-hidden />
          This one needs a connection, which review deliberately does not. The recordings are
          fetched as you play them and the paper is marked on the server, so sit it somewhere with
          signal. If handing in fails, your answers stay on the page and the button can be pressed
          again.
        </Note>
        <Note tone="neutral">
          <Mic size={14} className="mr-1.5 inline" aria-hidden />
          The spoken part is marked by you. There is no verified Estonian speech recogniser
          available to this app, so you record yourself, listen back, and tick the criteria you
          met. The result says which quarter of your score came from that.
        </Note>
        {paper.substituted && (
          <Note tone="hard">
            <FileWarning size={14} className="mr-1.5 inline" aria-hidden />
            Some tasks are set from words rather than from sentences. Recorded example sentences
            reach this app from Ekilex, and without a key there are none, so the tasks that need one
            fall back to a shape the dictionary can always fill. Each of them says so above. The
            paper is easier than the one it imitates, and that is worth knowing before you read your
            score.
          </Note>
        )}
        {paper.thin && (
          <Note tone="again">
            <FileWarning size={14} className="mr-1.5 inline" aria-hidden />
            The dictionary could only fill {fillRate} percent of this paper, so some tasks are
            shorter than the specification asks for. Each part is marked out of what was actually
            set rather than out of what was intended, and the result names the shortfall. Adding an
            Ekilex key, or more words to the deck, fills the rest.
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

function TaskBlock({ task, number, responses, onAnswer }: {
  task: ExamTask;
  number: number;
  responses: Record<string, Response>;
  onAnswer: (itemId: string, response: Response) => void;
}) {
  return (
    <section className="mb-8">
      <SectionTitle hint={`${task.spec.raw} marks`}>
        Task {number}: {task.spec.title}
      </SectionTitle>
      <p className="mb-4 max-w-[62ch] text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
        {task.spec.instruction}
      </p>

      {task.shortfall > 0 && (
        <div className="mb-4">
          <Note tone="neutral">{task.shortfallReason}</Note>
        </div>
      )}

      {task.items.length === 0 ? (
        <Note tone="neutral">
          Nothing could be set for this task, so it carries no marks and the part is marked out of
          the rest.
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

function ItemView({ item, number, marks, choices, response, onAnswer }: {
  item: ExamItem;
  number: number;
  /** The marks this task carries, which is how many criteria the spoken task offers. */
  marks: number;
  choices?: { id: string; label: string; gloss: string }[];
  response: Response | undefined;
  onAnswer: (response: Response) => void;
}) {
  const stem = (
    <span className="label-xs mr-2 shrink-0" style={{ color: "var(--ink-3)" }}>{number}</span>
  );

  switch (item.kind) {
    case "match-usage":
      return (
        <div>
          <p className="est mb-3 text-md leading-relaxed" style={{ color: "var(--ink)" }} lang="et">
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
          <p className="est mb-3 text-md leading-relaxed" style={{ color: "var(--ink)" }} lang="et">
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
        <Audible item={item} number={number} response={response} onAnswer={onAnswer}>
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
            <span className="est font-semibold" lang="et">{item.word}</span>
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
            <span className="est font-semibold" lang="et">{item.lemma}</span>
            <span style={{ color: "var(--ink-3)" }}> {item.translation}</span>
            <span className="ml-2">
              in the {item.caseEn.toLowerCase()}
              <span style={{ color: "var(--ink-3)" }}> {item.caseEt}, {item.caseQuestion}</span>
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
            <span className="est font-semibold" lang="et">{item.lemma}</span>
            <span style={{ color: "var(--ink-3)" }}> {item.translation}</span>
          </p>
          {item.cue && (
            <p className="est mb-3 text-sm" style={{ color: "var(--ink-3)" }} lang="et">{item.cue}</p>
          )}
          <Options
            name={item.id}
            options={item.options.map((o) => ({ value: o.key, label: o.en, hint: o.et }))}
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
            <span className="est font-semibold" lang="et">{item.lemma}</span>
            <span style={{ color: "var(--ink-3)" }}> {item.translation}</span>
            <span className="ml-2">
              in the {item.caseEn.toLowerCase()}
              <span style={{ color: "var(--ink-3)" }}> {item.caseEt}, {item.caseQuestion}</span>
            </span>
          </p>
          <EstonianInput
            value={response?.kind === "typed" ? response.value : ""}
            onChange={(value) => onAnswer({ kind: "typed", value })}
            ariaLabel={`${item.caseEn} of ${item.lemma}`}
            placeholder="Write the form"
          />
        </div>
      );

    case "dictation":
      return (
        <Audible item={item} number={number} response={response} onAnswer={onAnswer} slow>
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

    case "compose":
      return (
        <ComposeQuestion
          item={item}
          text={response?.kind === "composed" ? response.value : ""}
          onWrite={(value) => onAnswer({ kind: "composed", value })}
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
function Audible({ item, number, response, onAnswer, slow, children }: {
  item: Extract<ExamItem, { kind: "dictation" | "listen-choose" }>;
  number: number;
  response: Response | undefined;
  onAnswer: (response: Response) => void;
  slow?: boolean;
  children: ReactNode;
}) {
  const [gone, setGone] = useState(false);
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
          The recording would not play, so this question is left out of the marks rather than
          counted against you.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3 flex flex-wrap items-center gap-2 text-sm" style={{ color: "var(--ink-2)" }}>
        <span className="label-xs" style={{ color: "var(--ink-3)" }}>{number}</span>
        <Speak
          text={item.answer}
          label={`Play recording ${number}`}
          onUnavailable={lose}
        />
        {slow && (
          <Speak
            text={item.answer}
            slow
            label={`Play recording ${number} slowly`}
            onUnavailable={lose}
          />
        )}
        <span>
          {item.unit === "word"
            ? "One word. Play it as often as you like."
            : item.kind === "dictation"
              ? `${item.words} words. Play it as often as you like.`
              : "Play it, then choose what you heard."}
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
            className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-[var(--r)] border px-3 py-2.5 text-sm"
            style={{
              borderColor: active ? "var(--accent)" : "var(--rule)",
              background: active ? "var(--accent-soft)" : "var(--surface)",
              color: active ? "var(--accent-deep)" : "var(--ink)",
            }}
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
              <span className={english ? "" : "est"} lang={english ? undefined : "et"}>
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
        Tap the words in order. Tap one you have placed to take it back.
      </p>
      <div
        className="est mb-3 flex min-h-[52px] flex-wrap items-center gap-2 rounded-[var(--r)] border border-dashed p-3"
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
              className="min-h-[44px] rounded-[var(--r-sm)] px-3 py-2 text-md"
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
            className="est min-h-[44px] rounded-[var(--r-sm)] border px-3 py-2 text-md"
            style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
            lang="et"
          >
            {word}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The free writing task. Length and the named words are what carry the marks. */
function ComposeQuestion({ item, text, onWrite }: {
  item: Extract<ExamItem, { kind: "compose" }>;
  text: string;
  onWrite: (next: string) => void;
}) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const ref = useRef<HTMLTextAreaElement>(null);

  return (
    <div>
      <p className="text-md leading-relaxed" style={{ color: "var(--ink)" }}>{item.prompt}</p>
      <p className="mt-2 flex flex-wrap items-center gap-2 text-sm" style={{ color: "var(--ink-2)" }}>
        <span>Use every one of these:</span>
        {item.mustUse.map((word) => (
          <Chip key={word.lexemeId} caseSensitive>
            <span className="est" lang="et">{word.lemma}</span>
            <span style={{ opacity: 0.75 }}>{word.translation}</span>
          </Chip>
        ))}
      </p>

      <textarea
        ref={ref}
        value={text}
        onChange={(event) => onWrite(event.target.value)}
        rows={10}
        aria-label={`Write about ${item.topic}`}
        placeholder="Write in Estonian."
        className="est mt-3 w-full rounded-[var(--r-lg)] border px-4 py-3 text-md leading-relaxed outline-none focus:shadow-[var(--shadow)]"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
        lang="et"
      />
      <div className="mt-2">
        <DiacriticBar />
      </div>
      <p className="mt-2 text-xs" style={{ color: words >= item.minWords ? "var(--mint-ink)" : "var(--ink-3)" }}>
        {words} of {item.minWords} words. Length carries most of the marks here, and the words above
        carry the rest. Nothing about your Estonian is judged by a model.
      </p>
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
            <span className="est" lang="et">{idea.lemma}</span>
            <span style={{ opacity: 0.75 }}>{idea.translation}</span>
          </Chip>
        ))}
      </p>

      <div className="mt-4">
        <Recorder onRecorded={() => update({ recorded: true })} />
      </div>

      <fieldset className="mt-5">
        <legend className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>
          Listen back and tick what you managed. Each one is a mark.
        </legend>
        <div className="grid gap-1.5">
          {criteria.map((criterion, index) => (
            <label
              key={criterion}
              className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-[var(--r)] px-3 py-2 text-sm"
              style={{ background: ticked[index] ? "var(--mint-soft)" : "var(--raised)", color: "var(--ink)" }}
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
                className="size-4 shrink-0 accent-[var(--mint)]"
              />
              <span>{criterion}</span>
            </label>
          ))}
        </div>
        {!recorded && (
          <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
            Record something first. Ticking boxes about a thing you did not do is not a self
            assessment, and this task would score nothing anyway.
          </p>
        )}
      </fieldset>
    </div>
  );
}
