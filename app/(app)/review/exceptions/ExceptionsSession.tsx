"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CircleAlert, TriangleAlert, X } from "lucide-react";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { gradeCard } from "@/app/actions";
import { Button, ButtonLink } from "@/components/Button";
import { DiacriticBar } from "@/components/DiacriticBar";
import { SpeakPair } from "@/components/Speak";
import { useFeedbackSound } from "@/components/AudioPrefs";
import { useOffline } from "@/components/OfflineProvider";
import { enqueueGrade } from "@/lib/offline/db";
import { Chip, Stat } from "@/components/ui";
import { StarWord } from "@/components/StarWord";
import { markForm, type FlashMark } from "@/lib/games/flash";
import { departureLine, rungLine, type ExceptionTask } from "@/lib/games/exceptions";
import { grammarTopic } from "@/lib/estonian/grammar";
import { AlsoRight } from "@/components/WordExceptions";
import { plainAskLine } from "@/lib/estonian/plainAsk";
import { VERDICT_CLASS, VERDICT_INK, verdictOfRating } from "@/lib/ux/verdict";

/**
 * THE ROUND: MEET IT, TYPE IT, USE IT.
 *
 * One runner rather than `ReviewSession`, for the reason the flash round gives
 * about itself: a review card is a front and a back, and the first rung here
 * has no back to turn over. What it does share is everything that would be a
 * bug to reimplement. `markForm` is the flash round's own marker, split out
 * rather than copied, so the two screens cannot start disagreeing about whether
 * `toast` is a slip or the wrong case; the grade goes through `gradeCard` and
 * into the same outbox when the connection is down (ADR-015, ADR-016).
 *
 * MEETING WRITES NOTHING, which is the rule the review card learned the
 * expensive way: a card you have never seen cannot be recalled, only met, and
 * grading a form somebody has just been shown sets an interval from a recall
 * that did not happen. The rung is a teaching screen, and the round asks for
 * the form again once every word has been met.
 */
export function ExceptionsSession({ tasks: initialTasks }: { tasks: ExceptionTask[] }) {
  /*
    Snapshotted once on mount. `gradeCard` is a Server Action and Next
    re-renders this route's Server Component after every call, which would deal
    a fresh round under somebody still reading their feedback. Every mode that
    grades froze its queue for this reason.
  */
  const [tasks] = useState(initialTasks);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [mark, setMark] = useState<FlashMark | null>(null);
  const [right, setRight] = useState(0);
  const [asked, setAsked] = useState(0);
  const shownAt = useRef(Date.now());
  const startedAt = useRef(Date.now());
  const sound = useFeedbackSound();
  const { refresh: refreshOutbox } = useOffline();

  const task = tasks[index];
  const finished = !task;
  const meeting = task?.rung === "meet";

  const check = useCallback(async () => {
    if (!task || mark || task.rung === "meet") return;
    const result = markForm(task, typed);
    setMark(result);
    setAsked((n) => n + 1);
    sound(result.right ? "right" : "wrong", 0);
    if (result.right) setRight((n) => n + 1);

    // Nothing to move where the word is not in the deck. See the page: there
    // is no schedule to write to, and inventing a card behind the learner is
    // worse than writing nothing.
    if (!task.cardId) return;

    const duration = Date.now() - shownAt.current;
    const answeredAt = new Date().toISOString();
    /*
      The ending they reached for instead, where the marker could name one.
      `writeGrade` checks it again rather than trusting it, since this is a
      public endpoint and the row is permanent.
    */
    const reached = result.wroteSlot && result.wroteSlot !== task.slot
      ? result.wroteSlot
      : undefined;
    try {
      const res = await gradeCard(
        task.cardId, result.rating, duration, answeredAt, task.slot, reached,
      );
      if (!res.ok) throw new Error(res.error);
    } catch {
      await enqueueGrade({
        id: crypto.randomUUID(),
        cardId: task.cardId,
        rating: result.rating,
        durationMs: duration,
        reviewedAt: Date.parse(answeredAt),
        slot: task.slot,
        reachedSlot: reached,
      });
      refreshOutbox();
    }
  }, [task, typed, mark, sound, refreshOutbox]);

  const next = useCallback(() => {
    setMark(null);
    setTyped("");
    setIndex((i) => i + 1);
    shownAt.current = Date.now();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      if (mark || meeting) { e.preventDefault(); next(); return; }
      e.preventDefault();
      void check();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mark, meeting, next, check]);

  if (finished) {
    const minutes = Math.max(1, Math.round((Date.now() - startedAt.current) / 60000));
    return (
      <div className="mx-auto max-w-2xl px-5 py-16 md:px-10">
        <h1 className="text-[32px] font-bold tracking-tight" style={{ color: "var(--ink)" }}>
          Round complete
        </h1>
        <p className="mt-2 text-[15px]" style={{ color: "var(--ink-2)" }}>
          These are the forms no rule reaches. A few at a time, often, is how they stick.
        </p>
        <div
          className="mt-8 grid grid-cols-3 gap-6 rounded-lg border p-6"
          style={{ borderColor: "var(--rule)", background: "var(--surface)" }}
        >
          <Stat value={asked} label="Asked" />
          <Stat
            value={asked > 0 ? `${Math.round((right / asked) * 100)}%` : "0%"}
            label="Right"
            tone={VERDICT_INK[asked > 0 && right === asked ? "right" : "nearly"]}
          />
          <Stat value={`${minutes}m`} label="Time" />
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/grammar/exceptions" variant="primary">See the whole list</ButtonLink>
          <ButtonLink href="/review/exceptions">Another round</ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-5 py-6 md:px-10 md:py-10">
      {/* The heading a session screen has no room to draw. Every mode carries
          one, since an empty state with a heading and a round without it is an
          accessibility run that passes on the wrong screen. */}
      <h1 className="sr-only">Exceptions</h1>
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link href="/practice" aria-label="End session" className="rounded p-1" style={{ color: "var(--ink-3)" }}>
          <X size={19} aria-hidden />
        </Link>
        <div className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: "var(--raised)" }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${(index / tasks.length) * 100}%`, background: "var(--accent)" }}
            role="progressbar"
            aria-valuenow={index}
            aria-valuemin={0}
            aria-valuemax={tasks.length}
            aria-label="Round progress"
          />
        </div>
        <span className="tnum text-sm" style={{ color: "var(--ink-3)" }}>
          {tasks.length - index} left
        </span>
      </div>

      <div
        className="rounded-xl border"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow)" }}
      >
        <div
          className="flex flex-wrap items-center gap-2 border-b px-6 py-3"
          style={{ borderColor: "var(--rule-soft)" }}
        >
          <Chip tone="accent">{rungLine(task)}</Chip>
          {/*
            AND NOT THE ALTERNATION CHIP.

            `k : ∅` beside `vihkama` is true, is the same fact the dictionary
            entry carries, and was reported by somebody driving this round as
            not telling them anything: a learner mid-round is not reading a
            reference, and on the two rungs that ask for a form it sat above
            the box as a hint at the very letters the answer turns on. The
            entry keeps it (`ExceptionNote`), where a chip beside a word is
            what somebody came for.
          */}
          {/* The corner of the card, which is where somebody looks for this
              the moment a word turns out to be worth keeping. */}
          <div className="ml-auto">
            <StarWord lexemeId={task.lexemeId} starred={task.starred} label={task.lemma} />
          </div>
        </div>

        <div className="px-6 py-8">
          {meeting ? <Meeting task={task} /> : <Asking task={task} />}

          {!meeting && (
            <div className="mt-7">
              <label htmlFor="answer" className="label-xs block" style={{ color: "var(--ink-3)" }}>
                Your answer
              </label>
              <input
                id="answer"
                value={typed}
                lang="et"
                autoFocus
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                disabled={!!mark}
                onChange={(e) => setTyped(e.target.value)}
                className="field-lg mt-2 w-full text-[19px] disabled:opacity-70"
                style={{ borderColor: "var(--rule)", background: "var(--raised)", color: "var(--ink)" }}
              />
              {!mark && <div className="under-field"><DiacriticBar /></div>}
            </div>
          )}

          {mark && <Feedback task={task} mark={mark} />}
        </div>

        <div className="border-t px-6 py-4" style={{ borderColor: "var(--rule-soft)" }}>
          {meeting ? (
            <Button variant="primary" className="w-full py-3" onClick={next} autoFocus>
              Got it <kbd className="ml-1">↵</kbd>
            </Button>
          ) : !mark ? (
            <Button
              variant="primary"
              className="w-full py-3"
              disabled={typed.trim().length === 0}
              onClick={() => void check()}
            >
              Check it <kbd className="ml-1">↵</kbd>
            </Button>
          ) : (
            <Button variant="primary" className="w-full py-3" onClick={next} autoFocus>
              Next <kbd className="ml-1">↵</kbd>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The teaching rung: the form, what it departs from, and nothing to answer.
 *
 * The form leads and the pattern is described in words under it. What is
 * deliberately absent is the form the pattern would have given, unless that
 * form is also right: `toasse` is correct Estonian and is printed, and the
 * partitive the ending rule would build for `aeg` is not a word at all.
 * Printing one with a line through it would be this app writing Estonian and
 * hoping nobody memorized it (ADR-005).
 */
function Meeting({ task }: { task: ExceptionTask }) {
  return (
    <div>
      <p lang="et" className="text-[32px] font-bold leading-tight" style={{ color: "var(--ink)" }}>
        {task.lemma}
      </p>
      {task.translation && (
        <p className="text-[15px]" style={{ color: "var(--ink-2)" }}>{task.translation}</p>
      )}

      {task.accepted.length > 0 && (
        <div
          className="mt-6 rounded-md border px-3.5 py-3"
          style={{ borderColor: "var(--rule)", background: "var(--raised)" }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <p lang="et" className="text-[27px] font-semibold leading-tight" style={{ color: "var(--ink)" }}>
              {task.accepted.join(" / ")}
            </p>
            <SpeakPair text={task.accepted[0] ?? task.lemma} />
          </div>
          <p lang="et" className="mt-1 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
            {task.label}
          </p>
        </div>
      )}

      <p className="mt-5 flex items-start gap-2 text-[15px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
        <TriangleAlert size={16} aria-hidden className="mt-1 shrink-0" style={{ color: "var(--ink-3)" }} />
        <span>{departureLine(task)}</span>
      </p>

      {/*
        Both spellings named, rather than a pair with a paragraph about the
        dictionary under it. `AlsoRight` is the one drawing of that sentence,
        shared with the entry, so the round and the dictionary cannot disagree
        about which of `tuppa` and `toasse` is the short one.
      */}
      <AlsoRight
        short={task.accepted[0] ?? null}
        long={task.alsoRight}
        className="mt-3 text-[13.5px]"
      />

      <MoreOnThis task={task} className="mt-4 text-[13.5px]" />
    </div>
  );
}

/**
 * WHAT THE FORM IS FOR, WHICH IS THE QUESTION THE ROUND WAS NOT ANSWERING.
 *
 * A learner drove this and said it was not clear why they were being shown
 * `vihata`. Everything on the screen was about where the form departs from the
 * pattern, and nothing was about the sentence anybody would ever put it in: the
 * `da`-infinitive is the form after wanting and being able, and a round that
 * teaches the spelling without that has taught a string.
 *
 * The line is "more on this" rather than "where you need it", because the same
 * link has to be honest for the stem, whose page is about why the stem moves
 * rather than about a sentence to put it in. The topic's own title carries the
 * rest, which is what stops this being a second description of the page.
 *
 * A LINK RATHER THAN A PARAGRAPH, because which verbs govern which infinitive
 * is a page's worth of fact and `lib/estonian/grammar.ts` already holds it,
 * correctly and with no Estonian typed into it. Saying it again here is the
 * second copy that goes wrong, which is exactly how this kind came to claim the
 * everyday verb for must takes the `da` form when it takes the other one.
 */
function MoreOnThis({ task, className }: { task: ExceptionTask; className?: string }) {
  const topic = task.topic ? grammarTopic(task.topic) : undefined;
  if (!topic) return null;
  return (
    <p className={className} style={{ color: "var(--ink-3)" }}>
      More on this:{" "}
      <Link
        href={`/grammar/topic/${task.topic}`}
        className="font-semibold underline underline-offset-2"
        style={{ color: "var(--accent-deep)" }}
      >
        {topic.title}
      </Link>
    </p>
  );
}

/** The two rungs that ask for something: cold, then inside a sentence. */
function Asking({ task }: { task: ExceptionTask }) {
  const plain = plainAskLine(task.slot);

  if (task.rung === "use") {
    return (
      <div>
        <p lang="et" className="text-[22px] font-semibold leading-snug" style={{ color: "var(--ink)" }}>
          {task.gapped}
        </p>
        {/*
          The meaning rather than the dictionary form, which is the rule the
          gap-fill card learned: printing the lemma beside a gap that wants the
          lemma hands the answer over, and this gap wants a form built on it.
        */}
        <p className="mt-4 text-[15px]" style={{ color: "var(--ink-2)" }}>
          The missing word means <strong style={{ color: "var(--ink)" }}>{task.translation}</strong>.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p lang="et" className="text-[32px] font-bold leading-tight" style={{ color: "var(--ink)" }}>
        {task.lemma}
      </p>
      {/* Dropped where the gloss says the answer: `saun` is "sauna". */}
      {task.translation && (
        <p className="text-[15px]" style={{ color: "var(--ink-2)" }}>{task.translation}</p>
      )}
      <div className="mt-5">
        {plain ? (
          <>
            <p className="text-[22px] font-semibold leading-snug" style={{ color: "var(--ink)" }}>
              {plain}
            </p>
            <p lang="et" className="mt-1.5 text-[13.5px]" style={{ color: "var(--ink-3)" }}>
              {task.label}
            </p>
          </>
        ) : (
          <p lang="et" className="text-2xl font-semibold" style={{ color: "var(--accent-deep)" }}>
            {task.label}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * What happened, painted the way the rest of the app paints it.
 *
 * Three outcomes rather than two, because the marker returns three: the right
 * word in the wrong ending is a `nearly`, and flattening it into the same box
 * as a blank is what this round exists to stop somebody doing in their head.
 * The hue is never the only thing carrying it, so the heading says which.
 */
function Feedback({ task, mark }: { task: ExceptionTask; mark: FlashMark }) {
  const verdict = mark.right ? "right" : verdictOfRating(mark.rating);
  const head = { right: "That is it", nearly: "Nearly", wrong: "Not this time" }[verdict];

  return (
    <div className="mt-6" aria-live="polite">
      <div className={`${VERDICT_CLASS[verdict]} flex items-start gap-2.5 rounded-md px-3.5 py-3`}>
        {mark.right
          ? <Check size={16} className="mt-0.5 shrink-0" aria-hidden />
          : <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />}
        <p className="text-[15px]">
          <strong className="font-semibold">{head}.</strong>
          {mark.note && <> {mark.note}</>}
        </p>
      </div>

      <div
        className="mt-4 rounded-md border px-3.5 py-3"
        style={{ borderColor: "var(--rule)", background: "var(--raised)" }}
      >
        <p
          lang="et"
          data-exception-answer=""
          className="text-[22px] font-semibold leading-tight"
          style={{ color: "var(--ink)" }}
        >
          {task.accepted.join(" / ")}
        </p>
        <p lang="et" className="mt-1 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
          {task.label}
        </p>
      </div>

      <p className="mt-4 text-[13.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
        {departureLine(task)}
      </p>

      <p className="mt-3 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
        <Link
          href={`/grammar/exceptions/${task.kind.toLowerCase()}`}
          className="font-semibold underline underline-offset-2"
          style={{ color: "var(--accent-deep)" }}
        >
          The other words that do this
        </Link>
      </p>

      <MoreOnThis task={task} className="mt-1.5 text-[12.5px]" />
    </div>
  );
}
