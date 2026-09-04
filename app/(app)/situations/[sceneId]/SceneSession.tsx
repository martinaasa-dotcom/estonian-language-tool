"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleAlert, DoorOpen, HelpCircle, Loader2, RotateCcw, Send } from "lucide-react";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { addToDeck, finishScene } from "@/app/actions";
import { useAudioPrefs } from "@/components/AudioPrefs";
import { Button, ButtonLink } from "@/components/Button";
import { EstonianInput } from "@/components/EstonianInput";
import { Speak } from "@/components/Speak";
import { SuggestFix } from "@/components/SuggestFix";
import { Chip } from "@/components/ui";
import { conditionById } from "@/lib/audio/conditions";
import { VOICES } from "@/lib/audio/voice";
import { mulberry32, seedFrom } from "@/lib/random/seeded";
import { debriefOf, type Debrief } from "@/lib/scenes/debrief";
import type { Plan } from "@/lib/scenes/draw";
import { NARRATION, sceneLine, type SpokenLine } from "@/lib/scenes/line";
import { effectsOf } from "@/lib/scenes/personas";
import {
  advance, askedForHelp, currentBeat, objectives, otherSaid, startRun, walkOut,
  type LearnerTurn, type NextMove, type OtherTurn, type RunState,
} from "@/lib/scenes/run";
import { readTurn, type TurnOutcome } from "@/lib/scenes/turn";
import type { SceneSpec } from "@/lib/scenes/types";
import { DIFFICULTIES } from "@/lib/scenes/curveballs";
import { contextFromClient, type ClientMaterial } from "@/lib/progress/scenes";
import { addPending, clearRun, loadRun, saveRun } from "../resume";

/**
 * A conversation, played one turn at a time.
 *
 * THE BROWSER HOLDS THE MACHINE. The plan was drawn on the server from the
 * seed in the URL; the sets a turn is read against came down with the page;
 * every recorded line a beat can use is here already. So a turn costs no
 * round trip, an attested-only scene works with the network off, and the one
 * thing that goes to the server mid-scene is a request to compose a line for
 * a beat nothing recorded fits, which comes back gated or not at all. The
 * finished run goes up as turns, never as marks, and the server reads every
 * one of them again before writing anything (ADR-022).
 *
 * THERE ARE NO METERS. No timer, no patience bar, no score. Pressure is what
 * the other person says. What stays on screen is the role card and the
 * objectives, because knowing what you came in for is not a hint, it is what
 * a person walking into a health centre already knows.
 *
 * MEMORY IS A DIAL AND THE DEFAULT IS TWO TURNS. In a real conversation you
 * cannot scroll back, so the transcript shows the last exchange and a link to
 * the rest; the whole thing is one press away and comes back in the debrief.
 */
export interface SceneClient {
  scene: Pick<SceneSpec, "id" | "title" | "place" | "level" | "register" | "tests">;
  plan: Plan;
  material: ClientMaterial;
  aiAvailable: boolean;
  /** English. What the unit this scene tests promised. */
  canDo: string;
}

type Phase = "playing" | "finishing" | "debrief";

interface HelpHit { lemma: string; gloss: string }

const MAX_TURN_CHARS = 300;

function narrationFor(next: NextMove, outcome: TurnOutcome | null): string {
  if (next.kind === "moveOn") return NARRATION.moveOn;
  if (next.kind === "repair" && outcome) return NARRATION[outcome];
  return "";
}

export function SceneSession({ scene, plan, material, aiAvailable, canDo }: SceneClient) {
  const router = useRouter();
  const ctx = useMemo(() => contextFromClient(material), [material]);
  const random = useMemo(() => mulberry32(seedFrom(`${plan.seed}|lines`)), [plan.seed]);
  const { hearing } = useAudioPrefs();
  const persona = plan.persona;
  const voice = VOICES.find((v) => v.id === persona.voice) ?? VOICES[0]!;
  const agenda = effectsOf(persona.agenda);

  const [state, setState] = useState<RunState>(() => startRun(plan));
  const [phase, setPhase] = useState<Phase>("playing");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [narration, setNarration] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [help, setHelp] = useState<string | null>(null);
  const [debrief, setDebrief] = useState<Debrief | null>(null);
  const [kept, setKept] = useState<"sent" | "device" | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const restored = useRef(false);
  const spokenOnce = useRef<string | null>(null);

  /* The run in progress comes back on a reload, at the turn it was on. */
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const saved = loadRun(scene.id, plan.seed);
    if (saved && saved.state.turns.length > 0 && !saved.state.finished) {
      setState({ ...saved.state, plan });
    }
  }, [scene.id, plan]);

  useEffect(() => {
    if (phase !== "playing") return;
    if (state.turns.length > 0) saveRun({ sceneId: scene.id, seed: plan.seed, difficulty: plan.difficulty, state });
  }, [state, phase, scene.id, plan.seed, plan.difficulty]);

  const used = useMemo(() => new Set(state.turns.filter((t) => t.role === "other").map((t) => t.text)), [state.turns]);

  const lineFor = useCallback(async (beat: NonNullable<ReturnType<typeof currentBeat>>, repair: TurnOutcome | null, recentTurns: RunState["turns"]): Promise<SpokenLine> => {
    const recent = recentTurns.slice(-2).map((t) => ({ role: t.role, text: t.text }));
    return sceneLine({
      beat,
      used,
      random,
      recent,
      repair,
      sources: {
        attested: (b) => material.lines[b.id] ?? [],
        compose: aiAvailable
          ? async (request) => {
            try {
              const res = await fetch("/api/scene/line", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  sceneId: scene.id, seed: plan.seed, difficulty: plan.difficulty,
                  beatId: request.beat.id, recent: request.recent, repair: request.repair,
                }),
              });
              if (!res.ok) return null;
              const body = (await res.json()) as { text?: string | null };
              return body.text ?? null;
            } catch {
              return null;
            }
          }
          : undefined,
      },
    });
  }, [aiAvailable, material.lines, plan.difficulty, plan.seed, random, scene.id, used]);

  /* The other side opens, and speaks again after every learner turn. */
  const speak = useCallback(async (current: RunState, next: NextMove) => {
    if (next.kind === "end") return current;
    const beat = next.beat;
    const repair = next.kind === "repair" ? next.outcome : null;

    // An English turn is answered by saying the same line again, the way the
    // persona does it: slowly, at speed, or exactly as before.
    if (repair === "english") {
      const last = [...current.turns].reverse().find((t): t is OtherTurn => t.role === "other" && t.provenance !== "narrated");
      if (last) {
        return otherSaid(current, {
          beatId: beat.id, text: last.text, provenance: last.provenance, lemma: last.lemma, repair: true,
          quick: agenda.onEnglish === "faster", slow: agenda.onEnglish === "slowly",
        });
      }
    }
    const line = await lineFor(beat, repair, current.turns);
    return otherSaid(current, {
      beatId: beat.id, text: line.text, provenance: line.provenance, lemma: line.lemma,
      repair: repair !== null, quick: beat.quick, slow: false,
    });
  }, [agenda.onEnglish, lineFor]);

  useEffect(() => {
    if (phase !== "playing" || state.turns.length > 0 || busy) return;
    const beat = currentBeat(state);
    if (!beat) return;
    let cancelled = false;
    setBusy(true);
    void speak(state, { kind: "answer", beat }).then((next) => {
      if (!cancelled) setState(next);
      setBusy(false);
    });
    return () => { cancelled = true; };
    // Once, on an empty run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const lastOther = [...state.turns].reverse().find((t): t is OtherTurn => t.role === "other" && t.provenance !== "narrated") ?? null;

  const submit = useCallback(async () => {
    const text = typed.trim().slice(0, MAX_TURN_CHARS);
    if (!text || busy || phase !== "playing") return;
    const beat = currentBeat(state);
    if (!beat) return;
    setBusy(true);
    setError(null);
    const evidence = readTurn({ text, needs: beat.needs, shape: beat.shape, ctx, lastLine: lastOther?.text ?? null });
    const { state: moved, next } = advance(state, text, evidence);
    setTyped("");
    setNarration(narrationFor(next, evidence.outcome));
    const spoken = await speak(moved, next);
    setState(spoken);
    setBusy(false);
    if (spoken.finished) void finish(spoken, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed, busy, phase, state, ctx, lastOther, speak]);

  const finish = useCallback(async (final: RunState, walked: boolean) => {
    const ended = walked ? walkOut(final) : final;
    setPhase("finishing");
    const local = debriefOf(scene as SceneSpec, ended);
    const payload = {
      sceneId: scene.id, seed: plan.seed, difficulty: plan.difficulty,
      turns: ended.turns, helped: [...ended.helped], walkedOut: ended.walkedOut,
    };
    try {
      const result = await finishScene(payload);
      if (result.ok) {
        setDebrief(result.debrief);
        setKept("sent");
      } else {
        setDebrief(local);
        setError(result.error);
        setKept(null);
      }
    } catch {
      // No connection, or a bad minute at the server: the run waits on the
      // device and goes up on the next visit. The debrief is the same
      // arithmetic either way, because the marking is pure.
      addPending({ id: `${scene.id}.${plan.seed}`, ...payload, helped: payload.helped });
      setDebrief(local);
      setKept("device");
    }
    clearRun(scene.id, plan.seed);
    setPhase("debrief");
    router.refresh();
  }, [scene, plan.seed, plan.difficulty, router]);

  const leave = useCallback(() => {
    if (phase !== "playing") return;
    void finish(state, true);
  }, [phase, state, finish]);

  /* The help button: an English word, looked up inside the scene's own list. */
  const helpHits: HelpHit[] = useMemo(() => {
    if (!help || help.trim().length < 2) return [];
    const q = help.trim().toLowerCase();
    return Object.entries(material.glosses)
      .filter(([, gloss]) => gloss.toLowerCase().split(/[,;()]/).some((part) => part.trim().startsWith(q) || part.trim().includes(` ${q}`)))
      .slice(0, 6)
      .map(([lemma, gloss]) => ({ lemma, gloss }));
  }, [help, material.glosses]);

  const beat = currentBeat(state);
  const goals = objectives(state);
  const visible = showAll ? state.turns : state.turns.slice(-3);
  const hidden = state.turns.length - visible.length;
  const quick = conditionById("quick");

  useEffect(() => {
    if (!lastOther || hearing === "off") return;
    // Read once per line, in the persona's voice. The button under it replays.
    spokenOnce.current = lastOther.text;
  }, [lastOther, hearing]);

  if (phase === "debrief" && debrief) {
    return (
      <DebriefView
        scene={scene}
        plan={plan}
        debrief={debrief}
        kept={kept}
        error={error}
        glosses={material.glosses}
        added={added}
        onAdd={async (lemma: string) => {
          const id = material.ids[lemma];
          if (!id) return;
          try {
            await addToDeck(id, ["RECOGNITION", "PRODUCTION"], "SCENE");
            setAdded((s) => new Set([...s, lemma]));
          } catch {
            // Offline. The word is still on the list to look up.
          }
        }}
        canDo={canDo}
      />
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6 md:px-8 md:py-10">
      <header className="flex flex-col gap-1">
        <p className="label-xs" style={{ color: "var(--accent-deep)" }}>Situations · {scene.level}</p>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl" style={{ color: "var(--ink)" }}>{scene.title}</h1>
        <p className="text-sm" style={{ color: "var(--ink-2)" }}>
          {scene.place}. Behind the desk is {voice.name}, who {agenda.label}.
        </p>
      </header>

      {/* The role card and the objectives: collapsible, never gone. */}
      <details open className="rounded-[var(--r-lg)] border p-4" style={{ borderColor: "var(--rule)", background: "var(--surface)" }}>
        <summary className="cursor-pointer text-sm font-semibold" style={{ color: "var(--ink)" }}>Your card</summary>
        <p className="mt-2 text-sm" style={{ color: "var(--ink-2)" }}>{plan.card.who} {plan.card.wants}</p>
        <ul className="mt-2 flex flex-col gap-1 text-sm" style={{ color: "var(--ink-2)" }}>
          {plan.card.facts.map((f) => <li key={f}>{f}</li>)}
        </ul>
        <p className="label-xs mt-3" style={{ color: "var(--ink-3)" }}>What you came for</p>
        <ol className="mt-1 flex flex-col gap-1 text-sm">
          {goals.map(({ beat: b, status }) => (
            <li key={b.id} className="flex items-center gap-2" style={{ color: status === "now" ? "var(--ink)" : "var(--ink-2)" }}>
              <span aria-hidden className="w-4 text-center">{status === "done" ? "✓" : status === "missed" ? "·" : status === "now" ? "›" : " "}</span>
              <span>{b.goal}</span>
              <span className="text-2xs" style={{ color: "var(--ink-3)" }}>
                {status === "done" ? "done" : status === "missed" ? "missed" : status === "now" ? "now" : ""}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-2xs" style={{ color: "var(--ink-3)" }}>
          Nothing on this card is about you. You are playing somebody, which is how it stays practice.
        </p>
      </details>

      {/* The conversation. A log that announces each new turn once. */}
      <section
        role="log"
        aria-live="polite"
        aria-label="The conversation"
        className="flex min-h-[180px] flex-col gap-3 rounded-[var(--r-lg)] border p-4"
        style={{ borderColor: "var(--rule)", background: "var(--surface)" }}
      >
        {hidden > 0 && (
          <button type="button" className="tap-tint self-start rounded-full px-2 py-1 text-2xs underline" style={{ color: "var(--ink-3)" }} onClick={() => setShowAll(true)}>
            Show the {hidden} earlier turn{hidden === 1 ? "" : "s"}. In a real conversation you could not.
          </button>
        )}
        {visible.map((turn, i) => (
          <TurnView
            key={`${i}-${turn.role}-${turn.text.slice(0, 12)}`}
            turn={turn}
            voice={voice.id}
            quick={turn.role === "other" && (turn.quick || (beat?.quick ?? false)) && hearing === "on" ? quick : undefined}
            autoplay={turn.role === "other" && turn === lastOther}
            forms={material.forms}
            sceneId={scene.id}
          />
        ))}
        {busy && (
          <p className="flex items-center gap-2 text-xs" style={{ color: "var(--ink-3)" }}>
            <Loader2 size={12} className="animate-spin" aria-hidden /> {voice.name} is thinking.
          </p>
        )}
        {!busy && narration && (
          <p className="text-xs italic" style={{ color: "var(--ink-3)" }}>{narration}</p>
        )}
        {!busy && lastOther === null && state.turns.length > 0 && beat && (
          <p className="text-xs italic" style={{ color: "var(--ink-3)" }}>
            {NARRATION.silent} Nothing recorded fits this turn{aiAvailable ? " and nothing composed passed the check" : ", and there is no key to compose one"}, so they wait for you to {beat.goal.toLowerCase().replace(/\.$/, "")}.
          </p>
        )}
      </section>

      {/* The turn. */}
      {beat && (
        <section className="flex flex-col gap-3">
          <p className="text-sm" style={{ color: "var(--ink)" }}>
            <span className="font-semibold">Now:</span> {beat.goal}
          </p>
          <EstonianInput
            value={typed}
            onChange={setTyped}
            onEnter={() => void submit()}
            ariaLabel="What you say"
            placeholder={beat.shape === "word" ? "A word will do" : "A whole sentence, in Estonian"}
            autoFocus
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={() => void submit()} disabled={busy || typed.trim().length === 0}>
              <Send size={14} aria-hidden /> Say it
            </Button>
            {lastOther && (
              <Speak
                text={lastOther.text}
                voice={voice.id}
                slow
                label="Ask them to say that again, slowly"
                className="press tap-tint inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold"
                style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink-2)" }}
              >
                <RotateCcw size={13} aria-hidden /> Say that again
              </Speak>
            )}
            <button
              type="button"
              className="press tap-tint inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold"
              style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink-2)" }}
              onClick={() => setHelp((h) => (h === null ? "" : null))}
              aria-expanded={help !== null}
            >
              <HelpCircle size={13} aria-hidden /> What is the word for
            </button>
            <button
              type="button"
              className="press tap-tint ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs"
              style={{ color: "var(--ink-3)" }}
              onClick={leave}
            >
              <DoorOpen size={13} aria-hidden /> Walk out
            </button>
          </div>
          {help !== null && (
            <div className="rounded-[var(--r-lg)] border p-3" style={{ borderColor: "var(--rule)", background: "var(--raised)" }}>
              <label className="text-xs" style={{ color: "var(--ink-2)" }}>
                In English
                <input
                  value={help}
                  onChange={(e) => setHelp(e.target.value)}
                  className="mt-1 w-full rounded-[var(--r-sm)] border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
                  placeholder="throat, Thursday, broken"
                  autoFocus
                />
              </label>
              {helpHits.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {helpHits.map((hit) => (
                    <li key={hit.lemma}>
                      <button
                        type="button"
                        className="choice-btn rounded-full px-3 py-1.5 text-sm"
                        onClick={() => {
                          setState((s) => askedForHelp(s, hit.lemma));
                          setTyped((t) => (t ? `${t} ${hit.lemma}` : hit.lemma));
                          setHelp(null);
                        }}
                      >
                        <span lang="et" className="font-semibold">{hit.lemma}</span>{" "}
                        <span style={{ color: "var(--ink-3)" }}>{hit.gloss}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-2xs" style={{ color: "var(--ink-3)" }}>
                Every word you ask for is counted, never held against you, and handed back at the end.
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function TurnView({ turn, voice, quick, autoplay, forms, sceneId }: {
  turn: RunState["turns"][number];
  voice: string;
  quick?: ReturnType<typeof conditionById>;
  autoplay: boolean;
  forms: string[];
  sceneId: string;
}) {
  const known = useMemo(() => new Set(forms), [forms]);
  if (turn.role === "learner") {
    const t = turn as LearnerTurn;
    return (
      <div className="flex flex-col items-end gap-0.5">
        <p lang="et" className="max-w-[85%] rounded-[var(--r-lg)] px-3 py-2 text-sm" style={{ background: "var(--accent-soft)", color: "var(--ink)" }}>
          {t.text}
        </p>
        {t.outcome !== "complete" && (
          <span className="text-2xs" style={{ color: "var(--ink-3)" }}>{OUTCOME_WORD[t.outcome]}</span>
        )}
      </div>
    );
  }
  const o = turn as OtherTurn;
  if (o.provenance === "narrated" && !o.text) return null;
  const tokens = o.text.split(/(\p{L}[\p{L}\p{M}'’-]*)/u);
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex max-w-[92%] items-start gap-2">
        <p lang={o.provenance === "english" ? "en" : "et"} className="rounded-[var(--r-lg)] px-3 py-2 text-base" style={{ background: "var(--raised)", color: "var(--ink)" }}>
          {o.provenance === "english"
            ? o.text
            : tokens.map((piece, i) => {
              const lower = piece.toLowerCase();
              return known.has(lower)
                ? <Link key={i} href={`/dictionary?q=${encodeURIComponent(lower)}`} className="underline decoration-dotted underline-offset-2">{piece}</Link>
                : <span key={i}>{piece}</span>;
            })}
        </p>
        {o.provenance !== "english" && (
          <Speak text={o.text} voice={voice} condition={quick} slow={o.slow} autoplay={autoplay} size={14} />
        )}
      </div>
      <p className="flex flex-wrap items-center gap-1.5 text-2xs" style={{ color: "var(--ink-3)" }}>
        <Chip tone={o.provenance === "attested" ? "good" : o.provenance === "composed" ? "hard" : "neutral"}>
          {PROVENANCE_WORD[o.provenance]}
        </Chip>
        {o.provenance === "attested" && o.lemma && <span>recorded under <span lang="et">{o.lemma}</span></span>}
        {o.slow && <span>said slowly</span>}
        {o.quick && !o.slow && <span>at speed</span>}
        {o.provenance !== "english" && (
          <SuggestFix
            category="OTHER"
            lemma={o.lemma}
            trigger={`Situations, ${sceneId}: the other side said "${o.text}" (${o.provenance})`}
            label="Nobody says that"
          />
        )}
      </p>
    </div>
  );
}

const PROVENANCE_WORD: Record<OtherTurn["provenance"], string> = {
  attested: "Recorded",
  composed: "Composed, checked word by word",
  english: "In English",
  narrated: "",
};

const OUTCOME_WORD: Record<TurnOutcome, string> = {
  complete: "",
  incomplete: "part of it",
  unrecognised: "not caught",
  offTarget: "understood, not what was asked",
  english: "in English",
  repeat: "their own words",
  tooShort: "waiting for the rest",
};

function DebriefView({ scene, plan, debrief, kept, error, glosses, added, onAdd, canDo }: {
  scene: SceneClient["scene"];
  plan: Plan;
  debrief: Debrief;
  kept: "sent" | "device" | null;
  error: string | null;
  glosses: Record<string, string>;
  added: Set<string>;
  onAdd: (lemma: string) => Promise<void>;
  canDo: string;
}) {
  const [adding, setAdding] = useState<string | null>(null);
  const fresh = Math.random().toString(36).slice(2, 10);
  const difficulty = DIFFICULTIES.find((d) => d.level === plan.difficulty);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 md:px-8 md:py-10">
      <header>
        <p className="label-xs" style={{ color: "var(--accent-deep)" }}>How it went</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl" style={{ color: "var(--ink)" }}>{debrief.outcome}</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--ink-2)" }}>
          {debrief.done} of {debrief.of} things got done. {debrief.english > 0 ? `You reached for English ${debrief.english === 1 ? "once" : `${debrief.english} times`}, which is the thing to practise against, and nobody minds.` : "Not a word of English, which is the whole point."}
        </p>
        {kept === "device" && (
          <p className="mt-2 flex items-center gap-1 text-xs" style={{ color: "var(--hard-ink)" }}>
            <CircleAlert size={12} aria-hidden /> Kept on this device. It goes up the next time you open Situations with a connection.
          </p>
        )}
        {error && <p className="mt-2 text-xs" style={{ color: "var(--again-ink)" }}>{error}</p>}
      </header>

      <section className="rounded-[var(--r-lg)] border p-4" style={{ borderColor: "var(--rule)", background: "var(--surface)" }}>
        <h2 className="text-sm font-semibold" style={{ color: "var(--ink)" }}>What you got done</h2>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {debrief.objectives.map((o) => (
            <li key={o.beatId} className="flex items-center gap-2" style={{ color: o.met ? "var(--good-ink)" : "var(--ink-2)" }}>
              <span aria-hidden className="w-4 text-center">{o.met ? "✓" : "·"}</span>
              <span>{o.goal}</span>
              <span className="text-2xs" style={{ color: "var(--ink-3)" }}>{o.met ? "done" : "missed"}</span>
            </li>
          ))}
        </ul>
        {debrief.curveballs.length > 0 && (
          <p className="mt-3 text-xs" style={{ color: "var(--ink-3)" }}>
            {difficulty?.name ?? "Difficulty"}: {debrief.curveballs.length} thing{debrief.curveballs.length === 1 ? "" : "s"} did not go to plan.
          </p>
        )}
      </section>

      {debrief.turns.length > 0 && (
        <section className="rounded-[var(--r-lg)] border p-4" style={{ borderColor: "var(--rule)", background: "var(--surface)" }}>
          <h2 className="text-sm font-semibold" style={{ color: "var(--ink)" }}>Your turns</h2>
          <p className="text-2xs" style={{ color: "var(--ink-3)" }}>A dotted word is one the dictionary could not vouch for.</p>
          <ul className="mt-2 flex flex-col gap-2">
            {debrief.turns.map((t, i) => (
              <li key={i} className="text-sm">
                <p lang="et" style={{ color: "var(--ink)" }}>
                  {t.words.map((w, j) => (
                    <span key={j} className={w.recognised ? "" : "underline decoration-dotted"} style={{ color: w.recognised ? undefined : "var(--again-ink)" }}>{w.word}{" "}</span>
                  ))}
                </p>
                {t.outcome !== "complete" && <p className="text-2xs" style={{ color: "var(--ink-3)" }}>{OUTCOME_WORD[t.outcome]}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {debrief.gaps.length > 0 && (
        <section className="rounded-[var(--r-lg)] border p-4" style={{ borderColor: "var(--rule)", background: "var(--surface)" }}>
          <h2 className="text-sm font-semibold" style={{ color: "var(--ink)" }}>The words this conversation needed</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {debrief.gaps.map((g) => (
              <li key={`${g.kind}-${g.lemma}`} className="flex flex-wrap items-center gap-2 text-sm">
                <span lang="et" className="font-semibold" style={{ color: "var(--ink)" }}>{g.lemma}</span>
                <span style={{ color: "var(--ink-2)" }}>{glosses[g.lemma] ?? ""}</span>
                <Chip>{g.kind === "ASKED" ? "you asked for it" : "it stalled here"}</Chip>
                <Link href={`/dictionary?q=${encodeURIComponent(g.lemma)}`} className="text-xs underline" style={{ color: "var(--accent-deep)" }}>Look it up</Link>
                <AddGap lemma={g.lemma} added={added.has(g.lemma)} adding={adding === g.lemma} onAdd={async () => { setAdding(g.lemma); await onAdd(g.lemma); setAdding(null); }} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-[var(--r-lg)] border p-4" style={{ borderColor: "var(--rule)", background: "var(--surface)" }}>
        <h2 className="text-sm font-semibold" style={{ color: "var(--ink)" }}>One thing to work on</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
          This scene checks one promise the course makes: {canDo.toLowerCase().replace(/\.$/, "")}. The unit behind it is where the words are.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <ButtonLink href={`/learn/${scene.tests}`} variant="ghost" size="sm">Open the unit</ButtonLink>
          <ButtonLink href={`/situations/${scene.id}?seed=${fresh}&d=${plan.difficulty}`} variant="primary" size="sm">
            Try it again <ArrowRight size={14} aria-hidden />
          </ButtonLink>
          <ButtonLink href="/situations" variant="ghost" size="sm">All situations</ButtonLink>
        </div>
        <p className="mt-3 text-2xs" style={{ color: "var(--ink-3)" }}>
          The second run is where most of the learning is. Same card, another person behind the desk.
        </p>
      </section>
    </div>
  );
}

function AddGap({ lemma, added, adding, onAdd }: { lemma: string; added: boolean; adding: boolean; onAdd: () => Promise<void> }) {
  if (added) return <Chip tone="good">in your deck</Chip>;
  return (
    <button
      type="button"
      className="press tap-tint rounded-full border px-2.5 py-1 text-xs font-semibold"
      style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink-2)" }}
      disabled={adding}
      onClick={() => void onAdd()}
      aria-label={`Add ${lemma} to your deck`}
    >
      {adding ? "Adding" : "Add to deck"}
    </button>
  );
}
