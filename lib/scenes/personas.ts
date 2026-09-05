/**
 * Who is behind the desk today.
 *
 * **The persona is the strongest lever in the draw and it is nearly free**
 * (`docs/19-situations.md` §5). A receptionist who wants the queue gone, one
 * who is thorough and slow, one who is new and unsure, one following a script
 * and not deviating: same beats, same props, four conversations that feel
 * nothing alike. Props change the words. An agenda changes the person.
 *
 * Three levers and each is one number or one list:
 *
 *   patience  a delta on every beat's own, so a brisk one gives you one fewer
 *             try at everything and a thorough one gives you an extra.
 *   voice     one of the ten TartuNLP voices, so a second person in a scene
 *             reads as a second person rather than as more of the first.
 *   leans     which curveballs attach to them, which is how an agenda becomes
 *             something that happens rather than a label on a card.
 *
 * WHAT THIS FILE MAY WRITE. English. Not a word of Estonian, not even a lemma:
 * a persona has no vocabulary of its own, because everything they say comes
 * from the scene's own list through `sceneLine`.
 *
 * Pure: no React, no Next, no Prisma, no clock.
 */
import { VOICES } from "@/lib/audio/voice";
import type { CurveballId } from "./curveballs";

export interface PersonaSpec {
  readonly id: string;
  /** English, one line, shown before the scene starts. */
  readonly who: string;
  /**
   * Added to every beat's patience. Never below one try in total, which
   * `patienceFor` enforces rather than every caller remembering.
   */
  readonly patience: number;
  /** One of the twelve. Checked against the allowlist, not merely typed. */
  readonly voice: string;
  /** How fast they talk. The speech route's own scale. */
  readonly speed: number;
  /** Curveballs this one makes likelier. Never ones the scene does not admit. */
  readonly leans: readonly CurveballId[];
  /**
   * Whether they put the question into English when the learner writes
   * English (§8). The helpful ones do; the brisk one and the one on the form
   * repeat it in Estonian and wait. It is the persona's answer to English and
   * never a mark against it.
   */
  readonly translates: boolean;
  /** Whether they say "hästi" before the next question. The brisk one does not. */
  readonly acknowledges: boolean;
}

/**
 * Four of them, and the fourth is the one worth having.
 *
 * The brisk, the thorough and the unsure are the three anybody would write.
 * The one following a script is the one a learner actually meets at a
 * government counter: they are not unkind and they are not in a hurry, they
 * simply will not take the form in the order you have it, and no amount of
 * good Estonian changes that. It is the persona that makes `their-order` and
 * `missing-document` feel like the institution rather than like bad luck.
 */
export const PERSONAS: readonly PersonaSpec[] = [
  {
    id: "brisk",
    who: "They would like the queue to be shorter than it is.",
    patience: -1,
    voice: "kylli",
    speed: 1.1,
    leans: ["faster", "queue", "english"],
    translates: false,
    acknowledges: false,
  },
  {
    id: "thorough",
    who: "They are unhurried and they will ask you for all of it.",
    patience: 1,
    voice: "mari",
    speed: 0.95,
    leans: ["missing-document", "wrong-price", "small-talk"],
    translates: true,
    acknowledges: true,
  },
  {
    id: "new",
    who: "They started here recently and are checking as they go.",
    patience: 1,
    voice: "indrek",
    speed: 1,
    leans: ["not-possible", "contradiction", "interrupted"],
    translates: true,
    acknowledges: true,
  },
  {
    id: "by-the-book",
    who: "They are following the form, in the order the form has.",
    patience: 0,
    voice: "peeter",
    speed: 1,
    leans: ["their-order", "place-instruction", "other-register"],
    translates: false,
    acknowledges: true,
  },
];

/** Tries on a beat, once the persona has had their say. Never fewer than one. */
export function patienceFor(beatPatience: number, persona: PersonaSpec): number {
  return Math.max(1, beatPatience + persona.patience);
}

/**
 * Draws one, preferring somebody the last runs did not meet.
 *
 * §5's recency promise is about props and curveballs and this is the same
 * device, for the reason the persona is the strongest lever: meeting the same
 * receptionist three times running is what a learner notices first.
 */
export function drawPersona(
  random: () => number,
  avoid: ReadonlySet<string> = new Set(),
): PersonaSpec {
  const fresh = PERSONAS.filter((p) => !avoid.has(p.id));
  const pool = fresh.length > 0 ? fresh : PERSONAS;
  return pool[Math.floor(random() * pool.length)] ?? PERSONAS[0]!;
}

export function personaById(id: string): PersonaSpec | undefined {
  return PERSONAS.find((p) => p.id === id);
}

/** Every voice a persona names is one the speech route will actually accept. */
export function voicesAreReal(): boolean {
  const allowed = new Set(VOICES.map((v) => v.id));
  return PERSONAS.every((p) => allowed.has(p.voice));
}
