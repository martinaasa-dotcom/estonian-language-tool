/**
 * The machine that decides what happens next, which is never the model.
 *
 * `docs/19-situations.md` §18 names the first way this module could fail: a
 * chatbot in a costume. The guard is that the state machine decides what
 * happens, the dictionary decides what advances it, and the model writes one
 * line for one move inside a closed word list. This file is the first of
 * those three, and `advance` taking `Evidence` rather than a verdict is what
 * makes the second mechanical: `readTurn` is the only producer of `Evidence`,
 * so a caller holding a model's opinion cannot advance a scene by mistake.
 *
 * THERE ARE NO METERS (§7). No progress bar, no timer, no patience gauge:
 * every one of those turns this into a game about the gauge. Patience is a
 * number in here and it is never drawn. When it runs out the other side says
 * so, in words, and moves on, which is what a person does.
 *
 * Pure: no React, no Next, no Prisma, no network, no clock.
 */
import { advances, type Evidence, type TurnReading } from "./turn";
import type { BeatSpec, SceneSpec } from "./types";

/** What the other side does about the turn just read. */
export type Response =
  /** Answer the content and move on. */
  | "answer"
  /** Answer, and ask again for the part that was left out. */
  | "narrow"
  /** They did not catch it. Ask again, the whole question. */
  | "repeat"
  /** Wait, because a person would. A one-word turn where a sentence was due. */
  | "wait"
  /** They let it go and move on, out of patience rather than out of agreement. */
  | "moveOn"
  /** Answer the English, in character. Helpful or brisk, per the persona. */
  | "english";

/** One turn of the conversation, as the transcript holds it. */
export interface TurnRecord {
  readonly beatId: string;
  /** What the learner wrote. Fiction about a role card, never about them (§3). */
  readonly said: string;
  readonly reading: TurnReading;
  /** Which of the beat's requirements this turn met. */
  readonly met: readonly boolean[];
  /** Whether the app had to supply a word for this beat before it was met. */
  readonly helped: boolean;
}

export interface SceneState {
  readonly sceneId: string;
  /** Where in `beats` we are. Past the end means the scene is over. */
  readonly beat: number;
  /** Tries left on this beat before the other side moves on. */
  readonly patience: number;
  /** Beat ids met, in the order they were met. */
  readonly done: readonly string[];
  /** Every turn, for the debrief and for the server to re-mark. */
  readonly turns: readonly TurnRecord[];
  /** Set when the learner leaves. Leaving is a real option (§13). */
  readonly walkedOut: boolean;
}

export function startScene(scene: SceneSpec): SceneState {
  const first = scene.beats[0];
  return {
    sceneId: scene.id,
    beat: 0,
    patience: first ? first.patience : 0,
    done: [],
    turns: [],
    walkedOut: false,
  };
}

export function currentBeat(scene: SceneSpec, state: SceneState): BeatSpec | undefined {
  return scene.beats[state.beat];
}

export function isOver(scene: SceneSpec, state: SceneState): boolean {
  return state.walkedOut || state.beat >= scene.beats.length;
}

/**
 * The one consumer of `Evidence`.
 *
 * What it can do is move to the next beat, spend a try, or record the turn and
 * stay. What it cannot do is take anything a model wrote, which is the type
 * rather than a rule anybody has to remember.
 *
 * A `wait` and an `echo` cost nothing. Both are the other side reacting to
 * something that was not a turn: a one-word answer where a person would have
 * said a sentence, and their own line handed back. Spending patience on either
 * would mean a learner could be moved past a beat for saying too little, which
 * is the opposite of what a look and a wait is for.
 *
 * English costs a try, because it is a turn, and the design is explicit that
 * it is counted and never scolded: what it buys is the persona's answer and
 * one fewer attempt, not a mark and not a word about it.
 */
export function advance(
  scene: SceneSpec,
  state: SceneState,
  evidence: Evidence,
  said: string,
  helped = false,
): { readonly state: SceneState; readonly response: Response } {
  const beat = currentBeat(scene, state);
  if (!beat || state.walkedOut) return { state, response: "answer" };

  const turns = [...state.turns, {
    beatId: beat.id,
    said,
    reading: evidence.reading,
    met: evidence.met,
    helped,
  }];

  if (advances(evidence.reading)) {
    return {
      state: { ...state, ...moveOn(scene, state.beat), done: [...state.done, beat.id], turns },
      response: "answer",
    };
  }

  if (evidence.reading === "fragment" || evidence.reading === "echo") {
    return {
      state: { ...state, turns },
      response: evidence.reading === "echo" ? "repeat" : "wait",
    };
  }

  const patience = state.patience - 1;
  if (patience <= 0) {
    /*
      Out of patience, so they move on. The beat is NOT marked done: an
      objective the learner did not meet is an objective the debrief has to be
      able to say they did not meet, and a scene that quietly credited one for
      being persistent would be a scene with a score hidden inside it.
    */
    return {
      state: { ...state, ...moveOn(scene, state.beat), turns },
      response: "moveOn",
    };
  }

  return {
    state: { ...state, patience, turns },
    response: responseFor(evidence.reading),
  };
}

/** The learner leaves. No reproach, and the debrief still runs (§13). */
export function walkOut(state: SceneState): SceneState {
  return { ...state, walkedOut: true };
}

function moveOn(scene: SceneSpec, from: number): { beat: number; patience: number } {
  const beat = from + 1;
  return { beat, patience: scene.beats[beat]?.patience ?? 0 };
}

function responseFor(reading: TurnReading): Response {
  if (reading === "english") return "english";
  if (reading === "incomplete") return "narrow";
  if (reading === "offtarget") return "narrow";
  return "repeat";
}

/**
 * Which required beats were met, which were not, and what the run came to.
 *
 * A count of things achieved and never a percentage (§12, §18): a mark on a
 * conversation is a claim about somebody's Estonian, and the only module
 * allowed to make one is the mock exam, which caveats it heavily (ADR-022).
 */
export interface Objectives {
  readonly met: readonly string[];
  readonly missed: readonly string[];
}

export function objectivesOf(scene: SceneSpec, state: SceneState): Objectives {
  const done = new Set(state.done);
  const required = scene.beats.filter((b) => b.required);
  return {
    met: required.filter((b) => done.has(b.id)).map((b) => b.id),
    missed: required.filter((b) => !done.has(b.id)).map((b) => b.id),
  };
}

/**
 * How the run ended.
 *
 * The first outcome whose required beats were all met, which is why a scene
 * lists them from the fullest down. At least one outcome is a failure that is
 * not the learner's fault, because a real encounter has those and a module
 * where trying hard enough always works has stopped simulating anything.
 */
export function outcomeOf(scene: SceneSpec, state: SceneState) {
  if (state.walkedOut) return scene.outcomes.find((o) => o.id === "left") ?? null;
  const done = new Set(state.done);
  return scene.outcomes.find((o) => o.when.every((id) => done.has(id))) ?? null;
}
