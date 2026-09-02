/**
 * A difficulty setting is a budget, not a mode.
 *
 * `docs/19-situations.md` §9. Each curveball costs points, the setting is how
 * many points a run may spend, and the draw is seeded. Difficulty is then one
 * number a learner can move by one, rather than four presets that jump, and it
 * sits on the scene rather than in Settings because it is a decision about this
 * conversation rather than a preference about the app.
 *
 * **Every entry names its out: the move that resolves it. A curveball with no
 * out is a trap**, and that is asserted rather than reviewed for, because the
 * out is expressed as requirements and a requirement that cannot be met inside
 * the scene's own word list is not difficulty, it is a bug in a costume.
 *
 * WHAT THIS FILE MAY WRITE. English, and a lemma, which is the standing the
 * scene catalogue has. Every lemma named in an out is checked against the units
 * the scene declares, word by word, the same way a beat's are.
 *
 * Pure: no React, no Next, no Prisma, no clock.
 */
import { shuffle } from "@/lib/random/shuffle";
import type { Requirement } from "./types";

export type CurveballId =
  | "missing-document"
  | "slot-gone"
  | "misheard"
  | "english"
  | "interrupted"
  | "faster"
  | "small-talk"
  | "their-order"
  | "not-possible"
  | "other-register"
  | "wrong-price"
  | "queue"
  | "contradiction"
  | "place-instruction";

export interface CurveballSpec {
  readonly id: CurveballId;
  /** What it costs out of the run's budget. */
  readonly cost: number;
  /** English. What the learner is told has happened. */
  readonly says: string;
  /** English. The way out, printed beside it, because a trap is not difficulty. */
  readonly out: string;
  /**
   * What counts as having dealt with it.
   *
   * Every one of these is decidable by `readTurn` against the dictionary, which
   * is what makes a curveball markable at all. `lemma` entries are requests
   * against the scene's own units and are checked there.
   */
  readonly needs: readonly Requirement[];
  /** The band below which this one is never drawn. */
  readonly from?: "B2";
  /** Whether it changes the persona rather than asking for a turn. */
  readonly silent?: true;
}

/**
 * The catalogue.
 *
 * Three deserve a note and they are the three that could not be built any other
 * way.
 *
 * **The switch to English is the most real thing in this table.** It is what
 * happens to a foreigner speaking Estonian in Tallinn, it is a large part of
 * why people stop practising, and no textbook rehearses it because a textbook
 * cannot. Here the other side switches, the learner may switch too, and holding
 * the line in Estonian brings them back.
 *
 * **The mishearing ties this module to the phonology drills.** It is drawn only
 * where the prop word has a genuine minimal pair, which `lib/estonian/sounds.ts`
 * already knows how to find, so a learner meets in conversation the exact
 * contrast the minimal pairs round drills in isolation.
 *
 * **The queue is the only one with no words in it.** It costs a point and its
 * whole effect is one number, which is the argument for it: pressure that is
 * felt rather than announced. It is the one entry whose `needs` is empty, and
 * `silent` is what says that is deliberate rather than a missing out.
 */
export const CURVEBALLS: readonly CurveballSpec[] = [
  {
    id: "missing-document",
    cost: 2,
    says: "They ask for something you were not given.",
    out: "Say you do not have it.",
    needs: [{ kind: "negation" }],
  },
  {
    id: "slot-gone",
    cost: 2,
    says: "The time you asked for has gone.",
    out: "Take the one offered, or ask for another.",
    needs: [{ kind: "question" }],
  },
  {
    id: "misheard",
    cost: 3,
    says: "They heard a word that sounds like yours, and it was the wrong one.",
    out: "Correct them, and say it again.",
    needs: [{ kind: "negation" }],
  },
  {
    id: "english",
    cost: 3,
    says: "They switch to English.",
    out: "Keep going in Estonian, and they come back.",
    needs: [{ kind: "register" }],
  },
  {
    id: "interrupted",
    cost: 2,
    says: "Somebody else starts talking to them.",
    out: "Wait, or say you were first.",
    needs: [{ kind: "any" }],
  },
  {
    id: "faster",
    cost: 1,
    says: "They speed up.",
    out: "Ask them to slow down. Free, always, and taught.",
    needs: [{ kind: "question" }],
  },
  {
    id: "small-talk",
    cost: 1,
    says: "They say something about the weather.",
    out: "Answer it, and come back to what you were doing.",
    needs: [{ kind: "any" }],
  },
  {
    id: "their-order",
    cost: 2,
    says: "The form has to be filled in their order, not yours.",
    out: "Give them the part they asked for.",
    needs: [{ kind: "any" }],
  },
  {
    id: "not-possible",
    cost: 3,
    says: "What you came for cannot be done today.",
    out: "Ask what can, or when.",
    needs: [{ kind: "question" }],
  },
  {
    id: "other-register",
    cost: 1,
    says: "They use the other pronoun for you.",
    out: "Match them, or do not. Both are things people do.",
    needs: [{ kind: "any" }],
  },
  {
    id: "wrong-price",
    cost: 2,
    says: "The amount is not the one you were told.",
    out: "Query it.",
    needs: [{ kind: "question" }],
  },
  {
    id: "queue",
    cost: 1,
    says: "A queue forms behind you.",
    out: "Nothing. They have less time for you.",
    needs: [],
    silent: true,
  },
  {
    id: "contradiction",
    cost: 3,
    says: "They say the opposite of what they said two turns ago.",
    out: "Notice, and say so.",
    needs: [{ kind: "negation" }],
    from: "B2",
  },
  {
    id: "place-instruction",
    cost: 2,
    says: "They tell you to go somewhere before they can help.",
    out: "Follow it, or ask where.",
    needs: [{ kind: "question" }],
  },
];

/** The four presets, which set one number each. */
export const BUDGETS = {
  textbook: 0,
  good: 2,
  ordinary: 4,
  bad: 7,
} as const;

export type Difficulty = keyof typeof BUDGETS;

/** The setting above which a second expensive curveball may be drawn (§9). */
const ORDINARY = BUDGETS.ordinary;
/** What "expensive" is. */
const DEAR = 3;

/** A curveball, and the beat it attaches to. */
export interface DrawnCurveball {
  readonly id: CurveballId;
  /** The index into `beats`. Never 0. */
  readonly at: number;
}

/**
 * The draw, and its four rules.
 *
 * **Never on the first beat.** You get to say hello and be answered. A scene
 * that ambushes somebody at the door teaches them to dread it.
 *
 * **No two of the same kind in a run**, and none within two beats of another,
 * so a bad day is a bad day rather than an avalanche.
 *
 * **At most one dear one below Ordinary day**, so that step is a step and not
 * a cliff.
 *
 * **Never one whose out is not sayable**, which this cannot check on its own:
 * the requirement has to resolve inside the scene's word list, so `admits` is
 * given the ids the scene allows and `catalogue.test.ts` is what checks that
 * list word by word.
 */
export function drawCurveballs(
  admits: readonly CurveballId[],
  beats: number,
  budget: number,
  level: string,
  random: () => number,
  avoid: ReadonlySet<string> = new Set(),
): DrawnCurveball[] {
  const gap = 2;
  const pool = CURVEBALLS
    .filter((c) => admits.includes(c.id))
    .filter((c) => !c.from || level === "B2" || level === "C1" || level === "C2");

  const drawn: DrawnCurveball[] = [];
  const used = new Set<CurveballId>();
  let spent = 0;
  let dear = 0;

  /*
    FRESH ONES FIRST, AND SHUFFLED INSIDE EACH GROUP.

    §5 promises no curveball repeats within five runs, and the promise is kept
    by preference rather than by refusing to draw: a catalogue thinner than the
    window is a fact about the catalogue and not a reason for a run to have
    nothing in it. Two groups rather than a sort, because a sort followed by a
    shuffle is a shuffle, which is what the first version of this was and what
    its test caught. The cost filter is why it mattered: a budget of two admits
    the cheap ones far more often, and two of the three a run had just seen were
    cheap, so the draw was worse than chance at avoiding them.
  */
  const order = [
    ...shuffle(pool.filter((c) => !avoid.has(c.id)), random),
    ...shuffle(pool.filter((c) => avoid.has(c.id)), random),
  ];
  for (const candidate of order) {
    if (used.has(candidate.id)) continue;
    if (spent + candidate.cost > budget) continue;
    if (candidate.cost >= DEAR && dear >= 1 && budget < ORDINARY) continue;

    const at = placeFor(beats, drawn, gap, random);
    if (at === null) break;

    drawn.push({ id: candidate.id, at });
    used.add(candidate.id);
    spent += candidate.cost;
    if (candidate.cost >= DEAR) dear += 1;
  }
  return drawn.sort((a, b) => a.at - b.at);
}

/** A beat that is not the first and is not within `gap` of one already taken. */
function placeFor(
  beats: number,
  drawn: readonly DrawnCurveball[],
  gap: number,
  random: () => number,
): number | null {
  const free: number[] = [];
  // From 1, never 0: the greeting is answered before anything goes wrong.
  for (let at = 1; at < beats; at += 1) {
    if (drawn.every((d) => Math.abs(d.at - at) > gap)) free.push(at);
  }
  if (free.length === 0) return null;
  return free[Math.floor(random() * free.length)] ?? null;
}

export function curveballById(id: CurveballId): CurveballSpec | undefined {
  return CURVEBALLS.find((c) => c.id === id);
}
