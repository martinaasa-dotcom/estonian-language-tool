"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Mic, X } from "lucide-react";
import { checkAchievements, gradeCard } from "@/app/actions";
import { AchievementToasts } from "@/components/achievements/AchievementToasts";
import { Button, ButtonLink } from "@/components/Button";
import { Recorder } from "@/components/Recorder";
import { Chip, Empty, Meter, Page, Stat } from "@/components/ui";
import { Speak } from "@/components/Speak";
import type { Badge } from "@/lib/achievements/badges";
import { xpForRating } from "@/lib/gamification/xp";
import { RATINGS, type RatingValue } from "@/lib/srs/scheduler";

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

const TONE: Record<number, string> = { 1: "var(--again)", 2: "var(--hard)", 3: "var(--good)", 4: "var(--easy)" };
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
export function SpeakingSession({ cards }: { cards: SpeakingCard[] }) {
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
          body="Speaking practice draws on the words already in your deck. Add a unit from the path and come back."
          action={<ButtonLink href="/learn" variant="primary">Open the learning path</ButtonLink>}
        />
      </Page>
    );
  }

  if (finished) {
    const minutes = Math.max(1, Math.round((Date.now() - startedAt.current) / 60000));
    return (
      <div className="mx-auto max-w-2xl px-5 py-16 md:px-10">
        <h1 className="est text-[32px] font-bold tracking-tight" style={{ color: "var(--ink)" }}>
          Well spoken
        </h1>
        <p className="mt-2 text-[15px]" style={{ color: "var(--ink-2)" }}>
          Saying a word out loud is what moves it from something you recognise to something you can
          use. Nothing you recorded left this device.
        </p>
        <div
          className="mt-8 grid grid-cols-3 gap-6 rounded-lg border p-6"
          style={{ borderColor: "var(--rule)", background: "var(--surface)" }}
        >
          <Stat value={done} label="Spoken" />
          <Stat value={`+${xp}`} label="XP" tone="var(--accent)" />
          <Stat value={`${minutes}m`} label="Time" />
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/review/speaking" variant="primary">Another round</ButtonLink>
          <ButtonLink href="/practice">Other modes</ButtonLink>
          <ButtonLink href="/">Back to Today</ButtonLink>
        </div>
        <AchievementToasts badges={newBadges} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-5 py-6 md:px-10 md:py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link href="/" aria-label="End session" className="rounded p-1" style={{ color: "var(--ink-3)" }}>
          <X size={19} aria-hidden />
        </Link>
        <div className="flex-1">
          <Meter pct={(index / cards.length) * 100} label={`Card ${index + 1} of ${cards.length}`} height={4} />
        </div>
        <span className="tnum text-[13px]" style={{ color: "var(--ink-3)" }}>{cards.length - index} left</span>
      </div>

      <div
        className="flex flex-col rounded-xl border"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow)" }}
      >
        <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3" style={{ borderColor: "var(--rule-soft)" }}>
          <Chip tone="accent"><Mic size={12} aria-hidden /> Say it out loud</Chip>
          {card.isSentence && <Chip>sentence</Chip>}
          <Link
            href={`/dictionary?q=${encodeURIComponent(card.lemma)}`}
            className="ml-auto text-[12.5px]"
            style={{ color: "var(--ink-3)" }}
          >
            Full entry
          </Link>
        </div>

        <div className="flex min-h-[300px] flex-col items-center justify-center gap-5 px-6 py-10 text-center" aria-live="polite">
          <div>
            <p className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>Say this in Estonian</p>
            <p className="text-[22px] leading-snug" style={{ color: "var(--ink)" }}>{card.prompt}</p>
          </div>

          {revealed && (
            <>
              <div className="h-px w-16" style={{ background: "var(--rule)" }} />
              <div className="flex flex-wrap items-center justify-center gap-2">
                <p lang="et" className="est text-[26px] font-semibold md:text-[30px]" style={{ color: "var(--accent)" }}>
                  {card.et}
                </p>
                <Speak text={card.et} label={`Hear "${card.et}"`} size={17} />
                <Speak text={card.et} slow label={`Hear "${card.et}" slowly`} size={17} />
              </div>
              <Recorder />
              <p className="max-w-[44ch] text-[12px]" style={{ color: "var(--ink-3)" }}>
                Compare the two, then rate how close you were. Nothing is uploaded — the app has no
                Estonian speech recogniser and will not pretend to score you.
              </p>
            </>
          )}
        </div>

        <div className="border-t p-4" style={{ borderColor: "var(--rule-soft)" }}>
          {!revealed ? (
            <Button variant="primary" className="w-full py-3" onClick={() => setRevealed(true)}>
              I said it — show me
            </Button>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {RATINGS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  disabled={busy}
                  onClick={() => void submit(r.value as RatingValue)}
                  className="flex flex-col items-center gap-0.5 rounded-md border px-2 py-2.5 transition-opacity hover:opacity-80 disabled:opacity-40"
                  style={{ borderColor: "transparent", background: TONE_SOFT[r.value], color: TONE[r.value] }}
                >
                  <span className="text-[14px] font-semibold">{r.label}</span>
                  <span className="text-[10.5px] opacity-80">{r.hint}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="mt-4 text-center text-[11.5px]" style={{ color: "var(--ink-3)" }}>
        {done} spoken · +{xp} XP · audio from the University of Tartu
      </p>
    </div>
  );
}
