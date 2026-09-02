import { checkDictation, type DictationResult } from "@/lib/estonian/dictation";
import { checkAnswer } from "@/lib/estonian/answer";
import {
  BANDS, PRE_A1, type Band, type BandScore, type ChoiceItem, type Confidence,
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
    // A dropped diacritic is named by letter, because that is a thing to learn.
    // A slipped keystroke is not: `checkAnswer` quotes the word back, and this
    // sentence is about to say it again, so the two together read "So close,
    // the word is Eesti. The sentence had Eesti." Dictation calls the same
    // mistake "one letter out" and this is the same mistake.
    const slip = check.verdict === "diacritics" ? check.note : "One letter out.";
    return {
      credit: 0.8,
      right: true,
      usedAnotherForm: false,
      note: `${slip} The sentence had ${item.targetForm}.`,
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
 * **The highest band passed consecutively, starting from the bottom.** That is
 * the rule every published CEFR placement test scores on, and it is not what
 * this function used to do. The old version raised the level on any band that
 * cleared `PASS` and only stopped climbing on one that came in under `FLOOR`,
 * so the whole range between half and two thirds was a band the learner had
 * visibly not passed and was promoted straight past anyway: A1 at 100%, A2 at
 * 55% and B1 at 70% reported B1, on the strength of a band underneath it that
 * the same result screen was about to print as failed.
 *
 * That gap is where a four-option question lands most often, because 55% is
 * roughly what a learner scores at a band they half know and exactly what
 * guessing plus a little knowledge looks like. A level is a claim about
 * everything you can do at it, so a band that was asked and not passed ends
 * the climb, whatever happens above it.
 *
 * A band that was never asked is not evidence either way, so it is stepped
 * over rather than read as a failure. On a full paper that does not arise; on
 * a dictionary too thin to fill a band it is the difference between reporting
 * the level the answered questions support and reporting `pre-A1` to somebody
 * who answered everything correctly.
 *
 * **And the floor is the band below the lowest one asked, not always `pre-A1`.**
 * Writing has no A1 question and structurally cannot: its task is choosing the
 * ending a sentence needs, which is a step past reading the word, so
 * `writingItems` raises every gap to A2 for the same reason the reading gaps
 * are raised. Starting the count at `pre-A1` regardless then read a failed A2
 * as "below A1" on the strength of a band nobody had been asked about, and
 * since the overall level follows the *weakest* skill, that put "below A1" on
 * the result of anybody whose writing was not yet A2. Measured on the shipped
 * dictionary, writing comes out A1:0 at every seed, so it was not an edge
 * case, it was most sittings. The most a failed A2 supports is A1, and saying
 * so is the honest end of a section that never set an A1 question.
 */
export function levelFrom(bands: readonly BandScore[]): Level | null {
  if (bands.length === 0) return null;
  const lowestAsked = BANDS.findIndex((band) => bands.some((s) => s.band === band));
  let level: Level = BANDS[lowestAsked - 1] ?? PRE_A1;
  for (const band of BANDS) {
    const score = bands.find((b) => b.band === band);
    if (!score) continue;
    if (score.ratio < PASS) break;
    level = score.band;
  }
  return level;
}


function highest(levels: readonly Level[]): Level | null {
  if (levels.length === 0) return null;
  return levels.reduce((a, b) => (rank(a) >= rank(b) ? a : b));
}

export function rank(level: Level): number {
  return level === PRE_A1 ? -1 : BANDS.indexOf(level);
}

/**
 * How much evidence stands behind the level, and it is not the size of the paper.
 *
 * This read `itemsAnswered` against 12 and 6, which was written for a
 * nineteen-question paper and is now a threshold two thirds of the questions
 * at one band would clear on their own. Counting the whole paper is also the
 * wrong question twice over. A learner who stopped after A2 answered a third
 * of the paper and is not a third as measured: everything they answered was
 * about the boundary that decided them. A learner who went all the way to C1
 * answered the lot, of which everything below their level told us only what we
 * already knew after the first three.
 *
 * So it counts the questions asked at the two bands the decision actually
 * turns on: the highest band passed, and the first band above it that was not.
 * That number scales with the paper rather than with a constant somebody has
 * to remember to raise, and it is low for exactly the reason a result should
 * be hedged, which is a band decided on two questions.
 */
export function confidenceFrom(decisiveItems: number): Confidence {
  if (decisiveItems >= 12) return "reasonable";
  if (decisiveItems >= 6) return "indicative";
  return "rough";
}

/**
 * Questions asked at the bands that settled the level.
 *
 * The band the learner reached and the one above it, which is the boundary
 * being measured. Below `pre-A1` there is no band underneath, so the evidence
 * is whatever was asked at A1. Speaking is excluded here for the same reason
 * it is excluded everywhere else: it is not scored (ADR-018), so it is not
 * evidence for anything.
 */
export function decisiveItems(responses: readonly Response[], level: Level | null): number {
  if (level === null) return 0;
  const reached = level === PRE_A1 ? -1 : BANDS.indexOf(level);
  const decisive = new Set<Band>(
    [BANDS[reached], BANDS[reached + 1]].filter((b): b is Band => !!b),
  );
  return responses.filter(
    (r) => !r.skipped && r.skill !== "speaking" && decisive.has(r.band),
  ).length;
}

/**
 * The whole result.
 *
 * The overall level is the **average** of the measured skills, taken down to a
 * whole band. That reverses what this function did for its first year, and the
 * reversal is ADR-020 amendment 2, so the argument on both sides is worth
 * keeping.
 *
 * The old rule was the weakest measured skill, on the reasoning that a CEFR
 * level is a claim about everything you can do, so a learner who reads at B1
 * and writes at A2 is an A2 who reads well. That is a good argument about a
 * *certificate*, and this is not one: the screen it prints on says so in as
 * many words, twice.
 *
 * What it did in practice was worse than imprecise. A real sitting came back
 * reading B2, A1, B2 and the screen said **below A1**, because one skill fell
 * through the floor and the floor was the whole rule. Nobody who reads and
 * writes at B2 is below A1. The number was not a cautious reading of that
 * learner, it was wrong about them, and it was wrong in the direction that
 * makes somebody close the app: three bands under a person's own sense of
 * themselves, on the screen that exists to tell them where they stand.
 *
 * A single skill can miss for reasons that are not the learner's level. The
 * listening section needs the speech service to answer and abandons itself when
 * it cannot. Writing is the noisiest skill here by measurement, because its
 * answers are typed and nothing puts a floor under a band the way four options
 * do. A rule that takes the minimum takes the noise, every time, by
 * construction.
 *
 * So: the mean of the scored skills, floored. The floor is the cautious half
 * that survives from the old rule, and it is doing the work the old rule was
 * reaching for. The strongest skill is still reported alongside, because that
 * half was always true.
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

  const scored = scoredLevels(skills);

  const itemsAnswered = responses.filter((r) => !r.skipped && r.skill !== "speaking").length;
  const { level: overall, nearly } = overallFrom(scored);
  const decisive = decisiveItems(responses, overall);

  return {
    skills,
    overall,
    nearly,
    ceiling: highest(scored),
    confidence: confidenceFrom(decisive),
    itemsAnswered,
    decisive,
  };
}

/**
 * How close the average sat to the next band before it counts as "nearly".
 *
 * Half a band, which is the honest reading of "too close to call". Below it the
 * learner is in the band and the next one is not in view; at or above it the
 * two bands were genuinely hard to separate and saying only the lower one
 * undersells somebody who was one skill away.
 */
export const NEARLY = 0.5;

/** A level, and the band it was close enough to be worth naming. */
export interface Overall {
  level: Level | null;
  /**
   * The band above `level`, when the average landed at least `NEARLY` of the
   * way towards it. Null otherwise, and null is the common answer: this is a
   * sentence about an edge case and printing it every time would make it noise.
   */
  nearly: Band | null;
}

/**
 * The scored levels of a set of skill results.
 *
 * Exported because two callers need it and they must not disagree: `placement`
 * computes it from a live sitting, and `/assess` rebuilds it from the skills a
 * stored sitting kept. A stored row holds `overall` from whenever it was
 * written, so a row from before this amendment still says what it said; what
 * this lets the screen do is work the *nearly* out of the skills it does hold,
 * rather than storing a second column that could disagree with them.
 */
export function scoredLevels(skills: readonly SkillResult[]): Level[] {
  return skills
    .filter((s) => SCORED_SKILLS.includes(s.skill) && s.measured && s.level !== null)
    .map((s) => s.level as Level);
}

/**
 * The average of some measured levels, floored, and how near the next band it
 * came.
 *
 * `rank` puts pre-A1 at -1 and C1 at 4, so the mean is over evenly spaced
 * bands and the floor of it is a band. Flooring rather than rounding is
 * deliberate: between two bands this reports the lower one and names the
 * higher, which is both the cautious answer and the more useful sentence.
 */
export function overallFrom(levels: readonly Level[]): Overall {
  if (levels.length === 0) return { level: null, nearly: null };

  const mean = levels.reduce((sum, level) => sum + rank(level), 0) / levels.length;
  const floor = Math.floor(mean);
  const level = levelAt(floor);
  const next = levelAt(floor + 1);

  return {
    level,
    // `next` is only ever pre-A1 when the floor is below that, which cannot
    // happen: rank bottoms out at -1. Checked anyway, because "nearly pre-A1"
    // would be a sentence about being nearly nothing.
    nearly: mean - floor >= NEARLY && next !== PRE_A1 && next !== level ? next : null,
  };
}

/** The band at a rank, clamped: below the first band is pre-A1, above the last is the last. */
function levelAt(n: number): Level {
  if (n < 0) return PRE_A1;
  return BANDS[Math.min(n, BANDS.length - 1)] as Band;
}
