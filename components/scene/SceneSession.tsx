"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CornerDownLeft, DoorOpen, LifeBuoy, RotateCcw } from "lucide-react";
import { Button } from "@/components/Button";
import { ChoiceCard, ChoiceGroup } from "@/components/Choice";
import { EstonianInput } from "@/components/EstonianInput";
import { Card } from "@/components/ui";
import { SuggestFix } from "@/components/SuggestFix";
import { Speak } from "@/components/Speak";
import { CLEAN } from "@/lib/audio/conditions";
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

type Provenance = "attested" | "scripted" | "composed" | "fallback" | "again" | "recast" | "english" | "unspoken";

interface Line {
  readonly text: string;
  readonly provenance: Provenance;
  readonly reaction?: true;
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
  card: { you: string; props: { slot: string; card: string; given: readonly string[] }[] };
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

/** Whether a line is Estonian the other side said, as opposed to a stage direction or their English. */
const spokenEstonian = (line: Line) => line.provenance !== "unspoken" && line.provenance !== "english";
/** Whether a line was said at all, in either language. */
const spoken = (line: Line) => line.provenance !== "unspoken";

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
  const [turns, setTurns] = useState<Turn[]>([]);
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
      turns: turns.flatMap((turn): Debrief["turns"][number][] => {
        if (turn.who === "you") return [{ who: "you", text: turn.text }];
        const said = turn.lines.filter(spoken).map((line) => line.text).join(" ");
        return said ? [{ who: "them", text: said }] : [];
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
              <Card className="inline-block max-w-full"><p lang="et">{turn.text}</p></Card>
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
                      <p lang={spokenEstonian(line) ? "et" : "en"} className="flex items-center gap-2">
                        <span>{line.text}</span>
                        {/*
                          Spoken in the persona's voice (§6), and the newest
                          line plays itself where the learner has autoplay on:
                          a turn was just pressed, so the gesture the browser
                          wants has happened. A second persona in a scene
                          would be a second voice, which is how an
                          interruption reads as a second person.
                        */}
                        {spokenEstonian(line) && (
                          <Speak
                            text={line.text}
                            voice={voice}
                            condition={speed !== 1 ? { ...CLEAN, speed } : undefined}
                            size={14}
                            autoplay={index === turns.length - 1 && at === turn.lines.length - 1}
                            className="press inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-[var(--raised)]"
                          />
                        )}
                      </p>
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
};

export { BUDGETS };
