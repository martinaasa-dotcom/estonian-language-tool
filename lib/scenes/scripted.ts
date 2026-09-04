import { BANK } from "./bank";
import type { BeatSpec, SceneSpec } from "./types";

/**
 * LINES WRITTEN BEFORE ANYBODY PLAYED, AND WHICH BEATS MAY HAVE ONE.
 *
 * ADR-025 amendment 1. The ladder in `line.ts` had three rungs: a sentence a
 * lexicographer recorded, a line a model composes on the spot behind the gate,
 * and the way out. Phase 0 measured the first as thin (a lexicographer records
 * a sentence to illustrate a word, not to ask a question), so the composer
 * carried every beat that made a scene *this* scene, which meant a keyless
 * deployment could hold no conversation at all and a keyed one paid for every
 * turn and got a different receptionist each time.
 *
 * A scripted line is a composed line moved to a different moment. A model
 * drafts it offline (`scripts/draft-lines.ts`), inside the same closed word
 * list, and it passes the same four checks then, or it is not written. It
 * lands in `bank.ts`, which is generated and never typed, so the pull request
 * that adds it is where a person reads it; and a native speaker's pass, when
 * there is one, edits the same file and flips `reviewed`. The screen prints
 * which rung answered, exactly as it does for the other three.
 *
 * WHAT A SCRIPTED LINE MAY NEVER BE. It is Estonian a model wrote, so it is
 * never a card answer, never an exam answer and never a marking target: the
 * marker in `turn.ts` compares a turn against the dictionary and reads nothing
 * from here, and an invariant holds that nothing under `lib/srs`, `lib/exam`
 * or `lib/assessment` can reach this file. It is the other side's line and
 * nothing else.
 *
 * WHICH BEATS MAY HAVE ONE. A line that has to name a time, a room number or a
 * document code cannot be drafted in advance, because the card draws those per
 * run and a scripted "Kas kell kolm sobib?" would offer a time nobody was
 * dealt. So a beat that waits on such a datum is not scriptable, and the bank
 * is read through that rule rather than trusted, since a row drafted before a
 * scene was edited is exactly the row that would otherwise leak.
 *
 * Pure: no React, no Next, no Prisma, no clock.
 */

export interface ScriptedLine {
  readonly scene: string;
  readonly beat: string;
  readonly text: string;
  /** Which model drafted it, so a bad batch can be traced to its source. */
  readonly model: string;
  /** The day it was drafted, ISO date. */
  readonly draftedAt: string;
  /**
   * Whether a native speaker has read it. False on every row a script wrote;
   * true is set by a person editing this file, and the chip changes with it.
   */
  readonly reviewed: boolean;
}

/** The prop kinds whose value is drawn per run, and so cannot be in a line drafted before it. */
const DRAWN_PER_RUN = new Set(["time", "number", "code"]);

/** Whether a beat's line could be written before the run it is said in. */
export function scriptable(scene: SceneSpec, beat: BeatSpec): boolean {
  const perRun = new Set(
    scene.props.filter((prop) => DRAWN_PER_RUN.has(prop.kind)).map((prop) => prop.slot),
  );
  return !beat.needs.some((need) => need.kind === "datum" && perRun.has(need.slot));
}

/** The drafted lines for one beat, in the bank's order. Empty where there are none. */
export function scriptedFor(scene: SceneSpec, beat: BeatSpec): readonly string[] {
  if (!scriptable(scene, beat)) return [];
  return BANK.filter((row) => row.scene === scene.id && row.beat === beat.id).map((row) => row.text);
}

/** Whether a native speaker has read a given line. */
export function isReviewed(text: string): boolean {
  return BANK.some((row) => row.text === text && row.reviewed);
}
