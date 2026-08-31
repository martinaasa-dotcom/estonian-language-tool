"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ArrowRight, Check, Eye, RotateCcw, X } from "lucide-react";
import { checkAchievements, gradeCard, translateExample } from "@/app/actions";
import { AchievementToasts } from "@/components/achievements/AchievementToasts";
import { Button, ButtonLink } from "@/components/Button";
import { Chip, Empty, Page, StatTile } from "@/components/ui";
import { Mascot } from "@/components/brand";
import { Speak } from "@/components/Speak";
import type { Badge } from "@/lib/achievements/badges";
import { sentenceMatches, sentenceTiles } from "@/lib/estonian/cloze";
import { xpForRating } from "@/lib/gamification/xp";

export interface SentenceTask {
  /** The card this counts against — every mode grades through the same log. */
  cardId: string;
  lexemeId: string;
  lemma: string;
  /** The attested Estonian sentence, exactly as Ekilex recorded it. */
  et: string;
  /** English, when it has been resolved. Null means the preview mode is used. */
  en: string | null;
}

/** How long the sentence is shown before it is scrambled, when there is no English. */
const PREVIEW_MS = 4500;

/**
 * Sentence building — Duolingo's word bank, over attested Estonian.
 *
 * Word order is the thing a case language quietly demands and a flashcard never
 * tests: you can know every form of `raamat` and still not know where it goes.
 * Tapping real words into order drills exactly that, and because the sentence
 * came from Ekilex the exercise never asks anyone to reproduce invented Estonian.
 *
 * Two ways of asking, depending on what is known:
 *
 * - **With an English translation** — the real exercise: read the meaning, build
 *   the Estonian. Translations are fetched one sentence ahead in the background,
 *   so the mode gets better the more it is used and never blocks on the model.
 * - **Without one** — the sentence is shown for a few seconds, then scrambled.
 *   Weaker, and honest about being a recall drill rather than a translation.
 */
export function SentenceSession({ tasks: initialTasks }: { tasks: SentenceTask[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [index, setIndex] = useState(0);
  const [built, setBuilt] = useState<number[]>([]);
  const [checked, setChecked] = useState<null | "right" | "wrong">(null);
  const [attempts, setAttempts] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [xp, setXp] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const [newBadges, setNewBadges] = useState<Badge[]>([]);
  const [busy, setBusy] = useState(false);
  const startedAt = useRef(Date.now());
  const shownAt = useRef(Date.now());
  const graded = useRef(false);

  const task = tasks[index];
  const finished = !task;

  // Shuffling happens after mount, never during the server render: the server
  // and the browser would draw different orders from Math.random and React
  // would report a hydration mismatch (the same trap as the interval previews
  // in ReviewSession).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // The tiles are shuffled once per sentence, not on every render — a re-shuffle
  // mid-exercise would move the tile under the learner's finger.
  const tiles = useMemo(() => {
    if (!task || !mounted) return [];
    const words = sentenceTiles(task.et);
    const order = words.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    // A shuffle that happens to be the right order is not an exercise.
    if (order.every((v, i) => v === i) && order.length > 1) order.reverse();
    return order.map((i) => ({ index: i, word: words[i]! }));
  }, [task, mounted]);

  /** Translate the next couple of sentences while this one is being answered. */
  useEffect(() => {
    const upcoming = tasks.slice(index, index + 3).filter((t) => t.en === null);
    for (const next of upcoming) {
      void translateExample(next.lexemeId, next.et).then((result) => {
        if (!result.ok) return;
        setTasks((list) => list.map((t) => (t.et === next.et ? { ...t, en: result.en } : t)));
      });
    }
    // Only when the position changes: re-running per keystroke would hammer the model.
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setBuilt([]);
    setChecked(null);
    shownAt.current = Date.now();
    if (task && task.en === null) {
      setPreviewing(true);
      const t = setTimeout(() => setPreviewing(false), PREVIEW_MS);
      return () => clearTimeout(t);
    }
    setPreviewing(false);
    return undefined;
  }, [index, task]);

  useEffect(() => {
    if (!finished || graded.current || initialTasks.length === 0) return;
    graded.current = true;
    const accuracy = attempts > 0 ? Math.round((correct / attempts) * 100) : 0;
    void checkAchievements({ count: attempts, accuracy }).then((r) => {
      if (r.ok) setNewBadges(r.newBadges);
    });
  }, [finished, attempts, correct, initialTasks.length]);

  const answer = built.map((i) => tiles.find((t) => t.index === i)?.word ?? "");

  const check = useCallback(async () => {
    if (!task || busy || checked) return;
    setBusy(true);
    const right = sentenceMatches(answer, task.et);
    setChecked(right ? "right" : "wrong");
    setAttempts((a) => a + 1);
    if (right) setCorrect((c) => c + 1);
    if (!right && typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(60);

    const rating = right ? 3 : 1;
    setXp((x) => x + xpForRating(rating));
    try {
      await gradeCard(task.cardId, rating, Date.now() - shownAt.current);
    } catch {
      // The round still counts on screen; the grade is simply not recorded.
    }
    setBusy(false);
  }, [task, busy, checked, answer]);

  const next = () => setIndex((i) => i + 1);

  if (initialTasks.length === 0) {
    return (
      <Page title="Sentences" lead="Put real Estonian sentences back in order.">
        <Empty
          title="No sentences to build yet"
          body="Sentences come from Ekilex, already linked to words in your deck."
          action={<ButtonLink href="/dictionary" variant="primary">Open the dictionary</ButtonLink>}
        />
      </Page>
    );
  }

  if (finished) {
    const minutes = Math.max(1, Math.round((Date.now() - startedAt.current) / 60000));
    const accuracy = attempts > 0 ? Math.round((correct / attempts) * 100) : 0;
    return (
      <div className="mx-auto max-w-2xl px-5 py-16 md:px-10">
        <div className="pop-in text-center">
          <Mascot size={68} mood="cheer" className="float mx-auto" />
          <h1 className="mt-5 text-3xl font-bold tracking-tight" style={{ color: "var(--ink)" }}>
            Sentences done
          </h1>
          <p className="mx-auto mt-2 max-w-[46ch] text-base" style={{ color: "var(--ink-2)" }}>
            Word order is the part a flashcard cannot teach. Every sentence here was written by
            dictionary editors, not by this app.
          </p>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile value={attempts} label="Built" tone="accent" />
          <StatTile value={`${accuracy}%`} label="First time" tone={accuracy >= 70 ? "mint" : "butter"} />
          <StatTile value={`+${xp}`} label="XP" tone="blush" />
          <StatTile value={`${minutes}m`} label="Time" tone="sky" />
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/review/sentences" variant="primary" size="lg">Another round</ButtonLink>
          <ButtonLink href="/practice" size="lg">Other modes</ButtonLink>
          <ButtonLink href="/" size="lg">Back to Today</ButtonLink>
        </div>
        <AchievementToasts badges={newBadges} />
      </div>
    );
  }

  const progress = (index / tasks.length) * 100;

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
      <h1 className="sr-only">Sentences</h1>
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
            aria-valuemax={tasks.length}
            aria-label={`Sentence ${index + 1} of ${tasks.length}`}
          />
        </div>
        <span
          className="tnum label-xs rounded-full px-2.5 py-1"
          style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
        >
          {tasks.length - index} left
        </span>
      </div>

      <div
        className="flex flex-col overflow-hidden rounded-[var(--r-xl)] border"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow-lg)" }}
      >
        <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3" style={{ borderColor: "var(--rule-soft)" }}>
          <Chip tone="accent">Build the sentence</Chip>
          <Link
            href={`/dictionary?q=${encodeURIComponent(task.lemma)}`}
            className="ml-auto text-xs"
            style={{ color: "var(--ink-3)" }}
          >
            {task.lemma}
          </Link>
        </div>

        <div className="flex min-h-[300px] flex-col gap-5 px-6 py-8" aria-live="polite">
          <div className="text-center">
            {task.en ? (
              <>
                <p className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>Say this in Estonian</p>
                <p className="text-lg leading-snug" style={{ color: "var(--ink)" }}>{task.en}</p>
              </>
            ) : previewing ? (
              <>
                <p className="label-xs mb-2 flex items-center justify-center gap-1.5" style={{ color: "var(--ink-3)" }}>
                  <Eye size={12} aria-hidden /> Read it. The words scramble in a moment
                </p>
                <p lang="et" className="text-xl leading-snug" style={{ color: "var(--ink)" }}>
                  {task.et}
                </p>
              </>
            ) : (
              <p className="label-xs" style={{ color: "var(--ink-3)" }}>
                Now put it back together
              </p>
            )}
          </div>

          {/* What has been built so far. */}
          <div
            className="flex min-h-[68px] flex-wrap content-start items-start gap-2 rounded-[var(--r)] border border-dashed p-3 transition-colors"
            style={{
              borderColor: checked === "right" ? "var(--good)" : checked === "wrong" ? "var(--again)" : "var(--rule)",
              background: checked === "right" ? "var(--good-soft)" : checked === "wrong" ? "var(--again-soft)" : "transparent",
            }}
          >
            {built.length === 0 && (
              <span className="text-xs" style={{ color: "var(--ink-3)" }}>Tap the words in order…</span>
            )}
            {built.map((tileIndex) => {
              const tile = tiles.find((t) => t.index === tileIndex)!;
              return (
                <button
                  key={tileIndex}
                  type="button"
                  disabled={checked !== null}
                  onClick={() => setBuilt((b) => b.filter((i) => i !== tileIndex))}
                  lang="et"
                  aria-label={`Remove ${tile.word}`}
                  className="press rounded-[var(--r-sm)] border px-3 py-1.5 text-md transition-ui hover:-translate-y-px"
                  style={{
                    borderColor: "var(--rule)",
                    background: "var(--surface)",
                    color: "var(--ink)",
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  {tile.word}
                </button>
              );
            })}
          </div>

          {/* The bank of remaining words. */}
          <div className="flex flex-wrap gap-2">
            {tiles.map((tile) => {
              const used = built.includes(tile.index);
              return (
                <button
                  key={tile.index}
                  type="button"
                  disabled={used || checked !== null || previewing}
                  onClick={() => setBuilt((b) => [...b, tile.index])}
                  lang="et"
                  aria-label={`Add ${tile.word}`}
                  className="press rounded-[var(--r-sm)] border px-3 py-1.5 text-md transition-ui hover:-translate-y-px disabled:opacity-25 disabled:hover:translate-y-0"
                  style={{ borderColor: "transparent", background: "var(--raised)", color: "var(--ink)" }}
                >
                  {tile.word}
                </button>
              );
            })}
          </div>

          {checked && (
            <div
              className="pop-in rounded-[var(--r)] px-4 py-3 text-center"
              style={{ background: checked === "right" ? "var(--good-soft)" : "var(--again-soft)" }}
            >
              <p className="label-xs" style={{ color: checked === "right" ? "var(--good-ink)" : "var(--again-ink)" }}>
                {checked === "right" ? "Õige, exactly right." : "Not the order Estonian uses. It goes:"}
              </p>
              <p className="mt-1 flex items-center justify-center gap-2">
                <span lang="et" className="text-md" style={{ color: "var(--ink)" }}>{task.et}</span>
                <Speak text={task.et} />
              </p>
            </div>
          )}
        </div>

        <div className="border-t p-4" style={{ borderColor: "var(--rule-soft)" }}>
          {checked ? (
            <Button variant="primary" size="lg" className="w-full" onClick={next}>
              Next sentence <ArrowRight size={15} aria-hidden />
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setBuilt([])} disabled={built.length === 0}>
                <RotateCcw size={14} aria-hidden /> Clear
              </Button>
              <Button
                variant="primary"
                size="lg"
                className="flex-1"
                onClick={() => void check()}
                disabled={built.length !== tiles.length || busy}
              >
                <Check size={15} aria-hidden /> Check
              </Button>
            </div>
          )}
        </div>
      </div>

      <p className="mt-4 text-center text-2xs" style={{ color: "var(--ink-3)" }}>
        {correct} of {attempts} first time · +{xp} XP · sentences from Ekilex
      </p>
    </div>
  );
}
