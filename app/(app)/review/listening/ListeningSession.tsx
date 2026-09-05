"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Headphones, X } from "lucide-react";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { gradeCard } from "@/app/actions";
import { Button, ButtonLink } from "@/components/Button";
import { Chip, Empty, Page, StatTile } from "@/components/ui";
import { Mascot } from "@/components/brand";
import { Speak } from "@/components/Speak";
import { StarWord } from "@/components/StarWord";
import { OPTION_CLASS, optionState } from "@/lib/ux/verdict";
import { VOICES } from "@/lib/audio/voice";
import { conditionFor, describeHearing } from "@/lib/audio/conditions";
import { useAudioPrefs } from "@/components/AudioPrefs";

/**
 * A different speaker for each word, the way the examination's listening part
 * is read by more than one voice and the country by several million. The
 * round starts on a voice drawn once per session and walks the list from
 * there, so two rounds in a row do not open on the same speaker, and the name
 * is shown after the answer rather than before it: which voice said it is
 * worth knowing, and not a clue.
 */
function voiceFor(start: number, index: number) {
  return VOICES[(start + index) % VOICES.length]!;
}

export interface ListeningCard {
  id: string;
  /** The Estonian word to play — never shown as text until the round is answered. */
  lemma: string;
  correct: string;
  /** 2–4 English options, correct one included, already shuffled. */
  choices: string[];
  /**
   * How many times this card has been reviewed, which is what decides how it
   * may be heard: a new word is heard in a quiet room, a settled one at
   * speed, over noise or down a phone line (lib/audio/conditions.ts).
   */
  reps: number;
  /** The dictionary entry behind the card, for the favorite button. */
  lexemeId: string | null;
  /** Whether this word is already one of the learner's favorites. */
  starred: boolean;
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
  const shownAt = useRef(Date.now());
  const [voiceStart] = useState(() => Math.floor(Math.random() * VOICES.length));

  const card = cards[index];
  const voice = voiceFor(voiceStart, index);
  /*
    The room and the rate, decided per card from its own history and its
    place in the round rather than drawn: a reload gives back the same
    question. Which it was is said after the answer, beside the voice,
    because a learner who missed a word wants to know if it was the word or
    the room, and before the answer it would be a clue.
  */
  const { hearing } = useAudioPrefs();
  const condition = card ? conditionFor(card.reps, index, hearing) : undefined;
  const finished = !card;
  const answered = selected !== null;

  useEffect(() => {
    shownAt.current = Date.now();
    setSelected(null);
  }, [index]);

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
          body="This draws on cards that are due, or that you have slipped on before."
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
          <h1 className="mt-5 text-3xl font-bold tracking-tight" style={{ color: "var(--ink)" }}>
            Session complete
          </h1>
          <p className="mt-2 text-base" style={{ color: "var(--ink-2)" }}>
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
      </div>
    );
  }

  const remaining = cards.length - index;

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-5 py-6 md:px-10 md:py-10">
      {/* The heading a session screen has no room to draw.

          These five screens are a progress bar, a card and four rating buttons,
          and there is nothing on them a title could be added to without taking
          space from the card. So they had no heading at all: somebody working
          down a page by its headings, or asking what this screen is, got
          nothing back, while the four modes that happen to have a title bar
          answered fine. The `Empty` and finished states of these same files
          already carry one, which is how the gap survived a sweep. */}
      <h1 className="sr-only">Listening</h1>
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
            className="grad-accent h-full rounded-full transition-[width] duration-500"
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
          <span className="ml-auto text-xs" style={{ color: "var(--ink-3)" }}>{correct} correct</span>
          {/* ONLY ONCE THE ANSWER IS IN, WHICH IS NOT THE RULE ON ANY OTHER
              ROUND. The word here is played and deliberately never written
              down until it has been answered, and this button's own label
              names it: a screen reader would read the answer out of the
              corner of the card before a learner had picked anything. */}
          {answered && card.lexemeId && (
            <StarWord lexemeId={card.lexemeId} starred={card.starred} label={card.lemma} />
          )}
        </div>

        <div className="flex min-h-[220px] flex-col items-center justify-center gap-4 px-6 py-10 text-center" aria-live="polite">
          {!answered ? (
            noAudio ? (
              <>
                <p lang="et" className="text-2xl font-semibold" style={{ color: "var(--ink)" }}>
                  {card.lemma}
                </p>
                <p className="max-w-[40ch] text-xs" style={{ color: "var(--ink-3)" }}>
                  We couldn&rsquo;t reach the audio, so the word is shown instead. It&rsquo;s still
                  worth answering, come back later for the listening part.
                </p>
              </>
            ) : (
              <>
                <Speak
                  text={card.lemma}
                  size={30}
                  voice={voice.id}
                  condition={condition}
                  autoplay
                  onUnavailable={() => setNoAudio(true)}
                  className="press flex h-24 w-24 items-center justify-center rounded-full transition-ui hover:-translate-y-0.5"
                  style={{ background: "var(--accent-soft)", color: "var(--accent-deep)", boxShadow: "var(--shadow)" }}
                />
                <p className="text-xs" style={{ color: "var(--ink-3)" }}>Tap to hear the word, tap again to replay</p>
              </>
            )
          ) : (
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-2">
                <p lang="et" className="text-2xl font-semibold" style={{ color: "var(--ink)" }}>{card.lemma}</p>
                <Speak text={card.lemma} voice={voice.id} label={`Hear "${card.lemma}" clearly`} />
              </div>
              <p className="text-2xs" style={{ color: "var(--ink-3)" }}>
                {condition ? describeHearing(voice.name, condition) : `Read by ${voice.name}.`} The next word gets another voice.
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2 border-t p-4 sm:grid-cols-2" style={{ borderColor: "var(--rule-soft)" }}>
          {card.choices.map((choice, i) => {
            const isCorrectChoice = choice === card.correct;
            const isPicked = choice === selected;
            const state = answered ? OPTION_CLASS[optionState(isCorrectChoice, isPicked)] : "";
            return (
              <button
                key={choice}
                type="button"
                disabled={answered || busy}
                onClick={() => void pick(choice)}
                className={`${state} press flex items-center gap-2 rounded-[var(--r)] border px-4 py-3 text-left text-base font-semibold transition-ui hover:-translate-y-0.5 disabled:cursor-default disabled:hover:translate-y-0`}
                style={answered ? undefined : { background: "var(--raised)", borderColor: "transparent", color: "var(--ink)" }}
              >
                {/* One character, so axe files it as "too short to determine"
                    and the sweep used to drop the measurement on the floor.
                    At 60% this read 2.46 to 4.16 depending on which of the
                    four tones the option was wearing. */}
                <kbd className="text-2xs">{i + 1}</kbd>
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
              <kbd className="ml-1 rounded-md px-1.5 py-0.5 text-2xs key-cap">Space</kbd>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
