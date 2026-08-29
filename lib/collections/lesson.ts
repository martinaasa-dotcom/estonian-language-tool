/**
 * Turning a unit into a lesson.
 *
 * Before this existed, opening a unit offered two buttons: add its words to the
 * deck, or drill the unit. Both are flashcards, so a "course" of 84 units was 84
 * ways to arrive at the same rectangle. This module is the difference between a
 * word list and a lesson.
 *
 * Three rules shape a plan, and they are the whole answer to "why is this not
 * boring":
 *
 * 1. **Nothing is asked before it is taught.** A word is met — shown with its
 *    gloss and a real sentence — before anything is asked about it, and asked
 *    for recognition before it is asked for production. Being made to produce a
 *    word you have never seen is a guessing game, and losing it teaches nothing.
 *
 * 2. **No two consecutive steps of the same kind.** Six multiple-choice
 *    questions in a row is the exact texture of tedium, and it is what every
 *    naive generator produces. `varyKinds` reorders the plan until adjacent
 *    steps differ, and gives up gracefully rather than looping when a lesson is
 *    genuinely too small to vary.
 *
 * 3. **Words come back inside the lesson, not just tomorrow.** A word met in the
 *    first block is asked again several steps later, harder. Spacing is the one
 *    thing that turns exposure into memory, and waiting for the SRS to do all of
 *    it wastes the session the learner is already in.
 *
 * Everything a step contains is either English (ours to write) or Estonian that
 * came from the dictionary — a lemma, a stored form, a derived case, or an
 * attested sentence hidden or shuffled by `lib/estonian/cloze`. Nothing here
 * generates Estonian, and the distractors in a multiple choice are real words
 * from the learner's own level rather than invented near-misses (ADR-005).
 *
 * Pure and framework-free: no React, no Prisma, no clock. The page resolves the
 * dictionary rows and hands them in.
 */
import { buildCloze, isBuildable, sentenceTiles } from "@/lib/estonian/cloze";
import { deriveCase } from "@/lib/estonian/derive";
import { CASES } from "@/lib/estonian/cases";
import type { CaseKey } from "@/lib/estonian/types";

export type StepKind =
  | "intro" | "meet" | "choose" | "produce" | "type"
  | "listen" | "gap" | "build" | "case" | "govern" | "recap";

/** A dictionary word, resolved, as the lesson needs it. */
export interface LessonWord {
  lemma: string;
  gloss: string;
  pos: string;
  /** Attested Estonian sentences. Never generated. */
  examples: readonly string[];
  /** Stored principal parts, by formType. */
  parts: Readonly<Record<string, string>>;
  government: string | null;
}

interface StepBase {
  /** Stable within a plan, so React keys and answer records line up. */
  id: string;
  kind: StepKind;
  /** The word the step is about, for grading. Absent on intro and recap. */
  lemma?: string;
}

export interface IntroStep extends StepBase {
  kind: "intro";
  title: string;
  canDo: string;
  blurb: string;
  grammar: readonly string[];
  words: number;
}
export interface MeetStep extends StepBase {
  kind: "meet";
  lemma: string;
  gloss: string;
  pos: string;
  /** One attested sentence, when the word has one, purely to see it in use. */
  example: string | null;
}
/** Estonian shown, English chosen. The easiest question there is. */
export interface ChooseStep extends StepBase {
  kind: "choose";
  lemma: string;
  options: readonly string[];
  answer: number;
}
/** English shown, Estonian chosen. Harder: it asks for the form, not the sense. */
export interface ProduceStep extends StepBase {
  kind: "produce";
  lemma: string;
  gloss: string;
  options: readonly string[];
  answer: number;
}
/** English shown, Estonian typed. Hardest, and the only one that proves recall. */
export interface TypeStep extends StepBase {
  kind: "type";
  lemma: string;
  gloss: string;
}
export interface ListenStep extends StepBase {
  kind: "listen";
  lemma: string;
  options: readonly string[];
  answer: number;
}
export interface GapStep extends StepBase {
  kind: "gap";
  lemma: string;
  gloss: string;
  /** The sentence with one form blanked out. */
  text: string;
  answer: string;
  full: string;
}
export interface BuildStep extends StepBase {
  kind: "build";
  lemma: string;
  tiles: readonly string[];
  sentence: string;
}
export interface CaseStep extends StepBase {
  kind: "case";
  lemma: string;
  gloss: string;
  caseKey: CaseKey;
  caseName: string;
  question: string;
  answer: string;
}
export interface GovernStep extends StepBase {
  kind: "govern";
  lemma: string;
  gloss: string;
  options: readonly string[];
  answer: number;
}
export interface RecapStep extends StepBase {
  kind: "recap";
  learned: number;
}

export type LessonStep =
  | IntroStep | MeetStep | ChooseStep | ProduceStep | TypeStep
  | ListenStep | GapStep | BuildStep | CaseStep | GovernStep | RecapStep;

/** A step the learner answers, as opposed to reads. */
export function isAnswerable(step: LessonStep): boolean {
  return step.kind !== "intro" && step.kind !== "recap" && step.kind !== "meet";
}

export interface LessonUnitInfo {
  id: string;
  title: string;
  canDo: string;
  blurb: string;
  grammar: readonly string[];
}

export interface LessonInput {
  unit: LessonUnitInfo;
  words: readonly LessonWord[];
  /**
   * Other words from the learner's level, used only as multiple-choice
   * distractors. Real dictionary words, so a wrong option is still Estonian
   * somebody could look up rather than a plausible-looking invention.
   */
  distractors?: readonly LessonWord[];
  /** Makes a plan reproducible. The same seed gives the same lesson. */
  seed?: number;
  /** Hard ceiling, so a 20-word unit is still one sitting. */
  maxSteps?: number;
}

/** Words introduced together before being mixed. Three fits in working memory. */
const BLOCK = 3;
/**
 * New words in one lesson.
 *
 * A 19-word unit is not a lesson, it is an afternoon. Splitting the unit into
 * sittings of six is what lets every word be met, recognised, practised in a
 * sentence *and* produced — the full ladder — instead of a long unit quietly
 * dropping the last rung for its last words because the step budget ran out.
 */
export const LESSON_WORDS = 6;
const DEFAULT_MAX_STEPS = 40;
const OPTIONS = 4;

/**
 * A small deterministic PRNG.
 *
 * The plan has to be identical every time it is computed for the same learner
 * and unit, because a Server Action refreshes the route on every grade and a
 * plan that re-shuffled would swap the question out from under the answer. The
 * page passes a seed derived from the unit; nothing here reads a clock.
 */
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
 * Builds a multiple choice whose wrong answers are real and not accidentally
 * right.
 *
 * Returns null rather than padding when there are too few candidates: three
 * options where the design says four is a question with a one-in-three floor,
 * and silently changing the odds is worse than not asking.
 */
function choiceOf(
  correct: string,
  pool: readonly string[],
  rand: () => number,
): { options: string[]; answer: number } | null {
  const seen = new Set([correct.toLowerCase()]);
  const wrong: string[] = [];
  for (const candidate of shuffled(pool, rand)) {
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    wrong.push(candidate);
    if (wrong.length === OPTIONS - 1) break;
  }
  if (wrong.length < OPTIONS - 1) return null;
  const options = shuffled([correct, ...wrong], rand);
  return { options, answer: options.indexOf(correct) };
}

/** Every form of a word we hold or can derive, for finding it inside a sentence. */
function knownForms(word: LessonWord): string[] {
  const forms = new Set<string>([word.lemma, ...Object.values(word.parts)]);
  const genitive = word.parts.GEN_SG;
  if (genitive) {
    for (const spec of CASES) {
      if (spec.principal) continue;
      const derived = deriveCase(genitive, spec.key);
      if (derived) forms.add(derived);
    }
  }
  return [...forms].filter(Boolean);
}

/** The cases worth asking a learner to produce, in the order they are taught. */
const DRILL_CASES: readonly CaseKey[] = [
  "INESSIVE", "ILLATIVE", "ELATIVE", "ALLATIVE", "ADESSIVE", "COMITATIVE", "TRANSLATIVE",
];

const isInflecting = (w: LessonWord) => w.pos === "NOUN" || w.pos === "ADJECTIVE";

/**
 * The Estonian cases a government question offers.
 *
 * Ekilex records government as a question word — "keda", "kellele" — so the
 * options are those question words, which is how the distinction is actually
 * taught. Wrong options are other real government patterns, never invented ones.
 */
const GOVERNMENT_OPTIONS = ["mida", "kellele", "kellest", "millega", "kelle", "millele"];

// ────────────────────────────── step builders ──────────────────────────────
// Each returns null when the word cannot support that question. A step is only
// ever built from material we actually hold, which is why a unit with no
// attested sentences simply has no gap-fill rather than a broken one.

type Builder = (w: LessonWord, rand: () => number, nextId: (k: string) => string) => LessonStep | null;

const gapStep2: Builder = (w, _r, nextId) => gapStep(w, nextId("gap"));
const buildStep2: Builder = (w, r, nextId) => buildStep(w, nextId("build"), r);
const caseStep2: Builder = (w, r, nextId) => caseStep(w, nextId("case"), r);
const governStep2: Builder = (w, r, nextId) => governStep(w, nextId("govern"), r);

function gapStep(word: LessonWord, id: string): GapStep | null {
  for (const sentence of word.examples) {
    const cloze = buildCloze(sentence, knownForms(word));
    if (cloze) {
      return {
        id, kind: "gap", lemma: word.lemma, gloss: word.gloss,
        text: cloze.text, answer: cloze.answer, full: cloze.full,
      };
    }
  }
  return null;
}

function buildStep(word: LessonWord, id: string, rand: () => number): BuildStep | null {
  for (const sentence of word.examples) {
    if (!isBuildable(sentence)) continue;
    const tiles = sentenceTiles(sentence);
    if (tiles.length < 3 || tiles.length > 9) continue;
    return { id, kind: "build", lemma: word.lemma, tiles: shuffled(tiles, rand), sentence };
  }
  return null;
}

function caseStep(word: LessonWord, id: string, rand: () => number): CaseStep | null {
  if (!isInflecting(word)) return null;
  const genitive = word.parts.GEN_SG;
  if (!genitive) return null;
  for (const key of shuffled(DRILL_CASES, rand)) {
    const answer = deriveCase(genitive, key);
    const spec = CASES.find((c) => c.key === key);
    if (!answer || !spec) continue;
    return {
      id, kind: "case", lemma: word.lemma, gloss: word.gloss,
      caseKey: key, caseName: spec.en, question: spec.question, answer,
    };
  }
  return null;
}

function governStep(word: LessonWord, id: string, rand: () => number): GovernStep | null {
  if (word.pos !== "VERB" || !word.government) return null;
  // Ekilex writes government as one or more question words; the first is the one
  // a learner needs. Anything longer is a note, not a drillable answer.
  const correct = word.government.split(/[,;]/)[0]?.trim();
  if (!correct || correct.split(/\s+/).length > 2) return null;
  const choice = choiceOf(correct, GOVERNMENT_OPTIONS, rand);
  if (!choice) return null;
  return {
    id, kind: "govern", lemma: word.lemma, gloss: word.gloss,
    options: choice.options, answer: choice.answer,
  };
}

/**
 * Merges lanes by taking one step from each in turn.
 *
 * This is where the variety actually comes from, and it replaced a
 * shuffle-and-repair pass that did the job badly twice over: it could lift a
 * question in front of the step that teaches its word, and it could not do
 * anything at all about the run of identical steps at the end of a plan, because
 * there was nothing past them to swap with. Interleaving by construction has
 * neither failure. Each lane holds one kind of step, so a cycle through the
 * lanes is a cycle through kinds, and every lane stays internally in order — so
 * a word is still met before it is asked about.
 */
function interleave(lanes: readonly (readonly LessonStep[])[]): LessonStep[] {
  const out: LessonStep[] = [];
  const longest = Math.max(0, ...lanes.map((l) => l.length));
  for (let i = 0; i < longest; i++) {
    for (const lane of lanes) {
      const step = lane[i];
      if (step) out.push(step);
    }
  }
  return out;
}

/**
 * The rung of the ladder a step belongs to.
 *
 * This is the constraint that actually matters, and it is weaker than "the order
 * the lanes emitted things in". A word must be met before it is asked about and
 * recognised before it is produced cold — but whether it is heard before or
 * after it is used in a sentence makes no difference to anybody, and forbidding
 * that swap was what left a run of production steps unfixable at the end of a
 * lesson.
 */
function rungOf(kind: StepKind): number {
  switch (kind) {
    case "meet": return 0;
    case "choose": return 1;
    case "type": return 3;
    default: return 2;
  }
}

/** Whether every step of one word still climbs, after a proposed swap. */
function ladderHolds(steps: readonly LessonStep[], lemma: string | undefined): boolean {
  if (!lemma) return true;
  let highest = -1;
  for (const step of steps) {
    if (step.lemma !== lemma) continue;
    const rung = rungOf(step.kind);
    if (rung < highest) return false;
    highest = Math.max(highest, rung);
  }
  return true;
}

/**
 * Breaks up any run of identical *questions* the lanes could not.
 *
 * Interleaving handles the body of a lesson, but the last rounds drain lanes
 * that have already emptied, so at the very end the production lane can run on
 * with nothing to alternate against.
 *
 * Only answerable steps count. Three new words being introduced one after
 * another is a presentation, not a grind — the thing that makes a lesson a slog
 * is answering the same *kind of question* over and over, and treating a run of
 * teaching cards as the same defect would shuffle the introduction apart for no
 * gain.
 *
 * A swap is accepted only if both affected words still climb their ladder
 * afterwards. Checking the result rather than guessing at safe positions is what
 * finally made this correct: the first version reordered a word's own rungs, and
 * the second was so strict it could not fix the run it existed for.
 */
function repairRuns(steps: readonly LessonStep[]): LessonStep[] {
  const out = [...steps];

  for (let i = 1; i < out.length; i++) {
    const here = out[i]!;
    const prev = out[i - 1]!;
    if (!isAnswerable(here) || !isAnswerable(prev) || prev.kind !== here.kind) continue;

    for (let j = i + 1; j < out.length; j++) {
      const candidate = out[j]!;
      if (!isAnswerable(candidate) || candidate.kind === here.kind) continue;
      // Do not fix one run by opening another where the candidate came from.
      const after = out[j + 1];
      if (after && isAnswerable(after) && after.kind === here.kind) continue;

      out[i] = candidate;
      out[j] = here;
      if (ladderHolds(out, here.lemma) && ladderHolds(out, candidate.lemma)) break;
      out[i] = here;
      out[j] = candidate;
    }
  }
  return out;
}

/**
 * Splits a unit's words into lessons.
 *
 * Exported because the unit page needs to say "lesson 2 of 4" before the plan
 * for lesson 2 exists.
 */
export function splitIntoLessons<T>(words: readonly T[], size = LESSON_WORDS): T[][] {
  if (words.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < words.length; i += size) out.push(words.slice(i, i + size));
  // A trailing lesson of one or two words is a worse experience than a slightly
  // long one, so fold it back into its predecessor.
  const last = out.at(-1);
  if (out.length > 1 && last && last.length <= 2) {
    out[out.length - 2] = [...out[out.length - 2]!, ...last];
    out.pop();
  }
  return out;
}

/**
 * Plans one lesson.
 *
 * Words arrive in blocks of three: each is met, then recognised, then a variety
 * step drawn from whatever that block's material supports. Blocks after the
 * first also re-ask a word from an earlier block, harder than it was asked the
 * first time, which is the in-lesson spacing. A production pass over everything
 * closes it out, capped so a 20-word unit is still one sitting.
 */
export function planLesson(input: LessonInput): LessonStep[] {
  const { unit, words } = input;
  const rand = rng(input.seed ?? 1);
  const maxSteps = input.maxSteps ?? DEFAULT_MAX_STEPS;
  const steps: LessonStep[] = [];
  let n = 0;
  const nextId = (kind: string) => `${kind}-${n++}`;

  if (words.length === 0) return [];

  const glossPool = [...words, ...(input.distractors ?? [])].map((w) => w.gloss);
  const lemmaPool = [...words, ...(input.distractors ?? [])].map((w) => w.lemma);

  steps.push({
    id: nextId("intro"), kind: "intro",
    title: unit.title, canDo: unit.canDo, blurb: unit.blurb,
    grammar: unit.grammar, words: words.length,
  });

  const blocks: LessonWord[][] = [];
  for (let i = 0; i < words.length; i += BLOCK) blocks.push(words.slice(i, i + BLOCK));

  /**
   * The ladder a word climbs, one rung per round: met, recognised, practised on
   * its own material, then produced cold. Because each rung is emitted a round
   * later than the last, a word met in round 0 is not typed until round 3 — the
   * spacing happens inside the lesson rather than being left entirely to
   * tomorrow's review queue.
   */
  const meetLane = (block: readonly LessonWord[]) => block.map((word): LessonStep => ({
    id: nextId("meet"), kind: "meet", lemma: word.lemma, gloss: word.gloss,
    pos: word.pos, example: word.examples[0] ?? null,
  }));

  const chooseLane = (block: readonly LessonWord[]) => block.flatMap((word): LessonStep[] => {
    const choice = choiceOf(word.gloss, glossPool, rand);
    return choice
      ? [{ id: nextId("choose"), kind: "choose", lemma: word.lemma, options: choice.options, answer: choice.answer }]
      : [];
  });

  // The word's own material where it has any, and a reverse multiple choice
  // where it has none. A word with nothing gets the option set rather than being
  // skipped, because skipping is how a rung goes missing.
  //
  // The preference order rotates by position in the block. Taking the builders
  // in a fixed order looks reasonable and produces a lesson where every single
  // practice step is a gap-fill, because most words support the first one on the
  // list; rotating means three consecutive words practise three different ways
  // whenever the material allows it, and falls back to the same order as before
  // when it does not.
  const builders = [gapStep2, buildStep2, caseStep2, governStep2];
  const practiseLane = (block: readonly LessonWord[]) => block.flatMap((word, i): LessonStep[] => {
    const rotated = [...builders.slice(i % builders.length), ...builders.slice(0, i % builders.length)];
    let own: LessonStep | null = null;
    for (const make of rotated) {
      own = make(word, rand, nextId);
      if (own) break;
    }
    if (own) return [own];
    const choice = choiceOf(word.lemma, lemmaPool, rand);
    return choice
      ? [{ id: nextId("produce"), kind: "produce", lemma: word.lemma, gloss: word.gloss, options: choice.options, answer: choice.answer }]
      : [];
  });

  // Paired one-to-one with the production lane below, and emitted before it.
  // The last round of a lesson has nothing left but production, so without a
  // lane of equal length beside it the lesson ends on a run of identical
  // questions — and because it is the *last* round, there is nothing after it to
  // swap with, so no amount of repairing afterwards can fix it. Listening is the
  // right partner rather than filler: hearing a word you are about to have to
  // produce is how the two skills reinforce each other.
  const listenLane = (block: readonly LessonWord[]) =>
    block.flatMap((word): LessonStep[] => {
      const choice = choiceOf(word.gloss, glossPool, rand);
      return choice
        ? [{ id: nextId("listen"), kind: "listen", lemma: word.lemma, options: choice.options, answer: choice.answer }]
        : [];
    });

  const typeLane = (block: readonly LessonWord[]) => block.map((word): LessonStep => ({
    id: nextId("type"), kind: "type", lemma: word.lemma, gloss: word.gloss,
  }));

  // One round per block, plus the rounds the lag needs to drain: the last block
  // still has to be recognised, practised and produced after it is introduced.
  const at = (i: number) => blocks[i] ?? [];
  // The lags are what stagger the ladder, and they are chosen so that every
  // round past the first carries at least two *answerable* lanes. An earlier
  // arrangement gave round one nothing but recognition, which read as three
  // multiple-choice questions in a row however nicely the teaching cards were
  // interleaved between them — the meet steps break up the page, not the work.
  for (let round = 0; round < blocks.length + 2; round++) {
    steps.push(...interleave([
      meetLane(at(round)),
      chooseLane(at(round - 1)),
      practiseLane(at(round - 1)),
      listenLane(at(round - 2)),
      typeLane(at(round - 2)),
    ]));
  }

  const capped = repairRuns(steps.slice(0, maxSteps - 1));
  capped.push({ id: nextId("recap"), kind: "recap", learned: words.length });
  return capped;
}

/** How many steps the learner will actually be asked to answer. */
export const answerableCount = (steps: readonly LessonStep[]): number =>
  steps.filter(isAnswerable).length;
