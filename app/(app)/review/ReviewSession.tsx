"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { BookOpen, Check, Compass, Keyboard, MessageCircleQuestion, RotateCcw, Undo2, X, Zap } from "lucide-react";
import { checkAchievements, gradeCard, undoGrade } from "@/app/actions";
import { AchievementToasts } from "@/components/achievements/AchievementToasts";
import { Button, ButtonLink } from "@/components/Button";
import { EstonianInput } from "@/components/EstonianInput";
import { Chip, Empty, Meter, Page, StatTile } from "@/components/ui";
import { Mascot } from "@/components/brand";
import { Speak } from "@/components/Speak";
import { useAudioPrefs, useFeedbackSound } from "@/components/AudioPrefs";
import { prefetchClip } from "@/lib/audio/clip";
import { SuggestFix } from "@/components/SuggestFix";
import type { Badge } from "@/lib/achievements/badges";
import { caseByKey } from "@/lib/estonian/cases";
import { checkAnswer, countsAsRecalled, type AnswerCheck } from "@/lib/estonian/answer";
import { BLANK } from "@/lib/estonian/cloze";
import { splitOnForm } from "@/lib/dict/examples";
import { xpForRating } from "@/lib/gamification/xp";
import { enqueueGrade, readStashedSession, stashSession } from "@/lib/offline/db";
import { useOffline } from "@/components/OfflineProvider";
import type { ReviewMode } from "@/lib/settings/store";
import { previewIntervals, SELF_GRADES, type RatingValue, type SchedulingState } from "@/lib/srs/scheduler";
import { AI_TAG } from "@/lib/copy/values";

export interface ReviewCard {
  id: string;
  cardType: string;
  front: string;
  back: string;
  hint: string | null;
  targetCase: string | null;
  lemma: string | null;
  isNew: boolean;
  /**
   * What to show the first time this word is met, assembled by the page out of
   * the dictionary. Null on a card that has been seen, and on the rare card
   * with no dictionary entry behind it.
   */
  intro: {
    lemma: string;
    gloss: string;
    /** An attested sentence, and which form of the word it carries. */
    sentence: { et: string; en: string | null; form: string | null } | null;
  } | null;
  /** Four options including the right one, when this card can be asked as multiple choice. */
  choices: string[] | null;
  scheduling: Omit<SchedulingState, "due" | "lastReview"> & { due: string; lastReview: string | null };
}

// The ink of each grade, not the hue: these are set as text on the matching
// soft tint, where the hue itself is barely 2.5:1 (globals.css).
const TONE: Record<number, string> = {
  1: "var(--again-ink)", 2: "var(--hard-ink)", 3: "var(--good-ink)", 4: "var(--easy-ink)",
};
const TONE_SOFT: Record<number, string> = {
  1: "var(--again-soft)", 2: "var(--hard-soft)", 3: "var(--good-soft)", 4: "var(--easy-soft)",
};


/**
 * "Why?", at the only moment anyone asks it.
 *
 * A reference page nobody can find is a reference page nobody reads, and the
 * moment a learner wants the rule is the second after the answer appears and
 * does not match what they thought. Both links are one tap and neither leaves
 * the answer behind: the grammar page explains the case this card drills, and
 * Anu opens with the question already written so it can be sent or edited.
 */
function WhyRow({ card }: { card: ReviewCard }) {
  // Named the way a class names it, because this question is going to a tutor
  // who is told to answer in the same words (lib/tutor/prompt.ts).
  const named = card.targetCase ? caseByKey(card.targetCase) : undefined;
  const caseName = named?.et ?? card.targetCase?.toLowerCase() ?? "";
  const question = card.targetCase
    ? `Why is the ${caseName} of "${card.lemma ?? card.front}" what it is? I keep getting this form wrong.`
    : `Explain "${card.lemma ?? card.front}" to me, what does it mean and when would an Estonian use it?`;

  const pill =
    "press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-ui hover:-translate-y-px";

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
      {card.targetCase && (
        <Link
          href={`/grammar/${card.targetCase.toLowerCase()}`}
          className={pill}
          style={{ background: "var(--raised)", color: "var(--ink-2)" }}
        >
          <Compass size={12} aria-hidden /> Why the <span lang="et">{caseName}</span>?
        </Link>
      )}
      <Link
        href={`/tutor?q=${encodeURIComponent(question)}`}
        className={pill}
        style={{ background: "var(--raised)", color: "var(--ink-2)" }}
      >
        <MessageCircleQuestion size={12} aria-hidden /> Ask Anu
      </Link>
    </div>
  );
}

/**
 * A word's first outing: what it means, and it doing its job in a sentence
 * somebody actually wrote.
 *
 * What stood here was the answer, a line of instructions, and the four grading
 * buttons every other card carries. `askFor` had already worked out that this
 * is wrong and says so in its own comment: a card you have never seen cannot be
 * recalled, only met. It then handed over Again, Hard, Good and Easy anyway, so
 * the screen asked how well a memory had held up four seconds after admitting
 * there was no memory yet, and Easy scheduled the word a week out.
 *
 * So a first meeting teaches instead. The sentence is the part that does the
 * work: a gloss makes a word a label, and a word in a sentence is a word you
 * have seen behave. It is attested Estonian picked by `teachingSentence`, with
 * the form the card is about to ask for marked in it, and nothing here is
 * written or derived (ADR-005).
 */
function MeetWord({ card }: { card: ReviewCard }) {
  const lemma = card.intro?.lemma ?? card.lemma ?? card.front;
  const gloss = card.intro?.gloss ?? (card.cardType === "RECOGNITION" ? card.back : "");
  const sentence = card.intro?.sentence ?? null;

  return (
    <>
      <div className="flex items-center gap-2">
        <p lang="et" className="text-3xl font-bold leading-tight tracking-tight md:text-4xl" style={{ color: "var(--ink)" }}>
          {lemma}
        </p>
        {/* Read aloud on arrival: the first time a word is met is the one time
            hearing it is worth more than reading it. */}
        <Speak text={lemma} autoplay />
      </div>
      {gloss && <p className="text-base" style={{ color: "var(--ink-2)" }}>{gloss}</p>}

      <div className="my-1 h-1 w-14 rounded-full" style={{ background: "var(--accent-soft)" }} />

      {sentence ? (
        <div className="w-full max-w-md rounded-[var(--r)] px-4 py-3.5 text-left" style={{ background: "var(--raised)" }}>
          <div className="flex items-start gap-2">
            <p lang="et" className="flex-1 text-lg font-semibold leading-snug" style={{ color: "var(--ink)" }}>
              {splitOnForm(sentence.et, sentence.form).map((run, i) => (
                run.match
                  ? <mark key={i} className="bg-transparent font-bold" style={{ color: "var(--accent-deep)" }}>{run.text}</mark>
                  : <span key={i}>{run.text}</span>
              ))}
            </p>
            <Speak text={sentence.et} label="Hear the sentence" />
          </div>
          {sentence.en && (
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm" style={{ color: "var(--ink-2)" }}>
              {sentence.en}
              <Chip tone="again">{AI_TAG}</Chip>
            </p>
          )}
          <p className="mt-2 text-2xs" style={{ color: "var(--ink-3)" }}>
            A real sentence, from Ekilex. Try reading it out loud.
          </p>
        </div>
      ) : (
        /* No sentence, said plainly. The dictionary carries examples for most
           words and not for all of them, and a screen that quietly shows a word
           on its own looks exactly like one that had nothing to say about it.
           No report button: an absence is not a dead end, the word and its
           meaning and its audio are all still here, and the nearest category
           this app has covers an example that is *wrong* rather than one that
           is missing. */
        <p className="max-w-[38ch] text-sm" style={{ color: "var(--ink-3)" }}>
          No example sentence for this one yet. Say it out loud a couple of times.
        </p>
      )}

      {/* What this particular card will want back, once it starts asking. On a
          recognition card that is the word and its meaning, which is the whole
          screen already, so it would only be saying it twice. */}
      {card.cardType !== "RECOGNITION" && (
        <p className="text-xs" style={{ color: "var(--ink-3)" }}>
          Next time this card asks:{" "}
          <span lang={estonianSide(card.cardType, "front") ? "et" : "en"} className="font-semibold">
            {card.front}
          </span>
        </p>
      )}
    </>
  );
}

const TYPE_LABEL: Record<string, string> = {
  RECOGNITION: "Estonian → English",
  PRODUCTION: "English → Estonian",
  CASE_FORM: "Case form",
  GRADATION: "Gradation",
  GOVERNMENT: "Verb government",
  CLOZE: "Fill the gap",
  CONJUGATION: "Verb form",
};

/**
 * The one form to read aloud off a side that may print two.
 *
 * A case card's back is `tuppa / toasse`, both right and both printed, and a
 * speech service handed that string reads the slash. The first is the one the
 * dictionary leads with, which is the one worth hearing.
 */
const spoken = (side: string) => side.split(" / ")[0]!.trim();

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

export function ReviewSession({ cards: initialCards, drillCase, drillUnit, drillScan, totalCards, mode }: {
  cards: ReviewCard[];
  drillCase?: string;
  drillUnit?: string;
  /** A photographed page being drilled on its own: its id, and what it is called. */
  drillScan?: { id: string; title: string };
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
  const { pending: outboxPending, refresh: refreshOutbox } = useOffline();
  const [newBadges, setNewBadges] = useState<Badge[]>([]);
  const shownAt = useRef(Date.now());
  const startedAt = useRef(Date.now());
  const checkedAchievements = useRef(false);
  const { voice } = useAudioPrefs();
  const sound = useFeedbackSound();

  const card = queue[index];
  const finished = !card;
  const ask = card ? askFor(card, mode) : "flip";

  /*
    Whether the answer is on the screen, which is not the same question as
    whether the learner turned it over.

    A new card leads with its answer (`askFor`, "a card you have never seen
    cannot be recalled, only met"), so `intro` arrives with the answer already
    printed and the rating buttons already drawn. `revealed` stays false for
    it, because nothing was revealed.

    The render worked that out in four places and spelled it out in each of
    them; the keyboard handler is where the fifth copy should have been and
    was not, so it read `!revealed` and returned before the rating keys. The
    rating buttons sat on screen, the mouse graded the card and the number
    keys did nothing at all, on the one shape a learner meets every time they
    start a new word. Naming it once is what stops a sixth reader getting it
    wrong the same way.
  */
  const answerShown = revealed || ask === "intro";

  // Draining the queue is the provider's job, not this screen's — it has to keep
  // happening on pages that are not a review session. Here we only report it.
  useEffect(() => { setPendingOffline(outboxPending); }, [outboxPending]);

  // Two halves of offline review. When the server handed cards down, keep them:
  // a later visit with no connection needs something real to work through. When
  // it handed nothing down *and* the browser says it is offline, the empty state
  // is a lie — the page came from the service worker cache and the server never
  // ran — so fall back to what was stashed.
  useEffect(() => {
    if (initialCards.length > 0) {
      void stashSession(initialCards);
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine) return;
    void readStashedSession().then((stashed) => {
      if (stashed.length > 0) setQueue(stashed);
    });
  }, [initialCards]);

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

  /*
    The next card's word is fetched while this one is being answered, so its
    speaker button and its autoplay are instant rather than a round trip to a
    speech service on every card. One card ahead is enough: the page cache
    holds two dozen clips and a session moves one card at a time.
  */
  useEffect(() => {
    const upcoming = queue[index + 1];
    if (!upcoming) return;
    const heard = estonianSide(upcoming.cardType, "front") && upcoming.cardType !== "CLOZE"
      ? upcoming.lemma ?? upcoming.front
      : upcoming.intro?.lemma ?? upcoming.lemma ?? (estonianSide(upcoming.cardType, "back") ? upcoming.back : null);
    if (heard) prefetchClip({ text: spoken(heard), voice });
  }, [index, queue, voice]);

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
      // No connection, or the write failed. The grade is still a fact about
      // something the learner did, so it goes to the durable outbox and is
      // replayed in order with this timestamp once there is a connection —
      // which, because Review is append-only, lands exactly where it would have.
      await enqueueGrade({
        id: crypto.randomUUID(),
        cardId: card.id,
        rating,
        durationMs: duration,
        reviewedAt: Date.parse(answeredAt),
      });
      refreshOutbox();
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
  }, [card, busy, index, refreshOutbox]);

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
    sound(countsAsRecalled(result.verdict) ? "right" : "wrong");
    if (result.verdict === "wrong" && typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(60);
    }
    // Right answers move on by themselves, the way a picked choice already
    // does. Typing the word correctly and then being asked to confirm that you
    // typed the word correctly is a click on the most common outcome in the
    // app. A miss keeps its screen: that is the one moment worth stopping at,
    // and the correction needs reading before anything moves.
    if (result.verdict === "correct") {
      window.setTimeout(() => void submit(result.suggestedRating), 420);
    }
  }, [card, typed, verdict, submit, sound]);

  const pickChoice = useCallback((choice: string) => {
    if (!card || chosen) return;
    setChosen(choice);
    setRevealed(true);
    const right = choice === card.back;
    sound(right ? "right" : "wrong");
    if (!right && typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(60);
    if (right) {
      // Right answers move on by themselves: multiple choice is the fast mode,
      // and a confirmation click on every correct card halves the throughput.
      window.setTimeout(() => void submit(3), 420);
    }
  }, [card, chosen, submit, sound]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (finished) return;
      const field = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
        ? e.target
        : null;
      const typing = field !== null;

      // `u` has to reach undo from inside the answer box, because that is where
      // focus already is: grading a typed card advances to the next one, whose
      // input takes focus on mount — and the moment just after a grade is
      // exactly when you notice you hit the wrong key. Requiring focus to be
      // outside the field meant the shortcut silently did nothing there, and
      // quietly dropped a `u` into the next answer instead.
      //
      // Only while that box is still empty, though. Estonian is full of u —
      // tuba, kuu, muusika — so once there is anything typed, u is a letter.
      const startedAnswering = field !== null && field.value.length > 0;

      if (e.key.toLowerCase() === "u" && !startedAnswering && history.length > 0) {
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
        if (ask === "intro") { void submit(3); return; }
        if (ask === "type" && !verdict) { checkTyped(); return; }
        if (ask === "type" && verdict) { void submit(verdict.suggestedRating); return; }
        // A right pick grades itself on a timer; a wrong one waits here.
        if (ask === "choice") { if (chosen && chosen !== card?.back) void submit(1); return; }
        if (!revealed) setRevealed(true);
        else void submit(3);
        return;
      }

      if (typing) return;
      if (ask === "intro") return;
      if (ask === "choice" && !chosen && card?.choices) {
        const n = Number(e.key);
        if (n >= 1 && n <= card.choices.length) {
          e.preventDefault();
          pickChoice(card.choices[n - 1]!);
        }
        return;
      }
      if (!revealed) return;
      // Only on a flip card, and only the two digits the buttons carry. On a
      // typed or picked card the mark has already been made, so a stray digit
      // must not overrule it: 4 used to grade any revealed card Easy, whatever
      // the app had just decided about the answer.
      if (ask !== "flip") return;
      const chosenGrade = SELF_GRADES.find((g) => g.key === e.key);
      if (chosenGrade) { e.preventDefault(); void submit(chosenGrade.rating); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answerShown, revealed, submit, finished, ask, verdict, checkTyped, chosen, card, pickChoice, undo, history.length]);

  if (wasEmptyAtStart) {
    return (
      <Page title="Review" lead="Spaced repetition, timed to when you are about to forget.">
        {drillCase ? (
          <Empty
            title={`No ${drillCase.toLowerCase()} cards yet`}
            body="Tick 'Case form' when you add a word, or start a noun unit on the path."
            action={<ButtonLink href="/learn" variant="primary">Open the learning path</ButtonLink>}
          />
        ) : drillUnit ? (
          <Empty
            title="Nothing from this unit in your deck"
            body="Add the unit first and its words become cards you can drill here."
            action={<ButtonLink href={`/learn/${drillUnit}`} variant="primary">Open the unit</ButtonLink>}
          />
        ) : drillScan ? (
          <Empty
            title="Nothing from this page in your deck"
            body="The words are saved, they just have no cards yet. Add them and they turn up here."
            action={
              <ButtonLink href={`/scan/${drillScan.id}`} variant="primary">Open the page</ButtonLink>
            }
          />
        ) : totalCards === 0 ? (
          <Empty
            title="No cards yet"
            body="Start a unit on the path, or add words from the dictionary."
            action={<ButtonLink href="/learn" variant="primary">Open the learning path</ButtonLink>}
          />
        ) : (
          <Empty
            title="Nothing due, you're caught up"
            body={`All ${totalCards} cards are scheduled for later. Reviewing early does not help.`}
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
        <div className="pop-in text-center">
          <Mascot size={72} mood="cheer" className="float mx-auto" />
          <h1 className="mt-5 text-3xl font-bold tracking-tight" style={{ color: "var(--ink)" }}>
            Session complete
          </h1>
          <p className="mx-auto mt-2 max-w-[46ch] text-base" style={{ color: "var(--ink-2)" }}>
            {drillCase
              ? <>Tubli töö. That&rsquo;s the {drillCase.toLowerCase()} drill done. These cards still follow their normal schedule.</>
              : drillUnit
                ? <>Tubli töö. That&rsquo;s this unit drilled. Its cards still follow their normal schedule.</>
                : drillScan
                  ? <>Tubli töö. That&rsquo;s the whole page drilled. Its cards still follow their normal schedule.</>
                  : <>Tubli töö. That&rsquo;s everything due right now.</>}
          </p>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile value={done} label="Reviewed" tone="accent" />
          <StatTile value={`${accuracy}%`} label="Recalled" tone={accuracy >= 85 ? "mint" : "butter"} />
          <StatTile value={`+${xp}`} label="XP" tone="blush" />
          <StatTile value={`${minutes}m`} label="Time" tone="sky" />
        </div>
        {pendingOffline > 0 && (
          <p
            className="mt-4 rounded-[var(--r)] px-4 py-3 text-sm"
            style={{ background: "var(--hard-soft)", color: "var(--hard-ink)" }}
          >
            {pendingOffline} grade{pendingOffline === 1 ? "" : "s"} saved here while you were offline.
            They&rsquo;ll be sent the moment you&rsquo;re back online. You can close the tab.
          </p>
        )}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/" variant="primary" size="lg">Back to Today</ButtonLink>
          <ButtonLink href="/practice" size="lg"><Zap size={15} aria-hidden /> Play a round</ButtonLink>
          <ButtonLink href="/learn" size="lg">Add new words</ButtonLink>
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
      {/* The heading a session screen has no room to draw.

          These five screens are a progress bar, a card and four rating buttons,
          and there is nothing on them a title could be added to without taking
          space from the card. So they had no heading at all: somebody working
          down a page by its headings, or asking what this screen is, got
          nothing back, while the four modes that happen to have a title bar
          answered fine. The `Empty` and finished states of these same files
          already carry one, which is how the gap survived a sweep. */}
      <h1 className="sr-only">Review</h1>
      <div className="mb-7 flex items-center gap-4">
        <Link
          href="/"
          aria-label="End session"
          className="press flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-[var(--raised)]"
          style={{ color: "var(--ink-3)" }}
        >
          <X size={18} aria-hidden />
        </Link>
        <div className="flex-1">
          <Meter pct={progress} label={`Session progress: ${index} of ${queue.length}`} height={10} />
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
        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3.5" style={{ borderColor: "var(--rule-soft)" }}>
          <Chip tone="accent">{TYPE_LABEL[card.cardType] ?? card.cardType}</Chip>
          {card.isNew && <Chip tone="good">New word</Chip>}
          {drillCase && <Chip tone="hard">{drillCase.toLowerCase()} drill</Chip>}
          {drillScan && <Chip tone="sky">{drillScan.title}</Chip>}
          {card.lemma && (
            <Link
              href={`/dictionary?q=${encodeURIComponent(card.lemma)}`}
              className="ml-auto flex items-center gap-1.5 text-xs font-semibold transition-opacity hover:opacity-60"
              style={{ color: "var(--ink-3)" }}
            >
              <BookOpen size={13} aria-hidden /> Full entry
            </Link>
          )}
        </div>

        <div
          key={`${card.id}-${revealed}`}
          className="pop-in flex min-h-[280px] flex-col items-center justify-center gap-4 px-6 py-11 text-center md:min-h-[320px]"
          aria-live="polite"
        >
          {ask === "intro" && <MeetWord card={card} />}

          {ask !== "intro" && (
          <div className="flex items-center gap-2">
            <p
              lang={frontLang}
              className={
                // A gap-fill prompt is a whole sentence: at flashcard size it
                // wraps to four lines and stops being readable at a glance.
                card.cardType === "CLOZE"
                  ? "text-xl font-semibold leading-snug tracking-tight md:text-2xl"
                  : "text-3xl font-bold leading-tight tracking-tight md:text-4xl"
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
          )}

          {card.hint && !answerShown && (
            <p className="text-xs" style={{ color: "var(--ink-3)" }}>{card.hint}</p>
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
                className={`${verdict.verdict === "correct" ? "pop-in" : "shake"} rounded-md px-4 py-2.5 text-sm`}
                style={{
                  background: verdict.verdict === "correct" ? "var(--good-soft)"
                    : verdict.verdict === "wrong" ? "var(--again-soft)" : "var(--hard-soft)",
                  color: verdict.verdict === "correct" ? "var(--good-ink)"
                    : verdict.verdict === "wrong" ? "var(--again-ink)" : "var(--hard-ink)",
                }}
              >
                {verdict.verdict === "correct" ? "Õige!" : verdict.note}
              </p>
              {typed.trim() && verdict.verdict !== "correct" && (
                <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
                  You typed <span lang={backLang}>{typed.trim()}</span>
                </p>
              )}
              {/*
                MARKED WRONG, AND THE LEARNER DISAGREES.

                The check is a string comparison against a form the dictionary
                vouches for, which is the right way round: no model decides
                whether somebody was right. What it cannot know is that the
                dictionary itself is wrong, or that Estonian has a second
                accepted form here, and the person who does know is looking at
                the screen at exactly this moment. Sending it does not change
                the grade they are about to give, which stays theirs.
              */}
              {verdict.verdict !== "correct" && (
                <div className="mt-3">
                  <SuggestFix
                    category="MARKED_WRONG"
                    categories={["MARKED_WRONG", "WRONG_MEANING", "WRONG_FORM"]}
                    lemma={card.lemma ?? card.front}
                    trigger={
                      `Asked: ${card.front}. Expected: ${card.back}. ` +
                      `Typed: ${typed.trim() || "nothing"}.`
                    }
                    label="I think that was right"
                  />
                </div>
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
                  className="press flex items-center gap-3 rounded-[var(--r)] px-4 py-3.5 text-left text-base font-medium transition-ui hover:-translate-y-0.5"
                  style={{ background: "var(--accent-soft)", color: "var(--accent-deep)", boxShadow: "var(--shadow-sm)" }}
                >
                  <span
                    className="tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-2xs font-bold"
                    style={{ background: "var(--surface)", color: "var(--accent-deep)" }}
                  >
                    {i + 1}
                  </span>
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
                    className="rounded-[var(--r)] px-4 py-3.5 text-left text-base font-medium"
                    style={{
                      background: isAnswer ? "var(--good-soft)" : picked ? "var(--again-soft)" : "var(--raised)",
                      color: isAnswer ? "var(--good-ink)" : picked ? "var(--again-ink)" : "var(--ink-3)",
                      outline: isAnswer ? "2px solid var(--good)" : "none",
                      outlineOffset: -2,
                    }}
                  >
                    {choice}
                  </div>
                );
              })}
            </div>
          )}

          {revealed && ask !== "choice" && (
            <>
              <div className="my-1 h-1 w-14 rounded-full" style={{ background: "var(--accent-soft)" }} />
              {card.cardType === "CLOZE" ? (
                /* A gap-fill is answered by a word but *learned* as a sentence,
                   so the reveal puts the word back where it came from and reads
                   the whole thing aloud. */
                <div className="flex flex-col items-center gap-2">
                  <p lang="et" className="text-xl leading-snug md:text-2xl" style={{ color: "var(--ink)" }}>
                    {card.front.split(BLANK)[0]}
                    <span style={{ color: "var(--accent-deep)", fontWeight: 600 }}>{card.back}</span>
                    {card.front.split(BLANK)[1]}
                  </p>
                  <Speak text={card.front.replace(BLANK, card.back)} label="Hear the whole sentence" autoplay />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p
                    lang={backLang}
                    className="text-2xl font-bold md:text-3xl"
                    style={{ color: "var(--accent-deep)" }}
                  >
                    {card.back}
                  </p>
                  {/* The answer, read aloud as it appears. On a typed card
                      this is the correction; on a flip it is the word you
                      were trying to recall, said properly. */}
                  {estonianSide(card.cardType, "back") && <Speak text={spoken(card.back)} autoplay />}
                </div>
              )}

              {card.hint && <p className="text-xs" style={{ color: "var(--ink-3)" }}>{card.hint}</p>}
            </>
          )}

          {/* A first meeting carries these too. "What is the kaasaütlev?" is a
              question somebody has the moment they first see one, and the
              screen that introduces the form is the obvious place to answer
              it. */}
          {(revealed || chosen || ask === "intro") && <WhyRow card={card} />}
        </div>

        <div className="border-t p-4" style={{ borderColor: "var(--rule-soft)" }}>
          {/*
            WHO DECIDES WHETHER THE ANSWER WAS RIGHT.

            Four buttons used to sit here on every card in the app, and on most
            of them they were asking a question the app had already answered.
            `checkAnswer` compares what was typed against a form the dictionary
            vouches for and returns the rating to use; a multiple choice is
            right or it is not. The screen took that verdict, drew a ring round
            one of the four buttons, and waited for somebody to press it anyway.

            So the rule is: the app marks what it can mark, and the learner is
            asked only about what it cannot. A flip card is the one shape with
            nothing to compare, and there it is two buttons rather than four,
            because "how well did that go" has two honest answers and the middle
            two were guesses about a scheduler nobody can see.

            RATINGS still carries all four values and `submit` still takes any
            of them: the log, undo and the offline replay are unchanged, and
            Hard is still what a near miss is graded. What went is the asking.
          */}
          {ask === "intro" ? (
            <Button variant="primary" size="lg" className="w-full" onClick={() => void submit(3)} disabled={busy}>
              Got it, next
              <kbd className="ml-1 rounded-md px-1.5 py-0.5 text-2xs font-semibold key-cap">
                Space
              </kbd>
            </Button>
          ) : ask === "type" && !verdict ? (
            <Button variant="primary" size="lg" className="w-full" onClick={checkTyped}>
              Check
              <kbd className="ml-1 rounded-md px-1.5 py-0.5 text-2xs font-semibold key-cap">
                Enter
              </kbd>
            </Button>
          ) : ask === "type" && verdict ? (
            /* Marked already. A clean hit takes itself away (see `checkTyped`),
               so what reaches here is a miss, and a miss is the one moment in a
               review worth slowing down for: the correction is on screen and
               this button is an acknowledgement, not a grade. */
            <Button variant="primary" size="lg" className="w-full" onClick={() => void submit(verdict.suggestedRating)} disabled={busy}>
              Got it, next
              <kbd className="ml-1 rounded-md px-1.5 py-0.5 text-2xs font-semibold key-cap">
                Enter
              </kbd>
            </Button>
          ) : ask === "choice" && !chosen ? (
            <p className="text-center text-xs" style={{ color: "var(--ink-3)" }}>
              Pick the meaning · keys 1 to {card.choices?.length ?? 4}
            </p>
          ) : ask === "choice" && chosen === card.back ? (
            <p className="text-center text-sm font-semibold" style={{ color: "var(--good-ink)" }}>Õige!</p>
          ) : ask === "choice" ? (
            /* Picked the wrong one. Nothing to grade: the right answer is on
               the screen and the card comes back later in this session. */
            <Button variant="primary" size="lg" className="w-full" onClick={() => void submit(1)} disabled={busy}>
              Got it, next
              <kbd className="ml-1 rounded-md px-1.5 py-0.5 text-2xs font-semibold key-cap">
                Enter
              </kbd>
            </Button>
          ) : !revealed ? (
            <Button variant="primary" size="lg" className="w-full" onClick={() => setRevealed(true)}>
              Show answer
              <kbd className="ml-1 rounded-md px-1.5 py-0.5 text-2xs font-semibold key-cap">
                Space
              </kbd>
            </Button>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {SELF_GRADES.map((g) => (
                <button
                  key={g.rating}
                  type="button"
                  disabled={busy}
                  onClick={() => void submit(g.rating)}
                  aria-label={intervals ? `${g.label}, next in ${intervals[g.rating]}` : g.label}
                  className="press flex flex-col items-center gap-0.5 rounded-[var(--r)] px-2 py-3.5 transition-ui hover:-translate-y-0.5 disabled:opacity-40"
                  style={{ background: TONE_SOFT[g.rating], color: TONE[g.rating] }}
                >
                  <span className="text-base font-bold">{g.label}</span>
                  <span className="tnum text-2xs">{intervals?.[g.rating]}</span>
                  <kbd className="text-2xs">{g.key}</kbd>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-2xs" style={{ color: "var(--ink-3)" }}>
        <span className="flex items-center gap-1"><Check size={12} aria-hidden style={{ color: "var(--good-ink)" }} /> {correct} recalled</span>
        <span className="flex items-center gap-1"><RotateCcw size={12} aria-hidden /> {done} graded</span>
        <span className="flex items-center gap-1"><Zap size={12} aria-hidden /> +{xp} XP</span>
        <button
          type="button"
          onClick={() => void undo()}
          disabled={history.length === 0 || busy}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 disabled:opacity-40"
          style={{ color: "var(--ink-3)" }}
        >
          <Undo2 size={12} aria-hidden /> Undo <kbd>u</kbd>
        </button>
        <span className="hidden items-center gap-1 md:flex">
          <Keyboard size={12} aria-hidden />
          {/* Mirrors the footer button's own branches, so the hint cannot promise a
              key the card in front of you does not answer to. It had two arms for
              four shapes, which told anyone on a multiple-choice card to press
              Space to flip and 1-4 to grade, where nothing flips and 1-4 picks
              an option instead. */}
          {ask === "intro"
            ? "Space for the next one"
            : ask === "type"
              ? (verdict ? "Enter to carry on" : "Enter to check")
              : ask === "choice"
                ? (chosen ? "Enter to carry on" : `1 to ${card?.choices?.length ?? 4} to pick`)
                : !revealed
                  ? "Space to flip"
                  : "1 not yet · 2 got it"}
        </span>
      </div>

      {pendingOffline > 0 && (
        <p className="mt-3 text-center text-xs" style={{ color: "var(--hard-ink)" }}>
          You&rsquo;re offline. {pendingOffline} grade{pendingOffline === 1 ? "" : "s"} saved here, sent once you reconnect.
        </p>
      )}
      {verdict && countsAsRecalled(verdict.verdict) && verdict.verdict !== "correct" && (
        <p className="sr-only" role="status">Close: {verdict.note}</p>
      )}
    </div>
  );
}
