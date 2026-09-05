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
import { curveballById, type CurveballId, type CurveballSpec } from "./curveballs";
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
  | "english"
  /** The offer was turned down, and they make another. Once per beat. */
  | "counter";

/** One turn of the conversation, as the transcript holds it. */
export interface TurnRecord {
  readonly beatId: string;
  /** What the learner wrote. Fiction about a role card, never about them (§3). */
  readonly said: string;
  /** The line they were answering, so the debrief can show both sides. Absent on a row written before it was kept. */
  readonly heard?: string;
  readonly reading: TurnReading;
  /** Which of the beat's requirements this turn met. */
  readonly met: readonly boolean[];
  /** The words that met them, for the other side to repeat back. Absent on a row written before it was kept. */
  readonly matched?: readonly string[];
  /** Whether the app had to supply a word for this beat before it was met. */
  readonly helped: boolean;
}

/**
 * A curveball in play: what went wrong on this beat, and what the learner has
 * done about it so far. The beat itself waits behind it.
 */
export interface Hurdle {
  readonly id: CurveballId;
  readonly beat: number;
  readonly tries: number;
}

/** A curveball that has been and gone, for the debrief. */
export interface HurdleRecord {
  readonly id: CurveballId;
  readonly beat: number;
  /** Whether the learner dealt with it, or the other side let it go. */
  readonly met: boolean;
}

/** How many tries a hurdle stands for before they let it go. */
export const HURDLE_TRIES = 2;

export interface SceneState {
  readonly sceneId: string;
  /** The curveball standing in front of the current beat, if one is. */
  readonly hurdle: Hurdle | null;
  /** Every curveball this run has raised, met or not. */
  readonly hurdles: readonly HurdleRecord[];
  /** Where in `beats` we are. Past the end means the scene is over. */
  readonly beat: number;
  /** Tries left on this beat before the other side moves on. */
  readonly patience: number;
  /** Beat ids met, in the order they were met. */
  readonly done: readonly string[];
  /**
   * Beats whose first offer was turned down and countered, so the second no
   * ends it and every later line reads the second offer's values
   * (`cardInPlay`). Absent on a state written before counters existed.
   */
  readonly countered?: readonly string[];
  /** Every turn, for the debrief and for the server to re-mark. */
  readonly turns: readonly TurnRecord[];
  /** Set when the learner leaves. Leaving is a real option (§13). */
  readonly walkedOut: boolean;
}

export function startScene(scene: SceneSpec): SceneState {
  const first = scene.beats[0];
  return {
    sceneId: scene.id,
    hurdle: null,
    hurdles: [],
    beat: 0,
    patience: first ? first.patience : 0,
    done: [],
    countered: [],
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
  heard = "",
): { readonly state: SceneState; readonly response: Response } {
  const beat = currentBeat(scene, state);
  if (!beat || state.walkedOut) return { state, response: "answer" };

  const turns = [...state.turns, {
    beatId: beat.id,
    said,
    reading: evidence.reading,
    met: evidence.met,
    helped,
    ...(heard ? { heard } : {}),
    ...(evidence.matched.length > 0 ? { matched: evidence.matched } : {}),
  }];

  if (advances(evidence.reading)) {
    return {
      state: { ...state, ...moveOn(scene, state.beat), done: [...state.done, beat.id], turns },
      response: "answer",
    };
  }

  /*
    A NO GETS A SECOND OFFER, AND A SECOND NO IS AN ANSWER. Somebody who
    hears "ei sobi" tries another day rather than saying goodbye, so the
    first refusal on a beat with a counter costs nothing and the other side
    offers again; the beat waits, and every later line reads the second
    offer's values. The second refusal is the learner saying it will not
    do, which is what the beat's goal allows, so it is met and the scene
    moves on. A beat with no counter never produces this reading.
  */
  if (evidence.reading === "declined") {
    const countered = state.countered ?? [];
    if (beat.counter && !countered.includes(beat.id)) {
      return { state: { ...state, turns, countered: [...countered, beat.id] }, response: "counter" };
    }
    return {
      state: { ...state, ...moveOn(scene, state.beat), done: [...state.done, beat.id], turns },
      response: "answer",
    };
  }

  /*
    A look and a wait costs nothing the first time. It cost nothing every
    time, and a learner who kept typing one word at a beat that wanted a
    sentence was waited for for ever: seventy turns of `Tere!` and the scene
    never moved, which the fuzz harness found in four scenes out of seven. A
    person waits once. The second fragment in a row on the same beat is read
    as a turn that missed, and spends a try like one.
  */
  const previous = state.turns[state.turns.length - 1];
  const waitedAlready = previous?.beatId === beat.id
    && (previous.reading === "fragment" || previous.reading === "echo");
  if ((evidence.reading === "fragment" || evidence.reading === "echo") && !waitedAlready) {
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

/**
 * THE CURVEBALLS ARE PLAYED, WHICH FOR A WHILE THEY WERE NOT.
 *
 * `planRun` drew them, `beginRun` wrote them down and `recencyFor` read them
 * back so the next run would not repeat one, and no turn of any conversation
 * was ever changed by one: the difficulty dial promised "one thing catches you
 * out" and nothing did. A curveball is a hurdle now. When the conversation
 * reaches the beat it was drawn at, the other side does what the curveball
 * says and the beat waits behind it: the learner's next turns are read against
 * the curveball's own `needs` (§9), and once one lands, or `HURDLE_TRIES` have
 * not, the beat is asked as it would have been. A silent curveball changes
 * the beat's patience and asks for nothing, which is what "a queue forms
 * behind you" is.
 *
 * Raised by the replay before a turn is read, off the run's stored draw, so
 * the state machine stays pure and the draw stays the server's.
 */
export function raiseHurdle(
  scene: SceneSpec,
  state: SceneState,
  drawn: readonly { id: string; at: number }[],
): SceneState {
  if (state.hurdle || state.walkedOut || state.beat >= scene.beats.length) return state;
  const here = drawn.find((d) => d.at === state.beat);
  if (!here) return state;
  const spec = curveballById(here.id as CurveballId);
  if (!spec || state.hurdles.some((h) => h.beat === state.beat)) return state;
  if (spec.silent) {
    return {
      ...state,
      patience: Math.max(1, state.patience - 1),
      hurdles: [...state.hurdles, { id: spec.id, beat: state.beat, met: true }],
    };
  }
  return { ...state, hurdle: { id: spec.id, beat: state.beat, tries: 0 } };
}

/** The curveball standing in the way, as a beat the marker and the ladder can read. */
export function hurdleBeat(hurdle: Hurdle): BeatSpec | null {
  const spec = curveballById(hurdle.id);
  if (!spec) return null;
  return {
    id: `hurdle:${spec.id}`,
    goal: spec.out,
    they: spec.says,
    move: spec.move ?? "ask",
    topic: [],
    needs: spec.needs,
    required: false,
    patience: HURDLE_TRIES,
    shape: "word",
  };
}

export function hurdleSpec(state: SceneState): CurveballSpec | null {
  return state.hurdle ? curveballById(state.hurdle.id) ?? null : null;
}

/**
 * The learner's turn, read against the hurdle rather than the beat.
 *
 * Met, and the beat is asked next; not met, and they try again until the other
 * side lets it go. Letting it go is written down as not met, because a
 * curveball the learner did not deal with is exactly what the debrief exists
 * to say. A fragment or an echo costs no try, for the reason it costs the beat
 * none.
 */
export function advanceHurdle(
  scene: SceneSpec,
  state: SceneState,
  evidence: Evidence,
  said: string,
  heard = "",
): { readonly state: SceneState; readonly response: Response } {
  const hurdle = state.hurdle;
  const beat = currentBeat(scene, state);
  if (!hurdle || !beat) return { state, response: "answer" };

  const turns = [...state.turns, {
    beatId: `hurdle:${hurdle.id}`,
    said,
    reading: evidence.reading,
    met: evidence.met,
    helped: false,
    ...(heard ? { heard } : {}),
  }];

  if (advances(evidence.reading)) {
    return {
      state: {
        ...state, turns, hurdle: null,
        hurdles: [...state.hurdles, { id: hurdle.id, beat: hurdle.beat, met: true }],
      },
      response: "answer",
    };
  }
  const previous = state.turns[state.turns.length - 1];
  const waitedAlready = previous?.beatId === `hurdle:${hurdle.id}`
    && (previous.reading === "fragment" || previous.reading === "echo");
  if ((evidence.reading === "fragment" || evidence.reading === "echo") && !waitedAlready) {
    return { state: { ...state, turns }, response: evidence.reading === "echo" ? "repeat" : "wait" };
  }
  const tries = hurdle.tries + 1;
  if (tries >= HURDLE_TRIES) {
    return {
      state: {
        ...state, turns, hurdle: null,
        hurdles: [...state.hurdles, { id: hurdle.id, beat: hurdle.beat, met: false }],
      },
      response: "moveOn",
    };
  }
  return { state: { ...state, turns, hurdle: { ...hurdle, tries } }, response: responseFor(evidence.reading) };
}
