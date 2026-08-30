"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Ear, X, Volume2 } from "lucide-react";
import { checkAchievements, gradeCard } from "@/app/actions";
import { AchievementToasts } from "@/components/achievements/AchievementToasts";
import { Button, ButtonLink } from "@/components/Button";
import { EstonianInput } from "@/components/EstonianInput";
import { Chip, Empty, Page, StatTile } from "@/components/ui";
import { Mascot } from "@/components/brand";
import { Speak } from "@/components/Speak";
import type { Badge } from "@/lib/achievements/badges";
import { checkDictation, wordNote, type DictationResult, type WordStatus } from "@/lib/estonian/dictation";
import { xpForRating } from "@/lib/gamification/xp";
import type { RatingValue } from "@/lib/srs/scheduler";

export interface DictationTask {
  /** The card this counts against — every mode grades through the same log. */
  cardId: string;
  lemma: string;
  /** The attested Estonian sentence, exactly as Ekilex recorded it. */
  et: string;
  en: string | null;
}

/**
 * The colour each mark carries, and the sentence a screen reader gets.
 *
 * `label` is not a tooltip. `diacritics` and `typo` share a hue on purpose —
 * both are "nearly", and the palette has one colour for that (design system
 * §1) — which used to mean the two were indistinguishable on screen, since a
 * `title` attribute was the only thing between them and hover does not exist
 * on a phone. The visible note now comes from `wordNote`, and this string is
 * what the chip is announced as.
 */
const WORD_TONE: Record<WordStatus, { background: string; color: string; label: string }> = {
  right: { background: "var(--good-soft)", color: "var(--good-ink)", label: "exactly right" },
  diacritics: {
    background: "var(--hard-soft)",
    color: "var(--hard-ink)",
    label: "the right word, without its Estonian letters",
  },
  typo: { background: "var(--hard-soft)", color: "var(--hard-ink)", label: "one keystroke out" },
  wrong: { background: "var(--again-soft)", color: "var(--again-ink)", label: "a different word" },
  missing: { background: "var(--again-soft)", color: "var(--again-ink)", label: "left out" },
  extra: { background: "var(--raised)", color: "var(--ink-3)", label: "not in the sentence" },
};

/**
 * Dictation: hear it, write it.
 *
 * The one exercise that tests listening and spelling in the same breath, and the
 * one that catches what a multiple-choice listening round cannot — Estonian
 * welds its case endings onto the stem, so a learner who hears the sentence
 * perfectly and writes the wrong ending has learned something specific, and
 * needs to be told which word and which ending.
 *
 * So the marking is word by word (`lib/estonian/dictation.ts`), and the answer
 * comes back annotated rather than scored: green for exact, butter for a word
 * heard but misspelled, peach for one missed. The grade follows the marking, so
 * a sentence that was all there bar its diacritics does not get punished like a
 * blank.
 */
export function DictationSession({ tasks: initialTasks }: { tasks: DictationTask[] }) {
  /*
    Snapshotted once on mount. gradeCard refreshes this route's Server
    Component, which would hand down a task list shrinking as graded cards leave the
    due pool, changing what is on screen mid-session. Same rule as
    ReviewSession's frozen queue.
  */
  const [tasks] = useState(initialTasks);
  // Snapshotted on mount: grading refreshes the Server Component above, and a
  // shrinking prop mid-round would swap the last sentence out from under the
  // summary (the same trap ListeningSession documents).
  const [round] = useState(tasks);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<DictationResult | null>(null);
  const [played, setPlayed] = useState(false);
  // Set when the TTS proxy cannot produce audio. Every other screen can lose a
  // pronunciation button quietly; this one is built on it, so the sentence is
  // shown instead of leaving the learner staring at a silent box.
  const [noAudio, setNoAudio] = useState(false);
  const [done, setDone] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [xp, setXp] = useState(0);
  const [busy, setBusy] = useState(false);
  const [newBadges, setNewBadges] = useState<Badge[]>([]);
  const startedAt = useRef(Date.now());
  const shownAt = useRef(Date.now());
  const checked = useRef(false);

  const task = round[index];
  const finished = !task;

  useEffect(() => {
    setTyped("");
    setResult(null);
    setPlayed(false);
    shownAt.current = Date.now();
  }, [index]);

  useEffect(() => {
    if (!finished || round.length === 0 || checked.current) return;
    checked.current = true;
    const accuracy = done > 0 ? Math.round((correct / done) * 100) : 0;
    void checkAchievements({ count: done, accuracy }).then((r) => {
      if (r.ok) setNewBadges(r.newBadges);
    });
  }, [finished, round.length, done, correct]);

  const submit = useCallback(async () => {
    if (!task || busy || result) return;
    setBusy(true);
    const marked = checkDictation(typed, task.et);
    setResult(marked);
    setDone((d) => d + 1);
    if (marked.verdict === "correct") setCorrect((c) => c + 1);
    setXp((x) => x + xpForRating(marked.suggestedRating));
    if (marked.verdict === "wrong" && typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(60);
    }
    try {
      await gradeCard(task.cardId, marked.suggestedRating as RatingValue, Date.now() - shownAt.current);
    } catch {
      // The round still counts on screen; the grade is simply not recorded.
    }
    setBusy(false);
  }, [task, busy, result, typed]);

  const next = () => setIndex((i) => i + 1);

  if (round.length === 0) {
    return (
      <Page title="Dictation" lead="Hear a sentence, write it down.">
        <Empty
          title="No sentences short enough yet"
          body="Dictation uses the sentences Ekilex records against the words in your deck, and only the short ones, a sentence you cannot hold in your head tests memory, not listening. Look a few of your words up in the dictionary, or add a unit from the path."
          action={<ButtonLink href="/dictionary" variant="primary">Open the dictionary</ButtonLink>}
        />
      </Page>
    );
  }

  if (finished) {
    const minutes = Math.max(1, Math.round((Date.now() - startedAt.current) / 60000));
    const accuracy = done > 0 ? Math.round((correct / done) * 100) : 0;
    return (
      <div className="mx-auto max-w-2xl px-5 py-16 md:px-10">
        <div className="pop-in text-center">
          <Mascot size={68} mood="cheer" className="float mx-auto" />
          <h1 className="est mt-5 text-3xl font-bold tracking-tight" style={{ color: "var(--ink)" }}>
            Dictation done
          </h1>
          <p className="mx-auto mt-2 max-w-[46ch] text-base" style={{ color: "var(--ink-2)" }}>
            Writing down what you hear is the closest thing to using the language. Every sentence in
            this round was recorded by lexicographers, not by this app.
          </p>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile value={done} label="Written" tone="accent" />
          <StatTile value={`${accuracy}%`} label="Word perfect" tone={accuracy >= 50 ? "mint" : "butter"} />
          <StatTile value={`+${xp}`} label="XP" tone="blush" />
          <StatTile value={`${minutes}m`} label="Time" tone="sky" />
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/review/dictation" variant="primary" size="lg">Another round</ButtonLink>
          <ButtonLink href="/practice" size="lg">Other modes</ButtonLink>
          <ButtonLink href="/" size="lg">Back to Today</ButtonLink>
        </div>
        <AchievementToasts badges={newBadges} />
      </div>
    );
  }

  const progress = (index / round.length) * 100;

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-5 py-6 md:px-10 md:py-10">
      {/* The heading a session screen has no room to draw.

          These five screens are a progress bar, a card and four rating buttons,
          and there is nothing on them a title could be added to without taking
          space from the card. So they had no heading at all: somebody working
          down a page by its headings, or asking what this screen is, got
          nothing back, while the four modes that happen to have a title bar
          answered fine. The `Empty` and finished states of these same files
          already carry one, which is how the gap survived a sweep. */}
      <h1 className="sr-only">Dictation</h1>
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link
          href="/"
          aria-label="End session"
          className="press flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-[var(--raised)]"
          style={{ color: "var(--ink-3)" }}
        >
          <X size={18} aria-hidden />
        </Link>
        <div className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--raised)" }}>
          <div
            className="grad-accent h-full rounded-full transition-[width] duration-500"
            style={{ width: `${Math.max(progress, 2)}%` }}
            role="progressbar"
            aria-valuenow={index}
            aria-valuemin={0}
            aria-valuemax={round.length}
            aria-label={`Sentence ${index + 1} of ${round.length}`}
          />
        </div>
        <span
          className="tnum label-xs rounded-full px-2.5 py-1"
          style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
        >
          {round.length - index} left
        </span>
      </div>

      <div
        className="flex flex-col overflow-hidden rounded-[var(--r-xl)] border"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow-lg)" }}
      >
        <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3" style={{ borderColor: "var(--rule-soft)" }}>
          <Chip tone="accent"><Ear size={12} aria-hidden /> Write what you hear</Chip>
          {/* Only once the answer is in. This is a word *from the sentence being
              dictated*, so printing it above the box hands over part of what the
              exercise is asking for, which the review session's own header never
              does: there the link is the card's subject and the front of the card
              is already showing it. The link is worth keeping for afterwards,
              when looking the word up is the natural next thing to do. */}
          {result && (
            <Link
              href={`/dictionary?q=${encodeURIComponent(task.lemma)}`}
              className="ml-auto text-xs"
              style={{ color: "var(--ink-3)" }}
            >
              {task.lemma}
            </Link>
          )}
        </div>

        <div className="flex min-h-[300px] flex-col gap-5 px-6 py-8" aria-live="polite">
          <div className="flex flex-col items-center gap-3">
            {noAudio ? (
              <div
                className="flex flex-col items-center gap-2 rounded-[var(--r-lg)] px-5 py-4 text-center"
                style={{ background: "var(--hard-soft)" }}
              >
                <p className="label-xs" style={{ color: "var(--hard-ink)" }}>No audio right now</p>
                <p lang="et" className="est text-lg" style={{ color: "var(--ink)" }}>{task.et}</p>
                <p className="max-w-[42ch] text-xs" style={{ color: "var(--ink-2)" }}>
                  The pronunciation service could not be reached, so the sentence is shown instead of
                  played. Copying it out still drills the spelling. Come back for the listening half.
                </p>
              </div>
            ) : (
              <>
                <Speak
                  text={task.et}
                  size={30}
                  label="Play the sentence"
                  onUnavailable={() => setNoAudio(true)}
                  className="press flex h-24 w-24 items-center justify-center rounded-full transition-ui hover:-translate-y-0.5"
                  style={{ background: "var(--accent-soft)", color: "var(--accent-deep)", boxShadow: "var(--shadow)" }}
                />
                <div className="flex items-center gap-3">
                  <Speak
                    text={task.et}
                    slow
                    label="Play it slowly"
                    size={14}
                    className="press tap-tint inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold"
                    style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink-2)" }}
                  >
                    <Volume2 size={14} strokeWidth={2} aria-hidden /> Slow
                  </Speak>
                  <span className="text-xs" style={{ color: "var(--ink-3)" }}>
                    {played ? "Play it as often as you like" : "Tap to hear it, the slow button is next to it"}
                  </span>
                </div>
              </>
            )}
          </div>

          {result ? (
            <Marked result={result} />
          ) : (
            <EstonianInput
              value={typed}
              onChange={(v) => { setTyped(v); setPlayed(true); }}
              onEnter={() => void submit()}
              ariaLabel="What you heard"
              placeholder="Type the sentence…"
              autoFocus
            />
          )}

          {result && task.en && (
            <p className="text-center text-sm" style={{ color: "var(--ink-2)" }}>
              {task.en}
              <Chip tone="again" title="Machine translation, the Estonian is authoritative, this is not">
                AI
              </Chip>
            </p>
          )}
        </div>

        <div className="border-t p-4" style={{ borderColor: "var(--rule-soft)" }}>
          {result ? (
            <Button variant="primary" size="lg" className="w-full" onClick={next}>
              Next sentence <ArrowRight size={15} aria-hidden />
            </Button>
          ) : (
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={() => void submit()}
              disabled={busy}
            >
              <Check size={15} aria-hidden /> Check what I wrote
            </Button>
          )}
        </div>
      </div>

      <p className="mt-4 text-center text-2xs" style={{ color: "var(--ink-3)" }}>
        {correct} word-perfect of {done} · +{xp} XP · graded from the marking, sentences from Ekilex
      </p>
    </div>
  );
}

/**
 * The marked-up answer.
 *
 * The sentence as it was said, word by word, with what was typed underneath
 * wherever the two differ — which is the only view that answers "what did I
 * actually get wrong" without making the learner diff two lines by eye.
 */
function Marked({ result }: { result: DictationResult }) {
  return (
    <div className="flex flex-col gap-3">
      <p
        className="label-xs text-center"
        style={{
          color: result.verdict === "correct"
            ? "var(--good-ink)"
            : result.verdict === "wrong" ? "var(--again-ink)" : "var(--hard-ink)",
        }}
      >
        {result.note}
      </p>
      <div className="pop-in flex flex-wrap justify-center gap-1.5">
        {result.words.map((word, i) => {
          const tone = WORD_TONE[word.status];
          const shown = word.expected ?? word.typed ?? "";
          const note = wordNote(word);
          return (
            <span
              key={`${shown}-${i}`}
              /*
                The whole mark in one string, because the chip is three spans
                of fragments and a screen reader reading them in order says
                "õues you oues õ, not o", which is not a sentence. `lang="et"`
                stays on the Estonian span inside so the word itself is still
                pronounced as Estonian in the visual reading.
              */
              aria-label={`${shown}, ${tone.label}${
                word.typed && word.typed !== shown ? `. You typed ${word.typed}` : ""
              }`}
              className="flex flex-col items-center rounded-[var(--r-sm)] px-2 py-1"
              style={{ background: tone.background }}
            >
              <span
                lang="et"
                className="est text-md"
                style={{
                  color: tone.color,
                  textDecoration: word.status === "extra" ? "line-through" : undefined,
                }}
              >
                {shown}
              </span>
              {/* What was typed, only where it differs — repeating a correct
                  word underneath itself is noise. */}
              {word.status !== "right" && word.status !== "extra" && (
                <span className="text-2xs" style={{ color: "var(--ink-3)" }} aria-hidden>
                  {word.typed ? `you: ${word.typed}` : "left out"}
                </span>
              )}
              {/*
                Which kind of nearly it was, on screen rather than in a
                tooltip. This is the distinction the exercise is built to
                teach, and it used to be reachable only by hovering a mouse
                over the word, which no phone can do.
              */}
              {note && (
                <span
                  className="text-2xs"
                  style={{ color: "var(--hard-ink)" }}
                  aria-hidden
                >
                  {note}
                </span>
              )}
            </span>
          );
        })}
      </div>
      <p className="tnum text-center text-xs" style={{ color: "var(--ink-3)" }}>
        {result.right} of {result.total} words exactly right
      </p>
    </div>
  );
}
