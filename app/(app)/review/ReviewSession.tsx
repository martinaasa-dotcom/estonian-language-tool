"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { BookOpen, Check, Compass, Keyboard, MessageCircleQuestion, RotateCcw, Undo2, X, Zap } from "lucide-react";
import { gradeCard, undoGrade } from "@/app/actions";
import { Button, ButtonLink } from "@/components/Button";
import { EstonianInput } from "@/components/EstonianInput";
import { Chip, Empty, Meter, Page, StatTile } from "@/components/ui";
import { Mascot } from "@/components/brand";
import { Speak } from "@/components/Speak";
import { useAudioPrefs, useFeedbackSound } from "@/components/AudioPrefs";
import { prefetchClip } from "@/lib/audio/clip";
import { SuggestFix } from "@/components/SuggestFix";
import { StarWord } from "@/components/StarWord";
import { WordIntro } from "@/components/WordIntro";
import type { GlossedToken } from "@/lib/dict/glossed";
import { caseByKey } from "@/lib/estonian/cases";
import { plainAsk, plainAskLine } from "@/lib/estonian/plainAsk";
import { conjugationSlotFromFront, slotLabel } from "@/lib/srs/slots";
import { BLANK } from "@/lib/estonian/cloze";
import { checkAnswer, countsAsRecalled, type AnswerCheck } from "@/lib/estonian/answer";
import { SAME_SPELLING, sameSpelling } from "@/lib/copy/values";
import { enqueueGrade, readStashedSession, stashSession } from "@/lib/offline/db";
import { useOffline } from "@/components/OfflineProvider";
import type { ReviewMode } from "@/lib/settings/store";
import { previewIntervals, SELF_GRADES, type RatingValue, type SchedulingState } from "@/lib/srs/scheduler";
import { requeue } from "@/lib/srs/queue";
import { OPTION_CLASS, VERDICT_CLASS, VERDICT_PAUSE_MS, optionState, verdictOfCheck, verdictOfRating } from "@/lib/ux/verdict";
import { isAdvanceKey } from "@/lib/ux/advanceKey";

export interface ReviewCard {
  id: string;
  cardType: string;
  front: string;
  back: string;
  hint: string | null;
  targetCase: string | null;
  /** The conjugation slot a CONJUGATION card is about, as `CONJUGATION_SLOTS` spells it. */
  slot: string | null;
  lemma: string | null;
  /**
   * The dictionary entry behind the card, for the favorite button.
   *
   * Null on the handful of cards with no entry behind them, which is what the
   * `lemma` above is null on too, and the star is simply not drawn there:
   * there is nothing to keep.
   */
  lexemeId: string | null;
  /**
   * Other forms of this word, so another ending is not marked as a slip.
   *
   * `checkAnswer` reads anything within one edit as a typo and marks it as
   * produced, and every pair of Estonian cases is one letter apart: measured
   * over the shipped dictionary, 47,982 of 51,513 case answers have another
   * case of the same word one edit away. So the card told a learner who wrote
   * the seestütlev that they had mistyped the seesütlev, graded it Hard, and
   * wrote it into the append-only log as a recall. `lib/games/flash.ts` names
   * this fault and fixes it for its own round by asking the word's forms
   * first; these are those forms, on the screen a learner opens every day.
   *
   * Empty on a card with no entry behind it, and on a recognition card, whose
   * answer is English.
   */
  rivals: string[];
  /** Whether this word is already one of the learner's favorites. */
  starred: boolean;
  isNew: boolean;
  /**
   * What to show the first time this word is met, assembled by the page out of
   * the dictionary. Null on a card that has been seen, and on the rare card
   * with no dictionary entry behind it.
   */
  intro: {
    lemma: string;
    gloss: string;
    /**
     * The Institute's own equivalent in the learner's chosen language, or null.
     *
     * The first meeting is the one screen where this earns the most: it is the
     * moment the word is being learned rather than tested, and somebody who
     * already speaks Russian or Ukrainian reaches the meaning in one step
     * instead of two. Beside the English rather than instead of it, since the
     * English is the gloss every entry has. Comes from Ekilex, like the
     * sentence under it.
     */
    equivalent: { text: string; lang: string } | null;
    /** An attested sentence, and which form of the word it carries. */
    sentence: { et: string; en: string | null; form: string | null } | null;
    /** The entry it hangs off, so the sentence can be asked about in English. */
    lexemeId: string | null;
    /**
     * That sentence with the dictionary under every word it will vouch for.
     *
     * Ekilex holds no English for most usages, so the sentence that is meant to
     * show a word behaving was six unreadable words around one glossed one.
     * Null where the page did not look, which is a different thing from a
     * sentence nothing in the dictionary could be said about. See
     * `lib/dict/glossed.ts`.
     */
    tokens: GlossedToken[] | null;
    /** Whether this deployment has a model that could translate the whole line. */
    canTranslate: boolean;
    /**
     * Whether the entry is a whole utterance rather than a word.
     *
     * `Tere!` and `Kuidas läheb?` have no example sentence and never will, and
     * saying "no example sentence for this one yet" about them told a beginner
     * the app had let them down on twenty of the first cards it ever shows.
     */
    isPhrase: boolean;
  } | null;
  /** Four options including the right one, when this card can be asked as multiple choice. */
  choices: string[] | null;
  scheduling: Omit<SchedulingState, "due" | "lastReview"> & { due: string; lastReview: string | null };
}



/**
 * Which facet of a word this card is asking about.
 *
 * The case column where there is one, then `Card.slot`, which a conjugation
 * card carries since its front became a sentence with the form taken out, and
 * then the slot the front names, for a card built before the column existed
 * whose front is still `lugema → olevik · ta`. `slotOfCard` in
 * `lib/srs/slots.ts` is the same question answered from the columns alone.
 */
function slotAsked(card: ReviewCard): string {
  return card.targetCase ?? card.slot ?? conjugationSlotFromFront(card.front) ?? card.cardType;
}

/**
 * A front that is a sentence with the form taken out.
 *
 * The plain clause below is printed before the answer on a card whose front
 * already names what it wants (`hammas → kelle?`), where it cashes the name in.
 * On a gap it would name the case in front of the gap, which is the answer in
 * two pieces; the sentence is the ask there, and the clause is printed after
 * the answer instead, where it explains.
 */
const isGap = (card: ReviewCard) => card.front.includes(BLANK);

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
  // A conjugation card names its slot the same way, off `Card.slot`: the front
  // is a sentence now and carries no label, and the label is what the learner
  // wants the moment the answer appears and is not what they thought.
  const verbSlot = card.slot ? slotLabel(card.slot) : null;
  const question = card.targetCase
    ? `Why is the ${caseName} of "${card.lemma ?? card.front}" what it is? I keep getting this form wrong.`
    : verbSlot
      ? `Why is "${card.lemma ?? card.front}" in the ${verbSlot} what it is? I keep getting this form wrong.`
      : `Explain "${card.lemma ?? card.front}" to me, what does it mean and when would an Estonian use it?`;

  const pill =
    "press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-ui hover:-translate-y-px";

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
      {verbSlot && !card.targetCase && (
        <span className={pill} style={{ background: "var(--raised)", color: "var(--ink-2)" }} lang="et">
          {verbSlot}
        </span>
      )}
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

  return (
    <WordIntro
      key={card.id}
      lemma={lemma}
      gloss={gloss}
      equivalent={card.intro?.equivalent ?? null}
      sentence={card.intro?.sentence ?? null}
      tokens={card.intro?.tokens ?? null}
      lexemeId={card.intro?.lexemeId ?? null}
      canTranslate={card.intro?.canTranslate ?? false}
      isPhrase={card.intro?.isPhrase ?? false}
    >
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
    </WordIntro>
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
    : type === "PRODUCTION" || type === "CASE_FORM" || type === "GRADATION" || type === "CLOZE"
      || type === "CONJUGATION";

/**
 * Card types whose answer is a single Estonian form, and so can be typed and
 * checked exactly. `GOVERNMENT` is excluded on purpose: its answer is a
 * sentence-ish gloss ("partitive — aitan sind"), and marking that wrong on a
 * word order difference would be punishing the learner for the card's format.
 */
/*
  `CONJUGATION` joined the set when the card became a sentence with a form
  taken out: its answer was always a single vouched form and `checkAnswer`
  could always have marked it, and for a year it was a flip anyway.
*/
const TYPEABLE = new Set(["PRODUCTION", "CASE_FORM", "GRADATION", "CLOZE", "CONJUGATION"]);

type Ask = "intro" | "type" | "choice" | "flip";

/**
 * WHAT COUNTS AS HAVING MET A WORD.
 *
 * The word, not the card. `addCardsFor` writes a recognition card, a production
 * card and one per case the dictionary can build, so `Euroopa` alone is five
 * cards; keyed on the card id, each of them got its own introduction. Those
 * screens differ only in a line at the bottom saying what the card will ask
 * later, because the introduction shows the lemma, the gloss and a sentence and
 * none of that changes between a word's cards. Driven in a browser, that was
 * five near-identical screens for one word before a single question.
 *
 * Keyed on the lemma, a word is introduced once and its other cards are asked
 * straight away, which is what the meeting was for. `spreadSiblings` keeps
 * those questions apart; this only decides which of them teach.
 *
 * A card with no lemma behind it falls back to its own id, so it is its own
 * word. Reading a missing lemma as one shared key would collapse every such
 * card together and the rest would be asked having never been shown.
 */
function wordKey(card: ReviewCard): string {
  return card.intro?.lemma ?? card.lemma ?? card.id;
}

function askFor(card: ReviewCard, mode: ReviewMode, met: ReadonlySet<string>): Ask {
  /*
    A card you have never seen cannot be recalled, only met. Asking someone to
    produce a word they have not been shown is a guessing game that teaches
    nothing, so a new card leads with its answer.

    MEETING IT IS NOT ANSWERING IT, THOUGH. That screen used to end in
    `submit(3)`: the card was graded Good, in the append-only log, on a word
    the learner had done nothing with but read. The scheduler then set the
    first interval from a recall that never happened, and the next real
    question was the next day. Karpicke and Roediger measured what that costs:
    learners who kept retrieving new pairs inside the first session recalled
    about 80 percent a week later, against about 35 for those who only
    restudied, and the whole difference was whether retrieval happened while
    the word was being learned.

    So the meeting writes nothing, and the card comes back a few places later
    as the question it would ordinarily be. That retrieval is the grade.
  */
  if (card.isNew && !met.has(wordKey(card))) return "intro";

  /*
    A CARD THIS APP CAN MARK IS NEVER MARKED BY THE LEARNER.

    `TYPEABLE` is the set whose answer is a single Estonian form the dictionary
    vouches for, and `checkAnswer` compares against it, tells a dropped õ from
    a wrong word, and names the case the learner reached for instead. All of
    that was reachable, and one preference in Settings turned every one of
    those cards into a flip with "Not yet" and "Got it" under it. So the app
    held the answer, could have marked it, and asked the learner to mark it.

    That is not only a weaker question. The judgment goes into `Review`, which
    is append-only and is what the weakest-case panel, the mastery counter, the
    readiness rungs and the exam confidence figure are all derived from, so a
    number this app presents as measured was partly self-reported. The
    preference's own copy has always said so: "easier to fool yourself with".

    The preference is still honored, because "I would rather not type" is a
    real thing to want and typing on a phone is most of why. It is honored
    with four forms of the same word instead (`lib/questions/caseChoices.ts`),
    which is one tap exactly as "Got it" was one tap, and which measures. Where
    a card cannot be given options the honest answer is to ask for it typed
    rather than to hand the marking back.

    The flip survives where there is genuinely nothing to compare: a government
    card, whose answer is a gloss rather than a form, and speaking, where
    ADR-018 says the learner is the only judge there is.
  */
  if (TYPEABLE.has(card.cardType)) {
    if (mode === "type") return "type";
    return card.choices && card.choices.length > 1 ? "choice" : "type";
  }
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

export function ReviewSession({
  cards: initialCards, drillCase, drillUnit, drillScan, totalCards, mode, nextDue, title = "Review",
}: {
  cards: ReviewCard[];
  drillCase?: string;
  drillUnit?: string;
  /** A photographed page being drilled on its own: its id, and what it is called. */
  drillScan?: { id: string; title: string };
  totalCards: number;
  /**
   * What this screen is called, for the heading no round has room to draw.
   *
   * Two routes render this session, and the Flash cards round announced itself
   * as "Review" to a screen reader while its tab said "Flash cards". A screen
   * names itself, and it has to be the same name in both places.
   */
  title?: string;
  /**
   * One sentence saying when the next card comes back, or null.
   *
   * The only question an empty queue raises, and the one the caught-up screen
   * did not answer: it said "All 312 cards are scheduled for later", which is
   * a count the learner already knows. Worked out on the server, where the
   * learner's own zone lives, and only on the path where it is shown.
   */
  nextDue?: string | null;
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
  /*
    A MISS IS TYPED AGAIN BEFORE THE CARD GOES.

    The correction used to sit on the screen over a button reading "Got it",
    and a learner who pressed it had read the right form and produced
    nothing. Producing it is the part that sticks, so a typed card marked
    wrong or nearly right asks for the form once more, against the answer
    printed above, and only a correct retype lets the card move on. The grade
    is unchanged: the retype is rehearsal rather than a second answer, and
    the log records the miss the scheduler needs to see.
  */
  const [retyped, setRetyped] = useState("");
  const [retypeOk, setRetypeOk] = useState(false);
  const [retypeNote, setRetypeNote] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Done[]>([]);
  /*
    WHAT UNDO PUTS BACK IS WHAT THE SERVER LAST WROTE.

    `cards` is snapshotted on mount and its `scheduling` is deliberately never
    refreshed, which is right for the queue and was wrong here. An "Again" puts
    a card back into this same session, so a card can be graded twice, and both
    grades recorded the same mount-time state as the one to restore: undoing
    the second rewound past the first as well, dropping a lapse the learner
    really had made and sending a card they had just failed back out on its old
    interval.

    `gradeCard` already computes the next state in order to write it, so it
    hands it back and this is what the session remembers. A grade that could
    not reach the server leaves this untouched, which is exactly right: the row
    it describes was not updated either, and the outbox replays from whatever
    is actually there.
  */
  const scheduled = useRef(new Map<string, ReviewCard["scheduling"]>());
  /** Cards whose word has been met this session and which are now asked properly. */
  const [met, setMet] = useState<ReadonlySet<string>>(() => new Set());
  const [pendingOffline, setPendingOffline] = useState(0);
  const { pending: outboxPending, refresh: refreshOutbox } = useOffline();
  const shownAt = useRef(Date.now());
  const startedAt = useRef(Date.now());
  const { voice } = useAudioPrefs();
  const sound = useFeedbackSound();

  /*
    HOW MANY IN A ROW, WHICH IS WHAT THE RIGHT SOUND CLIMBS WITH.

    The two-note chime was the same every time, so the tenth card you got right
    sounded exactly like the first and a session had no shape to it. A run that
    goes up says what a counter would say and says it while you are already
    reading the next card, which is the one thing sound is better at than a
    number on a screen.

    A ref rather than state: nothing on the screen reads it, so putting it in
    state would re-render the card to change a frequency. Undo puts it back to
    nothing, because taking an answer back is not a run continuing.
  */
  const run = useRef(0);
  const cheer = useCallback((right: boolean) => {
    run.current = right ? run.current + 1 : 0;
    sound(right ? "right" : "wrong", run.current);
  }, [sound]);

  const card = queue[index];
  const finished = !card;
  const ask = card ? askFor(card, mode, met) : "flip";

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
    shownAt.current = Date.now();
    setRevealed(false);
    setTyped("");
    setVerdict(null);
    setChosen(null);
    setRetyped("");
    setRetypeOk(false);
    setRetypeNote(null);
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
    // What the card will play: on meeting it, the Estonian front or the lemma;
    // on the answer, the back whenever the back is the Estonian side, which is
    // every case, conjugation and gradation card. Both, so neither round-trips.
    const heard = new Set<string>();
    if (estonianSide(upcoming.cardType, "front") && upcoming.cardType !== "CLOZE") heard.add(upcoming.lemma ?? upcoming.front);
    else if (upcoming.intro?.lemma ?? upcoming.lemma) heard.add(upcoming.intro?.lemma ?? upcoming.lemma!);
    if (estonianSide(upcoming.cardType, "back")) heard.add(upcoming.back);
    for (const text of heard) prefetchClip({ text: spoken(text), voice });
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

  /**
   * The learner has met the word. Nothing is written, and the card comes back.
   *
   * `requeue` is the same helper the Again path uses, so a first meeting and a
   * miss are reinserted the same distance on: far enough that the answer is
   * not still on the screen, near enough that a short session still reaches
   * it. A session too short for the gap puts the card last, which is the best
   * a short session can do, and the card is asked either way.
   */
  const meetDone = useCallback(() => {
    if (!card || busy) return;
    setMet((m) => new Set(m).add(wordKey(card)));
    setQueue((q) => {
      const next = [...q];
      const [seen] = next.splice(index, 1);
      return seen ? requeue(next, seen, index) : next;
    });
    setRevealed(false);
    setTyped("");
    setVerdict(null);
    setChosen(null);
    setRetyped("");
    setRetypeOk(false);
    setRetypeNote(null);
    shownAt.current = Date.now();
  }, [card, busy, index]);

  const submit = useCallback(async (rating: RatingValue) => {
    if (!card || busy) return;
    setBusy(true);
    const duration = Date.now() - shownAt.current;
    const answeredAt = new Date().toISOString();
    const before = scheduled.current.get(card.id) ?? card.scheduling;

    /*
      EVERY CONTROL ON THIS SCREEN IS DISABLED WHILE A GRADE IS IN FLIGHT, SO
      THE FLAG HAS TO COME BACK OFF WHATEVER HAPPENS.

      It used to be cleared on the last line, and the offline branch below
      `await`s a write to IndexedDB: a browser with storage blocked, a private
      window, or a device with no room left rejects it, the exception leaves
      this function, and `busy` stays true for ever. The card then sits there
      with a button that exists, is visible, and can never be pressed, which is
      the least useful shape a failure can take. A lost grade is bad; a session
      the learner cannot carry on with is worse, and the outbox count on screen
      is what tells them either way.
    */
    try {
    try {
      const result = await gradeCard(card.id, rating, duration, answeredAt);
      if (!result.ok) throw new Error(result.error);
      scheduled.current.set(card.id, result.scheduling);
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
    if (rating >= 3) setCorrect((c) => c + 1);
    setHistory((h) => [...h, { cardId: card.id, index, rating, before }]);

    // "Again" means it is not learned — put it back near the end of this session.
    if (rating === 1) {
      setQueue((q) => {
        const next = [...q];
        const [failed] = next.splice(index, 1);
        // The same distance a newly met word waits: see `requeue`.
        return failed ? requeue(next, failed, index) : next;
      });
      setRevealed(false);
      setTyped("");
      setVerdict(null);
      setChosen(null);
      setRetyped("");
      setRetypeOk(false);
      setRetypeNote(null);
      shownAt.current = Date.now();
    } else {
      setIndex((i) => i + 1);
    }
    } finally {
      setBusy(false);
    }
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
      scheduled.current.set(last.cardId, last.before);
      setHistory((h) => h.slice(0, -1));
      setDone((d) => Math.max(0, d - 1));
      if (last.rating >= 3) setCorrect((c) => Math.max(0, c - 1));
      // Taking an answer back is not a run continuing.
      run.current = 0;
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
    const result = checkAnswer(typed, card.back, language, card.rivals);
    setVerdict(result);
    setRevealed(true);
    cheer(countsAsRecalled(result.verdict));
    if (result.verdict === "wrong" && typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(60);
    }
    // Right answers move on by themselves, the way a picked choice already
    // does. Typing the word correctly and then being asked to confirm that you
    // typed the word correctly is a click on the most common outcome in the
    // app. A miss keeps its screen: that is the one moment worth stopping at,
    // and the correction needs typing before anything moves.
    if (result.verdict === "correct") {
      window.setTimeout(() => void submit(result.suggestedRating), VERDICT_PAUSE_MS);
    }
  }, [card, typed, verdict, submit, cheer]);

  /** Whether the card is waiting for the miss to be typed again. */
  const needsRetype = ask === "type" && verdict !== null && verdict.verdict !== "correct" && !retypeOk;

  const checkRetype = useCallback(() => {
    if (!card || !verdict || retypeOk) return;
    const language = card.cardType === "RECOGNITION" ? "en" : "et";
    const again = checkAnswer(retyped, card.back, language, card.rivals);
    if (again.verdict === "correct") {
      setRetypeOk(true);
      setRetypeNote(null);
      // The pause a right answer gets, then the grade the miss already earned.
      window.setTimeout(() => void submit(verdict.suggestedRating), VERDICT_PAUSE_MS);
    } else {
      setRetypeNote("Not yet. Copy the answer above exactly, letter for letter.");
    }
  }, [card, verdict, retyped, retypeOk, submit]);

  const pickChoice = useCallback((choice: string) => {
    if (!card || chosen) return;
    setChosen(choice);
    setRevealed(true);
    const right = choice === card.back;
    cheer(right);
    if (!right && typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(60);
    if (right) {
      // Right answers move on by themselves: multiple choice is the fast mode,
      // and a confirmation click on every correct card halves the throughput.
      // Not before the tile has been seen to turn, though (`VERDICT_PAUSE_MS`).
      window.setTimeout(() => void submit(3), VERDICT_PAUSE_MS);
    }
  }, [card, chosen, submit, cheer]);

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

      if (isAdvanceKey(e)) {
        // While the answer box has focus it owns both keys: a space belongs in
        // the answer, and Enter is the input's own "check this". React flushes
        // discrete events synchronously, so without this the *same* Enter would
        // be seen again here after the re-render — with the verdict already
        // set — and would grade the card before it had been read.
        if (typing) return;
        e.preventDefault();
        if (ask === "intro") { meetDone(); return; }
        if (ask === "type" && !verdict) { checkTyped(); return; }
        // A miss waits for its retype, which the answer box handles itself.
        if (ask === "type" && verdict) { if (!needsRetype && !retypeOk) void submit(verdict.suggestedRating); return; }
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
  }, [answerShown, revealed, submit, finished, ask, verdict, checkTyped, chosen, card, pickChoice, meetDone, undo, history.length, needsRetype, retypeOk]);

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
            body={nextDue ?? `All ${totalCards} cards are scheduled for later.`}
            action={<ButtonLink href="/learn/new" variant="primary">Learn new words instead</ButtonLink>}
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

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile value={done} label="Reviewed" tone="accent" />
          <StatTile value={`${accuracy}%`} label="Recalled" tone={accuracy >= 85 ? "mint" : "butter"} />
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
          <ButtonLink href="/practice" size="lg"><Zap size={15} aria-hidden /> Play a round</ButtonLink>
          <ButtonLink href="/learn/new" size="lg">Learn new words</ButtonLink>
          <ButtonLink href="/" variant="primary" size="lg">Back to Today</ButtonLink>
        </div>
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
      <h1 className="sr-only">{title}</h1>
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
        <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3" style={{ borderColor: "var(--rule-soft)" }}>
          <Chip tone="accent">{TYPE_LABEL[card.cardType] ?? card.cardType}</Chip>
          {card.isNew && <Chip tone="good">New word</Chip>}
          {drillCase && <Chip tone="hard">{drillCase.toLowerCase()} drill</Chip>}
          {drillScan && <Chip tone="sky">{drillScan.title}</Chip>}
          <div className="ml-auto flex items-center gap-1">
            {card.lemma && (
              <Link
                href={`/dictionary?q=${encodeURIComponent(card.lemma)}`}
                className="flex items-center gap-1.5 text-xs font-semibold transition-opacity hover:opacity-60"
                style={{ color: "var(--ink-3)" }}
              >
                <BookOpen size={13} aria-hidden /> Full entry
              </Link>
            )}
            {/* The corner of the card, which is where somebody looks for this
                the moment a word turns out to be worth keeping. */}
            {card.lexemeId && (
              <StarWord
                lexemeId={card.lexemeId}
                starred={card.starred}
                label={card.lemma ?? card.front}
              />
            )}
          </div>
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

          {/*
            WHAT THE CARD IS ASKING, BEFORE WHAT IT IS CALLED.

            A `CASE_FORM` card's front is `tuba → milles? kus?` and its hint
            is `seesütlev · the inessive`, which is the naming rule this app
            follows and is two names and no instruction. A learner drove the
            flash round and reported that they could not tell what was being
            asked of them; the same is true here, on the daily path, and it is
            worth more here. So the plain sentence goes between the two: the
            question stays where it was, the name stays where it was, and
            somebody who has not met `seesütlev` yet can still answer the card.
          */}
          {(isGap(card) ? answerShown : !answerShown) && plainAsk(slotAsked(card)) && (
            <p className="text-[13.5px]" style={{ color: "var(--ink-2)" }}>
              {plainAskLine(slotAsked(card))}
            </p>
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
                className={`${verdict.verdict === "correct" ? "pop-in" : "shake"} ${VERDICT_CLASS[verdictOfCheck(verdict.verdict)]} rounded-md px-4 py-2.5 text-sm`}
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
              {verdict.verdict !== "correct" && (
                <div className="mt-4 text-left">
                  {retypeOk ? (
                    <p className={`pop-in ${VERDICT_CLASS.right} rounded-md px-4 py-2.5 text-sm`}>
                      Õige! That is the one.
                    </p>
                  ) : (
                    <>
                      <label htmlFor="retype" className="label-xs mb-2 block" style={{ color: "var(--ink-3)" }}>
                        Now type it again
                      </label>
                      <EstonianInput
                        id="retype"
                        value={retyped}
                        onChange={(v) => { setRetyped(v); setRetypeNote(null); }}
                        onEnter={checkRetype}
                        ariaLabel="Type the answer again"
                        autoFocus
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
                const state = optionState(choice === card.back, choice === chosen);
                return (
                  <div
                    key={choice}
                    className={`${OPTION_CLASS[state]} flex items-center gap-3 rounded-[var(--r)] border px-4 py-3.5 text-left text-base font-medium`}
                  >
                    <span className="flex-1">{choice}</span>
                    {state === "right" && <Check size={16} aria-label="Right" />}
                    {state === "wrong" && <X size={16} aria-label="Your pick" />}
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
                    <span data-answer style={{ color: "var(--accent-deep)", fontWeight: 600 }}>{card.back}</span>
                    {card.front.split(BLANK)[1]}
                  </p>
                  <Speak text={card.front.replace(BLANK, card.back)} label="Hear the whole sentence" autoplay />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p
                    lang={backLang}
                    data-answer
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

              {/* Turning the answer over and finding the question is a card
                  that looks broken. It is a real fact about the word, so it is
                  said in words. */}
              {answerShown && sameSpelling(card.front, card.back) && (
                <p className="text-xs" style={{ color: "var(--ink-3)" }}>{SAME_SPELLING}</p>
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

        <div className="border-t px-6 py-4" style={{ borderColor: "var(--rule-soft)" }}>
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
            <Button variant="primary" size="lg" className="w-full" onClick={meetDone} disabled={busy}>
              Got it, ask me later
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
               review worth slowing down for: the correction is on screen, the
               form has to be typed once more, and this button checks that
               rather than grading anything. */
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={needsRetype ? checkRetype : () => void submit(verdict.suggestedRating)}
              disabled={busy || retypeOk}
            >
              {needsRetype ? "Check it again" : "Got it, next"}
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
                  className={`${VERDICT_CLASS[verdictOfRating(g.rating)]} press flex flex-col items-center gap-0.5 rounded-[var(--r)] px-2 py-3.5 transition-ui hover:-translate-y-0.5 disabled:opacity-40`}
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
              ? (verdict ? (needsRetype ? "Type it again, then Enter" : "Enter to carry on") : "Enter to check")
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
