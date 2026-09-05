"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { BookOpen, Check, Sparkles, X } from "lucide-react";
import { gradeCard } from "@/app/actions";
import { Button, ButtonLink } from "@/components/Button";
import { EstonianInput } from "@/components/EstonianInput";
import { Chip, Empty, Meter, Page, StatTile } from "@/components/ui";
import { Mascot } from "@/components/brand";
import { Speak } from "@/components/Speak";
import { StarWord } from "@/components/StarWord";
import { SuggestFix } from "@/components/SuggestFix";
import { WordIntro } from "@/components/WordIntro";
import { useAudioPrefs, useFeedbackSound } from "@/components/AudioPrefs";
import { useOffline } from "@/components/OfflineProvider";
import { prefetchClip } from "@/lib/audio/clip";
import { checkAnswer, countsAsRecalled, type AnswerCheck } from "@/lib/estonian/answer";
import { BLANK } from "@/lib/estonian/cloze";
import { splitOnForm } from "@/lib/dict/examples";
import { sameSpelling } from "@/lib/copy/values";
import { enqueueGrade } from "@/lib/offline/db";
import { LEARN_BATCH, ratingFor, rungOf, tally, type Outcome, type Rung } from "@/lib/learn/ladder";
import type { LearnScheduling, LearnWord } from "@/lib/progress/learn";
import { grade, type RatingValue } from "@/lib/srs/scheduler";
import { requeue } from "@/lib/srs/queue";
import { OPTION_CLASS, VERDICT_CLASS, VERDICT_PAUSE_MS, optionState } from "@/lib/ux/verdict";

/**
 * THE LEARN LADDER, DRIVEN.
 *
 * Five words, three rungs each, in one loop. `lib/learn/ladder.ts` says what a
 * rung is and `lib/progress/learn.ts` reads the batch; this asks the questions
 * and sends the grades.
 *
 * WHY A LAP RATHER THAN A LIST. The queue is the batch, and a word that has
 * been answered goes back to the end of it rather than on to its next rung
 * immediately. So a learner meets five words, meets four others in between,
 * and is asked the first one back at the point where they have to retrieve it
 * rather than read it off the screen above. `requeue` is the same helper the
 * review session uses for a missed card and for a first meeting, and the gap
 * it asks for is the batch size, so one lap is one round.
 *
 * EVERY GRADE IS AN ANSWER. Meeting a word writes nothing, exactly as the
 * review screen decided: the card comes back a lap later and *that* retrieval
 * is what the scheduler hears about. Karpicke and Roediger measured the
 * difference at about 80 percent recalled a week later against 35 for learners
 * who only restudied, and the whole of it was whether retrieval happened while
 * the word was being learned.
 *
 * ONE CARD PER WORD, GRADED AT EVERY RUNG. The word's recognition card is what
 * a rung reads and what a rung writes, because each rung asks the same
 * question at a greater depth: what does this word mean, then produce it in a
 * sentence. The word's other cards are Practice's, which is what "moves to
 * practice" means on the screen at the end.
 */

/** How the current word is being asked, once its rung is known. */
type Phase = "ask" | "feedback";

/** What a word did on the rung it was just asked at. */
interface Result {
  outcome: Outcome;
  /** The answer, for a screen that has to show what was right. */
  expected: string;
  note: string;
}

const RUNG_LABEL: Record<Rung, string> = {
  meet: "New word",
  choice: "What does it mean?",
  gap: "Put it in the sentence",
  kept: "Off to practice",
};

/** How far up the ladder a word is, drawn as three steps. */
function Ladder({ rung }: { rung: Rung }) {
  const filled = rung === "meet" ? 1 : rung === "choice" ? 2 : 3;
  return (
    <span className="inline-flex items-center gap-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-4 rounded-full"
          style={{ background: i < filled ? "var(--accent)" : "var(--raised)" }}
        />
      ))}
    </span>
  );
}

export function LearnSession({
  words: initial, waiting, started,
}: {
  words: LearnWord[];
  /** Words in the deck that have never been asked, this batch included. */
  waiting: number;
  /** Words part way up the ladder, this batch included. */
  started: number;
}) {
  /*
    Snapshotted once. `gradeCard` is a Server Action and Next refreshes this
    route's server component after every one, which would hand down a batch
    that shrinks as words graduate: the last answer of a session would see an
    empty prop and render the empty state instead of the summary.
  */
  const [words] = useState(initial);
  const [queue, setQueue] = useState<string[]>(() => initial.map((w) => w.cardId));
  const [rungs, setRungs] = useState<Record<string, Rung>>(
    () => Object.fromEntries(initial.map((w) => [w.cardId, w.rung])),
  );
  /*
    THE QUESTION ON SCREEN, WHICH IS NOT THE SAME AS WHERE THE WORD NOW STANDS.

    `rungs` is the ladder and it moves the instant a grade lands. The screen
    cannot: a wrong answer at the gap drops the word to the choice rung, and if
    the render read the ladder directly, the correction would be replaced by the
    next question in the same frame. Driven in a browser, that is exactly what
    happened, and the one moment worth stopping for went past without being
    drawn at all.

    So the seat holds the card and the rung it is being asked at, and only
    `advance` changes it. Null is the end of the round.
  */
  const [seat, setSeat] = useState<{ cardId: string; rung: Rung } | null>(
    () => (initial[0] ? { cardId: initial[0].cardId, rung: initial[0].rung } : null),
  );
  const [phase, setPhase] = useState<Phase>("ask");
  const [result, setResult] = useState<Result | null>(null);
  const [typed, setTyped] = useState("");
  const [verdict, setVerdict] = useState<AnswerCheck | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  /*
    A miss at the gap is typed again before the round moves on, for the reason
    the review session gives: reading the right form is not producing it. The
    grade already went; this is rehearsal.
  */
  const [retyped, setRetyped] = useState("");
  const [retypeOk, setRetypeOk] = useState(false);
  const [retypeNote, setRetypeNote] = useState<string | null>(null);
  const [answered, setAnswered] = useState(0);
  const [right, setRight] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pendingOffline, setPendingOffline] = useState(0);
  const { pending: outboxPending, refresh: refreshOutbox } = useOffline();
  const { voice } = useAudioPrefs();
  const sound = useFeedbackSound();

  /*
    What the server last wrote for a card, because a word can be graded more
    than once in a session and the rung after the second grade is computed from
    the state the first one left behind. The prop is a mount-time snapshot and
    is deliberately never refreshed.
  */
  const scheduled = useRef(new Map<string, LearnScheduling>());
  /*
    A right answer stays on the screen for `VERDICT_PAUSE_MS` and then moves
    on by itself. The timer is held so that Enter or the button during the
    pause moves on once rather than twice.
  */
  const autoNext = useRef<number | null>(null);
  const shownAt = useRef(Date.now());
  const startedAt = useRef(Date.now());
  const run = useRef(0);

  const byId = useMemo(
    () => new Map(words.map((w) => [w.cardId, w])),
    [words],
  );
  const cardId = seat?.cardId;
  const word = cardId ? byId.get(cardId) : undefined;
  /*
    AND A WORD SPELLED THE SAME IN BOTH LANGUAGES IS NOT ASKED WHAT IT MEANS.

    Thirty entries in the shipped dictionary have an English gloss that is the
    very same string, twelve of them taught by the course: `film`, `park`,
    `sport`, `minister`, `risk`. Asking which of four meanings `film` has puts
    the answer at the top of the screen, and a question nobody can get wrong is
    worse than no question: the scheduler reads the pass as a recall and
    stretches the interval on a memory nothing tested.

    So such a word goes straight to the gap, which is a real question about it,
    and takes both its grades there. Exact rather than case-insensitive, which
    is the rule `sameSpelling` already carries: `august` is `August`, and the
    capital letter is the lesson.
  */
  const free = word !== undefined && word.gap !== null && sameSpelling(word.lemma, word.gloss);
  const rung: Rung = seat?.rung === "choice" && free ? "gap" : seat?.rung ?? "meet";
  const finished = !word;
  const total = words.length;
  const left = queue.length;

  useEffect(() => { setPendingOffline(outboxPending); }, [outboxPending]);

  /*
    The next word is fetched while this one is being answered, so its speaker
    button and its autoplay are instant rather than a round trip to a speech
    service on every screen.
  */
  useEffect(() => {
    const nextId = queue[1];
    const upcoming = nextId ? byId.get(nextId) : undefined;
    if (upcoming) prefetchClip({ text: upcoming.lemma, voice });
  }, [queue, byId, voice]);

  const cheer = useCallback((won: boolean) => {
    run.current = won ? run.current + 1 : 0;
    sound(won ? "right" : "wrong", run.current);
  }, [sound]);

  /**
   * Takes the seat, and puts the word that was in it back on the ladder.
   *
   * A word that has been kept leaves the round. Everything else goes to the
   * back of the queue rather than on to its next rung immediately: `requeue`
   * with the batch size is a full lap, so every other word is asked before
   * this one comes round again, which is the whole of what makes the second
   * sighting a retrieval rather than a re-read.
   */
  const advance = useCallback((updated: Record<string, Rung>) => {
    if (autoNext.current !== null) { window.clearTimeout(autoNext.current); autoNext.current = null; }
    const rest = [...queue];
    const [head] = rest.splice(0, 1);
    const next = head && updated[head] !== "kept" ? requeue(rest, head, 0, LEARN_BATCH) : rest;
    const nowId = next[0];

    setRungs(updated);
    setQueue(next);
    setSeat(nowId ? { cardId: nowId, rung: updated[nowId] ?? "meet" } : null);
    setPhase("ask");
    setResult(null);
    setTyped("");
    setVerdict(null);
    setChosen(null);
    setRetyped("");
    setRetypeOk(false);
    setRetypeNote(null);
    shownAt.current = Date.now();
  }, [queue]);

  /**
   * Grades the word's recognition card and works out where that leaves it.
   *
   * The rung is read back off the scheduling the server returns rather than
   * assumed here, so the ladder and the scheduler cannot disagree about
   * whether a word graduated. With no connection the grade goes to the outbox
   * exactly as a review does, and the same scheduler runs locally to keep the
   * session moving: `state` and `learningSteps` are not fuzzed, so the replay
   * lands on the rung this screen already showed.
   */
  const send = useCallback(async (outcome: Outcome, shown: Result) => {
    if (!word || busy) return;
    setBusy(true);
    const rating = ratingFor(outcome) as RatingValue;
    const durationMs = Date.now() - shownAt.current;
    const answeredAt = new Date().toISOString();
    const before = scheduled.current.get(word.cardId) ?? word.scheduling;

    /*
      The flag comes back off whatever happens, for the reason the review
      session gives at length: every control here is disabled while a grade is
      in flight, and the offline branch below awaits a write to IndexedDB that
      a browser can refuse. An exception leaving this function would leave the
      round on screen with nothing that can be pressed.
    */
    let after: LearnScheduling;
    try {
    try {
      const res = await gradeCard(word.cardId, rating, durationMs, answeredAt);
      if (!res.ok) throw new Error(res.error);
      after = res.scheduling;
    } catch {
      await enqueueGrade({
        id: crypto.randomUUID(),
        cardId: word.cardId,
        rating,
        durationMs,
        reviewedAt: Date.parse(answeredAt),
      });
      refreshOutbox();
      const local = grade(
        {
          ...before,
          due: new Date(before.due),
          lastReview: before.lastReview ? new Date(before.lastReview) : null,
        },
        rating,
      );
      after = {
        ...before,
        due: local.due.toISOString(),
        stability: local.stability,
        difficulty: local.difficulty,
        elapsedDays: local.elapsedDays,
        scheduledDays: local.scheduledDays,
        reps: local.reps,
        lapses: local.lapses,
        state: local.state,
        lastReview: local.lastReview?.toISOString() ?? null,
        learningSteps: local.learningSteps,
      };
    }

    scheduled.current.set(word.cardId, after);
    const moved = { ...rungs, [word.cardId]: rungOf(after.state, after.learningSteps) };
    setAnswered((n) => n + 1);
    if (rating >= 3) setRight((n) => n + 1);

    // A claim moves on at once. A clean hit shows itself first, green, for
    // long enough to be seen, then moves on by itself. A miss keeps its
    // screen, because the correction is the one moment in a round worth
    // stopping for, and at the gap it waits to be typed again.
    if (outcome === "known") advance(moved);
    else {
      setRungs(moved); setResult(shown); setPhase("feedback");
      if (outcome === "right") {
        autoNext.current = window.setTimeout(() => { autoNext.current = null; advance(moved); }, VERDICT_PAUSE_MS);
      }
    }
    } finally {
      setBusy(false);
    }
  }, [word, busy, rungs, advance, refreshOutbox]);

  /** The meeting writes nothing. The word comes back a lap later as a question. */
  const met = useCallback(() => {
    if (!word || busy) return;
    advance({ ...rungs, [word.cardId]: "choice" });
  }, [word, busy, rungs, advance]);

  const pick = useCallback((option: string) => {
    if (!word || busy || phase === "feedback") return;
    setChosen(option);
    const won = option === word.gloss;
    cheer(won);
    void send(won ? "right" : "wrong", {
      outcome: won ? "right" : "wrong",
      expected: word.gloss,
      note: won ? "" : `You chose ${option}.`,
    });
  }, [word, busy, phase, cheer, send]);

  const answerGap = useCallback(() => {
    if (!word || busy || phase === "feedback") return;
    const expected = word.gap ? word.gap.answer : word.lemma;
    const check = checkAnswer(typed, expected, "et");
    setVerdict(check);
    const won = check.verdict === "correct";
    cheer(countsAsRecalled(check.verdict));
    void send(
      won ? "right" : countsAsRecalled(check.verdict) ? "near" : "wrong",
      { outcome: won ? "right" : "wrong", expected: check.expected, note: check.note },
    );
  }, [word, busy, phase, typed, cheer, send]);

  /** Whether the gap is waiting for the miss to be typed again. */
  const needsRetype = phase === "feedback" && rung === "gap" && result?.outcome === "wrong" && !retypeOk;

  const carryOn = useCallback(() => {
    if (!word || needsRetype) return;
    advance(rungs);
  }, [word, rungs, advance, needsRetype]);

  const checkRetype = useCallback(() => {
    if (!word || !result || retypeOk) return;
    const again = checkAnswer(retyped, result.expected, "et");
    if (again.verdict === "correct") {
      setRetypeOk(true);
      setRetypeNote(null);
      autoNext.current = window.setTimeout(() => { autoNext.current = null; advance(rungs); }, VERDICT_PAUSE_MS);
    } else {
      setRetypeNote("Not yet. Copy the word above exactly, letter for letter.");
    }
  }, [word, result, retyped, retypeOk, advance, rungs]);

  /*
    The digits pick an option, exactly as they do in review, and Enter carries
    on from a correction. One handler rather than one per rung: a shortcut that
    knows about only some of the screens it is mounted on is the fault this app
    has already fixed once, on the first meeting.
  */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (phase === "feedback") {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); carryOn(); }
        return;
      }
      if (rung === "meet" && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); met(); }
      if (rung === "choice" && word?.choices) {
        const at = Number(e.key) - 1;
        const option = word.choices[at];
        if (option) { e.preventDefault(); pick(option); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, rung, word, met, pick, carryOn]);

  if (total === 0) {
    return (
      <Page title="Learn">
        <Empty
          title="No new words waiting"
          body="Add a unit from the course and its words arrive here."
          action={<ButtonLink href="/learn" variant="primary">Open the course</ButtonLink>}
        />
      </Page>
    );
  }

  if (finished) {
    const counts = tally(words.map((w) => rungs[w.cardId] ?? "meet"));
    const more = Math.max(0, waiting + started - total);
    const minutes = Math.max(1, Math.round((Date.now() - startedAt.current) / 60000));
    return (
      <div className="mx-auto max-w-2xl px-5 py-16 md:px-10">
        <div className="pop-in text-center">
          <Mascot size={72} mood="cheer" className="float mx-auto" />
          <h1 className="mt-5 text-3xl font-bold tracking-tight" style={{ color: "var(--ink)" }}>
            Round done
          </h1>
          <p className="mx-auto mt-2 max-w-[46ch] text-base" style={{ color: "var(--ink-2)" }}>
            {counts.kept > 0
              ? <>Tubli töö. {counts.kept} {counts.kept === 1 ? "word has" : "words have"} moved over to practice, where they come back on a schedule.</>
              : <>Tubli töö. These stay here until you can produce them in a sentence, which is the point at which they stick.</>}
          </p>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile value={counts.kept} label="To practice" tone="mint" />
          <StatTile value={counts.staying} label="Still learning" tone="butter" />
          <StatTile value={`${minutes}m`} label="Time" tone="sky" />
        </div>

        <ul className="mt-6 flex flex-col gap-2">
          {words.map((w) => {
            const where = rungs[w.cardId] ?? "meet";
            return (
              <li
                key={w.cardId}
                className="flex flex-wrap items-center gap-3 rounded-[var(--r)] border px-4 py-3"
                style={{ borderColor: "var(--rule)", background: "var(--surface)" }}
              >
                <span lang="et" className="font-semibold" style={{ color: "var(--ink)" }}>{w.lemma}</span>
                <span className="text-sm" style={{ color: "var(--ink-3)" }}>{w.gloss}</span>
                <span className="ml-auto flex items-center gap-2">
                  <Ladder rung={where} />
                  <Chip tone={where === "kept" ? "good" : "neutral"}>
                    {where === "kept" ? "Practice" : RUNG_LABEL[where]}
                  </Chip>
                </span>
              </li>
            );
          })}
        </ul>

        {pendingOffline > 0 && (
          <p
            className="mt-4 rounded-[var(--r)] px-4 py-3 text-sm"
            style={{ background: "var(--hard-soft)", color: "var(--hard-ink)" }}
          >
            {pendingOffline} answer{pendingOffline === 1 ? "" : "s"} saved here while you were offline.
            They&rsquo;ll be sent the moment you&rsquo;re back online. You can close the tab.
          </p>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {more > 0 && (
            <ButtonLink href="/learn/new" variant="primary" size="lg">
              <Sparkles size={15} aria-hidden /> Learn {Math.min(more, LEARN_BATCH)} more
            </ButtonLink>
          )}
          <ButtonLink href="/review" size="lg">Practice what is due</ButtonLink>
          <ButtonLink href="/" size="lg">Back to Today</ButtonLink>
        </div>
      </div>
    );
  }

  const progress = total > 0 ? ((total - left) / total) * 100 : 0;

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-5 py-6 md:px-10 md:py-10">
      {/* The heading a session screen has no room to draw. */}
      <h1 className="sr-only">Learn</h1>
      <div className="mb-7 flex items-center gap-4">
        <Link
          href="/learn"
          aria-label="End session"
          className="press flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-[var(--raised)]"
          style={{ color: "var(--ink-3)" }}
        >
          <X size={18} aria-hidden />
        </Link>
        <div className="flex-1">
          <Meter pct={progress} label={`${left} of ${total} words still on the ladder`} height={10} />
        </div>
        <span
          className="tnum label-xs rounded-full px-2.5 py-1"
          style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
        >
          {left} left
        </span>
      </div>

      <div
        className="flex flex-col overflow-hidden rounded-[var(--r-xl)] border"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow-lg)" }}
      >
        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3.5" style={{ borderColor: "var(--rule-soft)" }}>
          <Chip tone="accent">{RUNG_LABEL[rung]}</Chip>
          <Ladder rung={rung} />
          <div className="ml-auto flex items-center gap-1">
            <Link
              href={`/dictionary?q=${encodeURIComponent(word.lemma)}`}
              className="flex items-center gap-1.5 text-xs font-semibold transition-opacity hover:opacity-60"
              style={{ color: "var(--ink-3)" }}
            >
              <BookOpen size={13} aria-hidden /> Full entry
            </Link>
            {/* The corner of the card, which is where somebody looks for this
                the moment a word turns out to be worth keeping. */}
            <StarWord lexemeId={word.lexemeId} starred={word.starred} label={word.lemma} />
          </div>
        </div>

        <div className="flex min-h-[16rem] flex-col items-center justify-center gap-3 px-5 py-8 text-center">
          {rung === "meet" && (
            /* Keyed on the card. The intro holds an open word panel and the
               sentence's English, and a learner reported the last word's
               sentence still standing under the next word: a fresh subtree
               per word is what makes that impossible. */
            <WordIntro
              key={word.cardId}
              lemma={word.lemma}
              gloss={word.gloss}
              equivalent={word.equivalent}
              sentence={word.sentence}
              tokens={word.tokens}
              lexemeId={word.lexemeId}
              canTranslate={word.canTranslate}
              isPhrase={word.isPhrase}
            />
          )}

          {rung === "choice" && (
            <>
              <div className="flex items-center gap-2">
                <p lang="et" className="text-3xl font-bold tracking-tight md:text-4xl" style={{ color: "var(--ink)" }}>
                  {word.lemma}
                </p>
                <Speak text={word.lemma} />
              </div>
              {word.choices ? (
                <div className="mt-2 grid w-full max-w-md gap-2">
                  {word.choices.map((option, i) => {
                    const isAnswer = option === word.gloss;
                    const marked = phase === "feedback";
                    /* The option the learner pressed is marked as well as the
                       answer. It used to look exactly like the two nobody
                       chose, on a screen only ever reached by pressing the
                       wrong one. */
                    const state = marked ? optionState(isAnswer, option === chosen) : null;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => pick(option)}
                        disabled={busy || marked}
                        className={`choice-btn ${state ? OPTION_CLASS[state] : ""} flex items-center gap-3 rounded-[var(--r)] border px-4 py-3.5 text-left text-base`}
                      >
                        <span className="label-xs shrink-0 rounded-full px-2 py-0.5" style={{ background: "var(--raised)", color: "var(--ink-3)" }}>
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1">{option}</span>
                        {state === "right" && <Check size={16} aria-label="Right" />}
                        {state === "wrong" && <X size={16} aria-label="Your pick" />}
                      </button>
                    );
                  })}
                </div>
              ) : (
                /* No four options the dictionary could rank honestly, so the
                   word is asked the way the gap rung asks it. `pickOptions`
                   returns nothing rather than padding a question out with a
                   second right answer. */
                <p className="text-sm" style={{ color: "var(--ink-2)" }}>{word.gloss}</p>
              )}
            </>
          )}

          {rung === "gap" && (
            <>
              {word.gap ? (
                /*
                  THE WORD FIRST, THEN WHAT TO DO WITH IT, THEN THE SENTENCE.

                  This read the other way round: a sentence with a hole in it,
                  its translation, the word, and the question, four blocks of
                  the same weight in four different colors. A learner reported
                  that they could not tell at a glance what was being asked,
                  which is exactly what that order produces. You read the
                  sentence, work out that something is missing, read on to find
                  out which word, and then go back.

                  So it is put the way somebody would say it out loud: here is
                  the word, put it in this sentence. The word leads because it
                  is the one thing on the screen that does not change what it
                  is asking; the instruction is one line under it; and the
                  sentence is the thing to look at while typing, so it sits
                  closest to the box.

                  The gap itself is what the eye should land on inside the
                  sentence, so it keeps the accent and everything else in the
                  line is the ordinary ink. `max-w-md` on both blocks and the
                  spacing carried by one wrapper rather than by whatever margin
                  each element happened to have.
                */
                <div className="flex w-full max-w-md flex-col items-center gap-5">
                  {/*
                    AND NO FALLBACK TO THE LEMMA HERE, WHICH IS THE ONE WAY
                    THIS REORDERING COULD HAVE GONE WRONG. `hint` is already a
                    ladder: the lemma and the meaning, then the meaning alone,
                    then nothing, because wherever the gap wants the dictionary
                    form the lemma is the answer printed a line above the box.
                    Thirteen cards in the shipped dictionary end up with no
                    hint at all, and "which word goes in this gap" is still a
                    question worth asking, so those lead with the instruction
                    and nothing else. Writing `hint ?? lemma` to fill the space
                    would put the answer back on the screen for exactly those
                    cards.
                  */}
                  <div>
                    {word.gap.hint ? (
                      <>
                        <p className="label-xs" style={{ color: "var(--ink-3)" }}>The word</p>
                        <p className="mt-1 text-2xl font-bold leading-tight" style={{ color: "var(--accent-deep)" }}>
                          {word.gap.hint}
                        </p>
                        <p className="mt-2 text-sm" style={{ color: "var(--ink-2)" }}>
                          Put it in the sentence, in the form it needs.
                        </p>
                      </>
                    ) : (
                      <p className="text-base font-semibold" style={{ color: "var(--ink)" }}>
                        Which word goes in the gap?
                      </p>
                    )}
                  </div>

                  <div>
                    <p lang="et" className="text-xl font-semibold leading-snug" style={{ color: "var(--ink)" }}>
                      {word.gap.text.split(BLANK).map((part, i, all) => (
                        <span key={i}>
                          {part}
                          {i < all.length - 1 && (
                            <span
                              className="mx-1 inline-block rounded px-3 align-baseline"
                              style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
                            >
                              ?
                            </span>
                          )}
                        </span>
                      ))}
                    </p>
                    {word.gap.en && (
                      <p className="mt-1.5 text-sm" style={{ color: "var(--ink-3)" }}>{word.gap.en}</p>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-2xl font-semibold" style={{ color: "var(--ink)" }}>{word.gloss}</p>
                  <p className="text-xs" style={{ color: "var(--ink-3)" }}>Write it in Estonian.</p>
                </>
              )}
              <div className="w-full max-w-sm text-left">
                <EstonianInput
                  value={typed}
                  onChange={setTyped}
                  onEnter={answerGap}
                  autoFocus
                  ariaLabel={word.gap ? "The word that goes in the gap" : "The Estonian word"}
                  placeholder="Type in Estonian"
                  large
                />
              </div>
              {/*
                Not disabled on an empty box, which is the review screen's own
                answer and is the way out of a word you cannot produce: an empty
                answer is marked "nothing typed", the correction is shown, and
                the word drops to the rung below rather than holding the round
                up. A learner stuck on one word with nothing to press would have
                only the cross in the corner.
              */}
              {phase === "ask" && (
                <Button variant="primary" onClick={answerGap} disabled={busy}>
                  Check
                  <kbd className="ml-1 rounded-md px-1.5 py-0.5 text-2xs font-semibold key-cap">
                    Enter
                  </kbd>
                </Button>
              )}
            </>
          )}

          {phase === "feedback" && result && (
            <div
              className={`${result.outcome === "right" ? "pop-in" : ""} ${VERDICT_CLASS[result.outcome === "right" ? "right" : verdict && countsAsRecalled(verdict.verdict) ? "nearly" : "wrong"]} mt-2 w-full max-w-md rounded-[var(--r)] px-4 py-3.5 text-left`}
            >
              <p className="text-sm font-semibold">
                {result.outcome === "right"
                  ? "Õige!"
                  : rung === "gap" ? <>The word is <span lang="et" data-answer>{result.expected}</span></> : result.expected}
              </p>
              {result.note && <p className="mt-1 text-sm">{result.note}</p>}
              {rung === "gap" && word.gap && (
                <p lang="et" className="mt-2 text-sm" style={{ color: "var(--ink-2)" }}>
                  {splitOnForm(word.gap.full, word.gap.answer).map((part, i) => (
                    part.match
                      ? <mark key={i} className="bg-transparent font-bold" style={{ color: "var(--ink)" }}>{part.text}</mark>
                      : <span key={i}>{part.text}</span>
                  ))}
                </p>
              )}
            </div>
          )}

          {phase === "feedback" && rung === "gap" && result?.outcome === "wrong" && (
            <div className="w-full max-w-sm text-left">
              {retypeOk ? (
                <p className={`pop-in ${VERDICT_CLASS.right} rounded-md px-4 py-2.5 text-sm`}>
                  Õige! That is the one.
                </p>
              ) : (
                <>
                  <p className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>Now type it again</p>
                  <EstonianInput
                    value={retyped}
                    onChange={(v) => { setRetyped(v); setRetypeNote(null); }}
                    onEnter={checkRetype}
                    autoFocus
                    ariaLabel="Type the word again"
                    placeholder="Type in Estonian"
                    large
                  />
                  {retypeNote && (
                    <p role="alert" className="mt-2 text-xs" style={{ color: "var(--again-ink)" }}>{retypeNote}</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 border-t px-5 py-4" style={{ borderColor: "var(--rule-soft)" }}>
          {phase === "feedback" ? (
            <>
              <Button
                variant="primary"
                onClick={needsRetype ? checkRetype : carryOn}
                disabled={busy || retypeOk || result?.outcome === "right"}
              >
                {needsRetype ? "Check it again" : result?.outcome === "right" ? "Õige!" : "Got it"}
              </Button>
              {rung === "gap" && (
                <SuggestFix
                  category="MARKED_WRONG"
                  categories={["MARKED_WRONG", "WRONG_FORM", "WRONG_EXAMPLE"]}
                  lemma={word.lemma}
                  lexemeId={word.lexemeId}
                  trigger={
                    `Learn, gap rung. Expected: ${result?.expected ?? ""}. ` +
                    `Typed: ${typed.trim() || "nothing"}.`
                  }
                  label="I think that was right"
                />
              )}
            </>
          ) : rung === "meet" ? (
            <>
              {/*
                THE ONE BUTTON HERE THAT IS A CLAIM RATHER THAN AN ANSWER.

                Plenty of people arrive at this app already speaking some
                Estonian, and being walked up three rungs for `kohv` is how a
                learner decides an app is beneath them. Easy from a new card
                graduates it outright, so the word goes straight into the
                review rotation at about a week rather than out of the app: if
                the claim was optimistic, the schedule is what finds out.
              */}
              <Button
                onClick={() => { cheer(true); void send("known", { outcome: "known", expected: word.gloss, note: "" }); }}
                disabled={busy}
              >
                I already know this one
              </Button>
              {/* The primary action sits on the right of the pair, where the
                  sprint already puts "Got it" and where a thumb and a reading
                  eye both end up. The claim is the quieter button beside it. */}
              <Button variant="primary" size="lg" onClick={met} disabled={busy}>Got it</Button>
            </>
          ) : null}
        </div>
      </div>

      <p className="mt-5 text-center text-xs" style={{ color: "var(--ink-3)" }}>
        {answered > 0
          ? `${right} of ${answered} right this round.`
          : "Meet each word, then answer it back. Nothing is written down until you answer."}
      </p>
    </div>
  );
}
