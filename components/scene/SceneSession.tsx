"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CornerDownLeft, DoorOpen, LifeBuoy, RotateCcw } from "lucide-react";
import { Button } from "@/components/Button";
import { ChoiceCard, ChoiceGroup } from "@/components/Choice";
import { EstonianInput } from "@/components/EstonianInput";
import { Card } from "@/components/ui";
import { SuggestFix } from "@/components/SuggestFix";
import { Speak } from "@/components/Speak";
import type { Provenance as SceneProvenance } from "@/lib/scenes/line";
import { conditionFor } from "@/lib/audio/conditions";
import { GlossedSentence } from "@/components/GlossedSentence";
import type { GlossedToken } from "@/lib/dict/glossed";
import { useAudioPrefs } from "@/components/AudioPrefs";
import { beginScene, finishScene, sceneHelp } from "@/app/actions";
import type { SceneSpec } from "@/lib/scenes/types";
import type { Difficulty } from "@/lib/scenes/curveballs";
import { BUDGETS } from "@/lib/scenes/curveballs";
import { SceneDebrief, type Debrief } from "./SceneDebrief";
import { practises } from "@/lib/scenes/practises";

/**
 * One conversation, from the desk to the debrief.
 *
 * THERE ARE NO METERS (§7). No progress bar, no timer, no patience gauge: every
 * one of those turns this into a game about the gauge. Pressure is carried in
 * what the other person says, and when their patience runs out they say so and
 * move on. What stays on screen is the role card and the objectives, because
 * knowing what you came in to get done is not a hint, it is what somebody
 * walking into a health center already knows.
 *
 * THE SERVER MARKS EVERY TURN. This sends what has been typed and is told what
 * the other side says back; it never decides whether a turn landed. That is
 * ADR-022's split, and it is why the same function marks the run again when it
 * ends: two markers would be two answers to "were you understood", and the one
 * nobody watches is the one that drifts.
 *
 * A REPLY IS A FEW LINES, NOT ONE. The other side reacts to what was said and
 * then makes their move (`lib/scenes/reply.ts`), so what arrives is a list:
 * "Hästi." and then the next question, or "Ma ei saa aru" and the same
 * question again, or "Jah?" on its own while they wait for the rest of a
 * sentence. Each line still carries where it came from (ADR-025), and a line
 * of English about what they did is drawn as a stage direction rather than as
 * a bubble, because it is not something anybody said.
 *
 * YOU CAN WALK OUT. Leaving is a real option in a real conversation, and the
 * debrief handles it without a word of reproach.
 */

/*
  Read off the one definition rather than written out again. This was a second
  copy of the list, so the day a line learned to be a break in time or a hint
  from the app, the screen went on knowing nine kinds and `PROVENANCE` still
  type-checked with two of them missing. A type-only import is erased, so a
  client component pays nothing for it.
*/
type Provenance = SceneProvenance;

interface Line {
  readonly text: string;
  readonly provenance: Provenance;
  readonly reaction?: true;
  /**
   * The line read word by word, so a learner can open any word the
   * dictionary vouches for without leaving the conversation. Absent on a
   * stage direction, and on any line the route could not gloss.
   */
  readonly tokens?: GlossedToken[];
}

/**
 * What a turn was understood despite: the learner's spelling and the form
 * the other side would use, off the server's own marking. Shown under the
 * learner's bubble as "understood", never as a verdict, because that is
 * what happened (`lib/scenes/nearly.ts`).
 */
export interface SlipNote {
  readonly kind: "spelling" | "case" | "person";
  readonly said: string;
  readonly form: string | null;
}

type Turn =
  | { readonly who: "you"; readonly text: string; readonly slips?: readonly SlipNote[] }
  | { readonly who: "them"; readonly lines: readonly Line[] };

type Phase = "briefing" | "talking" | "debrief";

interface Opened {
  runId: string;
  /** Runs of this scene before this one, which opens the hearing pool. */
  plays: number;
  card: { you: string; props: { slot: string; card: string; given: readonly string[]; returned?: true }[] };
  persona: string;
  composed: boolean;
}

interface Sent {
  beatId: string;
  said: string;
  helped: boolean;
  /** The Estonian line this turn answers, for the echo rule and for saying it again. */
  heard: string;
}

/**
 * How hard a day the person behind the desk is having.
 *
 * Written as what happens to *you* rather than as a setting. "Two or three,
 * and one of them is real" is a note to whoever wrote the curveball table;
 * "they will throw two or three things at you" is what somebody choosing
 * between four buttons wants to know.
 */
const DIFFICULTIES: { id: Difficulty; label: string; blurb: string }[] = [
  { id: "textbook", label: "Easy", blurb: "It all goes the way the lesson said it would." },
  { id: "good", label: "Fairly easy", blurb: "One thing catches you out." },
  { id: "ordinary", label: "Normal", blurb: "Two or three, the way a real counter goes." },
  { id: "bad", label: "Hard", blurb: "As bad as a Tuesday at a busy desk." },
];

/**
 * The three kinds of line that are nobody speaking: what the other side did
 * where no Estonian could be built for it, time passing between two beats, and
 * the app stepping out of character to say what is wanted. None of them is a
 * bubble, because nobody said any of them.
 */
const NOT_SAID = new Set<Provenance>(["unspoken", "meanwhile", "coach"]);
/** Whether a line is Estonian the other side said, as opposed to a note or their English. */
const spokenEstonian = (line: Line) => !NOT_SAID.has(line.provenance) && line.provenance !== "english";
/** Whether a line was said at all, in either language. */
const spoken = (line: Line) => !NOT_SAID.has(line.provenance);

/**
 * The line the learner is now answering: the other side's last move, which is
 * never a reaction and never a stage direction. `Jah?` on its own leaves the
 * question before it standing, which is exactly what waiting means.
 */
function moveIn(lines: readonly Line[]): string | null {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]!;
    if (line.reaction) continue;
    /*
      A move made in English leaves nothing to say again: the last Estonian
      question is over and repeating it would be repeating the wrong one,
      which is what happened when a stage direction stood between two beats.
    */
    return spoken(line) ? line.text : "";
  }
  return null;
}

export function SceneSession({ scene }: { scene: SceneSpec }) {
  const [phase, setPhase] = useState<Phase>("briefing");
  const [difficulty, setDifficulty] = useState<Difficulty>("good");
  const [opened, setOpened] = useState<Opened | null>(null);
  const [turns, setTurnsState] = useState<Turn[]>([]);
  /*
    THE TRANSCRIPT IS READ FROM A REF, BECAUSE THE DEBRIEF IS BUILT IN THE SAME
    BREATH AS THE LAST TURN.

    The reply arrives, `setTurns` appends it, and two lines later `data.over`
    calls `hangUp`, all inside one continuation after `await response.json()`.
    React batches updates scheduled there, so no render commits between them
    and `hangUpRef.current` is still the closure from the previous commit,
    whose `turns` does not hold the reply that just arrived. Every scene that
    ends the ordinary way, on its last beat or on the persona running out of
    patience, produced a debrief missing its final exchange: the sign-off, or
    the moment they gave up, and the slips written onto the learner's last turn
    with it. A scene that ended on the first server turn had no transcript at
    all.

    The ref is written by the same updater that writes the state, so the two
    cannot come apart, and `hangUp` reads the ref. Grading was never affected:
    `finishScene` is handed `finalTurns` as an argument, which is fresh.
  */
  const turnsRef = useRef<Turn[]>([]);
  const setTurns = useCallback((update: (was: Turn[]) => Turn[]) => {
    setTurnsState((was) => {
      const next = update(was);
      turnsRef.current = next;
      return next;
    });
  }, []);
  const [sent, setSent] = useState<Sent[]>([]);
  const [beatId, setBeatId] = useState<string | null>(null);
  const [goal, setGoal] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const [used, setUsed] = useState<string[]>([]);
  const [heard, setHeard] = useState<string>("");
  /** Whose voice the other side speaks in, off the run's persona. */
  const [voice, setVoice] = useState<string | undefined>(undefined);
  /** How fast they talk: the persona's pace, faster once they have sped up. */
  const [speed, setSpeed] = useState(1);
  const [asked, setAsked] = useState<{ lemma: string; lexemeId: string | null }[]>([]);
  const [helped, setHelped] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debrief, setDebrief] = useState<Debrief | null>(null);
  /*
    What the ledger said, on the turn it said it. A run no longer books at the
    door, so "your allowance is spent" is news that arrives mid-conversation
    rather than a fact known at the briefing, and it belongs where it is true.
  */
  const [note, setNote] = useState<string | null>(null);
  /** The word the help button last handed over, shown until the next turn. */
  const [lent, setLent] = useState<{ lemma: string; gloss: string } | null>(null);
  /*
    HOW THE OTHER SIDE SOUNDS, WHICH IS THE ROOM THIS FEATURE WAS WRITTEN FOR.

    `lib/audio/conditions.ts` opens with a counter, a clinic ringing back on a
    bad line and a sentence caught from the middle of a conversation, and for
    its whole life it reached two flashcard rounds and never a conversation:
    the receptionist was the one voice in the app that always spoke from a
    studio. The pool opens on how many times this learner has had *this*
    conversation, which is the same claim the word pool makes one level down,
    so a first visit to a health centre is a quiet room and the harder
    deliveries arrive once the encounter itself has stopped being the hard
    part. Skippable, because nothing marks the words of a line the other side
    says: the learner answers the beat, and catching a sentence from halfway
    is the thing the table exists to rehearse rather than a way to be marked
    down.
  */
  const { hearing } = useAudioPrefs();

  const log = useRef<HTMLDivElement>(null);
  /*
    A scene can end on its own, when the last beat is done or the persona has
    run out of patience, and the turn that ended it is the one that has to hang
    up. `speak` is memoised and `hangUp` is not, so calling it directly captured
    whichever `hangUp` existed when `speak` was last built, closing over the
    `asked` and `turns` of that render: a learner who pressed the help button
    twice and then finished lost both words off the debrief, silently, because
    the stale closure sent an empty list. The ref is always this render's.
  */
  const hangUpRef = useRef<(t: Sent[], walkedOut: boolean) => Promise<void>>(
    async () => {},
  );

  /*
    The turns scroll in their own container, per the containment rules, and the
    newest is scrolled to rather than the page jumping. `scrollTop` rather than
    `scrollIntoView`, which scrolls every ancestor including the document.
  */
  useEffect(() => {
    const box = log.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [turns]);

  const speak = useCallback(async (next: Sent[]) => {
    if (!opened) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/scene", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: opened.runId, turns: next, used }),
      });
      /*
        A FAILURE MAY NOT MISNAME ITS CAUSE. Reading the body without looking at
        the status made a 500 and a dead network the same sentence, and the
        first version of this said "that did not reach us" about a route that
        had answered perfectly promptly with an error. That sends whoever reads
        it to check their connection about a bug in this app.
      */
      if (!response.ok) {
        setError(
          response.status === 429
            ? "That was a lot of turns at once. Give it a moment."
            : "Something went wrong at our end. Your turn is still here.",
        );
        return;
      }
      const data = await response.json() as {
        lines?: Line[]; voice?: string; speed?: number;
        beatId?: string | null; goal?: string | null; done?: string[];
        over?: boolean; error?: string;
        composed?: boolean; note?: string | null;
        slips?: SlipNote[];
      };
      if (data.error) { setError(data.error); return; }
      if (data.composed === false && data.note) setNote(data.note);

      /*
        What the last turn was understood despite, written onto that turn so
        the note sits under the learner's own words. The server marked it,
        because the screen never decides whether a turn landed.
      */
      const slips = data.slips ?? [];
      if (slips.length > 0) {
        setTurns((was) => {
          const at = was.length - 1;
          const last = was[at];
          if (!last || last.who !== "you") return was;
          return [...was.slice(0, at), { ...last, slips }];
        });
      }

      setBeatId(data.beatId ?? null);
      setGoal(data.goal ?? null);
      if (data.voice) setVoice(data.voice);
      if (typeof data.speed === "number" && data.speed > 0) setSpeed(data.speed);
      setDone(data.done ?? []);
      const lines = data.lines ?? [];
      if (lines.length > 0) {
        setTurns((was) => [...was, { who: "them", lines }]);
        const move = moveIn(lines);
        if (move !== null) setHeard(move);
        // Both rungs the route passes over once used. A scripted line left out
        // of this would be the one sentence a beat can repeat.
        const fresh = lines
          .filter((line) => line.provenance === "attested" || line.provenance === "scripted")
          .map((line) => line.text);
        if (fresh.length > 0) setUsed((was) => [...was, ...fresh]);
      }
      if (data.over) await hangUpRef.current(next, false);
    } catch {
      /*
        The network, which is the case this catch is actually for now that a
        refusal is read off the status. Either way the conversation stays where
        it was: the turn they typed is still theirs and pressing again resends
        it.
      */
      setError("That did not reach us. Try again.");
    } finally {
      setBusy(false);
    }
  }, [opened, used, setTurns]);

  async function start() {
    setBusy(true);
    setError(null);
    const result = await beginScene(scene.id, difficulty);
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }

    /*
      The briefing and nothing else: the plan stays on the server, so there is
      no cast here and nothing to read off a network tab. `Briefing` in
      `lib/progress/scene.ts` is where that is argued.
    */
    setOpened({
      runId: result.runId,
      plays: result.plays,
      card: { you: result.briefing.you, props: [...result.briefing.props] },
      persona: result.briefing.persona,
      composed: result.composed,
    });
    setPhase("talking");
  }

  async function help() {
    setBusy(true);
    const result = await sceneHelp(opened?.runId, sent);
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    setHelped(true);
    setLent({ lemma: result.lemma, gloss: result.gloss });
    setAsked((was) => [...was, { lemma: result.lemma, lexemeId: result.lexemeId }]);
  }

  async function say() {
    const said = draft.trim();
    if (!said || !beatId || busy) return;
    const next = [...sent, { beatId, said, helped, heard }];
    setSent(next);
    setTurns((was) => [...was, { who: "you", text: said }]);
    setDraft("");
    setHelped(false);
    setLent(null);
    await speak(next);
  }

  /*
    Asking for repetition is the most useful sentence a learner can own, so it
    is a control rather than something they have to think of. It costs no
    turn, no patience and no round trip: the line they were answering is said
    again, as it was, because a person asked to repeat themselves repeats
    themselves rather than rephrasing.
  */
  function again() {
    if (!heard) return;
    setTurns((was) => [...was, { who: "them", lines: [{ text: heard, provenance: "again" }] }]);
  }

  async function hangUp(finalTurns: Sent[], walkedOut: boolean) {
    setBusy(true);
    const result = await finishScene({
      runId: opened?.runId, turns: finalTurns, walkedOut, asked,
    });
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    setDebrief({
      scene,
      objectives: result.objectives,
      hurdles: result.hurdles,
      outcome: result.outcome,
      gaps: result.gaps,
      graded: result.graded,
      review: result.review,
      turns: turnsRef.current.flatMap((turn): Debrief["turns"][number][] => {
        if (turn.who === "you") return [{ who: "you", text: turn.text, lang: "et" }];
        /*
          Split by language rather than joined into one string, because the
          other side does not only speak Estonian: where neither rung could put
          their move into words the course teaches, `reply` says what they did
          in English. Joining the two and marking the result `lang="et"` had a
          screen reader saying the English with Estonian phonology.
        */
        const said = turn.lines.filter(spoken);
        const et = said.filter(spokenEstonian).map((line) => line.text).join(" ");
        const en = said.filter((line) => !spokenEstonian(line)).map((line) => line.text).join(" ");
        return [
          ...(et ? [{ who: "them" as const, text: et, lang: "et" as const }] : []),
          ...(en ? [{ who: "them" as const, text: en, lang: "en" as const }] : []),
        ];
      }),
    });
    setPhase("debrief");
  }

  hangUpRef.current = hangUp;

  // The first line, once the run is open.
  useEffect(() => {
    if (phase === "talking" && opened && turns.length === 0) void speak([]);
  }, [phase, opened, turns.length, speak]);

  if (phase === "debrief" && debrief) {
    return <SceneDebrief debrief={debrief} onAgain={() => window.location.reload()} />;
  }

  if (phase === "briefing") {
    return (
      <div className="flex flex-col gap-5">
        <Card className="flex flex-col gap-2">
          <h2 className="font-medium">{scene.place}</h2>
          <p className="text-sm" style={{ color: "var(--ink-2)" }}>{scene.role}</p>
          <p className="text-xs" style={{ color: "var(--ink-3)" }}>
            You will need {practises(scene).join(", ")}. They speak first, you answer, and the card
            below the conversation says what to get done.
          </p>
          {/*
            Said before the first line rather than discovered on the third,
            because a learner who expects to be marked writes less than one
            who expects to be understood, and being understood is the point.
          */}
          <p className="text-xs" style={{ color: "var(--ink-3)" }}>
            An ending that is off is still understood, the way it would be on the street. They
            will say the word back the way they say it, and the debrief lists those afterwards.
          </p>
        </Card>

        {/*
          The dial sits on the scene rather than in Settings, because it is a
          decision about this conversation rather than a preference about the
          app: somebody who found the last one hard should be able to turn it
          down where they feel it.

          `ChoiceGroup` rather than four bare buttons, and that is a fix rather
          than a tidy-up. These were `aria-pressed` toggles, so four mutually
          exclusive options announced as four unrelated switches and cost four
          tab stops, where a radio group is one stop and says "2 of 4"; and the
          chosen one was told apart by a background alone, which is the rule
          about a colour never carrying a distinction on its own broken on the
          one control where the colour *is* the answer. `ChoiceCard` was
          written for exactly this shape and every other pick-one in the app
          already uses it.
        */}
        <ChoiceGroup
          label="How hard do you want it"
          className="grid gap-2 sm:grid-cols-2"
        >
          {DIFFICULTIES.map((one) => (
            <ChoiceCard
              key={one.id}
              selected={difficulty === one.id}
              onSelect={() => setDifficulty(one.id)}
              title={one.label}
              detail={one.blurb}
              layout="stacked"
            />
          ))}
        </ChoiceGroup>

        {error && <p className="text-sm" style={{ color: "var(--peach-ink)" }}>{error}</p>}
        <Button onClick={start} disabled={busy} variant="primary" size="lg">
          {busy ? "Getting ready" : "Start the conversation"}
        </Button>
      </div>
    );
  }

  const objectives = scene.beats.filter((beat) => beat.required);

  return (
    <div className="flex flex-col gap-4">
      {/*
        The card and the objectives stay, collapsible and never gone. A `details`
        rather than a state flag, because the browser gives the disclosure a
        keyboard and a screen reader for free.
      */}
      <details open>
        <summary className="cursor-pointer text-sm font-medium">Your card</summary>
        <Card className="mt-2 flex flex-col gap-2">
          <p className="text-sm">{opened?.card.you}</p>
          <ul className="flex flex-col gap-1 text-sm" style={{ color: "var(--ink-2)" }}>
            {(opened?.card.props ?? []).map((prop) => (
              <li key={prop.slot}>
                {prop.card}
                {/*
                  What you were dealt, in English, because the card's own line
                  points at it: "read it off the word below" with nothing below
                  it is a card nobody can answer. Saying it in Estonian is the
                  exercise, so the word itself is not here.
                */}
                {prop.given.length > 0 && (
                  <span className="block font-medium" style={{ color: "var(--ink)" }}>
                    {prop.given.join(" · ")}
                  </span>
                )}
                {/* The word came back because it was missing last time. Said, so the card reads as remembering rather than repeating. */}
                {prop.returned && (
                  <span className="block text-xs" style={{ color: "var(--ink-3)" }}>
                    You reached for this one in a conversation recently and did not have it.
                  </span>
                )}
              </li>
            ))}
          </ul>
          {opened?.persona && (
            <p className="text-xs" style={{ color: "var(--ink-3)" }}>{opened.persona}</p>
          )}
          <ul className="mt-1 flex flex-col gap-1">
            {objectives.map((beat) => {
              const met = done.includes(beat.id);
              return (
                <li key={beat.id} className="flex items-center gap-2 text-sm">
                  {/*
                    An icon and a word beside the hue, because mint means
                    recalled and nothing in this app may be carried by colour
                    alone.
                  */}
                  <span aria-hidden style={{ color: met ? "var(--mint-ink)" : "var(--ink-3)" }}>
                    {met ? "✓" : "·"}
                  </span>
                  <span style={{ color: met ? "var(--ink)" : "var(--ink-3)" }}>{beat.goal}</span>
                  <span className="sr-only">{met ? "done" : "not yet"}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      </details>

      {opened && (!opened.composed || note) && (
        <p className="text-xs" style={{ color: "var(--ink-3)" }}>
          {note
            ?? "No model today: the lines are the course's own and the ones written for this scene, and a turn nothing was written for is described instead."}
        </p>
      )}

      {/*
        A log region that announces each new turn once and does not re-announce
        the ones above it, which is the lesson the exam clock taught: a live
        region that updates constantly reads a number a second at somebody.
      */}
      <div
        ref={log}
        className="scroll-host flex max-h-[46vh] flex-col gap-3 overflow-y-auto"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="The conversation"
      >
        {turns.map((turn, index) => (
          turn.who === "you" ? (
            <div key={index} className="self-end text-right">
              {/*
                What you typed, and a button to hear it said by a native
                voice, which the design (§11) promised and nothing drew: a
                learner who reads their own line back in a voice that is not
                theirs hears where the stress falls, which is the half of
                speaking a typed turn cannot rehearse. Never autoplayed, and
                the speaker is the app's own, so a turn of English is read
                with Estonian phonology and sounds exactly as wrong as it is.
              */}
              <Card className="inline-block max-w-full">
                <p lang="et" className="flex items-center justify-end gap-2">
                  <span>{turn.text}</span>
                  <Speak
                    text={turn.text}
                    voice={voice}
                    size={14}
                    className="press inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-[var(--raised)]"
                  />
                </p>
              </Card>
              {/*
                Understood, and how the word is said. Under the learner's own
                words and in the quiet ink, because it is not a verdict: the
                conversation carried on, and this is the one thing worth
                knowing about the turn. The form is the dictionary's, off the
                server's marking, and a slip the dictionary cannot recast is
                still "understood", which is the half that matters.
              */}
              {turn.slips && turn.slips.length > 0 && (
                <p className="mt-0.5 text-xs" style={{ color: "var(--ink-3)" }}>
                  Understood.
                  {turn.slips.some((slip) => slip.form) && (
                    <>
                      {" "}Here it is{" "}
                      {turn.slips.filter((slip) => slip.form).map((slip, at, all) => (
                        <span key={slip.said}>
                          <span lang="et" className="font-medium" style={{ color: "var(--ink-2)" }}>{slip.form}</span>
                          {at < all.length - 1 && ", "}
                        </span>
                      ))}
                      .
                    </>
                  )}
                </p>
              )}
            </div>
          ) : (
            <div key={index} className="flex flex-col items-start gap-1.5">
              {turn.lines.map((line, at) => (
                spoken(line) ? (
                  <div key={at} className="max-w-full">
                    <Card className="inline-block max-w-full">
                      {/*
                        Spoken in the persona's voice (§6), in the room this
                        scene is heard in, and the newest line plays itself
                        where the learner has autoplay on: a turn was just
                        pressed, so the gesture the browser wants has
                        happened. A second persona in a scene would be a
                        second voice, which is how an interruption reads as a
                        second person.

                        The room and the pace go separately, because
                        `playClip` takes the two apart: a condition with a
                        room in it goes through the mixer, which cannot hold a
                        pitch, so the persona's rate applies only where the
                        delivery is otherwise clean.
                      */}
                      {line.tokens ? (
                        /*
                          The line with the dictionary under it, which is the
                          same component a first meeting uses and at the same
                          standard. A learner who cannot read what was said to
                          them is stuck in the one place being stuck is not
                          the exercise.
                        */
                        <GlossedSentence
                          tokens={line.tokens}
                          sentence={line.text}
                          speak={{
                            voice,
                            condition: conditionFor(opened?.plays ?? 0, index, hearing, true),
                            rate: speed,
                            autoplay: index === turns.length - 1 && at === turn.lines.length - 1,
                          }}
                        />
                      ) : (
                      <p lang={spokenEstonian(line) ? "et" : "en"} className="flex items-center gap-2">
                        <span>{line.text}</span>
                        {spokenEstonian(line) && (
                          <Speak
                            text={line.text}
                            voice={voice}
                            condition={conditionFor(opened?.plays ?? 0, index, hearing, true)}
                            rate={speed}
                            size={14}
                            autoplay={index === turns.length - 1 && at === turn.lines.length - 1}
                            className="press inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-[var(--raised)]"
                          />
                        )}
                      </p>
                      )}
                    </Card>
                    {/*
                      Where the line came from, in words rather than a chip
                      shouting in capitals under every bubble (ADR-025), and
                      the report button beside it, because "this is not how
                      anybody says it" needs the line it is about.
                    */}
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs" style={{ color: "var(--ink-3)" }}>
                      <span>{PROVENANCE[line.provenance]}</span>
                      {line.provenance !== "again" && spokenEstonian(line) && (
                        <SuggestFix
                          category="WRONG_CONTENT"
                          trigger={`Situations · ${scene.id} · ${line.text}`}
                          label="Report"
                        />
                      )}
                    </p>
                  </div>
                ) : line.provenance === "meanwhile" ? (
                  /*
                    TIME PASSING, DRAWN AS A BREAK RATHER THAN AS A MURMUR.

                    A stage direction is set small and grey because it stands
                    in for a line and is worth less than one. This is the
                    opposite: it is the scene telling the learner where they
                    now are, and missing it is what left somebody answering
                    "where are you now?" from the kitchen the card had put
                    them in. So it is centred, ruled on both sides and set in
                    the ordinary ink, which is what a break in a story looks
                    like everywhere else it is drawn.
                  */
                  <p
                    key={at}
                    className="my-2 flex items-center gap-3 text-sm"
                    style={{ color: "var(--ink-2)" }}
                  >
                    <span aria-hidden className="h-px flex-1" style={{ background: "var(--rule)" }} />
                    <span className="text-center">{line.text}</span>
                    <span aria-hidden className="h-px flex-1" style={{ background: "var(--rule)" }} />
                  </p>
                ) : line.provenance === "coach" ? (
                  /*
                    THE APP, OUT OF CHARACTER, AND DRAWN SO NOBODY MISTAKES IT
                    FOR THE OTHER PERSON. A panel in the accent's softest tint
                    with the ink drawn to sit on it, which is the pairing
                    `test-design.mjs` measures: a hint set as grey italics
                    beside a grey italic stage direction is a hint nobody sees
                    at the moment they most need one.
                  */
                  <p
                    key={at}
                    className="rounded-2xl px-4 py-3 text-sm"
                    style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
                  >
                    <span className="label-xs block" style={{ color: "var(--accent-deep)" }}>
                      {PROVENANCE.coach}
                    </span>
                    {line.text}
                  </p>
                ) : (
                  /*
                    A stage direction: what they did, in English, because no
                    Estonian line could be built for it or because this
                    persona translates for somebody who wrote English. Not a
                    bubble, because nobody said it, and not offered to the
                    report queue, because a reader who reported it would be
                    reporting our own sentence.
                  */
                  <p key={at} className="text-sm italic" style={{ color: "var(--ink-3)" }}>
                    {line.text}
                    <span className="sr-only"> ({PROVENANCE.unspoken})</span>
                  </p>
                )
              ))}
            </div>
          )
        ))}
      </div>

      {goal && (
        <p className="text-sm" aria-live="polite">
          <span className="label-xs" style={{ color: "var(--ink-3)" }}>Your turn</span>
          <span className="block font-medium">{goal}</span>
        </p>
      )}
      {lent && (
        <p className="text-sm" aria-live="polite">
          <span lang="et" className="font-medium">{lent.lemma}</span>
          <span style={{ color: "var(--ink-2)" }}> · {lent.gloss}</span>
        </p>
      )}
      {error && <p className="text-sm" style={{ color: "var(--peach-ink)" }}>{error}</p>}

      <div className="flex flex-col gap-2">
        <EstonianInput
          value={draft}
          onChange={setDraft}
          onEnter={say}
          ariaLabel="What you say"
          placeholder="Say something"
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={say} disabled={busy || !draft.trim()}>
            <CornerDownLeft size={16} aria-hidden /> Say it
          </Button>
          <Button variant="ghost" onClick={again} disabled={busy || !heard}>
            <RotateCcw size={16} aria-hidden /> Say that again
          </Button>
          {/*
            Asking costs the turn its `helped` flag and nothing else: no
            objective is withheld and nothing is deducted, because somebody who
            asks for four words and finishes has learned more than somebody who
            gave up with none. The word is one of the beat's own, off the
            scene's closed list, which is why this is a server call rather than
            something the screen could work out: the client does not hold the
            lexicon and should not.
          */}
          <Button variant="ghost" onClick={help} disabled={busy || helped}>
            <LifeBuoy size={16} aria-hidden /> I need a word
          </Button>
          <Button variant="ghost" onClick={() => hangUp(sent, true)} disabled={busy}>
            <DoorOpen size={16} aria-hidden /> Leave
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Where a line came from, in words, because a color cannot carry this on its own. */
const PROVENANCE: Record<Provenance, string> = {
  attested: "From the course",
  /*
    Honest about both halves: a model wrote it, and every word was checked
    against the dictionary before it was kept. "Checked by a native speaker"
    is a different claim and the label does not make it until the bank's row
    says so (lib/scenes/scripted.ts).
  */
  scripted: "Written for this scene, checked word by word",
  composed: "Written for this turn",
  fallback: "They did not catch that",
  again: "Said again",
  /*
    The learner's word, put right and said back, which is the one correction
    a conversation makes without stopping. The label says whose word it was
    and what happened to it; "said again" would claim they had said it.
  */
  recast: "Your word, the way they say it",
  /*
    Handed over because the learner said they were not following. The label
    says whose word it is and that it was given rather than asked for, since
    "from the course" would read as the other side making a move.
  */
  offered: "The word you were reaching for",
  english: "They said it in English",
  /*
    The sixth is not a line they said, it is what they did, and the label has
    to say so or the sentence reads as Estonian rendered in English. It is
    read to a screen reader beside the stage direction and drawn to nobody:
    the italics are what a sighted reader gets. See `replyFor` in
    lib/scenes/reply.ts for why this exists at all: "They did not catch that"
    used to be printed over a turn that had been understood perfectly, which
    is the app blaming a learner for its own empty pool.
  */
  unspoken: "In English, because no Estonian line could be built for it",
  /*
    Time passing. Not a stage direction and not something anybody said: it is
    the scene moving the learner from one place to the next, which the screen
    used not to do at all, so a conversation that walked somebody to a shop
    left them answering from their own kitchen.
  */
  meanwhile: "What has happened since",
  /*
    The app, out of character. Everything else on this screen is one side of a
    conversation and a conversation cannot explain itself; this can, and the
    label says whose voice it is so nobody reads it as the other person
    breaking into English.
  */
  coach: "A hint, from the app rather than from them",
};

export { BUDGETS };
