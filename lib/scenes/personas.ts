/**
 * What an agenda changes, and nothing else it changes.
 *
 * A persona is a voice and an agenda. The voice is one of the twelve in
 * `lib/audio/voice.ts`, and the agenda is one of four kinds of person anybody
 * who has stood at a counter in Estonia has met. Between them they turn one
 * set of beats into four conversations, which is the whole of §5 of the
 * design: props change the words, an agenda changes the person.
 *
 * Every effect here is mechanical and none of it is Estonian. Patience is a
 * number of retries; pace is whether the other side's lines are heard at
 * speed (`lib/audio/conditions.ts`); and `onEnglish` is what they do when the
 * learner reaches for English, which is the moment this module exists for.
 * The helpful one says their line again slowly; the brisk one says it again
 * at speed; the one on a script says it again exactly as before.
 *
 * Pure.
 */
import type { Agenda } from "./types";

export interface AgendaEffects {
  /** Added to every beat's patience. Negative is somebody with a queue. */
  readonly patienceShift: number;
  /** Whether their lines are heard at speed. */
  readonly quick: boolean;
  /** How they answer a turn written in English. */
  readonly onEnglish: "slowly" | "again" | "faster";
  /** English. How the screen introduces them, after the place. */
  readonly label: string;
}

export const AGENDAS: Readonly<Record<Agenda, AgendaEffects>> = {
  brisk: {
    patienceShift: -1,
    quick: true,
    onEnglish: "faster",
    label: "wants the queue gone",
  },
  thorough: {
    patienceShift: 1,
    quick: false,
    onEnglish: "slowly",
    label: "is thorough, and slow",
  },
  new: {
    patienceShift: 0,
    quick: false,
    onEnglish: "slowly",
    label: "started last week and is still unsure",
  },
  script: {
    patienceShift: 0,
    quick: false,
    onEnglish: "again",
    label: "is following a script, and will not leave it",
  },
};

export function effectsOf(agenda: Agenda): AgendaEffects {
  return AGENDAS[agenda];
}

/** Patience never falls below one: everybody asks at least once more. */
export function patienceUnder(agenda: Agenda, patience: number): number {
  return Math.max(1, patience + AGENDAS[agenda].patienceShift);
}
