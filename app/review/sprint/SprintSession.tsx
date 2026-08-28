"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Timer, Trophy, X } from "lucide-react";
import Link from "next/link";
import { checkAchievements, gradeCard, recordSprintScore } from "@/app/actions";
import { AchievementToasts } from "@/components/achievements/AchievementToasts";
import { Button, ButtonLink } from "@/components/Button";
import { Chip, Empty, Page, Stat } from "@/components/ui";
import { Speak } from "@/components/Speak";
import type { Badge } from "@/lib/achievements/badges";

export interface SprintCard {
  id: string;
  front: string;
  back: string;
  lemma: string | null;
  cardType: string;
}

const DURATION_S = 60;

const estonianSide = (type: string, side: "front" | "back") =>
  side === "front" ? type !== "PRODUCTION" : type === "PRODUCTION" || type === "CASE_FORM" || type === "GRADATION";

export function SprintSession({ cards: initialCards, best }: { cards: SprintCard[]; best: number }) {
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
  const [secondsLeft, setSecondsLeft] = useState(DURATION_S);
  const [phase, setPhase] = useState<"ready" | "running" | "done">("ready");
  const [busy, setBusy] = useState(false);
  const [newBadges, setNewBadges] = useState<Badge[]>([]);
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
    void recordSprintScore(finalScore).then(async (r) => {
      setIsNewBest(r.isNewBest);
      const check = await checkAchievements();
      if (check.ok) setNewBadges(check.newBadges);
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
      if (e.key === " " || e.key === "Enter") {
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
        <Page title="Case Sprint" lead="A 60-second speed round through your deck.">
          <Empty
            title="Nothing to sprint through yet"
            body="Case Sprint draws from cards that are due or that you've slipped on before. Review a little first, or add some words."
            action={<ButtonLink href="/dictionary" variant="primary">Open the dictionary</ButtonLink>}
          />
        </Page>
      );
    }
    return (
      <div className="mx-auto max-w-xl px-5 py-16 text-center md:px-10">
        <Timer size={34} className="mx-auto" aria-hidden style={{ color: "var(--accent)" }} />
        <h1 className="est mt-3 text-[30px] font-bold tracking-tight" style={{ color: "var(--ink)" }}>
          Case Sprint
        </h1>
        <p className="mx-auto mt-2 max-w-[46ch] text-[14.5px]" style={{ color: "var(--ink-2)" }}>
          {cards.length} cards loaded. Flip and answer as fast as you can for {DURATION_S} seconds — Space to
          flip, Enter for correct, Backspace for missed.
        </p>
        <p className="mt-2 text-[13px]" style={{ color: "var(--ink-3)" }}>Personal best: {best}</p>
        <Button variant="primary" className="mt-6 px-8 py-3" onClick={start}>Start</Button>
      </div>
    );
  }

  if (phase === "done") {
    const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
    return (
      <div className="mx-auto max-w-2xl px-5 py-16 md:px-10">
        <h1 className="est text-[32px] font-bold tracking-tight" style={{ color: "var(--ink)" }}>
          Time&rsquo;s up!
        </h1>
        <p className="mt-2 flex items-center gap-2 text-[15px]" style={{ color: "var(--ink-2)" }}>
          {isNewBest && <Trophy size={17} aria-hidden style={{ color: "var(--hard)" }} />}
          {isNewBest ? "New personal best." : `Best so far: ${best}.`}
        </p>
        <div
          className="mt-8 grid grid-cols-3 gap-6 rounded-lg border p-6"
          style={{ borderColor: "var(--rule)", background: "var(--surface)" }}
        >
          <Stat value={correct} label="Score" tone="var(--accent)" />
          <Stat value={`${accuracy}%`} label="Accuracy" />
          <Stat value={attempted} label="Attempted" />
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/review/sprint" variant="primary">Sprint again</ButtonLink>
          <ButtonLink href="/">Back to Today</ButtonLink>
        </div>
        <AchievementToasts badges={newBadges} />
      </div>
    );
  }

  if (!card) return null; // unreachable: "ready" already gated on a non-empty pool

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-5 py-6 md:px-10 md:py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link href="/" aria-label="End sprint" className="rounded p-1" style={{ color: "var(--ink-3)" }}>
          <X size={19} aria-hidden />
        </Link>
        <div
          className="tnum flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold"
          style={{ background: secondsLeft <= 10 ? "var(--again-soft)" : "var(--raised)", color: secondsLeft <= 10 ? "var(--again)" : "var(--ink-2)" }}
        >
          <Timer size={14} aria-hidden /> {secondsLeft}s
        </div>
        <span className="tnum text-[13px]" style={{ color: "var(--ink-3)" }}>{correct} correct</span>
      </div>

      <div
        className="flex flex-col rounded-xl border"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow)" }}
      >
        <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3" style={{ borderColor: "var(--rule-soft)" }}>
          <Chip tone="accent">Sprint</Chip>
          <span className="ml-auto text-[12.5px]" style={{ color: "var(--ink-3)" }}>#{attempted + 1}</span>
        </div>

        <div className="flex min-h-[280px] flex-col items-center justify-center gap-4 px-6 py-12 text-center" aria-live="polite">
          <div className="flex items-center gap-2">
            <p
              lang={estonianSide(card.cardType, "front") ? "et" : "en"}
              className="est text-[32px] font-semibold leading-tight md:text-[38px]"
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
                  className="est text-[28px] font-semibold md:text-[32px]"
                  style={{ color: "var(--accent)" }}
                >
                  {card.back}
                </p>
                {estonianSide(card.cardType, "back") && <Speak text={card.back} />}
              </div>
            </>
          )}
        </div>

        <div className="border-t p-4" style={{ borderColor: "var(--rule-soft)" }}>
          {!revealed ? (
            <Button variant="primary" className="w-full py-3" onClick={() => setRevealed(true)}>
              Show answer <kbd className="ml-1 opacity-70">Space</kbd>
            </Button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void answer(1)}
                className="rounded-md border px-3 py-2.5 text-[14px] font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{ background: "var(--again-soft)", color: "var(--again)", borderColor: "transparent" }}
              >
                Missed it <kbd className="ml-1 opacity-70">⌫</kbd>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void answer(3)}
                className="rounded-md border px-3 py-2.5 text-[14px] font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{ background: "var(--good-soft)", color: "var(--good)", borderColor: "transparent" }}
              >
                Got it <kbd className="ml-1 opacity-70">Enter</kbd>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
