import { checkDictation, type DictationResult } from "@/lib/estonian/dictation";
import { checkAnswer } from "@/lib/estonian/answer";
import {
  BANDS, PRE_A1, type BandScore, type ChoiceItem, type Confidence,
  type DictationItem, type ItemRef, type Level, type Placement, type Response,
  type Skill, type SkillResult, type WriteItem,
} from "./types";

/**
 * Marking, and turning marks into a level.
 *
 * Two rules shape everything here.
 *
 * **No model marks anything.** A choice item is marked against a stored index,
 * a dictation against the sentence a lexicographer recorded, a written sentence
 * against a form the dictionary vouches for. That is the same ordering the
 * writing exercise already uses: the form is checked by string comparison
 * before any call is made, so a hallucination cannot mark a right answer wrong.
 * A placement test is where that would hurt most, because the learner has no
 * way yet to know the machine is the one that is confused.
 *
 * **Speaking is never scored.** There is no verified Estonian speech recogniser
 * available here (ADR-018), so the speaking section collects the learner's own
 * rating, reports it as theirs, and contributes nothing to the level. A number
 * invented on top of a recogniser that does not support Estonian would be
 * trusted, which is exactly what makes it worse than silence.
 */

/** A band counts as reached at two thirds of its credit. */
export const PASS = 2 / 3;
/** Below half at a band, the bands above it are not worth asking. */
export const FLOOR = 0.5;

/** Skills a level can be claimed from. Speaking is deliberately not one. */
export const SCORED_SKILLS: readonly Skill[] = ["reading", "listening", "writing"];
export const ALL_SKILLS: readonly Skill[] = ["reading", "listening", "writing", "speaking"];

export function gradeChoice(item: ChoiceItem, picked: number): number {
  return picked === item.answer ? 1 : 0;
}

export interface DictationMark {
  credit: number;
  result: DictationResult;
}

/**
 * A dictation is marked word by word, and credited in between.
 *
 * Exact accuracy is the base, with a floor for an answer whose only fault is
 * missing Estonian letters: that learner heard every word, which is the half
 * this section is about.
 */
export function gradeDictation(item: DictationItem, typed: string): DictationMark {
  const result = checkDictation(typed, item.et);
  const base = result.accuracy / 100;
  const credit = result.verdict === "diacritics" ? Math.max(base, 0.8) : base;
  return { credit: Math.min(1, Math.max(0, credit)), result };
}

export interface WriteMark {
  credit: number;
  /** Exactly the form the sentence had, allowing for a slipped diacritic. */
  right: boolean;
  /** A real form of the right word, but not the one this sentence wants. */
  usedAnotherForm: boolean;
  note: string;
}

/**
 * A typed gap is marked against the word the sentence actually had in it.
 *
 * `checkAnswer` is the app's one table for grading typed Estonian, and it is
 * what tells a dropped diacritic from a typo from a different word. Reusing it
 * rather than comparing strings here means the level check is as forgiving as
 * a flashcard is, and forgiving in the same way: `soidan` is not `sõidan`, but
 * the learner who typed it knew the form.
 *
 * The middle mark is the interesting one. A different form of the right word
 * is the mistake this task exists to find, so it is neither a blank page nor a
 * pass: the learner knew the word and not what the sentence was doing with it.
 */
export function gradeWrite(item: WriteItem, typed: string): WriteMark {
  const answer = typed.trim();
  if (!answer) {
    return { credit: 0, right: false, usedAnotherForm: false, note: "Nothing typed yet." };
  }

  const check = checkAnswer(answer, item.targetForm, "et");
  if (check.verdict === "correct") {
    return { credit: 1, right: true, usedAnotherForm: false, note: `${item.targetForm} is what the sentence had.` };
  }
  if (check.verdict === "diacritics" || check.verdict === "typo") {
    return {
      credit: 0.8,
      right: true,
      usedAnotherForm: false,
      note: `${check.note} The sentence had ${item.targetForm}.`,
    };
  }

  const other = item.otherForms.find((form) => checkAnswer(answer, form, "et").verdict === "correct");
  if (other) {
    return {
      credit: 0.4,
      right: false,
      usedAnotherForm: true,
      note: `${other} is a real form of ${item.lemma}, but this sentence wants ${item.targetForm}.`,
    };
  }

  return {
    credit: 0,
    right: false,
    usedAnotherForm: false,
    note: `The sentence had ${item.targetForm}.`,
  };
}

function bandScores(items: readonly ItemRef[], responses: readonly Response[]): BandScore[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const out: BandScore[] = [];
  for (const band of BANDS) {
    const answered = responses.filter((r) => r.band === band && byId.has(r.itemId));
    if (answered.length === 0) continue;
    const credit = answered.reduce((sum, r) => sum + r.credit, 0);
    out.push({ band, items: answered.length, credit, ratio: credit / answered.length });
  }
  return out;
}

/**
 * The level a set of band scores supports.
 *
 * The highest band the learner passed, provided nothing underneath it
 * collapsed. Climbing past a band that scored under half would be reporting a
 * level on the strength of a lucky guess two rungs up.
 */
export function levelFrom(bands: readonly BandScore[]): Level | null {
  if (bands.length === 0) return null;
  let level: Level = PRE_A1;
  for (const score of bands) {
    if (score.ratio >= PASS) level = score.band;
    if (score.ratio < FLOOR) break;
  }
  return level;
}

function lowest(levels: readonly Level[]): Level | null {
  if (levels.length === 0) return null;
  return levels.reduce((a, b) => (rank(a) <= rank(b) ? a : b));
}

function highest(levels: readonly Level[]): Level | null {
  if (levels.length === 0) return null;
  return levels.reduce((a, b) => (rank(a) >= rank(b) ? a : b));
}

export function rank(level: Level): number {
  return level === PRE_A1 ? -1 : BANDS.indexOf(level);
}

export function confidenceFrom(itemsAnswered: number): Confidence {
  if (itemsAnswered >= 12) return "reasonable";
  if (itemsAnswered >= 6) return "indicative";
  return "rough";
}

/**
 * The whole result.
 *
 * The overall level is the *weakest* measured skill, not the average. A CEFR
 * level is a claim about everything a person can do at it, so a learner who
 * reads at B1 and writes at A2 is an A2 who reads well, and telling them
 * otherwise sets them up to sit an exam they will not pass. The strongest skill
 * is reported alongside it, because that half is true too.
 */
export function placement(items: readonly ItemRef[], responses: readonly Response[]): Placement {
  const skills: SkillResult[] = ALL_SKILLS.map((skill) => {
    const own = items.filter((i) => i.skill === skill);
    const answered = responses.filter((r) => r.skill === skill && !r.skipped);
    const bands = bandScores(own, answered);
    const credit = answered.reduce((sum, r) => sum + r.credit, 0);

    if (skill === "speaking") {
      const rated = answered.filter((r) => typeof r.selfRating === "number");
      const average = rated.length
        ? rated.reduce((sum, r) => sum + (r.selfRating ?? 0), 0) / rated.length
        : null;
      return {
        skill, measured: rated.length > 0, items: rated.length, credit: 0,
        bands: [], level: null, selfRating: average,
      };
    }

    return {
      skill,
      measured: answered.length > 0,
      items: answered.length,
      credit,
      bands,
      level: levelFrom(bands),
    };
  });

  const scored = skills
    .filter((s) => SCORED_SKILLS.includes(s.skill) && s.measured && s.level !== null)
    .map((s) => s.level as Level);

  const itemsAnswered = responses.filter((r) => !r.skipped && r.skill !== "speaking").length;

  return {
    skills,
    overall: lowest(scored),
    ceiling: highest(scored),
    confidence: confidenceFrom(itemsAnswered),
    itemsAnswered,
  };
}
