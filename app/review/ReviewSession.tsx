"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Check, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { checkAchievements, gradeCard } from "@/app/actions";
import { AchievementToasts } from "@/components/achievements/AchievementToasts";
import { Button, ButtonLink } from "@/components/Button";
import { Chip, Stat } from "@/components/ui";
import { Speak } from "@/components/Speak";
import type { Badge } from "@/lib/achievements/badges";
import { previewIntervals, RATINGS, type RatingValue, type SchedulingState } from "@/lib/srs/scheduler";

export interface ReviewCard {
  id: string;
  cardType: string;
  front: string;
  back: string;
  hint: string | null;
  targetCase: string | null;
  lemma: string | null;
  isNew: boolean;
  scheduling: Omit<SchedulingState, "due" | "lastReview"> & { due: string; lastReview: string | null };
}

const TONE: Record<number, string> = {
  1: "var(--again)", 2: "var(--hard)", 3: "var(--good)", 4: "var(--easy)",
};
const TONE_SOFT: Record<number, string> = {
  1: "var(--again-soft)", 2: "var(--hard-soft)", 3: "var(--good-soft)", 4: "var(--easy-soft)",
};

const TYPE_LABEL: Record<string, string> = {
  RECOGNITION: "Estonian → English",
  PRODUCTION: "English → Estonian",
  CASE_FORM: "Case form",
  GRADATION: "Gradation",
  GOVERNMENT: "Verb government",
};

/** Cards whose front or back is Estonian and therefore worth hearing. */
const estonianSide = (type: string, side: "front" | "back") =>
  side === "front" ? type !== "PRODUCTION" : type === "PRODUCTION" || type === "CASE_FORM" || type === "GRADATION";

export function ReviewSession({ cards, drillCase }: { cards: ReviewCard[]; drillCase?: string }) {
  const [queue, setQueue] = useState(cards);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [busy, setBusy] = useState(false);
  const [newBadges, setNewBadges] = useState<Badge[]>([]);
  const shownAt = useRef(Date.now());
  const startedAt = useRef(Date.now());
  const checkedAchievements = useRef(false);

  const card = queue[index];
  const finished = !card;

  useEffect(() => {
    if (!finished || checkedAchievements.current) return;
    checkedAchievements.current = true;
    const accuracy = done > 0 ? Math.round((correct / done) * 100) : 0;
    void checkAchievements({ count: done, accuracy }).then((r) => {
      if (r.ok) setNewBadges(r.newBadges);
    });
  }, [finished, done, correct]);

  useEffect(() => {
    shownAt.current = Date.now();
    setRevealed(false);
  }, [index]);

  const intervals = useMemo(() => {
    if (!card) return null;
    return previewIntervals(
      { ...card.scheduling, due: new Date(card.scheduling.due), lastReview: card.scheduling.lastReview ? new Date(card.scheduling.lastReview) : null },
      new Date(),
    );
  }, [card]);

  const submit = useCallback(async (rating: RatingValue) => {
    if (!card || busy) return;
    setBusy(true);
    const duration = Date.now() - shownAt.current;
    try {
      await gradeCard(card.id, rating, duration);
    } catch {
      // The grade did not reach the database. Keep the card in the queue rather
      // than silently dropping a review the learner just did.
      setBusy(false);
      return;
    }
    setDone((d) => d + 1);
    if (rating >= 3) setCorrect((c) => c + 1);

    // "Again" means it is not learned — put it back near the end of this session.
    if (rating === 1) {
      setQueue((q) => {
        const next = [...q];
        const [failed] = next.splice(index, 1);
        if (failed) next.splice(Math.min(next.length, index + 5), 0, failed);
        return next;
      });
      setRevealed(false);
      shownAt.current = Date.now();
    } else {
      setIndex((i) => i + 1);
    }
    setBusy(false);
  }, [card, busy, index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (finished) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!revealed) setRevealed(true);
        else void submit(3);
        return;
      }
      if (!revealed) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 4) { e.preventDefault(); void submit(n as RatingValue); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, submit, finished]);

  if (finished) {
    const minutes = Math.max(1, Math.round((Date.now() - startedAt.current) / 60000));
    const accuracy = done > 0 ? Math.round((correct / done) * 100) : 0;
    return (
      <div className="mx-auto max-w-2xl px-5 py-16 md:px-10">
        <h1 className="est text-[32px] font-bold tracking-tight" style={{ color: "var(--ink)" }}>
          Session complete
        </h1>
        <p className="mt-2 text-[15px]" style={{ color: "var(--ink-2)" }}>
          {drillCase
            ? <>Tubli töö. That&rsquo;s the {drillCase.toLowerCase()} drill done — these cards keep their normal schedule too.</>
            : <>Tubli töö. That&rsquo;s everything due right now.</>}
        </p>
        <div
          className="mt-8 grid grid-cols-3 gap-6 rounded-lg border p-6"
          style={{ borderColor: "var(--rule)", background: "var(--surface)" }}
        >
          <Stat value={done} label="Reviewed" />
          <Stat value={`${accuracy}%`} label="Recalled" tone={accuracy >= 85 ? "var(--good)" : "var(--hard)"} />
          <Stat value={`${minutes}m`} label="Time" />
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/" variant="primary">Back to Today</ButtonLink>
          <ButtonLink href="/dictionary">Add new words</ButtonLink>
        </div>
        <AchievementToasts badges={newBadges} />
      </div>
    );
  }

  const remaining = queue.length - index;
  const progress = queue.length ? (index / queue.length) * 100 : 0;

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-5 py-6 md:px-10 md:py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link href="/" aria-label="End session" className="rounded p-1" style={{ color: "var(--ink-3)" }}>
          <X size={19} aria-hidden />
        </Link>
        <div className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: "var(--raised)" }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${progress}%`, background: "var(--accent)" }}
            role="progressbar"
            aria-valuenow={index}
            aria-valuemin={0}
            aria-valuemax={queue.length}
            aria-label="Session progress"
          />
        </div>
        <span className="tnum text-[13px]" style={{ color: "var(--ink-3)" }}>{remaining} left</span>
      </div>

      <div
        className="flex flex-col rounded-xl border"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow)" }}
      >
        <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3" style={{ borderColor: "var(--rule-soft)" }}>
          <Chip tone="accent">{TYPE_LABEL[card.cardType] ?? card.cardType}</Chip>
          {card.isNew && <Chip tone="good">New</Chip>}
          {drillCase && <Chip tone="hard">{drillCase.toLowerCase()} drill</Chip>}
          {card.lemma && (
            <Link
              href={`/dictionary?q=${encodeURIComponent(card.lemma)}`}
              className="ml-auto flex items-center gap-1.5 text-[12.5px]"
              style={{ color: "var(--ink-3)" }}
            >
              <BookOpen size={13} aria-hidden /> Full entry
            </Link>
          )}
        </div>

        <div
          className="flex min-h-[300px] flex-col items-center justify-center gap-4 px-6 py-12 text-center md:min-h-[340px]"
          aria-live="polite"
        >
          <div className="flex items-center gap-2">
            <p
              lang={estonianSide(card.cardType, "front") ? "et" : "en"}
              className="est text-[34px] font-semibold leading-tight md:text-[40px]"
              style={{ color: "var(--ink)" }}
            >
              {card.front}
            </p>
            {estonianSide(card.cardType, "front") && <Speak text={card.lemma ?? card.front} />}
          </div>
          {card.hint && !revealed && (
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{card.hint}</p>
          )}

          {revealed && (
            <>
              <div className="my-1 h-px w-16" style={{ background: "var(--rule)" }} />
              <div className="flex items-center gap-2">
                <p
                  lang={estonianSide(card.cardType, "back") ? "et" : "en"}
                  className="est text-[30px] font-semibold md:text-[34px]"
                  style={{ color: "var(--accent)" }}
                >
                  {card.back}
                </p>
                {estonianSide(card.cardType, "back") && <Speak text={card.back} />}
              </div>
              {card.hint && <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{card.hint}</p>}
            </>
          )}
        </div>

        <div className="border-t p-4" style={{ borderColor: "var(--rule-soft)" }}>
          {!revealed ? (
            <Button variant="primary" className="w-full py-3" onClick={() => setRevealed(true)}>
              Show answer <kbd className="ml-1 opacity-70">Space</kbd>
            </Button>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {RATINGS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  disabled={busy}
                  onClick={() => void submit(r.value as RatingValue)}
                  aria-label={`${r.label} — next in ${intervals?.[r.value as RatingValue] ?? ""}`}
                  className="flex flex-col items-center gap-0.5 rounded-md border px-2 py-2.5 transition-opacity hover:opacity-80 disabled:opacity-40"
                  style={{
                    borderColor: "transparent",
                    background: TONE_SOFT[r.value],
                    color: TONE[r.value],
                  }}
                >
                  <span className="text-[14px] font-semibold">{r.label}</span>
                  <span className="tnum text-[11px] opacity-80">{intervals?.[r.value as RatingValue]}</span>
                  <kbd className="text-[10px] opacity-60">{r.key}</kbd>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="mt-4 flex items-center justify-center gap-4 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
        <span className="flex items-center gap-1"><Check size={12} aria-hidden /> {correct} recalled</span>
        <span className="flex items-center gap-1"><RotateCcw size={12} aria-hidden /> {done} graded</span>
        <span className="hidden md:inline">Space to flip · 1–4 to grade</span>
      </p>
    </div>
  );
}
