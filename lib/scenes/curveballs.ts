/**
 * What goes wrong, and the way out of each one.
 *
 * A difficulty setting is a budget, not a mode (design §9): each curveball
 * costs points, the setting is how many a run may spend, and the draw is
 * seeded. Every entry names its out, the move that resolves it, because a
 * curveball with no out is a trap, and the out is written as requirements the
 * dictionary can decide, like every other beat.
 *
 * Two kinds. A curveball with a `beat` is an extra turn spliced in after a
 * beat of the named move: the slot you asked for has gone and they offer
 * another; they switch to English and you hold the line. A curveball with
 * none is a modifier: a queue forms and their patience drops by one; they
 * speed up and their lines are heard at speed. Neither kind writes Estonian.
 * The English switch is the one whose line this file holds, and it holds it
 * because it is English.
 *
 * Three from the design's catalogue are deliberately not here yet. The
 * mishearing needs a minimal pair drawn from the prop word, the contradiction
 * is B2 and needs a memory of two turns back, and "the form in their order"
 * needs a form. Each is a scene of its own to argue for.
 *
 * Pure.
 */
import type { MoveKind, Requirement } from "./types";

export type CurveballId = "gone" | "english" | "speed" | "smalltalk" | "queue" | "missing" | "notPossible";

export interface CurveballBeat {
  /** What the other side is doing in the spliced turn. */
  readonly move: MoveKind;
  /** Lemmas the line is about; retrieval searches on them. Taught by COMMON or the scene. */
  readonly topic: readonly string[];
  /** The out: what the learner has to do to get past it. */
  readonly needs: readonly Requirement[];
  readonly shape: "word" | "sentence";
  /** English, shown as the goal. */
  readonly goal: string;
  /**
   * A literal line, in English, where the other side speaks English. Null
   * means the line comes from the dictionary like any other.
   */
  readonly english: string | null;
}

export interface Curveball {
  readonly id: CurveballId;
  readonly cost: 1 | 2 | 3;
  /** English. What the debrief calls it. */
  readonly title: string;
  /** English. What happened, in a sentence, for the screen and the debrief. */
  readonly does: string;
  /** Which moves it may follow. Empty means anywhere but the first beat. */
  readonly after: readonly MoveKind[];
  readonly beat: CurveballBeat | null;
  /** For a modifier: what it changes. */
  readonly effect: "patience" | "quick" | null;
}

export const CURVEBALLS: readonly Curveball[] = [
  {
    id: "gone",
    cost: 2,
    title: "The time you asked for has gone",
    does: "The slot you wanted was taken while you were talking. They offer another.",
    after: ["offer"],
    beat: {
      move: "offer",
      topic: ["aeg", "kell", "päev"],
      needs: [{ kind: "datum", slot: "time2" }],
      shape: "word",
      goal: "Take the other time they offer, or say it will not do.",
      english: null,
    },
    effect: null,
  },
  {
    id: "english",
    cost: 3,
    title: "They switch to English",
    does: "They heard your accent and switched. Answering in Estonian brings them back.",
    after: [],
    beat: {
      move: "ask",
      topic: [],
      needs: [{ kind: "any" }],
      shape: "sentence",
      goal: "Keep going in Estonian. Anything Estonian brings them back.",
      english: "Sorry, do you speak English? It might be easier.",
    },
    effect: null,
  },
  {
    id: "notPossible",
    cost: 3,
    title: "What you came for is not possible",
    does: "They cannot do it today. Ask when they can, or what they can do instead.",
    after: ["ask"],
    beat: {
      move: "refuse",
      topic: ["täna", "homme", "aeg", "nädal"],
      needs: [{ kind: "question" }],
      shape: "sentence",
      goal: "Ask when it is possible, or what is.",
      english: null,
    },
    effect: null,
  },
  {
    id: "missing",
    cost: 2,
    title: "They ask for something you were not given",
    does: "They want a paper that is not on your card. Say you do not have it.",
    after: ["ask", "instruct"],
    beat: {
      move: "ask",
      topic: ["dokument", "kiri", "number", "pilt"],
      needs: [{ kind: "negation" }],
      shape: "sentence",
      goal: "Say you do not have it.",
      english: null,
    },
    effect: null,
  },
  {
    id: "smalltalk",
    cost: 1,
    title: "Small talk about the weather",
    does: "They say something about the weather while they type. Anything back will do.",
    after: [],
    beat: {
      move: "ask",
      topic: ["ilm", "vihm", "külm", "soe", "päike", "lumi", "tuul"],
      needs: [{ kind: "any" }],
      shape: "word",
      goal: "Answer it, and get back to what you came for.",
      english: null,
    },
    effect: null,
  },
  {
    id: "speed",
    cost: 1,
    title: "They speed up",
    does: "The rest of what they say is at the pace they use with everybody else.",
    after: [],
    beat: null,
    effect: "quick",
  },
  {
    id: "queue",
    cost: 1,
    title: "A queue forms behind you",
    does: "Somebody is waiting. They will ask once fewer before moving on.",
    after: [],
    beat: null,
    effect: "patience",
  },
];

export function curveballById(id: string): Curveball | undefined {
  return CURVEBALLS.find((c) => c.id === id);
}

/** The four settings, as budgets. The names are what the dial says. */
export const DIFFICULTIES = [
  { level: 0, budget: 0, name: "Textbook", feels: "Everything goes the way the unit taught it." },
  { level: 1, budget: 2, name: "Good day", feels: "One thing is not quite as expected." },
  { level: 2, budget: 4, name: "Ordinary day", feels: "Two or three things, and one of them is real." },
  { level: 3, budget: 7, name: "Bad day", feels: "About as bad as a Tuesday at a government counter." },
] as const;

export type Difficulty = (typeof DIFFICULTIES)[number]["level"];

export function budgetFor(level: number): number {
  return DIFFICULTIES.find((d) => d.level === level)?.budget ?? 0;
}

export function difficultyFrom(value: unknown): Difficulty {
  const n = typeof value === "number" ? value : Number(value);
  return (DIFFICULTIES.find((d) => d.level === n)?.level ?? 2) as Difficulty;
}
