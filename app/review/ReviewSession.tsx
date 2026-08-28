"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, Check, Keyboard, RotateCcw, Undo2, X, Zap } from "lucide-react";
import { checkAchievements, gradeCard, gradeCards, undoGrade } from "@/app/actions";
import { AchievementToasts } from "@/components/achievements/AchievementToasts";
import { Button, ButtonLink } from "@/components/Button";
import { EstonianInput } from "@/components/EstonianInput";
import { Chip, Empty, Meter, Page, Stat } from "@/components/ui";
import { Speak } from "@/components/Speak";
import type { Badge } from "@/lib/achievements/badges";
import { checkAnswer, countsAsRecalled, type AnswerCheck } from "@/lib/estonian/answer";
import { BLANK } from "@/lib/estonian/cloze";
import { xpForRating } from "@/lib/gamification/xp";
import { enqueueGrade, flushQueue, queueSize } from "@/lib/offline/queue";
import type { ReviewMode } from "@/lib/settings/store";
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
  /** Four options including the right one, when this card can be asked as multiple choice. */
  choices: string[] | null;
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
  CLOZE: "Fill the gap",
};

/** Cards whose front or back is Estonian and therefore worth hearing. */
const estonianSide = (type: string, side: "front" | "back") =>
  side === "front"
    ? type !== "PRODUCTION"
    : type === "PRODUCTION" || type === "CASE_FORM" || type === "GRADATION" || type === "CLOZE";

/**
 * Card types whose answer is a single Estonian form, and so can be typed and
 * checked exactly. `GOVERNMENT` is excluded on purpose: its answer is a
 * sentence-ish gloss ("partitive — aitan sind"), and marking that wrong on a
 * word order difference would be punishing the learner for the card's format.
 */
const TYPEABLE = new Set(["PRODUCTION", "CASE_FORM", "GRADATION", "CLOZE"]);

type Ask = "intro" | "type" | "choice" | "flip";

function askFor(card: ReviewCard, mode: ReviewMode): Ask {
  // A card you have never seen cannot be recalled, only met. Asking someone to
  // produce a word they have not been shown is a guessing game that teaches
  // nothing, so a new card leads with its answer.
  if (card.isNew) return "intro";
  if (mode === "type" && TYPEABLE.has(card.cardType)) return "type";
  if (card.cardType === "RECOGNITION" && card.choices && card.choices.length > 1) return "choice";
  return "flip";
}

interface Done {
  cardId: string;
  index: number;
  rating: RatingValue;
  /** The card's scheduling before the grade — everything undo needs. */
  before: ReviewCard["scheduling"];
}

export function ReviewSession({ cards: initialCards, drillCase, drillUnit, totalCards, mode }: {
  cards: ReviewCard[];
  drillCase?: string;
  drillUnit?: string;
  totalCards: number;
  mode: ReviewMode;
}) {
  // Snapshotted once on mount, and never updated from later props. gradeCard()
  // is a Server Action, and Next.js refreshes this route's Server Component
  // after every call — which would hand down a shrinking `cards` prop as
  // graded cards drop out of the due pool. Without a frozen snapshot, the
  // *last* grade of a session would see an empty prop and render "nothing
  // due" instead of the session summary — the pool the page found on the
  // very first load is the only one this session should ever know about.
  const [queue, setQueue] = useState(initialCards);
  const [wasEmptyAtStart] = useState(initialCards.length === 0);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState("");
  const [verdict, setVerdict] = useState<AnswerCheck | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [xp, setXp] = useState(0);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Done[]>([]);
  const [pendingOffline, setPendingOffline] = useState(0);
  const [newBadges, setNewBadges] = useState<Badge[]>([]);
  const shownAt = useRef(Date.now());
  const startedAt = useRef(Date.now());
  const checkedAchievements = useRef(false);

  const card = queue[index];
  const finished = !card;
  const ask = card ? askFor(card, mode) : "flip";

  // Anything queued while offline goes out as soon as there is a connection —
  // including from an earlier session that was closed before it could send.
  useEffect(() => {
    setPendingOffline(queueSize());
    const flush = async () => {
      const { remaining } = await flushQueue((batch) => gradeCards(batch));
      setPendingOffline(remaining);
    };
    void flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, []);

  useEffect(() => {
    if (!finished || wasEmptyAtStart || checkedAchievements.current) return;
    checkedAchievements.current = true;
    const accuracy = done > 0 ? Math.round((correct / done) * 100) : 0;
    void checkAchievements({ count: done, accuracy }).then((r) => {
      if (r.ok) setNewBadges(r.newBadges);
    });
  }, [finished, done, correct, wasEmptyAtStart]);

  useEffect(() => {
    shownAt.current = Date.now();
    setRevealed(false);
    setTyped("");
    setVerdict(null);
    setChosen(null);
  }, [index]);

  // Interval previews are computed after mount, never during the server render.
  // FSRS scheduling is fuzzed (deliberately — see lib/srs/scheduler.ts), so the
  // server and the browser draw different numbers for the same card and React
  // reports a hydration mismatch. The buttons simply carry no interval for the
  // first paint.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const intervals = useMemo(() => {
    if (!card || !mounted) return null;
    return previewIntervals(
      {
        ...card.scheduling,
        due: new Date(card.scheduling.due),
        lastReview: card.scheduling.lastReview ? new Date(card.scheduling.lastReview) : null,
      },
      new Date(),
    );
  }, [card, mounted]);

  const submit = useCallback(async (rating: RatingValue) => {
    if (!card || busy) return;
    setBusy(true);
    const duration = Date.now() - shownAt.current;
    const answeredAt = new Date().toISOString();

    try {
      const result = await gradeCard(card.id, rating, duration, answeredAt);
      if (!result.ok) throw new Error(result.error);
    } catch {
      // No connection, or the write failed. Keep the grade rather than losing
      // the review that was genuinely done — it is replayed on reconnect.
      enqueueGrade({ cardId: card.id, rating, durationMs: duration, reviewedAt: answeredAt });
      setPendingOffline(queueSize());
    }

    setDone((d) => d + 1);
    setXp((x) => x + xpForRating(rating));
    if (rating >= 3) setCorrect((c) => c + 1);
    setHistory((h) => [...h, { cardId: card.id, index, rating, before: card.scheduling }]);

    // "Again" means it is not learned — put it back near the end of this session.
    if (rating === 1) {
      setQueue((q) => {
        const next = [...q];
        const [failed] = next.splice(index, 1);
        if (failed) next.splice(Math.min(next.length, index + 5), 0, failed);
        return next;
      });
      setRevealed(false);
      setTyped("");
      setVerdict(null);
      setChosen(null);
      shownAt.current = Date.now();
    } else {
      setIndex((i) => i + 1);
    }
    setBusy(false);
  }, [card, busy, index]);

  /**
   * Puts the last graded card back.
   *
   * The Review row stays where it is — `Review` is append-only, and the card
   * really was answered. What is rewound is the scheduling, which is derived.
   */
  const undo = useCallback(async () => {
    const last = history[history.length - 1];
    if (!last || busy) return;
    setBusy(true);
    const result = await undoGrade(last.cardId, last.before);
    if (result.ok) {
      setHistory((h) => h.slice(0, -1));
      setDone((d) => Math.max(0, d - 1));
      setXp((x) => Math.max(0, x - xpForRating(last.rating)));
      if (last.rating >= 3) setCorrect((c) => Math.max(0, c - 1));
      setQueue((q) => {
        // The card may have been requeued by an "Again"; find it wherever it is.
        const without = q.filter((c) => c.id !== last.cardId);
        const original = queue.find((c) => c.id === last.cardId);
        if (!original) return q;
        without.splice(Math.min(last.index, without.length), 0, original);
        return without;
      });
      setIndex(last.index);
    }
    setBusy(false);
  }, [history, busy, queue]);

  const checkTyped = useCallback(() => {
    if (!card || verdict) return;
    const language = card.cardType === "RECOGNITION" ? "en" : "et";
    const result = checkAnswer(typed, card.back, language);
    setVerdict(result);
    setRevealed(true);
    if (result.verdict === "wrong" && typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(60);
    }
  }, [card, typed, verdict]);

  const pickChoice = useCallback((choice: string) => {
    if (!card || chosen) return;
    setChosen(choice);
    setRevealed(true);
    const right = choice === card.back;
    if (!right && typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(60);
    if (right) {
      // Right answers move on by themselves: multiple choice is the fast mode,
      // and a confirmation click on every correct card halves the throughput.
      window.setTimeout(() => void submit(3), 420);
    }
  }, [card, chosen, submit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (finished) return;
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

      if (e.key.toLowerCase() === "u" && !typing && history.length > 0) {
        e.preventDefault();
        void undo();
        return;
      }

      if (e.key === "Enter" || e.key === " ") {
        // While the answer box has focus it owns both keys: a space belongs in
        // the answer, and Enter is the input's own "check this". React flushes
        // discrete events synchronously, so without this the *same* Enter would
        // be seen again here after the re-render — with the verdict already
        // set — and would grade the card before it had been read.
        if (typing) return;
        e.preventDefault();
        if (ask === "type" && !verdict) { checkTyped(); return; }
        if (ask === "type" && verdict) { void submit(verdict.suggestedRating); return; }
        if (ask === "choice") return; // choices are picked, not flipped
        if (!revealed) setRevealed(true);
        else void submit(3);
        return;
      }

      if (typing) return;
      if (ask === "choice" && !chosen && card?.choices) {
        const n = Number(e.key);
        if (n >= 1 && n <= card.choices.length) {
          e.preventDefault();
          pickChoice(card.choices[n - 1]!);
        }
        return;
      }
      if (!revealed) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 4) { e.preventDefault(); void submit(n as RatingValue); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, submit, finished, ask, verdict, checkTyped, chosen, card, pickChoice, undo, history.length]);

  if (wasEmptyAtStart) {
    return (
      <Page title="Review" lead="Spaced repetition, scheduled by FSRS.">
        {drillCase ? (
          <Empty
            title={`No ${drillCase.toLowerCase()} cards yet`}
            body="Case-form cards are optional when you add a word — tick 'Case form' in the dictionary, or start a noun unit on the path, and they will show up here."
            action={<ButtonLink href="/learn" variant="primary">Open the learning path</ButtonLink>}
          />
        ) : drillUnit ? (
          <Empty
            title="Nothing from this unit in your deck"
            body="Add the unit first and its words become cards you can drill here."
            action={<ButtonLink href={`/learn/${drillUnit}`} variant="primary">Open the unit</ButtonLink>}
          />
        ) : totalCards === 0 ? (
          <Empty
            title="No cards yet"
            body="Start a unit on the path, or add words from the dictionary. Two cards are made per word — one each direction."
            action={<ButtonLink href="/learn" variant="primary">Open the learning path</ButtonLink>}
          />
        ) : (
          <Empty
            title="Nothing due — you're caught up"
            body={`All ${totalCards} cards are scheduled for later. Reviewing early doesn't help memory, so this is the app telling you to stop.`}
            action={<ButtonLink href="/practice" variant="secondary">Play a round instead</ButtonLink>}
          />
        )}
      </Page>
    );
  }

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
            : drillUnit
              ? <>Tubli töö. That&rsquo;s this unit drilled — the cards keep their normal schedule too.</>
              : <>Tubli töö. That&rsquo;s everything due right now.</>}
        </p>
        <div
          className="mt-8 grid grid-cols-2 gap-6 rounded-lg border p-6 sm:grid-cols-4"
          style={{ borderColor: "var(--rule)", background: "var(--surface)" }}
        >
          <Stat value={done} label="Reviewed" />
          <Stat value={`${accuracy}%`} label="Recalled" tone={accuracy >= 85 ? "var(--good)" : "var(--hard)"} />
          <Stat value={`+${xp}`} label="XP" tone="var(--accent)" />
          <Stat value={`${minutes}m`} label="Time" />
        </div>
        {pendingOffline > 0 && (
          <p className="mt-4 rounded-md px-4 py-2.5 text-[13.5px]" style={{ background: "var(--hard-soft)", color: "var(--hard)" }}>
            {pendingOffline} grade{pendingOffline === 1 ? "" : "s"} saved on this device while offline.
            They will be sent the moment you are back online — you can close the tab.
          </p>
        )}
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/" variant="primary">Back to Today</ButtonLink>
          <ButtonLink href="/practice"><Zap size={15} aria-hidden /> Play a round</ButtonLink>
          <ButtonLink href="/learn">Add new words</ButtonLink>
        </div>
        <AchievementToasts badges={newBadges} />
      </div>
    );
  }

  const remaining = queue.length - index;
  const progress = queue.length ? (index / queue.length) * 100 : 0;
  const frontLang = estonianSide(card.cardType, "front") ? "et" : "en";
  const backLang = estonianSide(card.cardType, "back") ? "et" : "en";

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-5 py-6 md:px-10 md:py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link href="/" aria-label="End session" className="rounded p-1" style={{ color: "var(--ink-3)" }}>
          <X size={19} aria-hidden />
        </Link>
        <div className="flex-1">
          <Meter pct={progress} label={`Session progress: ${index} of ${queue.length}`} height={4} />
        </div>
        <span className="tnum text-[13px]" style={{ color: "var(--ink-3)" }}>{remaining} left</span>
      </div>

      <div
        className="flex flex-col rounded-xl border"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow)" }}
      >
        <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3" style={{ borderColor: "var(--rule-soft)" }}>
          <Chip tone="accent">{TYPE_LABEL[card.cardType] ?? card.cardType}</Chip>
          {card.isNew && <Chip tone="good">New word</Chip>}
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
          className="flex min-h-[260px] flex-col items-center justify-center gap-4 px-6 py-10 text-center md:min-h-[300px]"
          aria-live="polite"
        >
          <div className="flex items-center gap-2">
            <p
              lang={frontLang}
              className={
                card.cardType === "CLOZE"
                  ? "est text-[23px] font-medium leading-snug md:text-[27px]"
                  : "est text-[32px] font-semibold leading-tight md:text-[38px]"
              }
              style={{ color: "var(--ink)" }}
            >
              {card.front}
            </p>
            {/* No audio on a gap-fill prompt: reading a sentence with a hole in
                it aloud is not a thing, and the reveal below plays the whole
                sentence once the answer is in. */}
            {estonianSide(card.cardType, "front") && card.cardType !== "CLOZE" && (
              <Speak text={card.lemma ?? card.front} />
            )}
          </div>

          {card.hint && !revealed && ask !== "intro" && (
            <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{card.hint}</p>
          )}

          {ask === "type" && !verdict && (
            <div className="mt-2 w-full max-w-sm text-left">
              <label htmlFor="answer" className="label-xs mb-2 block" style={{ color: "var(--ink-3)" }}>
                Type the answer
              </label>
              <EstonianInput
                id="answer"
                value={typed}
                onChange={setTyped}
                onEnter={checkTyped}
                ariaLabel="Type your answer"
                autoFocus
                large
              />
            </div>
          )}

          {ask === "type" && verdict && (
            <div className="w-full max-w-sm">
              <p
                className="rounded-md px-4 py-2.5 text-[14px]"
                style={{
                  background: verdict.verdict === "correct" ? "var(--good-soft)"
                    : verdict.verdict === "wrong" ? "var(--again-soft)" : "var(--hard-soft)",
                  color: verdict.verdict === "correct" ? "var(--good)"
                    : verdict.verdict === "wrong" ? "var(--again)" : "var(--hard)",
                }}
              >
                {verdict.verdict === "correct" ? "Õige!" : verdict.note}
              </p>
              {typed.trim() && verdict.verdict !== "correct" && (
                <p className="mt-2 text-[13px]" style={{ color: "var(--ink-3)" }}>
                  You typed <span lang={backLang} className="est">{typed.trim()}</span>
                </p>
              )}
            </div>
          )}

          {ask === "choice" && card.choices && !chosen && (
            <div className="mt-2 grid w-full max-w-md gap-2">
              {card.choices.map((choice, i) => (
                <button
                  key={choice}
                  type="button"
                  onClick={() => pickChoice(choice)}
                  className="flex items-center gap-3 rounded-md border px-4 py-3 text-left text-[15px] transition-opacity hover:opacity-80"
                  style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
                >
                  <span className="tnum text-[11px]" style={{ color: "var(--ink-3)" }}>{i + 1}</span>
                  {choice}
                </button>
              ))}
            </div>
          )}

          {ask === "choice" && chosen && (
            <div className="mt-2 grid w-full max-w-md gap-2">
              {card.choices?.map((choice) => {
                const isAnswer = choice === card.back;
                const picked = choice === chosen;
                return (
                  <div
                    key={choice}
                    className="rounded-md border px-4 py-3 text-left text-[15px]"
                    style={{
                      borderColor: isAnswer ? "var(--good)" : picked ? "var(--again)" : "var(--rule)",
                      background: isAnswer ? "var(--good-soft)" : picked ? "var(--again-soft)" : "var(--surface)",
                      color: isAnswer ? "var(--good)" : picked ? "var(--again)" : "var(--ink-3)",
                    }}
                  >
                    {choice}
                  </div>
                );
              })}
            </div>
          )}

          {(revealed || ask === "intro") && ask !== "choice" && (
            <>
              <div className="my-1 h-px w-16" style={{ background: "var(--rule)" }} />
              {card.cardType === "CLOZE" ? (
                /* A gap-fill is answered by a word but *learned* as a sentence,
                   so the reveal puts the word back where it came from and reads
                   the whole thing aloud. */
                <div className="flex flex-col items-center gap-2">
                  <p lang="et" className="est text-[24px] leading-snug md:text-[27px]" style={{ color: "var(--ink)" }}>
                    {card.front.split(BLANK)[0]}
                    <span style={{ color: "var(--accent)", fontWeight: 600 }}>{card.back}</span>
                    {card.front.split(BLANK)[1]}
                  </p>
                  <Speak text={card.front.replace(BLANK, card.back)} label="Hear the whole sentence" />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p
                    lang={backLang}
                    className="est text-[28px] font-semibold md:text-[32px]"
                    style={{ color: "var(--accent)" }}
                  >
                    {card.back}
                  </p>
                  {estonianSide(card.cardType, "back") && <Speak text={card.back} />}
                </div>
              )}
              {card.hint && <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>{card.hint}</p>}
            </>
          )}

          {ask === "intro" && (
            <p className="max-w-[40ch] text-[13px]" style={{ color: "var(--ink-3)" }}>
              First time seeing this one — read it, say it, then tell the scheduler how well it stuck.
            </p>
          )}
        </div>

        <div className="border-t p-4" style={{ borderColor: "var(--rule-soft)" }}>
          {ask === "type" && !verdict ? (
            <Button variant="primary" className="w-full py-3" onClick={checkTyped}>
              Check <kbd className="ml-1 opacity-70">Enter</kbd>
            </Button>
          ) : ask === "choice" && !chosen ? (
            <p className="text-center text-[12.5px]" style={{ color: "var(--ink-3)" }}>
              Pick the meaning · keys 1–{card.choices?.length ?? 4}
            </p>
          ) : ask === "choice" && chosen === card.back ? (
            <p className="text-center text-[13px]" style={{ color: "var(--good)" }}>Õige!</p>
          ) : !revealed && ask !== "intro" ? (
            <Button variant="primary" className="w-full py-3" onClick={() => setRevealed(true)}>
              Show answer <kbd className="ml-1 opacity-70">Space</kbd>
            </Button>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {RATINGS.map((r) => {
                const suggested = verdict?.suggestedRating === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    disabled={busy}
                    onClick={() => void submit(r.value as RatingValue)}
                    aria-label={intervals ? `${r.label} — next in ${intervals[r.value as RatingValue]}` : r.label}
                    className="flex flex-col items-center gap-0.5 rounded-md border px-2 py-2.5 transition-opacity hover:opacity-80 disabled:opacity-40"
                    style={{
                      borderColor: suggested ? TONE[r.value]! : "transparent",
                      background: TONE_SOFT[r.value],
                      color: TONE[r.value],
                    }}
                  >
                    <span className="text-[14px] font-semibold">{r.label}</span>
                    <span className="tnum text-[11px] opacity-80">{intervals?.[r.value as RatingValue]}</span>
                    <kbd className="text-[10px] opacity-60">{r.key}</kbd>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
        <span className="flex items-center gap-1"><Check size={12} aria-hidden /> {correct} recalled</span>
        <span className="flex items-center gap-1"><RotateCcw size={12} aria-hidden /> {done} graded</span>
        <span className="flex items-center gap-1"><Zap size={12} aria-hidden /> +{xp} XP</span>
        <button
          type="button"
          onClick={() => void undo()}
          disabled={history.length === 0 || busy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 disabled:opacity-40"
          style={{ color: "var(--ink-3)" }}
        >
          <Undo2 size={12} aria-hidden /> Undo <kbd className="opacity-60">u</kbd>
        </button>
        <span className="hidden items-center gap-1 md:flex">
          <Keyboard size={12} aria-hidden />
          {ask === "type" ? "Enter to check · 1–4 to grade" : "Space to flip · 1–4 to grade"}
        </span>
      </div>

      {pendingOffline > 0 && (
        <p className="mt-3 text-center text-[12px]" style={{ color: "var(--hard)" }}>
          Offline — {pendingOffline} grade{pendingOffline === 1 ? "" : "s"} saved here and sent when you reconnect.
        </p>
      )}
      {verdict && countsAsRecalled(verdict.verdict) && verdict.verdict !== "correct" && (
        <p className="sr-only" role="status">Close: {verdict.note}</p>
      )}
    </div>
  );
}
