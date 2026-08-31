"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Ear, Volume2, X } from "lucide-react";
import { Button } from "@/components/Button";
import { EstonianInput } from "@/components/EstonianInput";
import { Recorder } from "@/components/Recorder";
import { Speak } from "@/components/Speak";
import { Chip, Note } from "@/components/ui";
import { gradeChoice, gradeDictation, gradeWrite } from "@/lib/assessment/score";
import type { ChoiceItem, DictationItem, Item, SpeakItem, WriteItem } from "@/lib/assessment/types";
import type { WordStatus } from "@/lib/estonian/dictation";

/**
 * One question, and its answer.
 *
 * Each kind reports the same thing back: a credit between 0 and 1, and, for
 * speaking, the learner's own rating instead. Nothing here decides a level; the
 * pure marking functions in `lib/assessment/score.ts` do the marking and
 * `placement()` does the rest, so what a learner sees on screen and what the
 * result is built from cannot drift apart.
 *
 * Feedback is shown after every answer, including the wrong ones, with the
 * reason. A placement check that withholds the answers is fifteen minutes spent
 * learning nothing, and the learner has already agreed to be tested.
 */

export interface Answer {
  credit: number;
  selfRating?: number;
  skipped?: boolean;
}

const WORD_TONE: Record<WordStatus, { background: string; color: string; title: string }> = {
  right: { background: "var(--good-soft)", color: "var(--good-ink)", title: "Exactly right" },
  diacritics: { background: "var(--hard-soft)", color: "var(--hard-ink)", title: "The right word, without its Estonian letters" },
  typo: { background: "var(--hard-soft)", color: "var(--hard-ink)", title: "One keystroke out" },
  wrong: { background: "var(--again-soft)", color: "var(--again-ink)", title: "A different word" },
  missing: { background: "var(--again-soft)", color: "var(--again-ink)", title: "Left out" },
  extra: { background: "var(--raised)", color: "var(--ink-3)", title: "Not in the sentence" },
};

/** The provenance line. Every Estonian string on screen says where it is from. */
const SOURCE_LABEL: Record<Item["source"], string> = {
  dictionary: "From the dictionary",
  ekilex: "Paradigm from Ekilex",
  derived: "Computed from the genitive stem",
  usage: "A sentence recorded by a lexicographer",
};

export function Provenance({ source }: { source: Item["source"] }) {
  return (
    <p className="mt-4 text-xs" style={{ color: "var(--ink-3)" }}>
      {SOURCE_LABEL[source]}. No Estonian on this screen was written by this app or by an AI.
    </p>
  );
}

// ── Multiple choice, read or heard ───────────────────────────────────────────

export function ChoiceQuestion({ item, onAnswer, onNoAudio }: {
  item: ChoiceItem;
  onAnswer: (answer: Answer) => void;
  /** Called when the audio a heard question depends on cannot be produced. */
  onNoAudio: () => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const [played, setPlayed] = useState(!item.heard);
  const [silent, setSilent] = useState(false);

  useEffect(() => {
    setPicked(null);
    setPlayed(!item.heard);
    setSilent(false);
  }, [item.id, item.heard]);

  useEffect(() => {
    if (picked !== null || !played) return;
    const onKey = (event: KeyboardEvent) => {
      const n = Number(event.key);
      if (Number.isInteger(n) && n >= 1 && n <= item.options.length) choose(n - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const choose = (index: number) => {
    if (picked !== null) return;
    setPicked(index);
  };

  const right = picked === item.answer;

  return (
    <div>
      <p className="text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>{item.question}</p>

      {item.heard ? (
        /*
          A click anywhere in this group counts as having played it, which is
          what unlocks the options. The alternative was a separate "I have
          played it" button, and a learner who does not notice it is a learner
          staring at four options they cannot press.
        */
        <div className="mt-5 flex flex-wrap items-center gap-3" onClick={() => setPlayed(true)}>
          <Speak
            text={item.et}
            label="Play the Estonian"
            size={26}
            className="flex h-16 w-16 items-center justify-center rounded-full"
            style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
            onUnavailable={() => { setSilent(true); onNoAudio(); }}
          />
          <Speak
            text={item.et}
            slow
            label="Play it slowly"
            size={18}
            className="flex h-12 w-12 items-center justify-center rounded-full"
            style={{ background: "var(--raised)", color: "var(--ink-2)" }}
            onUnavailable={() => { setSilent(true); onNoAudio(); }}
          />
          <span className="text-sm" style={{ color: "var(--ink-3)" }}>
            {played ? "Pick the meaning" : "Play it, then pick the meaning"}
          </span>
        </div>
      ) : item.et ? (
        <p lang="et" className="mt-5 text-3xl font-bold leading-snug" style={{ color: "var(--ink)" }}>
          {item.et}
        </p>
      ) : null}

      {silent && (
        <div className="mt-4">
          <Note tone="sky">
            The audio could not be produced. That is a fault here, not an answer about your
            listening, so this section will be left unmeasured rather than marked at zero.
          </Note>
        </div>
      )}

      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        {item.options.map((option, index) => {
          const chosen = picked === index;
          const correct = picked !== null && index === item.answer;
          const wrong = chosen && !correct;
          return (
            <button
              key={option}
              type="button"
              disabled={picked !== null || !played}
              onClick={() => choose(index)}
              className="choice-btn flex min-h-[52px] items-center gap-3 rounded-[var(--r-lg)] border px-4 py-3 text-left disabled:cursor-default"
              style={{
                ...(correct || wrong ? {
                  borderColor: correct ? "var(--good-ink)" : "var(--again-ink)",
                  background: correct ? "var(--good-soft)" : "var(--again-soft)",
                } : {}),
                opacity: picked !== null && !chosen && !correct ? 0.55 : 1,
              }}
            >
              <span
                className="tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                style={{ background: "var(--raised)", color: "var(--ink-3)" }}
              >
                {index + 1}
              </span>
              <span
                lang={item.estonianOptions ? "et" : undefined}
                className={`min-w-0 flex-1 text-base ${item.estonianOptions ? "font-semibold" : ""}`}
                style={{ color: "var(--ink)" }}
              >
                {option}
              </span>
              {correct && <Check size={17} aria-hidden style={{ color: "var(--good-ink)" }} />}
              {wrong && <X size={17} aria-hidden style={{ color: "var(--again-ink)" }} />}
            </button>
          );
        })}
      </div>

      {picked !== null && (
        <div className="pop-in mt-5">
          <Chip tone={right ? "good" : "again"}>{right ? "Right" : "Not this time"}</Chip>
          {/*
            Not marked lang="et": this line is English prose with an Estonian
            word or two inside it, and telling a screen reader the whole
            sentence is Estonian would have it read the English with Estonian
            phonics, which is worse than leaving the two words unmarked.
          */}
          <p className="mt-3 text-base" style={{ color: "var(--ink-2)" }}>{item.because}</p>
          <Provenance source={item.source} />
          <Button
            variant="primary"
            size="lg"
            className="mt-5"
            autoFocus
            onClick={() => onAnswer({ credit: gradeChoice(item, picked) })}
          >
            Next question
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Dictation ────────────────────────────────────────────────────────────────

export function DictationQuestion({ item, onAnswer, onNoAudio }: {
  item: DictationItem;
  onAnswer: (answer: Answer) => void;
  onNoAudio: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [mark, setMark] = useState<ReturnType<typeof gradeDictation> | null>(null);
  const [silent, setSilent] = useState(false);

  useEffect(() => { setTyped(""); setMark(null); setSilent(false); }, [item.id]);

  return (
    <div>
      <p className="text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>{item.question}</p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Speak
          text={item.et}
          label="Play the sentence"
          size={26}
          className="flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
          onUnavailable={() => { setSilent(true); onNoAudio(); }}
        />
        <Speak
          text={item.et}
          slow
          label="Play it slowly"
          size={18}
          className="flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: "var(--raised)", color: "var(--ink-2)" }}
          onUnavailable={() => { setSilent(true); onNoAudio(); }}
        />
        <span className="text-sm" style={{ color: "var(--ink-3)" }}>
          <Ear size={14} className="mr-1.5 inline" aria-hidden />
          As many times as you like
        </span>
      </div>

      {silent && (
        <div className="mt-4">
          <Note tone="sky">
            No audio, so there is nothing to write down. Skip this one and the listening section
            stays unmeasured rather than being marked at zero.
          </Note>
        </div>
      )}

      {mark === null ? (
        <div className="mt-6">
          <EstonianInput
            value={typed}
            onChange={setTyped}
            ariaLabel="What you heard"
            placeholder="Write the sentence"
            large
            autoFocus
            onEnter={() => setMark(gradeDictation(item, typed))}
          />
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="primary" size="lg" onClick={() => setMark(gradeDictation(item, typed))}>
              Check
            </Button>
            <Button variant="ghost" onClick={() => onAnswer({ credit: 0, skipped: true })}>
              Skip this one
            </Button>
          </div>
        </div>
      ) : (
        <div className="pop-in mt-6">
          <Chip tone={mark.result.verdict === "correct" ? "good" : mark.result.verdict === "wrong" ? "again" : "hard"}>
            {mark.result.note}
          </Chip>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {mark.result.words.map((word, i) => {
              const tone = WORD_TONE[word.status];
              return (
                <span
                  key={`${word.expected ?? word.typed ?? ""}-${i}`}
                  lang="et"
                  title={tone.title}
                  className="rounded-[var(--r-sm)] px-2 py-1 text-base"
                  style={{ background: tone.background, color: tone.color }}
                >
                  {word.expected ?? word.typed}
                </span>
              );
            })}
          </div>
          <p lang="et" className="mt-4 text-base" style={{ color: "var(--ink-2)" }}>{item.et}</p>
          <Provenance source={item.source} />
          <Button variant="primary" size="lg" className="mt-5" autoFocus onClick={() => onAnswer({ credit: mark.credit })}>
            Next question
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Writing ──────────────────────────────────────────────────────────────────

export function WriteQuestion({ item, onAnswer }: { item: WriteItem; onAnswer: (answer: Answer) => void }) {
  const [text, setText] = useState("");
  const [mark, setMark] = useState<ReturnType<typeof gradeWrite> | null>(null);

  useEffect(() => { setText(""); setMark(null); }, [item.id]);

  return (
    <div>
      <p className="text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>{item.question}</p>
      <p className="mt-3 text-base" style={{ color: "var(--ink-3)" }}>
        The {item.caseEn.toLowerCase()} (<span lang="et">{item.caseEt}</span>) answers{" "}
        <span lang="et">{item.caseQuestion}</span>
      </p>

      {mark === null ? (
        <div className="mt-6">
          <EstonianInput
            value={text}
            onChange={setText}
            ariaLabel="Your sentence"
            placeholder="Write a whole sentence"
            large
            autoFocus
            onEnter={() => setMark(gradeWrite(item, text))}
          />
          <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
            Marked on one thing only: whether the right form is in your sentence. That check is a
            string comparison against the dictionary, so no AI is involved and none is needed.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="primary" size="lg" onClick={() => setMark(gradeWrite(item, text))}>
              Check
            </Button>
            <Button variant="ghost" onClick={() => onAnswer({ credit: 0, skipped: true })}>
              Skip this one
            </Button>
          </div>
        </div>
      ) : (
        <div className="pop-in mt-6">
          <Chip tone={mark.credit === 1 ? "good" : mark.credit > 0 ? "hard" : "again"}>{mark.note}</Chip>
          <p lang="et" className="mt-4 text-2xl font-bold" style={{ color: "var(--ink)" }}>{item.targetForm}</p>
          <Provenance source={item.source} />
          <Button variant="primary" size="lg" className="mt-5" autoFocus onClick={() => onAnswer({ credit: mark.credit })}>
            Next question
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Speaking ─────────────────────────────────────────────────────────────────

const SELF_RATINGS = [
  { value: 1, label: "Nothing like it", detail: "I could not get the sounds out." },
  { value: 2, label: "Recognisable", detail: "A native would work out what I meant." },
  { value: 3, label: "Close", detail: "The rhythm and the length are nearly right." },
  { value: 4, label: "Confident", detail: "I would say that out loud to somebody." },
] as const;

/**
 * Speaking, judged by the only person qualified to judge it here.
 *
 * There is no verified Estonian speech recogniser available to this app
 * (ADR-018), so nothing scores the recording. The learner hears a native
 * rendering, hears their own, and rates the comparison. That rating is reported
 * back to them as theirs and contributes nothing to the level, which the screen
 * says out loud rather than leaving to be discovered.
 */
export function SpeakQuestion({ item, onAnswer }: { item: SpeakItem; onAnswer: (answer: Answer) => void }) {
  const [recorded, setRecorded] = useState(false);
  const startedAt = useRef(Date.now());

  useEffect(() => { setRecorded(false); startedAt.current = Date.now(); }, [item.id]);

  return (
    <div>
      <p className="text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>{item.question}</p>
      <p className="mt-2 text-sm" style={{ color: "var(--ink-3)" }}>{item.translation}</p>

      <p lang="et" className="mt-5 text-3xl font-bold leading-snug" style={{ color: "var(--ink)" }}>
        {item.et}
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Speak
          text={item.et}
          label="Hear a native voice say it"
          size={20}
          className="flex min-h-[44px] items-center gap-2 rounded-full px-4"
          style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
        />
        <Recorder onRecorded={() => setRecorded(true)} />
      </div>

      <Note tone="neutral">
        Nothing here scores your pronunciation, and nothing you record leaves this device. There is
        no Estonian speech recogniser this app can honestly use, so your own rating is what gets
        recorded, marked as yours, and it never moves your level.
      </Note>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {SELF_RATINGS.map((rating) => (
          <button
            key={rating.value}
            type="button"
            onClick={() => onAnswer({ credit: 0, selfRating: rating.value })}
            className="choice-btn min-h-[52px] rounded-[var(--r-lg)] border px-4 py-3 text-left"
          >
            <span className="block text-base font-medium" style={{ color: "var(--ink)" }}>{rating.label}</span>
            <span className="block text-xs" style={{ color: "var(--ink-3)" }}>{rating.detail}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button variant="ghost" onClick={() => onAnswer({ credit: 0, skipped: true })}>
          Skip speaking
        </Button>
        {!recorded && (
          <span className="text-xs" style={{ color: "var(--ink-3)" }}>
            <Volume2 size={13} className="mr-1 inline" aria-hidden />
            Record yourself first if you want the comparison to mean anything.
          </span>
        )}
      </div>
    </div>
  );
}
