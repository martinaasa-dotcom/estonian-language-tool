"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Headphones, X } from "lucide-react";
import Link from "next/link";
import { checkAchievements, gradeCard } from "@/app/actions";
import { AchievementToasts } from "@/components/achievements/AchievementToasts";
import { Button, ButtonLink } from "@/components/Button";
import { Chip, Empty, Page, Stat } from "@/components/ui";
import { Speak } from "@/components/Speak";
import type { Badge } from "@/lib/achievements/badges";

export interface ListeningCard {
  id: string;
  /** The Estonian word to play — never shown as text until the round is answered. */
  lemma: string;
  correct: string;
  /** 2–4 English options, correct one included, already shuffled. */
  choices: string[];
}

export function ListeningSession({ cards: initialCards }: { cards: ListeningCard[] }) {
  // Snapshotted once on mount, and never updated from later props. gradeCard()
  // is a Server Action, and Next.js refreshes this route's Server Component
  // after every call — which would hand down a shrinking `cards` prop as
  // graded cards drop out of the due pool. Without a frozen snapshot, the
  // *last* grade of a session would see an empty prop and render "nothing to
  // listen to" instead of the session summary.
  const [cards] = useState(initialCards);
  const [wasEmptyAtStart] = useState(initialCards.length === 0);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);
  const [attempted, setAttempted] = useState(0);
  const [busy, setBusy] = useState(false);
  const [newBadges, setNewBadges] = useState<Badge[]>([]);
  const shownAt = useRef(Date.now());
  const checkedAchievements = useRef(false);

  const card = cards[index];
  const finished = !card;
  const answered = selected !== null;

  useEffect(() => {
    shownAt.current = Date.now();
    setSelected(null);
  }, [index]);

  useEffect(() => {
    if (!finished || wasEmptyAtStart || checkedAchievements.current) return;
    checkedAchievements.current = true;
    const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
    void checkAchievements({ count: attempted, accuracy }).then((r) => {
      if (r.ok) setNewBadges(r.newBadges);
    });
  }, [finished, attempted, correct, wasEmptyAtStart]);

  const pick = useCallback(async (choice: string) => {
    if (!card || answered || busy) return;
    setBusy(true);
    const isCorrect = choice === card.correct;
    const duration = Date.now() - shownAt.current;
    setSelected(choice);
    try {
      await gradeCard(card.id, isCorrect ? 3 : 1, duration);
    } catch {
      // The grade did not reach the database; the round still shows feedback.
    }
    setAttempted((a) => a + 1);
    if (isCorrect) setCorrect((c) => c + 1);
    setBusy(false);
  }, [card, answered, busy]);

  const next = useCallback(() => {
    if (!answered) return;
    setIndex((i) => i + 1);
  }, [answered]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (finished) return;
      if (answered) {
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); next(); }
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= card.choices.length) { e.preventDefault(); void pick(card.choices[n - 1]!); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finished, answered, card, pick, next]);

  if (wasEmptyAtStart) {
    return (
      <Page title="Listening" lead="Hear a word, pick its meaning.">
        <Empty
          title="Nothing to listen to yet"
          body="Listening draws from cards that are due or that you've slipped on before. Review a little first, or add some words."
          action={<ButtonLink href="/dictionary" variant="primary">Open the dictionary</ButtonLink>}
        />
      </Page>
    );
  }

  if (finished) {
    const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
    return (
      <div className="mx-auto max-w-2xl px-5 py-16 md:px-10">
        <h1 className="est text-[32px] font-bold tracking-tight" style={{ color: "var(--ink)" }}>
          Session complete
        </h1>
        <p className="mt-2 text-[15px]" style={{ color: "var(--ink-2)" }}>
          Tubli töö. That&rsquo;s every word in this round.
        </p>
        <div
          className="mt-8 grid grid-cols-3 gap-6 rounded-lg border p-6"
          style={{ borderColor: "var(--rule)", background: "var(--surface)" }}
        >
          <Stat value={correct} label="Correct" tone="var(--accent)" />
          <Stat value={`${accuracy}%`} label="Accuracy" tone={accuracy >= 85 ? "var(--good)" : "var(--hard)"} />
          <Stat value={attempted} label="Attempted" />
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/review/listening" variant="primary">Listen again</ButtonLink>
          <ButtonLink href="/">Back to Today</ButtonLink>
        </div>
        <AchievementToasts badges={newBadges} />
      </div>
    );
  }

  const remaining = cards.length - index;

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-5 py-6 md:px-10 md:py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link href="/" aria-label="End session" className="rounded p-1" style={{ color: "var(--ink-3)" }}>
          <X size={19} aria-hidden />
        </Link>
        <div className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: "var(--raised)" }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${(index / cards.length) * 100}%`, background: "var(--accent)" }}
            role="progressbar"
            aria-valuenow={index}
            aria-valuemin={0}
            aria-valuemax={cards.length}
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
          <Chip tone="accent"><Headphones size={12} aria-hidden /> Listening</Chip>
          <span className="ml-auto text-[12.5px]" style={{ color: "var(--ink-3)" }}>{correct} correct</span>
        </div>

        <div className="flex min-h-[220px] flex-col items-center justify-center gap-4 px-6 py-10 text-center" aria-live="polite">
          {!answered ? (
            <>
              <Speak
                text={card.lemma}
                size={30}
                className="flex h-20 w-20 items-center justify-center rounded-full transition-opacity hover:opacity-80"
              />
              <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>Tap to hear the word — tap again to replay</p>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <p lang="et" className="est text-[30px] font-semibold" style={{ color: "var(--ink)" }}>{card.lemma}</p>
              <Speak text={card.lemma} />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2 border-t p-4 sm:grid-cols-2" style={{ borderColor: "var(--rule-soft)" }}>
          {card.choices.map((choice, i) => {
            const isCorrectChoice = choice === card.correct;
            const isPicked = choice === selected;
            const tone = !answered
              ? { background: "var(--raised)", color: "var(--ink)" }
              : isCorrectChoice
                ? { background: "var(--good-soft)", color: "var(--good)" }
                : isPicked
                  ? { background: "var(--again-soft)", color: "var(--again)" }
                  : { background: "var(--raised)", color: "var(--ink-3)" };
            return (
              <button
                key={choice}
                type="button"
                disabled={answered || busy}
                onClick={() => void pick(choice)}
                className="flex items-center gap-2 rounded-md border px-3.5 py-2.5 text-left text-[14px] font-medium transition-opacity disabled:cursor-default"
                style={{ borderColor: "transparent", ...tone }}
              >
                <kbd className="text-[10.5px] opacity-60">{i + 1}</kbd>
                <span className="flex-1">{choice}</span>
                {answered && isCorrectChoice && <Check size={15} aria-hidden />}
                {answered && isPicked && !isCorrectChoice && <X size={15} aria-hidden />}
              </button>
            );
          })}
        </div>

        {answered && (
          <div className="border-t p-4" style={{ borderColor: "var(--rule-soft)" }}>
            <Button variant="primary" className="w-full py-2.5" onClick={next}>
              Continue <kbd className="ml-1 opacity-70">Space</kbd>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
