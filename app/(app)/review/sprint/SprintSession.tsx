"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Timer, Trophy, X } from "lucide-react";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { gradeCard, recordSprintScore } from "@/app/actions";
import { Button, ButtonLink } from "@/components/Button";
import { Chip, Empty, KeyCap, Page, StatTile } from "@/components/ui";
import { Mascot } from "@/components/brand";
import { Speak } from "@/components/Speak";
import { StarWord } from "@/components/StarWord";
import { VERDICT_CLASS } from "@/lib/ux/verdict";
import { ADVANCE_KEY_LABEL, isAdvanceKey } from "@/lib/ux/advanceKey";
import { roundLength } from "@/lib/ux/roundClock";

export interface SprintCard {
  id: string;
  front: string;
  back: string;
  lemma: string | null;
  /** The dictionary entry behind the card, for the favorite button. */
  lexemeId: string | null;
  /** Whether this word is already one of the learner's favorites. */
  starred: boolean;
  cardType: string;
}

const estonianSide = (type: string, side: "front" | "back") =>
  side === "front" ? type !== "PRODUCTION" : type === "PRODUCTION" || type === "CASE_FORM" || type === "GRADATION";

/**
 * How long the clock runs, resolved on the server from the learner's own pace
 * (`lib/ux/roundClock.ts`). It arrives as a number rather than being read here,
 * because a client component has no settings to read and a round that fetched
 * its own length in an effect would start before it knew it.
 */
export function SprintSession({
  cards: initialCards, best, seconds,
}: { cards: SprintCard[]; best: number; seconds: number }) {
  // Snapshotted once on mount, and never updated from later props. gradeCard()
  // is a Server Action, and Next.js refreshes this route's Server Component
  // after every call — which would hand down a shrinking `cards` prop as
  // graded cards drop out of the due pool, ending the sprint early or (on the
  // very last card) swapping to an empty-state render mid-session. The pool
  // the page found on first load is the only one this sprint should ever see.
  const [cards] = useState(initialCards);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [attempted, setAttempted] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(seconds);
  const [phase, setPhase] = useState<"ready" | "running" | "done">("ready");
  const [busy, setBusy] = useState(false);
  const [isNewBest, setIsNewBest] = useState(false);
  const shownAt = useRef(Date.now());

  const card = cards.length > 0 ? cards[index % cards.length]! : null;
  const exhausted = cards.length > 0 && attempted >= cards.length;

  useEffect(() => {
    if (phase !== "running") return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const finish = useCallback((finalScore: number) => {
    setPhase("done");
    void recordSprintScore(finalScore).then((r) => {
      // A refused score is not a new best; the round is over either way.
      setIsNewBest(r.ok && r.isNewBest);
    });
  }, []);

  useEffect(() => {
    if (phase === "running" && (secondsLeft === 0 || exhausted)) finish(correct);
  }, [phase, secondsLeft, exhausted, correct, finish]);

  const start = () => {
    setPhase("running");
    shownAt.current = Date.now();
  };

  const answer = useCallback(async (rating: 1 | 3) => {
    if (!card || busy || phase !== "running") return;
    setBusy(true);
    const duration = Date.now() - shownAt.current;
    try {
      await gradeCard(card.id, rating, duration);
    } catch {
      // Speed is the point; a failed write here just means this rep isn't scored.
    }
    setAttempted((a) => a + 1);
    if (rating === 3) setCorrect((c) => c + 1);
    setIndex((i) => i + 1);
    setRevealed(false);
    shownAt.current = Date.now();
    setBusy(false);
  }, [busy, phase, card]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== "running") return;
      if (isAdvanceKey(e)) {
        e.preventDefault();
        if (!revealed) setRevealed(true);
        else void answer(3);
        return;
      }
      if (revealed && e.key === "Backspace") { e.preventDefault(); void answer(1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, revealed, answer]);

  if (phase === "ready") {
    if (cards.length === 0) {
      return (
        <Page title="Case Sprint" lead={`A speed round through your deck, ${roundLength(seconds)} on the clock.`}>
          <Empty
            title="Nothing to sprint through yet"
            body="This draws on cards that are due, or that you have slipped on before."
            action={<ButtonLink href="/dictionary" variant="primary">Open the dictionary</ButtonLink>}
          />
        </Page>
      );
    }
    return (
      <div className="mx-auto max-w-xl px-5 py-16 text-center md:px-10">
        <div
          className="pop-in rounded-[var(--r-xl)] px-6 py-12"
          style={{ background: "var(--butter-soft)" }}
        >
          <span
            className="float mx-auto flex h-16 w-16 items-center justify-center rounded-full"
            style={{ background: "var(--surface)", color: "var(--butter-ink)", boxShadow: "var(--shadow)" }}
          >
            <Timer size={30} aria-hidden />
          </span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight" style={{ color: "var(--ink)" }}>
            Case Sprint
          </h1>
          <p className="mx-auto mt-2 max-w-[44ch] text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
            {cards.length} cards loaded. Flip and answer as fast as you can for{" "}
            {roundLength(seconds)}. {ADVANCE_KEY_LABEL} to flip, again for correct, Backspace for missed.
          </p>
          <p
            className="mt-4 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold"
            style={{ background: "var(--surface)", color: "var(--butter-ink)" }}
          >
            <Trophy size={14} aria-hidden /> Personal best: {best}
          </p>
          <div className="mt-7">
            <Button variant="primary" size="lg" className="px-10" onClick={start}>Start the clock</Button>
          </div>
          {/* Said here rather than only in Settings, because the moment
              somebody notices the round is too fast is the moment they are
              looking at this screen. */}
          <p className="mt-4 text-xs" style={{ color: "var(--ink-3)" }}>
            Need longer?{" "}
            <Link href="/settings#round-pace" className="underline underline-offset-2">
              Give yourself more time
            </Link>
            , up to ten times this.
          </p>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
    return (
      <div className="mx-auto max-w-2xl px-5 py-16 md:px-10">
        <div className="pop-in text-center">
          <Mascot size={68} mood={isNewBest ? "cheer" : "happy"} className="float mx-auto" />
          <h1 className="mt-5 text-3xl font-bold tracking-tight" style={{ color: "var(--ink)" }}>
            Time&rsquo;s up!
          </h1>
          <p className="mt-2 flex items-center justify-center gap-2 text-base" style={{ color: "var(--ink-2)" }}>
            {isNewBest && <Trophy size={17} aria-hidden style={{ color: "var(--butter-ink)" }} />}
            {isNewBest ? "New personal best." : `Best so far: ${best}.`}
          </p>
        </div>
        <div className="mt-8 grid grid-cols-3 gap-3">
          <StatTile value={correct} label="Score" tone="accent" />
          <StatTile value={`${accuracy}%`} label="Accuracy" tone={accuracy >= 85 ? "mint" : "butter"} />
          <StatTile value={attempted} label="Attempted" tone="sky" />
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/" size="lg">Back to Today</ButtonLink>
          <ButtonLink href="/review/sprint" variant="primary" size="lg">Sprint again</ButtonLink>
        </div>
      </div>
    );
  }

  if (!card) return null; // unreachable: "ready" already gated on a non-empty pool

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-5 py-6 md:px-10 md:py-10">
      {/* The heading a session screen has no room to draw. Same line as every
          other mode: the start screen and the finished screen each carry one
          and the round itself did not. */}
      <h1 className="sr-only">Case sprint</h1>
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link
          href="/"
          aria-label="End sprint"
          className="press flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-[var(--raised)]"
          style={{ color: "var(--ink-3)" }}
        >
          <X size={18} aria-hidden />
        </Link>
        <div
          className="tnum flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-bold"
          style={{ background: secondsLeft <= 10 ? "var(--peach-soft)" : "var(--raised)", color: secondsLeft <= 10 ? "var(--peach-ink)" : "var(--ink-2)" }}
        >
          <Timer size={14} aria-hidden /> {secondsLeft}s
        </div>
        <span className="tnum text-xs" style={{ color: "var(--ink-3)" }}>{correct} correct</span>
      </div>

      <div
        className="flex flex-col overflow-hidden rounded-[var(--r-xl)] border"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow-lg)" }}
      >
        <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3" style={{ borderColor: "var(--rule-soft)" }}>
          <Chip tone="accent">Sprint</Chip>
          <span className="ml-auto text-xs" style={{ color: "var(--ink-3)" }}>#{attempted + 1}</span>
          {/* The corner of the card, which is where somebody looks for this the
              moment a word turns out to be worth keeping. */}
          {card.lexemeId && (
            <StarWord lexemeId={card.lexemeId} starred={card.starred} label={card.lemma ?? card.front} />
          )}
        </div>

        <div className="flex min-h-[280px] flex-col items-center justify-center gap-4 px-6 py-12 text-center" aria-live="polite">
          <div className="flex items-center gap-2">
            <p
              lang={estonianSide(card.cardType, "front") ? "et" : "en"}
              className="text-3xl font-semibold leading-tight md:text-4xl"
              style={{ color: "var(--ink)" }}
            >
              {card.front}
            </p>
            {estonianSide(card.cardType, "front") && <Speak text={card.lemma ?? card.front} />}
          </div>

          {revealed && (
            <>
              <div className="my-1 h-px w-16" style={{ background: "var(--rule)" }} />
              <div className="flex items-center gap-2">
                <p
                  lang={estonianSide(card.cardType, "back") ? "et" : "en"}
                  className="text-2xl font-semibold md:text-3xl"
                  style={{ color: "var(--accent-deep)" }}
                >
                  {card.back}
                </p>
                {estonianSide(card.cardType, "back") && <Speak text={card.back} />}
              </div>
            </>
          )}
        </div>

        <div className="border-t px-6 py-4" style={{ borderColor: "var(--rule-soft)" }}>
          {!revealed ? (
            <Button variant="primary" size="lg" className="w-full" onClick={() => setRevealed(true)}>
              Show answer
              <KeyCap className="ml-1">{ADVANCE_KEY_LABEL}</KeyCap>
            </Button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void answer(1)}
                className={`${VERDICT_CLASS.wrong} press rounded-[var(--r)] px-3 py-3 text-base font-bold transition-ui hover:-translate-y-0.5 disabled:opacity-40`}
              >
                Missed it <KeyCap className="ml-1">⌫</KeyCap>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void answer(3)}
                className={`${VERDICT_CLASS.right} press rounded-[var(--r)] px-3 py-3 text-base font-bold transition-ui hover:-translate-y-0.5 disabled:opacity-40`}
              >
                Got it <KeyCap className="ml-1">{ADVANCE_KEY_LABEL}</KeyCap>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
