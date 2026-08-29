/**
 * Finding out what level somebody is actually at.
 *
 * Onboarding used to ask, with four buttons from "Just starting" to
 * "Confident". People are bad at this about themselves in both directions, and
 * getting it wrong is expensive at both ends: a beginner placed too high meets
 * eleven units of vocabulary they cannot hold, and a B2 speaker placed too low
 * is shown greetings and concludes the app is for tourists.
 *
 * The test is a ladder. Four words per level, starting at A1, and it stops the
 * moment a level is failed — so a beginner answers four questions and a C1
 * speaker answers twenty. That is adaptivity without a single round trip: every
 * question is planned up front and the client simply stops climbing.
 *
 * Two deliberate limits, both stated to the learner rather than hidden:
 *
 * It measures recognition, which overstates ability — knowing `ühiskond` when
 * you see it is easier than reaching for it. So placement is the highest level
 * *passed*, never the next one up, which biases the result low on purpose. Being
 * placed slightly under is a mild insult; being placed over is a wall.
 *
 * It is vocabulary only. Nothing here tests whether somebody can use the
 * partitive, and no twenty-question test could. It is a starting point that the
 * learner can change, not a certificate.
 *
 * Pure and framework-free, like the rest of lib/collections.
 */
import { LEVELS, levelIndex, type Level } from "./syllabus";

/** A word the placement test can ask about. */
export interface PlacementWord {
  lemma: string;
  gloss: string;
  level: Level;
}

export interface PlacementQuestion {
  id: string;
  level: Level;
  lemma: string;
  options: readonly string[];
  answer: number;
}

/** One rung: the questions asked at a single level. */
export interface PlacementStage {
  level: Level;
  questions: readonly PlacementQuestion[];
}

/** Questions per level. Four is enough to see a pattern and short enough to climb. */
export const PER_LEVEL = 4;
/** Correct answers needed to move up. Three of four, against a one-in-four floor. */
export const PASS_MARK = 3;
const OPTIONS = 4;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const a = out[i]!;
    const b = out[j]!;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/**
 * Builds the ladder.
 *
 * Wrong answers are drawn from the same level as the right one. Offering an A1
 * gloss beside a C1 word would let somebody climb the whole ladder by
 * eliminating the easy options, which measures test-taking rather than Estonian.
 */
export function buildPlacement(words: readonly PlacementWord[], seed = 1): PlacementStage[] {
  const rand = rng(seed);
  const stages: PlacementStage[] = [];

  for (const level of LEVELS) {
    const pool = words.filter((w) => w.level === level);
    if (pool.length < OPTIONS + PER_LEVEL) continue;

    const asked = shuffled(pool, rand).slice(0, PER_LEVEL);
    const questions: PlacementQuestion[] = [];

    for (const [i, word] of asked.entries()) {
      const seen = new Set([word.gloss.toLowerCase()]);
      const wrong: string[] = [];
      for (const candidate of shuffled(pool, rand)) {
        const key = candidate.gloss.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        wrong.push(candidate.gloss);
        if (wrong.length === OPTIONS - 1) break;
      }
      if (wrong.length < OPTIONS - 1) continue;
      const options = shuffled([word.gloss, ...wrong], rand);
      questions.push({
        id: `${level}-${i}`,
        level,
        lemma: word.lemma,
        options,
        answer: options.indexOf(word.gloss),
      });
    }

    if (questions.length === PER_LEVEL) stages.push({ level, questions });
  }

  return stages;
}

export interface StageScore {
  level: Level;
  correct: number;
  asked: number;
}

/** Whether the ladder continues past this rung. */
export const passed = (score: StageScore): boolean =>
  score.asked > 0 && score.correct >= Math.ceil((PASS_MARK / PER_LEVEL) * score.asked);

/**
 * The level to place somebody at.
 *
 * The highest level passed *without a gap*. A run of levels has to hold from A1
 * upwards: somebody who fails B1 and then happens to pass B2 has got lucky on
 * four questions, not demonstrated B2. Failing at the first rung places them at
 * A1, which is where a real beginner belongs.
 */
export function placementResult(scores: readonly StageScore[]): Level {
  const byLevel = new Map(scores.map((s) => [s.level, s]));
  let placed: Level = "A1";
  for (const level of LEVELS) {
    const score = byLevel.get(level);
    if (!score || !passed(score)) break;
    placed = level;
  }
  return placed;
}

/**
 * What to tell the learner, in words rather than a score.
 *
 * A placement is a starting point, and saying so is part of the result: a number
 * out of twenty invites somebody to retake it until it flatters them.
 */
export function placementSummary(level: Level, scores: readonly StageScore[]): string {
  const answered = scores.reduce((n, s) => n + s.asked, 0);
  const top = LEVELS[LEVELS.length - 1];
  if (level === top && scores.every(passed)) {
    return `You recognised words at every level, ${answered} of them. The course starts you at ${top}, and its last units are honest that C2 is finished by reading and arguing in Estonian rather than by finishing units.`;
  }
  if (level === "A1" && (scores[0] ? !passed(scores[0]) : true)) {
    return "Starting at the beginning, which is the right place to start and much the fastest way through. The first units are short.";
  }
  const next = LEVELS[levelIndex(level) + 1];
  const opens = next ? ` ${next} opens as you work.` : "";
  return `You placed at ${level}. This test only measures recognition, so it deliberately places you at the highest level you passed rather than the one above.${opens} You can start anywhere on the course you like.`;
}
