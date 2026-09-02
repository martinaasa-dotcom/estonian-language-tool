"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Ear, Loader2, Volume2, X } from "lucide-react";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { gradeCard } from "@/app/actions";
import { Button, ButtonLink } from "@/components/Button";
import { Chip, Stat } from "@/components/ui";
import { Speak } from "@/components/Speak";
import { playClip } from "@/lib/audio/clip";
import { useAudioPrefs } from "@/components/AudioPrefs";

export interface PairQuestion {
  /** The form that is actually played. */
  heard: string;
  /** The card this practises, when the word heard is already in the deck. */
  cardId: string | null;
  options: { value: string; lemma: string; translation: string; formLabel: string }[];
  sameWord: boolean;
  longer: string;
  letter: string | null;
}

/**
 * Hear one of two words that differ only in the length of a sound, and say which.
 *
 * This is the drill the app could not offer before, for a reason worth stating:
 * the distinction it teaches is one Estonian *writing* only half records, so no
 * amount of reading practice conveys it. It only became possible because the
 * speech proxy already existed and was already verified end to end.
 */
export function PairsSession({ questions: initialQuestions }: { questions: PairQuestion[] }) {
  /*
    Snapshotted once on mount, never updated from later props. gradeCard() is a
    Server Action and Next refreshes this route's Server Component after every
    call, which hands down a freshly computed question set: the word under the
    learner's feedback would change while they were still reading it. The set
    the page found on first load is the only one this session should know
    about. ReviewSession froze its queue for the same reason; these four modes
    started grading in this change and inherited the hazard with it.
  */
  const [questions] = useState(initialQuestions);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  /*
    The browser would not autoplay, which is a fact about the gesture and not
    about the audio. Separate from `audioFailed` because the two want opposite
    screens: one is "there is nothing to hear", the other is "press the button
    that is already on this page".
  */
  const [needsPress, setNeedsPress] = useState(false);
  const startedAt = useRef(Date.now());

  const question = questions[index];
  const finished = !question;
  const revealed = picked !== null;

  const { voice } = useAudioPrefs();
  const play = useCallback(async (text: string, slow = false, unasked = false) => {
    try {
      setPlaying(true);
      /*
        Shared with `Speak` rather than a ref of its own. A ref's clips became
        unreachable when the round ended and were still held by the browser,
        because nothing revoked them: a listening round meets a dozen new
        words a minute and every one of them stayed. `fetchClip` is the one
        reader of that cache and the one place the key is built.
      */
      const outcome = await playClip({ text, slow, voice }, { unasked });
      setNeedsPress(outcome === "blocked");
    } catch {
      setAudioFailed(true);
    } finally {
      setPlaying(false);
    }
  }, [voice]);

  /*
    Play as soon as the question appears: this is a listening drill, and making
    someone press play before every item is friction with no purpose.

    `unasked` is what stops that being the end of the drill. Every browser
    refuses a gesture-less `play()` and every phone is that case on arrival, so
    this call catching it as a failure replaced the whole round with a screen
    blaming the connection, on the platform this app is measured on. It asks
    for a press instead, on the button that was already there.
  */
  useEffect(() => {
    if (!question) return;
    void play(question.heard, false, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const choose = useCallback((value: string) => {
    if (!question || picked) return;
    setPicked(value);
    const right = value.toLowerCase() === question.heard.toLowerCase();
    if (right) setCorrect((c) => c + 1);
    // ADR-016: the same review log as every other mode.
    if (question.cardId) void gradeCard(question.cardId, right ? 3 : 1, 0).catch(() => {});
  }, [question, picked]);

  const next = useCallback(() => {
    setPicked(null);
    setIndex((i) => i + 1);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (finished || !question) return;
      if (e.key === "r" || e.key === "R") { e.preventDefault(); void play(question.heard); return; }
      if (revealed && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); next(); return; }
      if (revealed) return;
      const option = question.options[Number(e.key) - 1];
      if (option) { e.preventDefault(); choose(option.value); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finished, question, revealed, choose, next, play]);

  if (audioFailed) {
    return (
      <div className="mx-auto max-w-lg px-5 py-20 text-center">
        <h1 className="text-xl font-bold" style={{ color: "var(--ink)" }}>
          No audio, no drill
        </h1>
        <p className="mx-auto mt-2 max-w-[44ch] text-base" style={{ color: "var(--ink-2)" }}>
          This exercise is all about what a word sounds like, so without audio there&rsquo;s nothing
          to show you. It runs on TartuNLP and needs a connection.
        </p>
        <div className="mt-6 flex justify-center">
          <ButtonLink href="/" variant="primary">Back to Today</ButtonLink>
        </div>
      </div>
    );
  }

  if (finished) {
    const accuracy = Math.round((correct / questions.length) * 100);
    const minutes = Math.max(1, Math.round((Date.now() - startedAt.current) / 60000));
    return (
      <div className="mx-auto max-w-2xl px-5 py-16 md:px-10">
        <h1 className="text-[32px] font-bold tracking-tight" style={{ color: "var(--ink)" }}>
          Round complete
        </h1>
        <p className="mt-2 text-[15px]" style={{ color: "var(--ink-2)" }}>
          In Estonian, length changes the word: <span lang="et">maja</span> and{" "}
          <span lang="et">majja</span> are different words, not the same word said twice. Ears take
          longer than eyes.
        </p>
        <div
          className="mt-8 grid grid-cols-3 gap-6 rounded-lg border p-6"
          style={{ borderColor: "var(--rule)", background: "var(--surface)" }}
        >
          <Stat value={questions.length} label="Heard" />
          <Stat value={`${accuracy}%`} label="Right" tone={accuracy >= 80 ? "var(--good)" : "var(--hard)"} />
          <Stat value={`${minutes}m`} label="Time" />
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/" variant="primary">Back to Today</ButtonLink>
          <ButtonLink href="/review/pairs">Another round</ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-5 py-6 md:px-10 md:py-10">
      {/* The heading a session screen has no room to draw. Same line as every
          other mode: the start screen and the finished screen each carry one
          and the round itself did not. */}
      <h1 className="sr-only">Minimal pairs</h1>
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link href="/" aria-label="End session" className="rounded p-1" style={{ color: "var(--ink-3)" }}>
          <X size={19} aria-hidden />
        </Link>
        <div className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: "var(--raised)" }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${(index / questions.length) * 100}%`, background: "var(--accent)" }}
            role="progressbar"
            aria-valuenow={index}
            aria-valuemin={0}
            aria-valuemax={questions.length}
            aria-label="Round progress"
          />
        </div>
        <span className="tnum text-sm" style={{ color: "var(--ink-3)" }}>
          {questions.length - index} left
        </span>
      </div>

      <div
        className="rounded-xl border"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow)" }}
      >
        <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3" style={{ borderColor: "var(--rule-soft)" }}>
          <Chip tone="accent"><Ear size={12} aria-hidden /> Which did you hear?</Chip>
          {question.sameWord && <Chip>same word, two cases</Chip>}
        </div>

        <div className="flex flex-col items-center gap-4 px-6 py-10">
          <button
            type="button"
            onClick={() => void play(question.heard)}
            disabled={playing}
            // The same correction as the hint below, and the one that matters
            // more: a screen reader announces this button and nothing else on
            // the card, so "Play again" before anything has played is the only
            // thing that reader is told.
            aria-label={needsPress ? "Play the word" : "Play again"}
            className="press flex h-20 w-20 items-center justify-center rounded-full transition-ui hover:-translate-y-0.5 disabled:hover:translate-y-0"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            {playing
              ? <Loader2 size={30} className="animate-spin" aria-hidden />
              : <Volume2 size={30} aria-hidden />}
          </button>
          <p className="text-sm" style={{ color: "var(--ink-3)" }}>
            {/* "Play again" is a lie before anything has played, which is
                every arrival on a browser that blocks autoplay. */}
            {needsPress ? "Tap to hear it" : "Play again"} <kbd>R</kbd> · or hear it{" "}
            <span className="inline-flex items-center align-middle">
              <Speak text={question.heard} slow label="Hear it slowly" />
            </span>{" "}
            slowly
          </p>
        </div>

        <div className="px-4 pb-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {question.options.map((option, i) => {
              const isAnswer = option.value.toLowerCase() === question.heard.toLowerCase();
              const isPicked = option.value === picked;
              const tone = !revealed
                ? { "--choice-bg": "var(--raised)", color: "var(--ink)" } as React.CSSProperties
                : isAnswer
                  /*
                    The ink, not the hue. `--good` set as text on `--good-soft`
                    measures 2.23:1 on the light theme and `--again` on its own
                    tint 2.50:1, which is what the token block in globals.css
                    says will happen: the five hues are chosen to read as
                    colour at full strength, and every one of them has an ink
                    for the case where it has to be read as words instead.
                    Dark is unaffected either way, since there the ink is the
                    hue.
                  */
                  ? { background: "var(--good-soft)", color: "var(--good-ink)", borderColor: "transparent" }
                  : isPicked
                    ? { background: "var(--again-soft)", color: "var(--again-ink)", borderColor: "transparent" }
                    : { background: "transparent", color: "var(--ink-3)", borderColor: "var(--rule-soft)" };

              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={revealed}
                  onClick={() => choose(option.value)}
                  className="choice-btn flex items-center gap-2.5 rounded-md border px-3.5 py-3 text-left disabled:cursor-default"
                  style={tone}
                >
                  {/* Neither of these fades any more. The key hint is one
                      character, which axe declines to rule on, and it measured
                      1.62 to 4.12; the gloss under the word measured 1.90 to
                      3.85 once the tone above it was corrected. */}
                  <kbd className="tnum text-2xs">{i + 1}</kbd>
                  <span className="min-w-0">
                    <span lang="et" className="block text-[19px] font-semibold">{option.value}</span>
                    <span className="block text-[12.5px]">
                      {option.formLabel} of {option.lemma} · {option.translation}
                    </span>
                  </span>
                  {revealed && isAnswer && <Check size={16} className="ml-auto shrink-0" aria-hidden />}
                </button>
              );
            })}
          </div>
        </div>

        {revealed && (
          <div className="border-t px-6 py-5" style={{ borderColor: "var(--rule-soft)" }} aria-live="polite">
            <p className="text-[13.5px]" style={{ color: "var(--ink-2)" }}>
              {question.letter
                ? <>The two only differ in how long the <strong lang="et">{question.letter}</strong> sounds.
                    The doubled spelling, <strong lang="et">{question.longer}</strong>, is the longer one.</>
                : <>The two only differ in length.</>}
              {question.sameWord && " Both are forms of the same word. Here the length shows the grammar, not a different meaning."}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {question.options.map((o) => (
                <span key={o.value} className="flex items-center gap-1.5">
                  <span lang="et" className="text-[15px]" style={{ color: "var(--ink)" }}>{o.value}</span>
                  <Speak text={o.value} />
                </span>
              ))}
            </div>
            <div className="mt-4">
              <Button variant="primary" onClick={next} autoFocus>
                Next <kbd className="ml-1">↵</kbd>
              </Button>
            </div>
          </div>
        )}
      </div>

      <p className="mt-4 text-center text-[11.5px]" style={{ color: "var(--ink-3)" }}>
        {correct}/{index + (revealed ? 1 : 0)} right · keys 1 to 2 to answer
      </p>
    </div>
  );
}
