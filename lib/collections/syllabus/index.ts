/**
 * The course, assembled.
 *
 * Five levels, A1 to C1. The ordering here is the course: units come in the
 * order they are meant to be worked, and each one names the units it builds
 * on.
 *
 * C2 was cut rather than built out further: the app can name what C2 asks
 * for, but it cannot verify vocabulary at that register without a fluent
 * reviewer, and a "course" whose top level is ten thin units is a promise
 * the app should not make. `docs/13-mvp-status.md` §14 and §19 have the
 * fuller account.
 *
 * On locking. The first version of the path locked nothing at all, which made it
 * a shelf of word lists rather than a course; the obvious fix, hard
 * prerequisites, is worse, because it strands a B2 learner behind eleven A1
 * units they do not need. So a unit is only ever locked when *both* things are
 * true: its prerequisites are unmet, and it sits above the level the learner
 * placed into. Everything at or below your own level is always open, and the UI
 * offers a way past a lock rather than pretending it is a wall. Structure for
 * somebody who wants to be led, no cage for somebody who does not.
 */
import type { Level } from "./types";
import { LEVELS, unit, type SyllabusUnit, type UnitSpec, type WordSpec, type Pos } from "./types";
import { A1 } from "./a1";
import { A2 } from "./a2";
import { B1 } from "./b1";
import { B2 } from "./b2";
import { C1 } from "./c1";

export type { Level, SyllabusUnit, UnitSpec, WordSpec, Pos };
export { LEVELS, unit };

export const SYLLABUS: readonly SyllabusUnit[] = [...A1, ...A2, ...B1, ...B2, ...C1];

/** What each level is for, in the words a learner would use about themselves. */
export interface LevelInfo {
  level: Level;
  title: string;
  summary: string;
  /** The one sentence that describes arriving here. */
  arrival: string;
}

export const LEVEL_INFO: Record<Level, LevelInfo> = {
  A1: {
    level: "A1",
    title: "Esimesed sammud",
    summary: "Survive a first conversation: greet, order, count, and say what you do.",
    arrival: "You can be understood in a shop, a café and a first introduction.",
  },
  A2: {
    level: "A2",
    title: "Igapäevane eesti keel",
    summary: "Handle daily life in the past as well as the present, and ask for things politely.",
    arrival: "You can hold a simple conversation about your day, your family and your plans.",
  },
  B1: {
    level: "B1",
    title: "Iseseisev keelekasutaja",
    summary: "Say why, not just what: the object, verb government, the conditional and participles.",
    arrival: "You can explain, disagree and deal with the unexpected without switching to English.",
  },
  B2: {
    level: "B2",
    title: "Kindel keelekasutaja",
    summary: "Change register at will, and read a newspaper without a dictionary open.",
    arrival: "You can follow a public debate and argue your side of it in writing.",
  },
  C1: {
    level: "C1",
    title: "Vilunud keelekasutaja",
    summary: "Compress, subordinate, hedge and choose between near-synonyms.",
    arrival: "You can write academic and professional Estonian that reads as though written, not translated.",
  },
};

/**
 * The exam at the end of a level.
 *
 * A checkpoint is not another unit. It draws entirely on words the learner has
 * already met at this level and asks for them cold, in the modes that demand
 * production rather than recognition — which is the only way to find out whether
 * a level is finished or merely visited.
 */
export interface Checkpoint {
  id: string;
  level: Level;
  title: string;
  blurb: string;
  /** Questions asked. Kept short: a checkpoint is a measurement, not a session. */
  questions: number;
  /** Percentage correct needed to pass. */
  passMark: number;
}

export const CHECKPOINTS: readonly Checkpoint[] = LEVELS.map((level) => ({
  id: `checkpoint-${level.toLowerCase()}`,
  level,
  title: `${level} lõpueksam`,
  blurb: `Everything ${level} asked of you, cold and in production. No multiple choice.`,
  questions: 20,
  // Deliberately not 100. A level is passed when it is reliable, not perfect,
  // and the CEFR descriptors themselves are about consistency rather than
  // flawlessness.
  passMark: 80,
}));

export const checkpointFor = (level: Level): Checkpoint =>
  CHECKPOINTS.find((c) => c.level === level)!;

const BY_ID = new Map(SYLLABUS.map((u) => [u.id, u]));

export function unitById(id: string): SyllabusUnit | undefined {
  return BY_ID.get(id);
}

export function unitsAtLevel(level: Level): readonly SyllabusUnit[] {
  return SYLLABUS.filter((u) => u.level === level);
}

/** Level index, for comparisons. A1 is 0, C2 is 5. */
export const levelIndex = (level: Level): number => LEVELS.indexOf(level);

/**
 * Every distinct lemma the course teaches, with the unit that introduces it.
 *
 * A word may appear in more than one unit and that is deliberate: a grammar unit
 * teaches a rule using vocabulary the learner already has, which is the whole
 * reason `objekt` revisits verbs from A1. The *introducing* unit is the first one
 * in course order, and it is the one that decides which level a word counts at.
 */
export interface CourseWord {
  lemma: string;
  gloss: string;
  pos: Pos;
  /** The Ekilex homonym a person pinned, where the lemma alone is ambiguous. */
  ekilexWordId?: number;
  /** The unit that introduces it, in course order. */
  unitId: string;
  level: Level;
  /** Every unit that drills it, including the introducing one. */
  units: string[];
}

const WORDS: readonly CourseWord[] = (() => {
  const byLemma = new Map<string, CourseWord>();
  for (const u of SYLLABUS) {
    for (const v of u.vocabulary) {
      const key = `${v.lemma}|${v.pos}`;
      const existing = byLemma.get(key);
      if (existing) {
        if (!existing.units.includes(u.id)) existing.units.push(u.id);
        continue;
      }
      byLemma.set(key, {
        lemma: v.lemma,
        gloss: v.gloss,
        pos: v.pos,
        ...(v.ekilexWordId ? { ekilexWordId: v.ekilexWordId } : {}),
        unitId: u.id,
        level: u.level,
        units: [u.id],
      });
    }
  }
  return [...byLemma.values()];
})();

export const courseWords = (): readonly CourseWord[] => WORDS;

const INTRODUCING = (() => {
  const byLemma = new Map<string, string>();
  for (const word of WORDS) {
    const lemma = word.lemma.trim().toLowerCase();
    byLemma.set(`${lemma}|${word.pos}`, word.unitId);
    if (!byLemma.has(lemma)) byLemma.set(lemma, word.unitId);
  }
  return byLemma;
})();

/**
 * The unit that introduces a word, which is the nearest thing this app has to
 * a topic.
 *
 * A course is not a thesaurus and for this it is the better of the two: a unit
 * is a dozen words a teacher put in one lesson because they turn up together,
 * which makes them exactly the words a learner has to be able to tell apart.
 * `lib/questions/distractors.ts` reads it to keep "black" among the colors.
 *
 * The part of speech is matched where the dictionary and the course agree on
 * one, and ignored otherwise: `hall` is a noun meaning frost in the dictionary
 * and an adjective meaning gray in the course, and it belongs to the colors
 * either way. A word the course does not teach has no unit, which is the
 * honest answer rather than a guess.
 */
export function unitIntroducing(lemma: string, pos?: string): string | null {
  const key = lemma.trim().toLowerCase();
  return (pos ? INTRODUCING.get(`${key}|${pos}`) : undefined) ?? INTRODUCING.get(key) ?? null;
}

export function wordsAtLevel(level: Level): readonly CourseWord[] {
  return WORDS.filter((w) => w.level === level);
}

export type UnitState = "done" | "learning" | "available" | "locked";

export interface UnitProgress {
  /** Unit words that exist in the dictionary at all. */
  available: number;
  /** Unit words with at least one card in the deck. */
  started: number;
  /** Unit words whose cards have all reached the FSRS Review state. */
  known: number;
  /** 0-100, weighting a known word fully and a started one half. */
  pct: number;
  state: UnitState;
}

/**
 * How far through a unit the learner is.
 *
 * "Known" means every card made from the word has graduated to FSRS Review state
 * — not "was answered right once". A unit only reads as finished when the
 * scheduler agrees the words are actually retained.
 */
export function unitProgress(input: {
  availableLemmas: readonly string[];
  startedLemmas: readonly string[];
  knownLemmas: readonly string[];
}): UnitProgress {
  const available = input.availableLemmas.length;
  const startedSet = new Set(input.startedLemmas);
  const knownSet = new Set(input.knownLemmas);
  const started = input.availableLemmas.filter((l) => startedSet.has(l)).length;
  const known = input.availableLemmas.filter((l) => knownSet.has(l)).length;

  if (available === 0) return { available, started: 0, known: 0, pct: 0, state: "locked" };

  const pct = Math.min(100, Math.round(((known + (started - known) * 0.5) / available) * 100));
  const state: UnitState = known === available ? "done" : started > 0 ? "learning" : "available";

  return { available, started, known, pct, state };
}

/**
 * Whether a unit is open, given what is finished and where the learner placed.
 *
 * See the note at the top of this file: locking is the weaker of the two
 * conditions on purpose. A unit at or below your own level never locks, however
 * little of the course you have done.
 */
export function isUnitOpen(input: {
  unit: SyllabusUnit;
  doneUnitIds: ReadonlySet<string>;
  placement: Level;
}): boolean {
  if (levelIndex(input.unit.level) <= levelIndex(input.placement)) return true;
  if (input.unit.requires.length === 0) return true;
  return input.unit.requires.every((r) => input.doneUnitIds.has(r));
}

/**
 * The unit to offer as "continue here".
 *
 * The first open unit in course order that is not finished, starting from the
 * learner's own level rather than from A1 — being told to go back to greetings
 * is how a B1 learner decides the course is not for them.
 */
export function nextUnit(input: {
  doneUnitIds: ReadonlySet<string>;
  startedUnitIds: ReadonlySet<string>;
  placement: Level;
}): SyllabusUnit | undefined {
  const open = (u: SyllabusUnit) => isUnitOpen({ unit: u, ...input });
  const unfinished = SYLLABUS.filter((u) => !input.doneUnitIds.has(u.id) && open(u));

  // Something already in progress beats something new: finishing beats starting.
  const inProgress = unfinished.find((u) => input.startedUnitIds.has(u.id));
  if (inProgress) return inProgress;

  const atOrAbove = unfinished.find((u) => levelIndex(u.level) >= levelIndex(input.placement));
  return atOrAbove ?? unfinished[0];
}

/** Kept so the pre-syllabus consumers keep working unchanged. */
export const PATH = SYLLABUS;
export type PathUnit = SyllabusUnit;
