/**
 * What happened, what got done, and what to do about it.
 *
 * The order is the argument (design §12). The outcome first, because a person
 * remembers the outcome; then the required beats, ticked, as a count and never
 * a percentage, since a mark on a conversation is a claim about somebody's
 * Estonian and the only module allowed to make one is the mock exam; then the
 * learner's own turns with each word marked; then the words the conversation
 * needed and they did not have; then one thing to work on; then the button
 * that matters, which is trying it again.
 *
 * GRADING IS CONSERVATIVE. A conversation is a noisy instrument, so a review
 * row is written only where the retrieval was unambiguous: the learner
 * produced a vouched form of a word a requirement named, without pressing
 * help for it, in a beat that asked for it. Good on the first attempt, Hard
 * after a repair, Again where the app had to supply the word. Never Easy,
 * because a conversation cannot tell easy from lucky. An abandoned scene
 * writes nothing.
 *
 * Pure.
 */
import type { Plan } from "./draw";
import type { RunState, LearnerTurn } from "./run";
import type { SceneSpec } from "./types";

export interface Objective {
  readonly beatId: string;
  readonly goal: string;
  readonly met: boolean;
}

export interface WordMark {
  readonly word: string;
  readonly recognised: boolean;
}

export interface MarkedTurn {
  readonly beatId: string;
  readonly text: string;
  readonly outcome: LearnerTurn["outcome"];
  readonly words: readonly WordMark[];
}

/** A lemma the conversation needed: asked for with help, or a beat that stalled on it. */
export interface Gap {
  readonly lemma: string;
  readonly kind: "ASKED" | "STALLED";
}

export interface Grade {
  readonly lemma: string;
  /** FSRS ratings: 1 Again, 2 Hard, 3 Good. Never 4. */
  readonly rating: 1 | 2 | 3;
}

export interface Debrief {
  readonly outcome: string;
  readonly objectives: readonly Objective[];
  readonly done: number;
  readonly of: number;
  readonly turns: readonly MarkedTurn[];
  readonly gaps: readonly Gap[];
  readonly english: number;
  readonly curveballs: readonly string[];
  readonly grades: readonly Grade[];
  readonly walkedOut: boolean;
}

export function outcomeFor(scene: SceneSpec, met: Readonly<Record<string, boolean>>, walkedOut: boolean): string {
  if (walkedOut) return "You left before it was settled. That is allowed, and it is still a conversation you had.";
  // The most demanding outcome whose beats were all met wins; the fallback has no beats.
  const ranked = [...scene.outcomes].sort((a, b) => b.when.length - a.when.length);
  for (const outcome of ranked) {
    if (outcome.when.every((id) => met[id] === true)) return outcome.says;
  }
  return scene.outcomes[scene.outcomes.length - 1]?.says ?? "It ended without either of you getting what you came for.";
}

function markWords(turn: LearnerTurn): WordMark[] {
  const recognised = new Set(turn.recognised);
  const all = turn.text.match(/[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)*/gu) ?? [];
  return all.map((word) => ({ word, recognised: recognised.has(word.toLowerCase()) }));
}

/** The lemma a `lemma` requirement was met with, or the first it named where it was not. */
function stalledLemmas(plan: Plan, state: RunState): string[] {
  const out: string[] = [];
  for (const beat of plan.beats) {
    if (state.met[beat.id] !== false) continue;
    for (const need of beat.needs) {
      if (need.kind === "lemma") out.push(need.oneOf[0]!);
      if (need.kind === "case") out.push(need.lemma);
    }
  }
  return out;
}

export function debriefOf(scene: SceneSpec, state: RunState): Debrief {
  const plan = state.plan;
  const required = plan.beats.filter((b) => b.required);
  const objectives = required.map((b) => ({ beatId: b.id, goal: b.goal, met: state.met[b.id] === true }));
  const turns = state.turns
    .filter((t): t is LearnerTurn => t.role === "learner")
    .map((t) => ({ beatId: t.beatId, text: t.text, outcome: t.outcome, words: markWords(t) }));

  const gaps: Gap[] = [
    ...state.helped.map((lemma) => ({ lemma, kind: "ASKED" as const })),
    ...stalledLemmas(plan, state).filter((l) => !state.helped.includes(l)).map((lemma) => ({ lemma, kind: "STALLED" as const })),
  ];

  const grades: Grade[] = [];
  if (!state.walkedOut) {
    const helped = new Set(state.helped);
    for (const beat of plan.beats) {
      const attempts = state.turns.filter((t): t is LearnerTurn => t.role === "learner" && t.beatId === beat.id);
      const last = attempts[attempts.length - 1];
      for (const [i, need] of beat.needs.entries()) {
        if (need.kind !== "lemma" && need.kind !== "case") continue;
        const named = need.kind === "lemma" ? need.oneOf : [need.lemma];
        if (state.met[beat.id] === true && last) {
          const withForm = last.met[i];
          // Which of the named lemmas was said: the one whose forms hold the form used.
          const lemma = named.find((l) => l === withForm || (withForm && plan.props.some((p) => p.lemma === l && p.accepted.includes(withForm)))) ?? named[0]!;
          if (helped.has(lemma)) { grades.push({ lemma, rating: 1 }); continue; }
          grades.push({ lemma, rating: attempts.length > 1 ? 2 : 3 });
        } else if (state.met[beat.id] === false) {
          grades.push({ lemma: named[0]!, rating: 1 });
        }
      }
    }
  }

  return {
    outcome: outcomeFor(scene, state.met, state.walkedOut),
    objectives,
    done: objectives.filter((o) => o.met).length,
    of: objectives.length,
    turns,
    gaps,
    english: state.english,
    curveballs: plan.curveballs,
    grades,
    walkedOut: state.walkedOut,
  };
}
