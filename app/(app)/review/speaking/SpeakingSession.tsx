"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Mic, X } from "lucide-react";
import { checkAchievements, gradeCard } from "@/app/actions";
import { AchievementToasts } from "@/components/achievements/AchievementToasts";
import { Button, ButtonLink } from "@/components/Button";
import { Recorder } from "@/components/Recorder";
import { Chip, Empty, Page, StatTile } from "@/components/ui";
import { Mascot } from "@/components/brand";
import { SpeakPair } from "@/components/Speak";
import type { Badge } from "@/lib/achievements/badges";
import { xpForRating } from "@/lib/gamification/xp";
import { SELF_GRADES, type RatingValue } from "@/lib/srs/scheduler";

export interface SpeakingCard {
  cardId: string;
  /** What the learner is asked to produce, in Estonian. */
  et: string;
  /** The prompt: an English meaning, or a sentence's translation. */
  prompt: string;
  lemma: string;
  /** True when `et` is a whole sentence rather than a single word. */
  isSentence: boolean;
}

// Inks, not hues: these colour text on the matching soft tint.
const TONE: Record<number, string> = {
  1: "var(--again-ink)", 2: "var(--hard-ink)", 3: "var(--good-ink)", 4: "var(--easy-ink)",
};
const TONE_SOFT: Record<number, string> = {
  1: "var(--again-soft)", 2: "var(--hard-soft)", 3: "var(--good-soft)", 4: "var(--easy-soft)",
};

/**
 * Say it out loud.
 *
 * A production test with the one thing the typed mode cannot give: a native
 * voice to compare against, and your own voice played straight back. Speakly
 * and Duolingo both score the attempt automatically; this does not, because
 * there is no Estonian speech-recogniser it could do that with honestly — see
 * components/Recorder.tsx. What it does instead is put the two recordings next
 * to each other and let the learner judge, which is how shadowing is actually
 * practised.
 *
 * It grades like any other card: the prompt is a meaning, the answer is
 * Estonian, and the learner rates their own recall — the same self-assessment
 * a flipped flashcard asks for, with better evidence to base it on.
 */
export function SpeakingSession({ cards: initialCards }: { cards: SpeakingCard[] }) {
  /*
    Snapshotted once on mount. gradeCard refreshes this route's Server
    Component, which would hand down a card list shrinking as graded cards leave the
    due pool, changing what is on screen mid-session. Same rule as
    ReviewSession's frozen queue.
  */
  const [cards] = useState(initialCards);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [xp, setXp] = useState(0);
  const [busy, setBusy] = useState(false);
  const [newBadges, setNewBadges] = useState<Badge[]>([]);
  const startedAt = useRef(Date.now());
  const shownAt = useRef(Date.now());
  const checked = useRef(false);

  const card = cards[index];
  const finished = !card;

  useEffect(() => {
    setRevealed(false);
    shownAt.current = Date.now();
  }, [index]);

  useEffect(() => {
    if (!finished || cards.length === 0 || checked.current) return;
    checked.current = true;
    const accuracy = done > 0 ? Math.round((correct / done) * 100) : 0;
    void checkAchievements({ count: done, accuracy }).then((r) => {
      if (r.ok) setNewBadges(r.newBadges);
    });
  }, [finished, cards.length, done, correct]);

  const submit = useCallback(async (rating: RatingValue) => {
    if (!card || busy) return;
    setBusy(true);
    setDone((d) => d + 1);
    setXp((x) => x + xpForRating(rating));
    if (rating >= 3) setCorrect((c) => c + 1);
    try {
      await gradeCard(card.cardId, rating, Date.now() - shownAt.current);
    } catch {
      // Speaking practice is not worth losing to a failed write.
    }
    setIndex((i) => i + 1);
    setBusy(false);
  }, [card, busy]);

  if (cards.length === 0) {
    return (
      <Page title="Speaking" lead="Say it out loud, then hear a native voice say the same thing.">
        <Empty
          title="Nothing to say yet"
          body="This draws on the words already in your deck."
          action={<ButtonLink href="/learn" variant="primary">Open the learning path</ButtonLink>}
        />
      </Page>
    );
  }

  if (finished) {
    const minutes = Math.max(1, Math.round((Date.now() - startedAt.current) / 60000));
    return (
      <div className="mx-auto max-w-2xl px-5 py-16 md:px-10">
        <div className="pop-in text-center">
          <Mascot size={68} mood="cheer" className="float mx-auto" />
          <h1 className="mt-5 text-3xl font-bold tracking-tight" style={{ color: "var(--ink)" }}>
            Well spoken
          </h1>
          <p className="mx-auto mt-2 max-w-[46ch] text-base" style={{ color: "var(--ink-2)" }}>
            Saying a word out loud is what moves it from something you recognise to something you can
            use. Nothing you recorded left this device.
          </p>
        </div>
        <div className="mt-8 grid grid-cols-3 gap-3">
          <StatTile value={done} label="Spoken" tone="accent" />
          <StatTile value={`+${xp}`} label="XP" tone="blush" />
          <StatTile value={`${minutes}m`} label="Time" tone="sky" />
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/review/speaking" variant="primary" size="lg">Another round</ButtonLink>
          <ButtonLink href="/practice" size="lg">Other modes</ButtonLink>
          <ButtonLink href="/" size="lg">Back to Today</ButtonLink>
        </div>
        <AchievementToasts badges={newBadges} />
      </div>
    );
  }

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
      <h1 className="sr-only">Speaking</h1>
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
            style={{ width: `${Math.max((index / cards.length) * 100, 2)}%` }}
            role="progressbar"
            aria-valuenow={index}
            aria-valuemin={0}
            aria-valuemax={cards.length}
            aria-label={`Card ${index + 1} of ${cards.length}`}
          />
        </div>
        <span
          className="tnum label-xs rounded-full px-2.5 py-1"
          style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
        >
          {cards.length - index} left
        </span>
      </div>

      <div
        className="flex flex-col overflow-hidden rounded-[var(--r-xl)] border"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow-lg)" }}
      >
        <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3" style={{ borderColor: "var(--rule-soft)" }}>
          <Chip tone="accent"><Mic size={12} aria-hidden /> Say it out loud</Chip>
          {card.isSentence && <Chip>sentence</Chip>}
          <Link
            href={`/dictionary?q=${encodeURIComponent(card.lemma)}`}
            className="ml-auto text-xs"
            style={{ color: "var(--ink-3)" }}
          >
            Full entry
          </Link>
        </div>

        <div className="flex min-h-[300px] flex-col items-center justify-center gap-5 px-6 py-10 text-center" aria-live="polite">
          <div>
            <p className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>Say this in Estonian</p>
            <p className="text-2xl font-bold leading-snug tracking-tight md:text-3xl" style={{ color: "var(--ink)" }}>
              {card.prompt}
            </p>
          </div>

          {revealed && (
            <>
              <div className="h-1 w-14 rounded-full" style={{ background: "var(--accent-soft)" }} />
              <div
                className="pop-in flex flex-wrap items-center justify-center gap-2 rounded-[var(--r-lg)] px-5 py-4"
                style={{ background: "var(--accent-soft)" }}
              >
                <p lang="et" className="text-2xl font-semibold md:text-2xl" style={{ color: "var(--accent-deep)" }}>
                  {card.et}
                </p>
                <SpeakPair text={card.et} size={17} />
              </div>
              <Recorder />
              <p className="max-w-[44ch] text-xs" style={{ color: "var(--ink-3)" }}>
                Compare the two, then rate how close you were. Nothing is uploaded, the app has no
                Estonian speech recogniser and will not pretend to score you.
              </p>
            </>
          )}
        </div>

        <div className="border-t p-4" style={{ borderColor: "var(--rule-soft)" }}>
          {!revealed ? (
            <Button variant="primary" size="lg" className="w-full" onClick={() => setRevealed(true)}>
              I said it, show me
            </Button>
          ) : (
            /* Two, from the one table in lib/srs/scheduler.ts. Nothing here can
               mark a recording (ADR-018), so the learner is the judge, and the
               four they were offered asked them to sort their own pronunciation
               into a scheduler's grades. Whether it sounded like the native
               rendering has two answers. */
            <div className="grid grid-cols-2 gap-2.5">
              {SELF_GRADES.map((g) => (
                <button
                  key={g.rating}
                  type="button"
                  disabled={busy}
                  onClick={() => void submit(g.rating)}
                  className="press flex items-center justify-center rounded-[var(--r)] px-2 py-3.5 transition-ui hover:-translate-y-0.5 disabled:opacity-40"
                  style={{ background: TONE_SOFT[g.rating], color: TONE[g.rating] }}
                >
                  <span className="text-base font-bold">{g.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="mt-4 text-center text-2xs" style={{ color: "var(--ink-3)" }}>
        {done} spoken · +{xp} XP · audio from the University of Tartu
      </p>
    </div>
  );
}
