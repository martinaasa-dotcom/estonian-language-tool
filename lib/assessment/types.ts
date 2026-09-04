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

/**
 * A figure published as a range, kept as one.
 *
 * Hours to a level, hours a week a situation holds, weeks to a date: every
 * number the plan quotes comes from somebody's estimate and is honest only as
 * a pair. It lives here rather than in `plan.ts` because the reasons table in
 * `goals.ts` carries one per reason and the plan reads that table, and a type
 * both need cannot live in either without the two importing each other.
 */
export interface HourRange {
  low: number;
  high: number;
}

/** Where the Estonian in an item came from, shown to the learner. */
export type ItemSource =
  /** A form or gloss stored in the dictionary, seeded or retrieved. */
  | "dictionary"
  /** A form retrieved from Ekilex. */
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

/**
 * Fill the gap in a recorded sentence. Marked by string match.
 *
 * The productive half of the check, and the only shape in which this app can
 * ask for a form and still mark it with certainty: the sentence decides which
 * form it wants and a lexicographer already wrote down which one that is. It
 * is the state examination's own `lünkülesanne`, and it names no case, because
 * a learner who can put the right ending on a word in a real sentence has
 * shown the thing a case name is only a label for.
 */
export interface WriteItem extends ItemBase {
  kind: "write";
  translation: string;
  /** The sentence with the word taken out. */
  sentence: string;
  /** The sentence whole, which is the explanation afterwards. */
  full: string;
  /** The form the learner has to produce. Authoritative, never generated. */
  targetForm: string;
  /** Every other form of the word, so a near miss can be named as one. */
  otherForms: readonly string[];
  /**
   * Why the sentence wanted that form, in the same words the reading gap uses.
   *
   * The screen used to answer "why that form" with the sentence put back
   * together and nothing else, which tells a learner what the answer was and
   * not what they got wrong. It is the same `explainGap` string the multiple
   * choice version of this task shows, because the two are one task typed and
   * chosen and two explanations of it would drift.
   */
  because: string;
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
   * The average of the measured skills, taken down to a whole band.
   *
   * It was the weakest of them until ADR-020 amendment 2. See `placement` in
   * `./score` for why that changed and what the floor is still doing here.
   */
  overall: Level | null;
  /**
   * The band above `overall`, when the average landed close enough to it to be
   * worth saying. Null almost always, which is the point: "a confident A2, and
   * nearly B1" is a sentence for the sitting that genuinely fell between two
   * bands, and it stops meaning anything if every result carries one.
   *
   * Null on a `Placement` rebuilt from a stored row that kept no skills.
   */
  nearly: Band | null;
  /** The strongest measured skill's level, for the honest "but you can" line. */
  ceiling: Level | null;
  confidence: Confidence;
  itemsAnswered: number;
  /**
   * Questions asked at the two bands the level turned on, which is what the
   * confidence tier is a statement about.
   *
   * Reported beside the tier rather than left inside the calculation, because
   * the screen used to print the whole paper's count and then a tier computed
   * from a subset of it, which is a headline and a sentence answering one
   * question two ways. Somebody who climbed to C1 answered sixty-odd questions
   * and forty of them told us only what the first three already had.
   */
  decisive: number;
}
