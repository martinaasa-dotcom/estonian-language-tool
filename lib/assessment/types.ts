import type { CaseKey } from "@/lib/estonian/types";

/**
 * What a placement check is made of.
 *
 * The whole feature rests on one constraint: **every Estonian string in an item
 * comes from the dictionary**, never from this app and never from a model
 * (ADR-005, ADR-017). A test that invented its own Estonian would be worse than
 * no test at all, because a learner would be marked wrong for disagreeing with
 * something nobody attested. So an item carries the Estonian it shows *and*
 * where that Estonian came from, and the runner prints the provenance beside it.
 *
 * The English half is ours to write: the questions are metalanguage, and the
 * options for a meaning question are the glosses already stored against the
 * words. Nothing here translates, and nothing here inflects.
 *
 * Pure and framework-free, like `lib/estonian/`.
 */

export type Skill = "reading" | "listening" | "writing" | "speaking";

/** The CEFR bands the dictionary is tagged with, in order. */
export type Band = "A1" | "A2" | "B1" | "B2" | "C1";
export const BANDS: readonly Band[] = ["A1", "A2", "B1", "B2", "C1"] as const;

/** Below the first band. Reported honestly rather than rounded up to A1. */
export const PRE_A1 = "pre-A1" as const;
export type Level = Band | typeof PRE_A1;

export function bandIndex(band: Band): number {
  return BANDS.indexOf(band);
}

/** Where the Estonian in an item came from, shown to the learner. */
export type ItemSource =
  /** A form or gloss stored in the dictionary, seeded or retrieved. */
  | "dictionary"
  /** A full paradigm form retrieved from Ekilex. */
  | "ekilex"
  /** A regular case computed from the genitive stem by `lib/estonian/derive`. */
  | "derived"
  /** An example sentence recorded by a lexicographer. */
  | "usage";

interface ItemBase {
  /** Stable across a render, so React keys and responses line up. */
  id: string;
  skill: Skill;
  band: Band;
  /** The English question. Metalanguage only. */
  question: string;
  source: ItemSource;
  /** The word the item is about, for the review afterwards. */
  lemma: string;
}

/** Pick one of four. The only kind that can be marked without any judgement. */
export interface ChoiceItem extends ItemBase {
  kind: "choice";
  /** The Estonian being asked about. Empty when the question needs no prompt. */
  et: string;
  /** True when `et` may only be heard, never shown. Listening depends on it. */
  heard: boolean;
  options: readonly string[];
  /** True when the options are Estonian, so they are marked `lang="et"`. */
  estonianOptions: boolean;
  answer: number;
  /** One line explaining the answer, shown on review. */
  because: string;
}

/** Hear a sentence, type it back. Marked by `lib/estonian/dictation`. */
export interface DictationItem extends ItemBase {
  kind: "dictation";
  et: string;
}

/** Write a sentence putting a word in a named case. Marked by string match. */
export interface WriteItem extends ItemBase {
  kind: "write";
  translation: string;
  caseKey: CaseKey;
  caseEn: string;
  caseEt: string;
  caseQuestion: string;
  /** The form the learner has to produce. Authoritative, never generated. */
  targetForm: string;
  /** Every other form of the word, so a near miss can be named as one. */
  otherForms: readonly string[];
}

/** Say it, hear it back beside a native voice, judge for yourself. */
export interface SpeakItem extends ItemBase {
  kind: "speak";
  et: string;
  /** The English meaning, which is the prompt. */
  translation: string;
  /** True when `et` is a whole sentence rather than one word. */
  isSentence: boolean;
}

export type Item = ChoiceItem | DictationItem | WriteItem | SpeakItem;

/**
 * As much of an item as the scale needs.
 *
 * Marking needs the whole question; turning marks into a level needs only which
 * skill it tested and how hard it was. Naming that narrower shape is what lets
 * the server recompute a level from a result posted by a browser without
 * trusting, or rebuilding, the paper itself.
 */
export type ItemRef = Pick<Item, "id" | "skill" | "band">;

/**
 * One answer.
 *
 * `credit` runs 0 to 1 rather than right or wrong, because two of the four
 * skills genuinely have a middle: a dictation with one word out is not a blank
 * page, and a sentence built on the wrong form of the right word is not a
 * sentence about nothing.
 *
 * A speaking response carries `selfRating` and no credit at all. That is not an
 * oversight, it is ADR-018: there is no verified Estonian speech recogniser
 * available here, so nothing in this app may score a recording, including this.
 */
export interface Response {
  itemId: string;
  skill: Skill;
  band: Band;
  credit: number;
  /** 1 to 4, and only ever on a speaking item. */
  selfRating?: number;
  /** Milliseconds from the item appearing to the answer landing. */
  ms: number;
  /** Was the answer skipped rather than attempted. */
  skipped?: boolean;
}

export interface BandScore {
  band: Band;
  items: number;
  credit: number;
  /** Credit as a share of the items attempted, 0 to 1. */
  ratio: number;
}

export interface SkillResult {
  skill: Skill;
  /** False when the section could not run at all, e.g. audio was unavailable. */
  measured: boolean;
  items: number;
  credit: number;
  bands: BandScore[];
  /** Null when the skill was not measured, or is not scoreable at all. */
  level: Level | null;
  /** Speaking only: the average of the learner's own ratings, 1 to 4. */
  selfRating?: number | null;
}

export type Confidence = "rough" | "indicative" | "reasonable";

export interface Placement {
  /** Per skill, always in a fixed order so two results compare cleanly. */
  skills: SkillResult[];
  /**
   * The level all measured skills reach, which is the weakest of them. A CEFR
   * level is a claim about everything you can do, so it follows the floor.
   */
  overall: Level | null;
  /** The strongest measured skill's level, for the honest "but you can" line. */
  ceiling: Level | null;
  confidence: Confidence;
  itemsAnswered: number;
}
