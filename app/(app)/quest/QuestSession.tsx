"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Flame, Target, Timer, X } from "lucide-react";
import { gradeCard } from "@/app/actions";
import { Button, ButtonLink } from "@/components/Button";
import { Chip, Empty, KeyCap, Page, StatTile } from "@/components/ui";
import { Speak } from "@/components/Speak";
import { useFeedbackSound } from "@/components/AudioPrefs";
import type { QuestCard } from "@/lib/progress/quest";
import { acceptedAnswers } from "@/lib/estonian/answer";
import { OPTION_CLASS, VERDICT_CLASS, optionState } from "@/lib/ux/verdict";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ADVANCE_KEY_LABEL, isAdvanceKey } from "@/lib/ux/advanceKey";
import { roundLength } from "@/lib/ux/roundClock";


export interface AimedCase {
  key: string;
  accuracy: number;
  et: string;
  question: string | null;
}

/**
 * THE DAILY QUEST.
 *
 * Two minutes by default, self-graded by comparison, on the cards behind the
 * cases this learner is worst at. It is the one round that opens by saying what
 * it is about: "your seesütlev is at 54%" is the reason to press it, and a round
 * that hid that would be another timer. How long the clock runs is the
 * learner's, resolved on the server from `lib/ux/roundClock.ts`: a fixed limit
 * is WCAG 2.2.1 failed, and somebody who reads slowly was shut out of this
 * round rather than playing a harder one.
 *
 * A PICK RATHER THAN A TYPED ANSWER, deliberately. Two minutes at a typed
 * answer is about eight cards, and the point of this round is volume across a
 * weakness rather than depth on one card; the same argument the Case Sprint
 * makes.
 *
 * WHAT IS NOT DELIBERATE IS THE LEARNER MARKING THEIR OWN PAPER, and this
 * round used to. It showed the answer and asked "Had it?" or "Missed it?", and
 * that verdict went into `Review`, which is append-only and is what
 * `caseAccuracy` reads back to decide which cases are weak. This round chooses
 * its cards *by* that reading, so the panel picking the cards was being fed by
 * the round claiming to fix them, on the learner's own say-so, and every
 * figure downstream of it — the weakest-case panel, the mastery counter, the
 * readiness rungs, the exam confidence percentage — was presented as measured.
 *
 * The volume argument never required that. Picking one of four forms of the
 * same word is a tap, exactly as "Had it" was a tap, and it is a measurement:
 * the wrong answers are `toast`, `toasse` and `toale` against `toas`, which is
 * the confusion this round exists for. A wrong pick also says which case the
 * learner reached for, which goes into `Review.reachedSlot` and which no flip
 * could ever have known (`lib/questions/caseChoices.ts`).
 *
 * A card that cannot be given options is still a flip, because there is then
 * genuinely nothing to compare, and `SELF_GRADES` is what makes that honest
 * (`lib/srs/scheduler.ts`).
 *
 * Every answer grades through `gradeCard`, so a round played for the timer
 * still moves the schedule and the log records what happened (ADR-016). An
 * abandoned round writes only the cards actually answered, which is what the
 * log should say.
 */
export function QuestSession({
  cards: initialCards, aimed, seconds,
}: { cards: QuestCard[]; aimed: AimedCase[]; seconds: number }) {
  // Snapshotted once on mount and never updated from later props: `gradeCard`
  // refreshes this route's Server Component on every call, which would hand
  // down a shrinking pool mid-round. See ReviewSession for the same reasoning.
  const [cards] = useState(initialCards);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);
  const [attempted, setAttempted] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(seconds);
  const [phase, setPhase] = useState<"ready" | "running" | "done">("ready");
  const [busy, setBusy] = useState(false);
  const shownAt = useRef(Date.now());
  const sound = useFeedbackSound();

  const card = cards.length > 0 ? cards[index % cards.length]! : null;
  const exhausted = cards.length > 0 && attempted >= cards.length;

  useEffect(() => {
    if (phase !== "running") return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const finish = useCallback(() => setPhase("done"), []);

  useEffect(() => {
    if (phase === "running" && (secondsLeft === 0 || exhausted)) finish();
  }, [phase, secondsLeft, exhausted, finish]);

  const answer = useCallback(async (got: boolean, reached?: string | null) => {
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
    /*
      The case asked and the case reached for, where the round can name both.
      `writeGrade` checks each against its own closed list rather than trusting
      them, and keeps the second only where both sides are forms, so a round
      cannot file "asked what it meant, got a case" as a confusion between two
      cases.
    */
    await gradeCard(
      card.id, got ? 3 : 1, Date.now() - shownAt.current, undefined,
      card.targetCase ?? undefined, reached ?? undefined,
    );
    setPicked(null);
    setRevealed(false);
    setIndex((i) => i + 1);
    shownAt.current = Date.now();
    setBusy(false);
  }, [card, busy, sound]);

  /*
    A pick marks itself. The option carries what it would mean, so a wrong one
    is written down as the case the learner reached for; the right one is
    whichever spelling the card accepts, which is `acceptedAnswers` and not a
    string comparison against the whole back, since a card's back can be
    `tuppa / toasse` and both are right.
  */
  const choose = useCallback((option: { text: string; slot: string | null }) => {
    if (!card || busy || picked) return;
    const right = acceptedAnswers(card.back, "et")
      .some((f) => f.toLocaleLowerCase("et") === option.text.toLocaleLowerCase("et"));
    setPicked(option.text);
    setRevealed(true);
    void answer(right, right ? null : option.slot);
  }, [card, busy, picked, answer]);

  /* Keys, because a two-minute round is one a keyboard should be able to play:
     space turns the card, then 1 and 2 answer it. Same two answers as a flip
     card in review, for the same reason. */
  useEffect(() => {
    if (phase !== "running") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      /*
        1 to 4 pick an option where there are options, which is the same key
        row the multiple-choice cards in review use. A card with none keeps the
        flip it always had: space, then 1 and 2.
      */
      const options = card?.choices;
      if (options) {
        const at = Number(e.key) - 1;
        if (Number.isInteger(at) && at >= 0 && at < options.length) {
          e.preventDefault();
          choose(options[at]!);
        }
        return;
      }
      if (isAdvanceKey(e) && !revealed) { e.preventDefault(); setRevealed(true); return; }
      if (!revealed) return;
      if (e.key === "1") { e.preventDefault(); void answer(false); }
      if (e.key === "2") { e.preventDefault(); void answer(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, revealed, answer, card, choose]);

  if (cards.length === 0) {
    return (
      <Page title="Daily quest" lead={`${roundLength(seconds)} on whatever keeps going wrong.`}>
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
      <Page title="Daily quest" lead={`${roundLength(seconds)} on whatever keeps going wrong.`}>
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
            Start the {roundLength(seconds)}
          </Button>
          <ButtonLink href="/">Not now</ButtonLink>
          {/* Where the clock is set, said on the screen somebody is standing
              on when they find the round too fast. */}
          <p className="text-xs" style={{ color: "var(--ink-3)" }}>
            Need longer?{" "}
            <Link href="/settings#round-pace" className="underline underline-offset-2">
              Give yourself more time
            </Link>
            , up to ten times this.
          </p>
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
            <ButtonLink href="/practice" size="lg">Play a round</ButtonLink>
            <ButtonLink href="/" variant="primary" size="lg">Back to Today</ButtonLink>
          </div>
        </div>
      </Page>
    );
  }

  const pct = seconds > 0 ? (secondsLeft / seconds) * 100 : 0;

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

          {card.choices ? (
            /*
              FOUR FORMS OF THE WORD, and the answer is marked rather than
              claimed. Each option keeps its place once picked, with the right
              one shown in mint and a wrong pick in peach beside it, because
              the correction is the one moment in a round worth stopping for
              and a board that cleared itself would take it away. The hues
              carry a border and the answer carries a word, since a hue is half
              a signal (docs/14-design-system.md).
            */
            <div className="mt-2 grid w-full max-w-sm gap-2">
              {card.choices.map((option, at) => {
                const chosen = picked === option.text;
                const isAnswer = revealed && acceptedAnswers(card.back, "et")
                  .some((f) => f.toLocaleLowerCase("et") === option.text.toLocaleLowerCase("et"));
                const state = revealed ? OPTION_CLASS[optionState(isAnswer, chosen)] : "";
                return (
                  <button
                    key={option.text}
                    type="button"
                    lang="et"
                    onClick={() => choose(option)}
                    disabled={busy || picked !== null}
                    className={`choice-btn ${state} flex items-center justify-between gap-2 rounded-[var(--r)] border px-4 py-3 text-left text-lg font-semibold`}
                  >
                    <span>{option.text}</span>
                    {revealed && isAnswer
                      ? <span className="text-xs font-semibold uppercase tracking-wide">Right</span>
                      : (
                        <KeyCap>{at + 1}</KeyCap>
                      )}
                  </button>
                );
              })}
            </div>
          ) : revealed ? (
            <>
              <div className="flex items-center gap-2">
                <p lang="et" className="text-2xl font-semibold" style={{ color: "var(--accent-deep)" }}>
                  {card.back}
                </p>
                <Speak text={card.back.split(" / ")[0]!.trim()} />
              </div>
              <div className="mt-2 grid w-full max-w-sm grid-cols-2 gap-2">
                {/* The two self-grades in the palette's own words, as Sprint
                    and the review card draw them. */}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void answer(false)}
                  className={`${VERDICT_CLASS.wrong} press rounded-[var(--r)] px-3 py-3 text-base font-bold transition-ui hover:-translate-y-0.5 disabled:opacity-40`}
                >
                  Missed it <KeyCap className="ml-1">1</KeyCap>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void answer(true)}
                  className={`${VERDICT_CLASS.right} press rounded-[var(--r)] px-3 py-3 text-base font-bold transition-ui hover:-translate-y-0.5 disabled:opacity-40`}
                >
                  Had it <KeyCap className="ml-1">2</KeyCap>
                </button>
              </div>
            </>
          ) : (
            <Button variant="primary" size="lg" onClick={() => setRevealed(true)}>
              Show answer <KeyCap className="ml-1">{ADVANCE_KEY_LABEL}</KeyCap>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
