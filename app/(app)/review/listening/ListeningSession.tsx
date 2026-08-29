"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Headphones, X } from "lucide-react";
import Link from "next/link";
import { checkAchievements, gradeCard } from "@/app/actions";
import { AchievementToasts } from "@/components/achievements/AchievementToasts";
import { Button, ButtonLink } from "@/components/Button";
import { Chip, Empty, Page, StatTile } from "@/components/ui";
import { Mascot } from "@/components/brand";
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
  // The whole exercise is the audio. If the proxy cannot produce any, the word
  // is shown rather than leaving four choices and no question.
  const [noAudio, setNoAudio] = useState(false);
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
        <div className="pop-in text-center">
          <Mascot size={68} mood="cheer" className="float mx-auto" />
          <h1 className="est mt-5 text-[32px] font-bold tracking-tight" style={{ color: "var(--ink)" }}>
            Session complete
          </h1>
          <p className="mt-2 text-[15px]" style={{ color: "var(--ink-2)" }}>
            Tubli töö. That&rsquo;s every word in this round.
          </p>
        </div>
        <div className="mt-8 grid grid-cols-3 gap-3">
          <StatTile value={correct} label="Correct" tone="accent" />
          <StatTile value={`${accuracy}%`} label="Accuracy" tone={accuracy >= 85 ? "mint" : "butter"} />
          <StatTile value={attempted} label="Attempted" tone="sky" />
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/review/listening" variant="primary" size="lg">Listen again</ButtonLink>
          <ButtonLink href="/" size="lg">Back to Today</ButtonLink>
        </div>
        <AchievementToasts badges={newBadges} />
      </div>
    );
  }

  const remaining = cards.length - index;

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-5 py-6 md:px-10 md:py-10">
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
            className="grad-accent h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.max((index / cards.length) * 100, 2)}%` }}
            role="progressbar"
            aria-valuenow={index}
            aria-valuemin={0}
            aria-valuemax={cards.length}
            aria-label="Session progress"
          />
        </div>
        <span
          className="tnum label-xs rounded-full px-2.5 py-1"
          style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
        >
          {remaining} left
        </span>
      </div>

      <div
        className="flex flex-col overflow-hidden rounded-[var(--r-xl)] border"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow-lg)" }}
      >
        <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3" style={{ borderColor: "var(--rule-soft)" }}>
          <Chip tone="accent"><Headphones size={12} aria-hidden /> Listening</Chip>
          <span className="ml-auto text-[12.5px]" style={{ color: "var(--ink-3)" }}>{correct} correct</span>
        </div>

        <div className="flex min-h-[220px] flex-col items-center justify-center gap-4 px-6 py-10 text-center" aria-live="polite">
          {!answered ? (
            noAudio ? (
              <>
                <p lang="et" className="est text-[30px] font-semibold" style={{ color: "var(--ink)" }}>
                  {card.lemma}
                </p>
                <p className="max-w-[40ch] text-[13px]" style={{ color: "var(--ink-3)" }}>
                  No audio right now. The pronunciation service could not be reached, so the word is
                  shown instead. Still worth answering; come back for the listening part.
                </p>
              </>
            ) : (
              <>
                <Speak
                  text={card.lemma}
                  size={30}
                  onUnavailable={() => setNoAudio(true)}
                  className="press flex h-24 w-24 items-center justify-center rounded-full transition-all hover:-translate-y-0.5"
                  style={{ background: "var(--accent-soft)", color: "var(--accent-deep)", boxShadow: "var(--shadow)" }}
                />
                <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>Tap to hear the word, tap again to replay</p>
              </>
            )
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
                className="press flex items-center gap-2 rounded-[var(--r)] px-4 py-3 text-left text-[14.5px] font-semibold transition-all hover:-translate-y-0.5 disabled:cursor-default disabled:hover:translate-y-0"
                style={tone}
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
            <Button variant="primary" size="lg" className="w-full" onClick={next}>
              Continue
              <kbd className="ml-1 rounded-md px-1.5 py-0.5 text-[11px]" style={{ background: "rgb(255 255 255 / 0.22)" }}>Space</kbd>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
