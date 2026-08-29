import { checkDictation, type DictationResult } from "@/lib/estonian/dictation";
import { checkForm, looksLikeSentence } from "@/lib/estonian/writing";
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
  used: boolean;
  usedAnotherForm: boolean;
  isSentence: boolean;
  note: string;
}

/**
 * A written sentence is marked on the one thing that can be marked with
 * certainty: whether the required form is in it.
 *
 * Whether the sentence is idiomatic is a separate question, and one only a
 * human or a model can answer. It is not asked here, because a placement level
 * built on a model's opinion of somebody's Estonian is a level built on sand.
 */
export function gradeWrite(item: WriteItem, sentence: string): WriteMark {
  const isSentence = looksLikeSentence(sentence);
  const task = {
    lemma: item.lemma,
    translation: item.translation,
    caseKey: item.caseKey,
    caseEn: item.caseEn,
    caseEt: item.caseEt,
    caseQuestion: item.caseQuestion,
    targetForm: item.targetForm,
    provenance: "ekilex" as const,
  };
  const { used, usedAnotherForm } = checkForm(sentence, task, [...item.otherForms]);

  if (!isSentence) {
    return { credit: 0, used, usedAnotherForm, isSentence, note: "That is not a whole sentence yet." };
  }
  if (used) {
    return {
      credit: 1,
      used, usedAnotherForm, isSentence,
      note: `${item.targetForm} is the ${item.caseEn.toLowerCase()}, and you used it.`,
    };
  }
  if (usedAnotherForm) {
    return {
      credit: 0.4,
      used, usedAnotherForm, isSentence,
      note: `A sentence, and the right word, but not the ${item.caseEn.toLowerCase()}. That is ${item.targetForm}.`,
    };
  }
  return {
    credit: 0,
    used, usedAnotherForm, isSentence,
    note: `The ${item.caseEn.toLowerCase()} of ${item.lemma} is ${item.targetForm}.`,
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
