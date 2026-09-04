/**
 * Every run is a different draw, and the same draw on a reload.
 *
 * A run is a pure function of (scene, seed, difficulty), exactly as a paper is
 * (`lib/exam/paper.ts`) and for the same reason: a reload in the middle of a
 * conversation has to give back the same conversation. What the seed decides,
 * in the order a learner notices: who is behind the desk, what is on the role
 * card, which curveballs fire and where, and which of the optional beats are
 * in. Required beats never move.
 *
 * THE RULES OF THE DRAW (design §9), each one a line below rather than a
 * sentence in a document:
 *
 *   - never on the first beat: you get to say hello and be answered;
 *   - no two curveballs of one kind, and none within two beats of another;
 *   - at most one cost-3 below Ordinary day, so that step is a step;
 *   - never past the budget.
 *
 * Pure. The forms behind a prop are the caller's to add, because this file
 * has no dictionary; what it draws is the lemma or the digits.
 */
import { mulberry32, seedFrom } from "@/lib/random/seeded";
import { shuffle } from "@/lib/random/shuffle";
import { CURVEBALLS, budgetFor, curveballById, type Curveball } from "./curveballs";
import { patienceUnder } from "./personas";
import { drawProps, fillFacts, type PropValue } from "./props";
import type { BeatSpec, PersonaSpec, SceneSpec } from "./types";

export interface PlannedBeat extends BeatSpec {
  /** The curveball this beat is, when it is one. */
  readonly curveball: string | null;
  /** Heard at speed, from a persona or a curveball. */
  readonly quick: boolean;
  /** Patience after the persona and any queue have had their say. */
  readonly patience: number;
  /** A literal English line, where the other side speaks English. */
  readonly english: string | null;
}

export interface Plan {
  readonly sceneId: string;
  readonly seed: string;
  readonly difficulty: number;
  readonly persona: PersonaSpec;
  readonly props: readonly PropValue[];
  readonly beats: readonly PlannedBeat[];
  /** The role card, with its facts filled in. */
  readonly card: { readonly who: string; readonly wants: string; readonly facts: readonly string[] };
  /** Which curveballs fired, in order. */
  readonly curveballs: readonly string[];
}

export interface DrawInput {
  readonly scene: SceneSpec;
  readonly seed: string;
  readonly difficulty: number;
  /** English for a lemma, from the syllabus. */
  readonly glossOf: (lemma: string) => string;
  /** Prop values recent runs used, per slot, so they are avoided. */
  readonly recentProps?: ReadonlyMap<string, readonly string[]>;
  /** Curveballs recent runs drew, avoided while the budget allows. */
  readonly recentCurveballs?: readonly string[];
}

/** Chooses which curveballs fire, inside the rules. */
export function chooseCurveballs(input: {
  admitted: readonly Curveball[];
  budget: number;
  random: () => number;
  recent?: readonly string[];
}): Curveball[] {
  const { admitted, budget, random } = input;
  const recent = new Set(input.recent ?? []);
  const chosen: Curveball[] = [];
  let spent = 0;
  // Fresh ones first, then anything, so a thin catalogue still fills a budget.
  const order = shuffle(admitted, random);
  const pool = [...order.filter((c) => !recent.has(c.id)), ...order.filter((c) => recent.has(c.id))];
  for (const c of pool) {
    if (spent + c.cost > budget) continue;
    if (chosen.some((x) => x.id === c.id)) continue;
    if (c.cost === 3 && budget < 4 && chosen.some((x) => x.cost === 3)) continue;
    chosen.push(c);
    spent += c.cost;
  }
  return chosen;
}

/**
 * Splices the chosen curveballs into the beat list.
 *
 * A curveball with a beat goes after a beat of a move it may follow, never
 * after the first beat, and never within two beats of another. A modifier
 * attaches to a beat and changes what follows it.
 */
export function placeCurveballs(
  beats: readonly BeatSpec[],
  chosen: readonly Curveball[],
  random: () => number,
  persona: PersonaSpec,
): { beats: PlannedBeat[]; fired: string[] } {
  const base: PlannedBeat[] = beats.map((b) => ({
    ...b,
    curveball: null,
    quick: false,
    patience: patienceUnder(persona.agenda, b.patience),
    english: null,
  }));
  const fired: string[] = [];
  const taken = new Set<number>(); // indexes of base beats a curveball follows
  let queueFrom = -1;
  let quickFrom = -1;

  const spliced: { after: number; beat: PlannedBeat }[] = [];
  for (const c of chosen) {
    const candidates = base
      .map((b, i) => ({ b, i }))
      .filter(({ b, i }) => i > 0 && (c.after.length === 0 || c.after.includes(b.move)))
      .filter(({ i }) => ![...taken].some((t) => Math.abs(t - i) < 3))
      .map(({ i }) => i);
    if (candidates.length === 0) continue;
    const at = candidates[Math.floor(random() * candidates.length)]!;
    taken.add(at);
    fired.push(c.id);
    if (c.beat) {
      spliced.push({
        after: at,
        beat: {
          id: `curveball-${c.id}`,
          goal: c.beat.goal,
          move: c.beat.move,
          topic: c.beat.topic,
          needs: c.beat.needs,
          required: false,
          patience: patienceUnder(persona.agenda, 2),
          shape: c.beat.shape,
          curveball: c.id,
          quick: false,
          english: c.beat.english,
        },
      });
    } else if (c.effect === "patience") {
      queueFrom = at;
    } else if (c.effect === "quick") {
      quickFrom = at;
    }
  }

  const out: PlannedBeat[] = [];
  base.forEach((b, i) => {
    out.push(b);
    for (const s of spliced.filter((x) => x.after === i)) out.push(s.beat);
  });
  return {
    beats: out.map((b, i) => {
      const baseIndex = base.findIndex((x) => x.id === b.id);
      const after = (from: number) => from >= 0 && (baseIndex > from || (baseIndex < 0 && i > from));
      return {
        ...b,
        patience: after(queueFrom) ? Math.max(1, b.patience - 1) : b.patience,
        quick: b.quick || after(quickFrom),
      };
    }),
    fired,
  };
}

export function drawPlan(input: DrawInput): Plan {
  const { scene, seed, difficulty, glossOf } = input;
  const random = mulberry32(seedFrom(`${scene.id}|${seed}|${difficulty}`));

  const persona = scene.personas[Math.floor(random() * scene.personas.length)]
    ?? { voice: "mari", agenda: "thorough" as const };
  const props = drawProps({ scene, random, glossOf, recent: input.recentProps });

  const admitted = scene.curveballs.map(curveballById).filter((c): c is Curveball => Boolean(c));
  const chosen = chooseCurveballs({ admitted, budget: budgetFor(difficulty), random, recent: input.recentCurveballs });
  const placed = placeCurveballs(scene.beats, chosen, random, persona);

  // A brisk persona is heard at speed throughout, whatever the draw did.
  const quickAll = persona.agenda === "brisk";
  const beats = placed.beats.map((b) => ({ ...b, quick: b.quick || quickAll }));

  return {
    sceneId: scene.id,
    seed,
    difficulty,
    persona,
    props,
    beats,
    card: { who: scene.role.who, wants: scene.role.wants, facts: fillFacts(scene.role.facts, props) },
    curveballs: placed.fired,
  };
}

/** Every curveball the catalogue holds, for the settings screen and the audit. */
export const CATALOGUE = CURVEBALLS;
