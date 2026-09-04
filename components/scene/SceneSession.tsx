"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CornerDownLeft, DoorOpen, LifeBuoy, RotateCcw } from "lucide-react";
import { Button } from "@/components/Button";
import { EstonianInput } from "@/components/EstonianInput";
import { Card, Chip } from "@/components/ui";
import { SuggestFix } from "@/components/SuggestFix";
import { beginScene, finishScene, sceneHelp } from "@/app/actions";
import type { SceneSpec } from "@/lib/scenes/types";
import type { Difficulty } from "@/lib/scenes/curveballs";
import { BUDGETS } from "@/lib/scenes/curveballs";
import { SceneDebrief, type Debrief } from "./SceneDebrief";

/**
 * One conversation, from the desk to the debrief.
 *
 * THERE ARE NO METERS (§7). No progress bar, no timer, no patience gauge: every
 * one of those turns this into a game about the gauge. Pressure is carried in
 * what the other person says, and when their patience runs out they say so and
 * move on. What stays on screen is the role card and the objectives, because
 * knowing what you came in to get done is not a hint, it is what somebody
 * walking into a health centre already knows.
 *
 * THE SERVER MARKS EVERY TURN. This sends what has been typed and is told what
 * the other side says back; it never decides whether a turn landed. That is
 * ADR-022's split, and it is why the same function marks the run again when it
 * ends: two markers would be two answers to "were you understood", and the one
 * nobody watches is the one that drifts.
 *
 * YOU CAN WALK OUT. Leaving is a real option in a real conversation, and the
 * debrief handles it without a word of reproach.
 */

interface Turn {
  readonly who: "them" | "you";
  readonly text: string;
  readonly provenance?: "attested" | "scripted" | "composed" | "fallback";
  readonly reading?: string | null;
}

type Phase = "briefing" | "talking" | "debrief";

interface Opened {
  runId: string;
  card: { you: string; props: { slot: string; card: string; given: readonly string[] }[] };
  persona: string;
  composed: boolean;
}

const DIFFICULTIES: { id: Difficulty; label: string; blurb: string }[] = [
  { id: "textbook", label: "Textbook", blurb: "Everything goes the way the unit taught it." },
  { id: "good", label: "Good day", blurb: "One thing is not quite as expected." },
  { id: "ordinary", label: "Ordinary day", blurb: "Two or three, and one of them is real." },
  { id: "bad", label: "Bad day", blurb: "About as bad as a Tuesday at a counter." },
];

export function SceneSession({ scene }: { scene: SceneSpec }) {
  const [phase, setPhase] = useState<Phase>("briefing");
  const [difficulty, setDifficulty] = useState<Difficulty>("good");
  const [opened, setOpened] = useState<Opened | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [sent, setSent] = useState<{ beatId: string; said: string; helped: boolean }[]>([]);
  const [beatId, setBeatId] = useState<string | null>(null);
  const [goal, setGoal] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const [used, setUsed] = useState<string[]>([]);
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
  const hangUpRef = useRef<(t: typeof sent, walkedOut: boolean) => Promise<void>>(
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

  const speak = useCallback(async (next: typeof sent) => {
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
        text?: string | null; provenance?: Turn["provenance"];
        beatId?: string | null; goal?: string | null; done?: string[];
        over?: boolean; reading?: string | null; error?: string;
        composed?: boolean; note?: string | null;
      };
      if (data.error) { setError(data.error); return; }
      if (data.composed === false && data.note) setNote(data.note);

      setBeatId(data.beatId ?? null);
      setGoal(data.goal ?? null);
      setDone(data.done ?? []);
      if (data.text) {
        setTurns((was) => [...was, {
          who: "them", text: data.text!, provenance: data.provenance, reading: data.reading,
        }]);
        // Both rungs the route passes over once used. A scripted line left out
        // of this would be the one sentence a beat can repeat.
        if (data.provenance === "attested" || data.provenance === "scripted") {
          setUsed((was) => [...was, data.text!]);
        }
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
  }, [opened, used]);

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
    const next = [...sent, { beatId, said, helped }];
    setSent(next);
    setTurns((was) => [...was, { who: "you", text: said }]);
    setDraft("");
    setHelped(false);
    setLent(null);
    await speak(next);
  }

  async function hangUp(finalTurns: typeof sent, walkedOut: boolean) {
    setBusy(true);
    const result = await finishScene({
      runId: opened?.runId, turns: finalTurns, walkedOut, asked,
    });
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    setDebrief({
      scene,
      objectives: result.objectives,
      outcome: result.outcome,
      gaps: result.gaps,
      graded: result.graded,
      turns: turns.filter((turn) => turn.who === "you").map((turn) => turn.text),
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
        </Card>

        <div>
          <h2 className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>How hard a day</h2>
          {/*
            The dial sits on the scene rather than in Settings, because it is a
            decision about this conversation rather than a preference about the
            app: somebody who found the last one hard should be able to turn it
            down where they feel it.
          */}
          <div className="grid gap-2 sm:grid-cols-2">
            {DIFFICULTIES.map((one) => (
              <button
                key={one.id}
                type="button"
                onClick={() => setDifficulty(one.id)}
                aria-pressed={difficulty === one.id}
                className="choice-btn text-left"
              >
                <span className="font-medium">{one.label}</span>
                <span className="block text-xs" style={{ color: "var(--ink-3)" }}>{one.blurb}</span>
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm" style={{ color: "var(--peach-ink)" }}>{error}</p>}
        <Button onClick={start} disabled={busy}>
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
            ?? "No model today: this one is built from recorded sentences and lines written for the scene."}
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
          <div key={index} className={turn.who === "you" ? "self-end text-right" : ""}>
            <Card className="inline-block max-w-full">
              <p lang={turn.who === "them" ? "et" : undefined}>{turn.text}</p>
            </Card>
            {turn.who === "them" && turn.provenance && (
              <div className="mt-1 flex items-center gap-2">
                {/* The provenance chip is text, never a colour (ADR-025). */}
                <Chip tone="neutral">{PROVENANCE[turn.provenance]}</Chip>
                <SuggestFix
                  category="WRONG_CONTENT"
                  trigger={`Situations · ${scene.id} · ${turn.text}`}
                  label="Report this line"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {goal && (
        <p className="text-sm font-medium" aria-live="polite">{goal}</p>
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
          {/*
            Asking for repetition is the most useful sentence a learner can own,
            so it is a control on the screen rather than something they have to
            think of. It costs a turn and never patience.
          */}
          <Button
            variant="ghost"
            onClick={() => { setDraft(""); void speak(sent); }}
            disabled={busy}
          >
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

/** What the chip says. Text, because a colour cannot carry this on its own. */
const PROVENANCE: Record<NonNullable<Turn["provenance"]>, string> = {
  attested: "Recorded sentence",
  /*
    Honest about both halves: a model wrote it, and every word was checked
    against the dictionary before it was kept. "Checked by a native speaker"
    is a different claim and the chip does not make it until the bank's row
    says so (lib/scenes/scripted.ts).
  */
  scripted: "Written for this scene, checked word by word",
  composed: "Written for this turn",
  fallback: "They did not catch that",
};

export { BUDGETS };
