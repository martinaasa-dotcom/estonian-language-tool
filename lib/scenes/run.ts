/**
 * The state of one conversation, and the only way it moves.
 *
 * `advance` takes `Evidence` and nothing else, which is the device
 * `buildOptions` uses with a parsed `Government`: a caller holding a model's
 * verdict cannot call it. The state is plain data so it can sit in the
 * browser for the length of a scene, be stored as the transcript when the
 * scene ends, and be rebuilt on the server from the same turns to decide the
 * grades (design §15).
 *
 * THERE ARE NO METERS. Pressure is carried in what the other person says.
 * When patience runs out they say so, in words, and move on; the beat is
 * missed, and if it was required the debrief opens on it.
 *
 * Pure.
 */
import type { Plan, PlannedBeat } from "./draw";
import type { Evidence, TurnOutcome } from "./turn";

export type Provenance = "attested" | "composed" | "english" | "narrated";

export interface OtherTurn {
  readonly role: "other";
  readonly beatId: string;
  readonly text: string;
  readonly provenance: Provenance;
  /** The entry an attested line was recorded under. */
  readonly lemma: string | null;
  /** Whether this was a repair: them asking again. */
  readonly repair: boolean;
  /** Heard at speed. */
  readonly quick: boolean;
  /** Said slowly, which is the helpful persona answering English. */
  readonly slow: boolean;
}

export interface LearnerTurn {
  readonly role: "learner";
  readonly beatId: string;
  readonly text: string;
  readonly outcome: TurnOutcome;
  readonly recognised: readonly string[];
  readonly unknown: readonly string[];
  /** What each requirement was met with, or null. */
  readonly met: readonly (string | null)[];
}

export type Turn = OtherTurn | LearnerTurn;

export interface RunState {
  readonly plan: Plan;
  /** Index into `plan.beats` of the beat being played. */
  readonly index: number;
  /** How many times the other side has asked at this beat. */
  readonly asked: number;
  readonly turns: readonly Turn[];
  /** Beat id to whether its requirements were all met. */
  readonly met: Readonly<Record<string, boolean>>;
  /** Lemmas the help button was pressed for. */
  readonly helped: readonly string[];
  /** Turns in English. */
  readonly english: number;
  readonly finished: boolean;
  /** Ended by walking out rather than by the last beat. */
  readonly walkedOut: boolean;
}

export function startRun(plan: Plan): RunState {
  return { plan, index: 0, asked: 0, turns: [], met: {}, helped: [], english: 0, finished: false, walkedOut: false };
}

export function currentBeat(state: RunState): PlannedBeat | null {
  return state.finished ? null : (state.plan.beats[state.index] ?? null);
}

/** The other side spoke. */
export function otherSaid(state: RunState, turn: Omit<OtherTurn, "role">): RunState {
  return { ...state, turns: [...state.turns, { role: "other", ...turn }], asked: state.asked + 1 };
}

/**
 * What the other side does next, given how the last turn read.
 *
 *   - `answer`: the beat is done; move on and play the next beat.
 *   - `repair`: ask again at this beat, in the manner the outcome deserves.
 *   - `moveOn`: patience is spent; say so and play the next beat.
 *   - `end`: nothing left.
 */
export type NextMove =
  | { readonly kind: "answer"; readonly beat: PlannedBeat }
  | { readonly kind: "repair"; readonly beat: PlannedBeat; readonly outcome: TurnOutcome }
  | { readonly kind: "moveOn"; readonly beat: PlannedBeat; readonly missed: PlannedBeat }
  | { readonly kind: "end" };

/** Applies what the dictionary found, and says what the other side does next. */
export function advance(state: RunState, text: string, evidence: Evidence): { state: RunState; next: NextMove } {
  const beat = currentBeat(state);
  if (!beat) return { state, next: { kind: "end" } };

  const learnerTurn: LearnerTurn = {
    role: "learner",
    beatId: beat.id,
    text,
    outcome: evidence.outcome,
    recognised: evidence.recognised,
    unknown: evidence.unknown,
    met: evidence.met.map((m) => m.with),
  };
  const english = state.english + (evidence.outcome === "english" ? 1 : 0);
  const turns = [...state.turns, learnerTurn];

  if (evidence.outcome === "complete") {
    const met = { ...state.met, [beat.id]: true };
    const nextIndex = state.index + 1;
    const nextBeat = state.plan.beats[nextIndex];
    const finished = !nextBeat;
    const moved: RunState = { ...state, turns, met, english, index: nextIndex, asked: 0, finished };
    return { state: moved, next: nextBeat ? { kind: "answer", beat: nextBeat } : { kind: "end" } };
  }

  // A repeat and a turn in English do not spend patience: neither was an attempt at the beat.
  const spends = evidence.outcome !== "repeat" && evidence.outcome !== "english";
  if (!spends || state.asked < beat.patience) {
    return { state: { ...state, turns, english }, next: { kind: "repair", beat, outcome: evidence.outcome } };
  }

  // Patience spent. The beat is missed, and they move on.
  const met = { ...state.met, [beat.id]: false };
  const nextIndex = state.index + 1;
  const nextBeat = state.plan.beats[nextIndex];
  const finished = !nextBeat;
  const moved: RunState = { ...state, turns, met, english, index: nextIndex, asked: 0, finished };
  return { state: moved, next: nextBeat ? { kind: "moveOn", beat: nextBeat, missed: beat } : { kind: "end" } };
}

export function askedForHelp(state: RunState, lemma: string): RunState {
  if (state.helped.includes(lemma)) return state;
  return { ...state, helped: [...state.helped, lemma] };
}

export function walkOut(state: RunState): RunState {
  return { ...state, finished: true, walkedOut: true };
}

/** Which required beats are still ahead, for the objectives list. */
export function objectives(state: RunState): { beat: PlannedBeat; status: "done" | "missed" | "ahead" | "now" }[] {
  return state.plan.beats
    .filter((b) => b.required)
    .map((beat) => {
      const i = state.plan.beats.indexOf(beat);
      const met = state.met[beat.id];
      const status = met === true ? "done" : met === false ? "missed" : i === state.index && !state.finished ? "now" : "ahead";
      return { beat, status };
    });
}
