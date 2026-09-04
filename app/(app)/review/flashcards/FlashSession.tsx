"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CircleAlert, X } from "lucide-react";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { gradeCard } from "@/app/actions";
import { Button, ButtonLink } from "@/components/Button";
import { DiacriticBar } from "@/components/DiacriticBar";
import { SpeakPair } from "@/components/Speak";
import { useFeedbackSound } from "@/components/AudioPrefs";
import { Chip, Meter, Stat } from "@/components/ui";
import { useOffline } from "@/components/OfflineProvider";
import { enqueueGrade } from "@/lib/offline/db";
import { splitOnForm } from "@/lib/dict/examples";
import { askLine, markFlash, plainAskFor, type FlashMark, type FlashTask } from "@/lib/games/flash";
import { MAX_SENTENCE_CHARS } from "@/lib/estonian/writing";
import { englishName } from "@/lib/games/flash";
import { caseByKey } from "@/lib/estonian/cases";

/** A task, plus where the word stands, which is the thing the round is moving. */
export interface FlashPrompt extends FlashTask {
  progress: { correct: number; needCorrect: number; slots: number; needSlots: number };
}

/**
 * THE ROUND.
 *
 * One word, one form, one of five shapes, and a box. It renders its own runner
 * rather than `ReviewSession` because the two ask different questions: a review
 * card is a front and a back, and three of these shapes have no back to turn
 * over. What it does share is everything that would be a bug to reimplement,
 * which is the grading path: `gradeCard`, the durable outbox behind it, the
 * learner's own voice and feedback sounds, and the letter bar.
 *
 * The mark is worked out here rather than on the server, and everything it
 * needs travels with the task. That is the same arrangement every review card
 * has always had, since a card carries its own answer, and it is what lets a
 * round carry on when the connection goes: the grade goes to the outbox and is
 * replayed with the slot it was about (ADR-015).
 */
export function FlashSession({ prompts: initialPrompts }: { prompts: FlashPrompt[] }) {
  /*
    Snapshotted once. `gradeCard` is a Server Action and Next re-renders this
    route's Server Component after every call, which would hand down a freshly
    drawn round and change the question under somebody still reading their
    feedback. Every mode that grades froze its queue for this reason.
  */
  const [prompts] = useState(initialPrompts);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [mark, setMark] = useState<FlashMark | null>(null);
  const [right, setRight] = useState(0);
  const [streak, setStreak] = useState(0);
  const [heardLost, setHeardLost] = useState(false);
  const shownAt = useRef(Date.now());
  const startedAt = useRef(Date.now());
  const sound = useFeedbackSound();
  const { refresh: refreshOutbox } = useOffline();

  const task = prompts[index];
  const finished = !task;

  /*
    A `heard` task with no sound is asked the plain way rather than abandoned.

    The browser refuses to play on a page nobody has touched yet, which is not
    a failure and leaves the button in place to be pressed; a clip that cannot
    be fetched at all takes the button away, and that is this. Falling back to
    the lemma and the form asks the same slot with the same answer, which is
    the one thing that has to survive: the round is about the word.
  */
  const shape = task?.shape === "heard" && heardLost ? "inflect" : task?.shape;

  const check = useCallback(async () => {
    if (!task || mark) return;
    const result = markFlash(task, typed);
    setMark(result);
    sound(result.right ? "right" : "wrong", result.right ? streak + 1 : 0);
    if (result.right) { setRight((n) => n + 1); setStreak((s) => s + 1); } else setStreak(0);

    const duration = Date.now() - shownAt.current;
    const answeredAt = new Date().toISOString();
    /*
      The ending they reached for instead, which this round has always known
      and has only ever said out loud. `markFlash` names it to print "That is
      the seestütlev. This one wanted the seesütlev.", and that sentence was
      the whole life of the fact: it left the screen with the card.

      Only where it differs from what was asked, since `markFlash` also
      returns the asked slot on a clean hit and on a typo. `writeGrade` checks
      that again rather than trusting it, because this is a public endpoint.
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
      // The grade is still a fact about something the learner did, and the slot
      // is half of what makes it worth recording here: replayed without it, an
      // answer about the kaasaütlev would go down as an answer about whatever
      // the card happens to be.
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
  }, [task, typed, mark, sound, streak, refreshOutbox]);

  const next = useCallback(() => {
    setMark(null);
    setTyped("");
    setHeardLost(false);
    setIndex((i) => i + 1);
    shownAt.current = Date.now();
  }, []);

  /*
    Enter checks, and then Enter moves on. One key for the whole round, which
    is what makes a typed round fast enough to be worth doing on a phone.
    `build` is a textarea and takes the modifier, since a sentence sometimes
    wants a line break.
  */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      if (mark) { e.preventDefault(); next(); return; }
      if (shape === "build" && !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      void check();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mark, next, check, shape]);

  if (finished) {
    const minutes = Math.max(1, Math.round((Date.now() - startedAt.current) / 60000));
    return (
      <div className="mx-auto max-w-2xl px-5 py-16 md:px-10">
        <h1 className="text-[32px] font-bold tracking-tight" style={{ color: "var(--ink)" }}>
          Round complete
        </h1>
        <p className="mt-2 text-[15px]" style={{ color: "var(--ink-2)" }}>
          Every answer counted towards the word it was about.
        </p>
        <div
          className="mt-8 grid grid-cols-3 gap-6 rounded-lg border p-6"
          style={{ borderColor: "var(--rule)", background: "var(--surface)" }}
        >
          <Stat value={prompts.length} label="Asked" />
          <Stat
            value={`${Math.round((right / prompts.length) * 100)}%`}
            label="Right"
            tone={right === prompts.length ? "var(--good)" : "var(--hard)"}
          />
          <Stat value={`${minutes}m`} label="Time" />
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/words/mastery" variant="primary">Where your words stand</ButtonLink>
          <ButtonLink href="/review/flashcards">Another round</ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-5 py-6 md:px-10 md:py-10">
      {/* The heading a session screen has no room to draw. Every mode carries
          one: the empty state had a heading and the round did not, so an
          accessibility run that met an empty deck saw one and passed. */}
      <h1 className="sr-only">Flash cards</h1>
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link href="/practice" aria-label="End session" className="rounded p-1" style={{ color: "var(--ink-3)" }}>
          <X size={19} aria-hidden />
        </Link>
        <div className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: "var(--raised)" }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${(index / prompts.length) * 100}%`, background: "var(--accent)" }}
            role="progressbar"
            aria-valuenow={index}
            aria-valuemin={0}
            aria-valuemax={prompts.length}
            aria-label="Round progress"
          />
        </div>
        <span className="tnum text-sm" style={{ color: "var(--ink-3)" }}>
          {prompts.length - index} left
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
          <Chip tone="accent">{askLine({ ...task, shape: shape ?? task.shape })}</Chip>
          {task.provenance === "derived" && <Chip>worked out from the stem</Chip>}
        </div>

        <div className="px-6 py-8">
          <Question task={task} shape={shape ?? task.shape} onNoAudio={() => setHeardLost(true)} />

          <div className="mt-7">
            <label htmlFor="answer" className="label-xs block" style={{ color: "var(--ink-3)" }}>
              {shape === "build" ? "Your sentence" : "Your answer"}
            </label>
            {shape === "build" ? (
              <textarea
                id="answer"
                value={typed}
                lang="et"
                rows={3}
                maxLength={MAX_SENTENCE_CHARS}
                disabled={!!mark}
                autoFocus
                onChange={(e) => setTyped(e.target.value)}
                placeholder="Kirjuta oma lause siia…"
                className="mt-2 w-full resize-none rounded-md border px-3.5 py-3 text-[17px] disabled:opacity-70"
                style={{ borderColor: "var(--rule)", background: "var(--raised)", color: "var(--ink)" }}
              />
            ) : (
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
                className="mt-2 w-full rounded-md border px-3.5 py-3 text-[19px] disabled:opacity-70"
                style={{ borderColor: "var(--rule)", background: "var(--raised)", color: "var(--ink)" }}
              />
            )}
            {!mark && <div className="mt-2"><DiacriticBar /></div>}
          </div>

          {mark && <Feedback task={task} mark={mark} />}
        </div>

        <div className="border-t p-4" style={{ borderColor: "var(--rule-soft)" }}>
          {!mark ? (
            <Button
              variant="primary"
              className="w-full py-3"
              disabled={typed.trim().length === 0}
              onClick={() => void check()}
            >
              Check it <kbd className="ml-1">{shape === "build" ? "⌘↵" : "↵"}</kbd>
            </Button>
          ) : (
            <Button variant="primary" className="w-full py-3" onClick={next} autoFocus>
              Next <kbd className="ml-1">↵</kbd>
            </Button>
          )}
        </div>
      </div>

      <Standing task={task} />
    </div>
  );
}

/** What the learner is looking at, which is a different thing in each shape. */
function Question({
  task, shape, onNoAudio,
}: { task: FlashPrompt; shape: FlashTask["shape"]; onNoAudio: () => void }) {
  const meaning = (
    <p className="text-[15px]" style={{ color: "var(--ink-2)" }}>{task.translation}</p>
  );
  const word = (
    <p lang="et" className="text-[32px] font-bold leading-tight" style={{ color: "var(--ink)" }}>
      {task.lemma}
    </p>
  );

  if (shape === "recall") {
    return (
      <div>
        <p className="text-[32px] font-bold leading-tight" style={{ color: "var(--ink)" }}>
          {task.translation}
        </p>
        <p className="mt-2 text-[13.5px]" style={{ color: "var(--ink-3)" }}>
          {task.pos.toLowerCase()}
        </p>
      </div>
    );
  }

  if (shape === "gap") {
    return (
      <div>
        <p lang="et" className="text-[22px] font-semibold leading-snug" style={{ color: "var(--ink)" }}>
          {task.gapped}
        </p>
        {/*
          The meaning rather than the lemma, which is what makes this harder
          than the gap-fill card review already has: the sentence and the
          meaning together are what say which form is wanted, and printing the
          dictionary form beside a gap wanting the dictionary form hands the
          answer over. That was 2,468 cards once.
        */}
        <p className="mt-4 text-[15px]" style={{ color: "var(--ink-2)" }}>
          The missing word means <strong style={{ color: "var(--ink)" }}>{task.translation}</strong>.
        </p>
        <SlotLine task={task} />
      </div>
    );
  }

  if (shape === "heard") {
    return (
      <div>
        {word}
        {meaning}
        <div className="mt-6 flex items-center gap-3">
          <SpeakPair
            text={task.sentence ?? task.lemma}
            size={22}
            className="px-1 py-1"
            label="Play the sentence"
            slowLabel="Play the sentence slowly"
            onUnavailable={onNoAudio}
          />
          <span className="text-[13.5px]" style={{ color: "var(--ink-3)" }}>
            Play it, then type the form of {task.lemma} you hear.
          </span>
        </div>
      </div>
    );
  }

  // `inflect` and `build` both ask for a named form of a word on the screen.
  return (
    <div>
      {word}
      {meaning}
      <SlotLine task={task} />
      {shape === "build" && !plainAskFor(task) && (
        <p className="mt-4 text-[13.5px]" style={{ color: "var(--ink-2)" }}>
          Write one sentence of your own with it in that form.
        </p>
      )}
    </div>
  );
}

/**
 * What the card wants, and then what that thing is called.
 *
 * IN THAT ORDER, WHICH IS THE WHOLE OF WHAT CHANGED. This used to lead with
 * `lihtminevik · ma` at 24px in the accent, with the English name under it, and
 * a learner drove a round and reported that they could not tell what it wanted
 * them to do. Both names were on the screen and neither is an instruction: a
 * name is a thing you look up, and somebody who has to look it up mid card has
 * already lost the sentence they were building.
 *
 * So the plain sentence leads and the names sit under it, in one quiet line, as
 * the cross-reference CLAUDE.md has always said they are. Nothing is dropped:
 * a learner who is also sitting a course still reads `lihtminevik · ma` and
 * `the simple past` on the same card, which is what lets them follow their own
 * teacher. Where a slot has no plain reading the name leads exactly as before,
 * because `plainAsk` is deliberately partial and an invented sentence would be
 * worse than the name it replaced.
 */
function SlotLine({ task }: { task: FlashPrompt }) {
  const english = englishName(task.slot);
  const plain = plainAskFor(task);
  const names = [task.label, english ? `the ${english}` : null].filter(Boolean).join(" · ");
  return (
    <div className="mt-5">
      {plain ? (
        <>
          <p className="text-[22px] font-semibold leading-snug" style={{ color: "var(--ink)" }}>
            {plain}
          </p>
          <p lang="et" className="mt-1.5 text-[13.5px]" style={{ color: "var(--ink-3)" }}>
            {names}
          </p>
        </>
      ) : (
        <>
          <p lang="et" className="text-2xl font-semibold" style={{ color: "var(--accent-deep)" }}>
            {task.label}
          </p>
          {english && (
            <p className="mt-1 text-[13.5px]" style={{ color: "var(--ink-3)" }}>the {english}</p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * WHAT HAPPENED, PAINTED THE WAY THE REST OF THE APP PAINTS IT.
 *
 * This was a solid `--butter` panel with `--ink-2` running across it, which is
 * two rules broken at once and one of them only in the dark. Every hue in this
 * palette is a pair: the fill is what a bar or a button is painted, the tint is
 * what a panel is painted, and each has an ink drawn to sit on its own tint
 * (docs/14-design-system.md). `--butter` is the fill, #cf9114, so the box was a
 * slab of gold with body text set in a colour chosen for a white card; in the
 * dark theme `--butter` is #ffcd6e and `--butter-ink` resolves to the same
 * value, so the heading was bright yellow on bright yellow. Every other
 * feedback panel in the app was already right: the cloze round, listening,
 * sprint and pairs all paint `<hue>-soft` and write in `<hue>-ink`.
 *
 * AND THREE OUTCOMES RATHER THAN TWO, because the round already knew about
 * three. `markFlash` returns a middle rating for the right word in the wrong
 * ending, which is the near miss this round exists to catch, and the screen
 * flattened it into the same box as a blank. The palette has one colour for
 * "nearly" and one for "missed" and they mean exactly those two things, so the
 * box now says which without anybody reading a word. It says it in words too,
 * since a hue is never the only thing carrying a distinction here.
 */
function Feedback({ task, mark }: { task: FlashPrompt; mark: FlashMark }) {
  const spec = caseByKey(task.slot);
  const english = englishName(task.slot);
  /*
    Recalled, nearly, or missed. `mark.right` with the middle rating is a
    diacritic somebody dropped or a slip of one letter, which `checkAnswer`
    counts as produced, so it reads as the recall it was.
  */
  const tone = mark.right
    ? { bg: "var(--good-soft)", ink: "var(--good-ink)", head: "That is it" }
    : mark.rating === 2
      ? { bg: "var(--hard-soft)", ink: "var(--hard-ink)", head: "Nearly" }
      : { bg: "var(--again-soft)", ink: "var(--again-ink)", head: "Not this time" };

  return (
    <div className="mt-6" aria-live="polite">
      <div
        className="flex items-start gap-2.5 rounded-md px-3.5 py-3"
        style={{ background: tone.bg, color: tone.ink }}
      >
        {mark.right
          ? <Check size={16} className="mt-0.5 shrink-0" aria-hidden />
          : <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />}
        <p className="text-[15px]">
          <strong className="font-semibold">{tone.head}.</strong>
          {mark.note && <> {mark.note}</>}
        </p>
      </div>

      {/* The answer itself, on the card rather than on the tint: it is the one
          thing worth reading twice, and a form is read letter by letter. */}
      <div
        className="mt-4 rounded-md border px-3.5 py-3"
        style={{ borderColor: "var(--rule)", background: "var(--raised)" }}
      >
        <p lang="et" className="text-[22px] font-semibold leading-tight" style={{ color: "var(--ink)" }}>
          {task.shown.join(" / ")}
        </p>
        <p className="mt-1 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
          <span lang="et">{task.label}</span>
          {english && <> · the {english}</>}
        </p>
      </div>

      {task.sentence && (
        <p lang="et" className="mt-4 text-[15px] leading-snug" style={{ color: "var(--ink-2)" }}>
          {/* The spelling the sentence itself carries, which is not always the
              one the slot leads with: `tuppa` and `toasse` are both the
              illative and a lexicographer writes whichever the sentence
              wanted. */}
          {splitOnForm(task.sentence, task.sentenceForm ?? task.value)
            .map((part, i) =>
              part.match
                ? <strong key={i} style={{ color: "var(--ink)" }}>{part.text}</strong>
                : <span key={i}>{part.text}</span>,
            )}
        </p>
      )}

      <p className="mt-4 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
        {task.provenance === "ekilex"
          ? "This form is the one the dictionary records."
          : "This form is worked out from the stem the dictionary records."}{" "}
        {spec && (
          <Link
            href={`/grammar/${task.slot.toLowerCase()}`}
            className="font-semibold underline underline-offset-2"
            style={{ color: "var(--accent-deep)" }}
          >
            What the {spec.et} is for
          </Link>
        )}
      </p>
    </div>
  );
}

/** How far this word is from being done, which is the thing the round moves. */
function Standing({ task }: { task: FlashPrompt }) {
  const { correct, needCorrect, slots, needSlots } = task.progress;
  const pct = Math.round(
    Math.min(1, Math.min(correct / needCorrect, slots / Math.max(1, needSlots))) * 100,
  );
  return (
    <div className="mt-4">
      <Meter pct={pct} label={`${task.lemma} towards mastered`} />
      {/*
          Two facts, and each carries its target only while it is unmet. It read
          "6 of 5 right" on the first word of the first real round, which is a
          line the learner has to work out rather than read: over the count and
          short of the variety is the ordinary state of a word this round is
          about, and it is what the sentence has to say plainly.
        */}
      <p className="mt-2 text-center text-[12.5px]" style={{ color: "var(--ink-3)" }}>
        <span lang="et">{task.lemma}</span>:{" "}
        {correct >= needCorrect
          ? `right ${correct} times`
          : `right ${correct} of ${needCorrect} times`}
        , in {slots} of the {needSlots} {needSlots === 1 ? "form" : "forms"} it needs.
      </p>
    </div>
  );
}
