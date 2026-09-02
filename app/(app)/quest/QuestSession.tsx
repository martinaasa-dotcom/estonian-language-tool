"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Flame, Target, Timer, X } from "lucide-react";
import { checkAchievements, gradeCard } from "@/app/actions";
import { AchievementToasts } from "@/components/achievements/AchievementToasts";
import { Button, ButtonLink } from "@/components/Button";
import { Chip, Empty, Page, StatTile } from "@/components/ui";
import { Speak } from "@/components/Speak";
import { useFeedbackSound } from "@/components/AudioPrefs";
import type { Badge } from "@/lib/achievements/badges";
import type { QuestCard } from "@/lib/progress/quest";

/** Two minutes, which is what was asked for and is about right for 24 cards. */
const DURATION_S = 120;

export interface AimedCase {
  key: string;
  accuracy: number;
  et: string;
  question: string | null;
}

/**
 * THE DAILY QUEST.
 *
 * Two minutes, self-graded by comparison, on the cards behind the cases this
 * learner is worst at. It is the one round that opens by saying what it is
 * about: "your seesütlev is at 54%" is the reason to press it, and a round that
 * hid that would be another timer.
 *
 * A FLIP RATHER THAN A TYPED ANSWER, deliberately. Two minutes at a typed
 * answer is about eight cards, and the point of this round is volume across a
 * weakness rather than depth on one card; the same argument the Case Sprint
 * makes. `SELF_GRADES` is why that is honest: the learner says whether they had
 * it, which is the only judge a flip has (`lib/srs/scheduler.ts`).
 *
 * Every answer grades through `gradeCard`, so a round played for the timer
 * still moves the schedule and the log records what happened (ADR-016). An
 * abandoned round writes only the cards actually answered, which is what the
 * log should say.
 */
export function QuestSession({ cards: initialCards, aimed }: { cards: QuestCard[]; aimed: AimedCase[] }) {
  // Snapshotted once on mount and never updated from later props: `gradeCard`
  // refreshes this route's Server Component on every call, which would hand
  // down a shrinking pool mid-round. See ReviewSession for the same reasoning.
  const [cards] = useState(initialCards);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [attempted, setAttempted] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(DURATION_S);
  const [phase, setPhase] = useState<"ready" | "running" | "done">("ready");
  const [busy, setBusy] = useState(false);
  const [newBadges, setNewBadges] = useState<Badge[]>([]);
  const shownAt = useRef(Date.now());
  const sound = useFeedbackSound();

  const card = cards.length > 0 ? cards[index % cards.length]! : null;
  const exhausted = cards.length > 0 && attempted >= cards.length;

  useEffect(() => {
    if (phase !== "running") return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const finish = useCallback(() => {
    setPhase("done");
    void checkAchievements().then((r) => { if (r.ok) setNewBadges(r.newBadges); });
  }, []);

  useEffect(() => {
    if (phase === "running" && (secondsLeft === 0 || exhausted)) finish();
  }, [phase, secondsLeft, exhausted, finish]);

  const answer = useCallback(async (got: boolean) => {
    if (!card || busy) return;
    setBusy(true);
    sound(got ? "right" : "wrong");
    setAttempted((a) => a + 1);
    if (got) {
      setCorrect((c) => c + 1);
      setStreak((s) => { const next = s + 1; setBestStreak((b) => Math.max(b, next)); return next; });
    } else {
      setStreak(0);
    }
    await gradeCard(card.id, got ? 3 : 1, Date.now() - shownAt.current);
    setRevealed(false);
    setIndex((i) => i + 1);
    shownAt.current = Date.now();
    setBusy(false);
  }, [card, busy, sound]);

  /* Keys, because a two-minute round is one a keyboard should be able to play:
     space turns the card, then 1 and 2 answer it. Same two answers as a flip
     card in review, for the same reason. */
  useEffect(() => {
    if (phase !== "running") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " " && !revealed) { e.preventDefault(); setRevealed(true); return; }
      if (!revealed) return;
      if (e.key === "1") { e.preventDefault(); void answer(false); }
      if (e.key === "2") { e.preventDefault(); void answer(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, revealed, answer]);

  if (cards.length === 0) {
    return (
      <Page title="Daily quest" lead="Two minutes on whatever keeps going wrong.">
        <Empty
          title="Nothing to work on yet"
          body="This round draws on the cards you have already answered."
          action={<ButtonLink href="/review" variant="primary">Open review</ButtonLink>}
        />
      </Page>
    );
  }

  if (phase === "ready") {
    return (
      <Page title="Daily quest" lead="Two minutes on whatever keeps going wrong.">
        <div className="mx-auto flex max-w-md flex-col items-center gap-5 text-center">
          <span
            className="flex h-20 w-20 items-center justify-center rounded-full quest-pulse"
            style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
          >
            <Target size={34} aria-hidden />
          </span>

          {/* What the round is about, said before it starts. A timer with no
              reason behind it is another timer; "your seesütlev is at 54%" is
              the reason to press it. */}
          {aimed.length > 0 ? (
            <>
              <p className="text-base" style={{ color: "var(--ink-2)" }}>
                Aimed at what is going wrong most:
              </p>
              <ul className="flex flex-wrap justify-center gap-2">
                {aimed.map((c) => (
                  <li key={c.key}>
                    <Chip tone={c.accuracy < 60 ? "again" : "hard"}>
                      <span lang="et">{c.et}</span>
                      {c.question && <span lang="et"> · {c.question}</span>}
                      {" "}{c.accuracy}%
                    </Chip>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-base" style={{ color: "var(--ink-2)" }}>
              The cards you have got wrong most often. Answer as many as you can.
            </p>
          )}

          <Button variant="primary" size="lg" onClick={() => { setPhase("running"); shownAt.current = Date.now(); }}>
            Start the two minutes
          </Button>
          <ButtonLink href="/">Not now</ButtonLink>
        </div>
      </Page>
    );
  }

  if (phase === "done") {
    const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
    return (
      <Page title="Daily quest" lead="That is where you stand today.">
        <div className="mx-auto flex max-w-md flex-col items-center gap-5 text-center">
          <div className="grid w-full grid-cols-3 gap-3">
            <StatTile value={correct} label="Right" tone="mint" />
            <StatTile value={`${accuracy}%`} label="Accuracy" tone={accuracy >= 70 ? "mint" : "butter"} />
            <StatTile value={bestStreak} label="Best run" tone="blush" />
          </div>
          <p className="max-w-[40ch] text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
            {attempted === 0
              ? "Nothing answered, so nothing recorded. The round is here again whenever you want it."
              : "Every one of those went into the schedule, so the cards you missed come back sooner."}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <ButtonLink href="/" variant="primary" size="lg">Back to Today</ButtonLink>
            <ButtonLink href="/practice" size="lg">Play a round</ButtonLink>
          </div>
          <AchievementToasts badges={newBadges} />
        </div>
      </Page>
    );
  }

  const pct = (secondsLeft / DURATION_S) * 100;

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-5 py-6 md:px-10 md:py-10">
      <h1 className="sr-only">Daily quest</h1>

      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold tabular-nums"
          style={{ color: secondsLeft <= 15 ? "var(--again-ink)" : "var(--ink-2)" }}>
          <Timer size={15} aria-hidden />
          {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
        </span>
        <span className="flex items-center gap-3">
          {streak >= 3 && (
            <span className="flex items-center gap-1 text-sm font-bold quest-pop"
              style={{ color: "var(--blush-ink)" }}>
              <Flame size={15} aria-hidden /> {streak}
            </span>
          )}
          <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--ink-2)" }}>
            {correct}/{attempted}
          </span>
          <ButtonLink href="/" aria-label="Leave the quest"><X size={15} aria-hidden /></ButtonLink>
        </span>
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--raised)" }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: secondsLeft <= 15 ? "var(--again-ink)" : "var(--accent)",
            transition: "width 1s linear",
          }}
        />
      </div>

      {card && (
        <div
          key={card.id}
          className="quest-card mt-6 flex min-h-[19rem] flex-col items-center justify-center gap-4 rounded-[var(--r-lg)] border p-6 text-center"
          style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}
        >
          {card.targetsWeakCase && (
            <Chip tone="hard">One of your weak spots</Chip>
          )}
          <p lang="et" className="text-3xl font-bold leading-tight md:text-4xl" style={{ color: "var(--ink)" }}>
            {card.front}
          </p>
          {card.hint && !revealed && (
            <p className="text-sm" style={{ color: "var(--ink-3)" }}>{card.hint}</p>
          )}

          {revealed ? (
            <>
              <div className="flex items-center gap-2">
                <p lang="et" className="text-2xl font-semibold" style={{ color: "var(--accent-deep)" }}>
                  {card.back}
                </p>
                <Speak text={card.back.split(" / ")[0]!.trim()} />
              </div>
              <div className="mt-2 grid w-full max-w-sm grid-cols-2 gap-2">
                <Button onClick={() => void answer(false)} disabled={busy}>
                  Missed it <kbd className="ml-1 rounded-md px-1.5 py-0.5 text-2xs font-semibold key-cap">1</kbd>
                </Button>
                <Button variant="primary" onClick={() => void answer(true)} disabled={busy}>
                  Had it <kbd className="ml-1 rounded-md px-1.5 py-0.5 text-2xs font-semibold key-cap">2</kbd>
                </Button>
              </div>
            </>
          ) : (
            <Button variant="primary" size="lg" onClick={() => setRevealed(true)}>
              Show answer <kbd className="ml-1 rounded-md px-1.5 py-0.5 text-2xs font-semibold key-cap">Space</kbd>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
