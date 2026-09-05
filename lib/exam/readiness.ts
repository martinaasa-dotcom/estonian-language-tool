import { EXAM_LEVELS, PASS_PCT, type ExamLevel } from "./spec";
import { SKILLS, SKILL_LABEL, type SkillKey } from "./types";

/**
 * Where the app thinks a learner is, and how likely they are to pass each paper.
 *
 * THE HARD PART IS NOT THE ARITHMETIC, IT IS SAYING HOW SURE WE ARE.
 *
 * A number like "68 percent likely to pass B1" is worth having and is very easy
 * to make up. Everything a percentage like that could rest on is already in the
 * review log, which is the whole argument for computing it rather than storing
 * one (ADR-014): how many words at the level have stuck, how often recall
 * actually succeeds, which cases are shaky, and which of the four skills the
 * learner has ever practiced at all.
 *
 * What the log cannot supply is confidence in its own answer. Somebody who has
 * done forty reviews has a coverage figure, and it means almost nothing. So the
 * estimate is made in two steps, and both are published:
 *
 *   1. A **predicted score** for each part, from coverage and accuracy.
 *   2. A **confidence** that the total clears sixty percent, which is a logistic
 *      on the margin whose spread widens as the evidence thins. Thin evidence
 *      does not make the app confident and wrong, it makes it visibly unsure.
 *
 * And a ceiling on top of that: a learner with a hundred reviews behind them
 * cannot be told they are 94 percent certain of anything, whatever the model
 * says, because the model has not seen enough of them to earn the claim.
 *
 * A paper they have actually sat outranks all of it. A measured result is
 * evidence of a kind no amount of flashcard history can substitute for, so the
 * most recent sitting at a level carries most of the weight for that level.
 *
 * Pure: no React, no Prisma, no clock beyond what the caller passes in.
 */

export interface SkillEvidence {
  /** Sessions or items the learner has done that exercise this skill. */
  attempts: number;
  /** How well, 0 to 100. Meaningless when `attempts` is 0. */
  pct: number;
}

export interface PastAttempt {
  level: ExamLevel;
  pct: number;
  passed: boolean;
  /** ISO date, most recent first when the caller sorts them that way. */
  at: string;
  /**
   * Percentage scored in each part, when the sitting recorded them.
   *
   * The only per-skill evidence the app has for listening and speaking: a
   * review row carries no note of which mode wrote it, so a dictation and a
   * flip of the same card are indistinguishable in the log.
   */
  parts?: Partial<Record<SkillKey, number>>;
}

export interface CaseSignal {
  caseKey: string;
  caseEn: string;
  /** The name a course uses, which is the one the advice is written in. */
  caseEt: string;
  pct: number;
  reviews: number;
}

/**
 * A level the placement check measured, per skill.
 *
 * The one source that separates listening and speaking from everything else. A
 * `Review` row carries no note of which mode wrote it, so a dictation and a
 * flip of the same card are the same row in the log, and before this existed
 * the advice here could only say the app had nothing on those two parts. The
 * placement check asks them directly (ADR-020), so when one has been sat its
 * per-skill levels are evidence, and better evidence than any card-type proxy.
 */
export interface PlacementSignal {
  /** ISO date it was sat. */
  at: string;
  /** Per skill, "A1" to "C1", or "pre-A1" below the first band. Null if unmeasured. */
  skills: Partial<Record<SkillKey, string | null>>;
  /** Scored questions behind it. Speaking is deliberately not among them. */
  answered: number;
}

export interface ReadinessSignals {
  /** Dictionary words at each level, and how many have stuck. */
  vocabulary: Record<ExamLevel, { known: number; available: number }>;
  /** Recall on cards past the learning phase, and how many reviews it rests on. */
  accuracy: { pct: number; reviews: number };
  /** Per-case accuracy, weakest first. */
  cases: CaseSignal[];
  skills: Record<SkillKey, SkillEvidence>;
  /** Sittings of this app's mock papers, most recent first. */
  attempts: PastAttempt[];
  /** The most recent placement check, when one has been sat. */
  placement?: PlacementSignal | null;
  totalReviews: number;
}

/** "pre-A1" and an unmeasured skill both sit below A1. */
const PLACEMENT_RANK: Record<string, number> = {
  "pre-A1": -1, A1: 0, A2: 1, B1: 2, B2: 3, C1: 4,
};

/**
 * What a placement level says about a paper at a given level, as a percentage.
 *
 * Not a score, an expectation. Somebody the check placed at B1 should be around
 * the pass mark on the B1 paper, comfortable on A2, and well short at C1. So the
 * distance between the two levels is what matters, centered on the pass mark and
 * moving about twenty points a band: at the level, 60; one band above, 40; one
 * below, 80. Clamped, because two bands either way is already "no" or "yes".
 */
export function expectationFromPlacement(placed: string, paper: ExamLevel): number | null {
  const from = PLACEMENT_RANK[placed];
  const to = PLACEMENT_RANK[paper];
  if (from === undefined || to === undefined) return null;
  return Math.max(2, Math.min(98, PASS_PCT - (to - from) * 20));
}

export type Evidence = "thin" | "fair" | "good";

/**
 * WHAT A TIER MEANS, IN WORDS, AND THERE IS ONE COPY OF IT.
 *
 * A confidence figure carries the evidence behind it, which is the whole reason
 * `Evidence` exists: "72 percent likely to pass B2" after nine reviews is an
 * invented number and the learner has no way of telling it apart from one that
 * means something. The exam hub said this in a sentence it kept to itself, and
 * the moment a second screen printed the same percentage the app had two
 * answers to what it was worth. So the words live next to the tier.
 *
 * Two lengths because there are two shapes of room. The note is a sentence
 * under a heading; the label goes beside a number where a sentence will not
 * fit, and it is printed rather than hidden in a `title`, because a hover is
 * not text and this app is measured on a phone.
 */
export const EVIDENCE_NOTE: Record<Evidence, string> = {
  thin: "We have very little to go on yet, so these are guesses and are capped to say so.",
  fair: "There is enough history here for a rough estimate, not a confident one.",
  good: "There is enough history here for these numbers to mean something.",
};

export const EVIDENCE_LABEL: Record<Evidence, string> = {
  thin: "a guess for now",
  fair: "a rough estimate",
  good: "on a real record",
};

export interface Feedback {
  id: string;
  title: string;
  detail: string;
  /** Where to go and do something about it. */
  href?: string;
  cta?: string;
}

export interface LevelReadiness {
  level: ExamLevel;
  /** Percentage chance of clearing the pass mark, 1 to 99. */
  confidence: number;
  /** Predicted score for each part, 0 to 100. */
  expected: Record<SkillKey, number>;
  /**
   * Whether anything at all has been seen of that part.
   *
   * A `Review` row carries no note of which mode wrote it, so a dictation and
   * a flip of the same card are one row and the app genuinely has nothing on
   * speaking until a level check is sat. The model still needs a number for
   * every part, because the total is an average of four; the screen must not
   * print that number as a prediction. It said "Speaking predicted at 0
   * percent" to somebody who had never been asked to speak, which reads as a
   * verdict rather than as an absence.
   */
  seen: Record<SkillKey, boolean>;
  /** Predicted total, 0 to 100. */
  expectedTotal: number;
  evidence: Evidence;
  /** True when this rests on a paper the learner actually sat. */
  measured: boolean;
  /** One line, ready to print. */
  verdict: string;
}

export interface Readiness {
  levels: LevelReadiness[];
  /** The highest level the app would bet on. Null when it would bet on none. */
  assessed: ExamLevel | null;
  /** The one to aim at next: the first the learner is not yet likely to pass. */
  next: ExamLevel | null;
  evidence: Evidence;
  strengths: Feedback[];
  gaps: Feedback[];
}

// ── The model ────────────────────────────────────────────────────────────────

/**
 * How far down the levels the paper reaches, and how much each one counts.
 *
 * A B2 candidate is not excused an A2 word, so coverage at a level is coverage
 * of everything up to it. The level itself counts most because the paper is
 * drawn from it: the weights halve with each step down, which after four steps
 * is small enough to ignore and never quite zero, which is right. Somebody who
 * has forgotten every A1 word is not ready for C1 however much C1 vocabulary
 * they have collected.
 */
const DEPTH_WEIGHTS = [1, 0.5, 0.25, 0.125, 0.0625];

function coverageAt(signals: ReadinessSignals, level: ExamLevel): number {
  const index = EXAM_LEVELS.indexOf(level);
  let weighted = 0;
  let total = 0;
  for (let step = 0; step <= index; step++) {
    const at = EXAM_LEVELS[index - step]!;
    const weight = DEPTH_WEIGHTS[step] ?? 0;
    const row = signals.vocabulary[at];
    if (!row || row.available === 0) continue;
    weighted += weight * (row.known / row.available);
    total += weight;
  }
  return total === 0 ? 0 : weighted / total;
}

/**
 * Reviews behind a claim, turned into a tier.
 *
 * The thresholds are round numbers rather than derived ones, and they are meant
 * to be: what they encode is that a few dozen reviews is an anecdote, a few
 * hundred is a pattern, and a few thousand is a record. Publishing the tier
 * beside the number is what keeps it honest, not the exact boundary.
 */
export const EVIDENCE_FAIR = 150;
export const EVIDENCE_GOOD = 800;

/** The most confident the app may be at each tier. */
export const CEILING: Record<Evidence, number> = { thin: 60, fair: 85, good: 97 };

export function evidenceFrom(signals: ReadinessSignals): Evidence {
  // A placement check measures a skill directly, so it counts as having reached
  // it. It is the only thing that reaches listening and speaking at all before
  // a paper has been sat.
  const measured = new Set<SkillKey>();
  for (const skill of SKILLS) {
    if (signals.skills[skill].attempts > 0) measured.add(skill);
    if (signals.placement?.skills?.[skill]) measured.add(skill);
  }
  if (signals.totalReviews < EVIDENCE_FAIR || measured.size < 2) return "thin";
  if (signals.totalReviews < EVIDENCE_GOOD || measured.size < 3) return "fair";
  return "good";
}

/** How wide the uncertainty is, in percentage points of the final score. */
function spreadFor(evidence: Evidence, measured: boolean): number {
  const base = evidence === "good" ? 9 : evidence === "fair" ? 14 : 22;
  // A paper actually sat narrows the estimate more than any amount of history.
  return measured ? Math.max(6, base - 5) : base;
}

/** Chance the true score clears the pass mark, given a prediction and a spread. */
export function passChance(expected: number, spread: number): number {
  return 1 / (1 + Math.exp(-(expected - PASS_PCT) / spread));
}

/**
 * A predicted percentage for one part.
 *
 * Coverage says how much of the material is there; the skill's own record says
 * how well it is handled. A skill with no record falls back to overall recall
 * accuracy, which is the honest default: the app knows how well this person
 * remembers Estonian, it just has not watched them do this particular thing.
 */
function expectedPart(
  signals: ReadinessSignals,
  skill: SkillKey,
  coverage: number,
  level: ExamLevel,
): number {
  const evidence = signals.skills[skill];
  const fallback = signals.accuracy.reviews > 0 ? signals.accuracy.pct : 50;
  const quality = evidence.attempts > 0
    // Blend, rather than switch: two dictation rounds is a signal, not a verdict.
    ? (evidence.pct * Math.min(1, evidence.attempts / 20)) +
      (fallback * (1 - Math.min(1, evidence.attempts / 20)))
    : fallback;
  const modelled = Math.round(Math.max(0, Math.min(100, coverage * quality)));

  /*
    A placement check measured this very skill, against this very set of bands.
    That outranks a coverage figure multiplied by an accuracy figure, and for
    listening and speaking it is usually the only thing the app has: a review row
    carries no note of which mode wrote it, so nothing else in the log tells them
    apart.

    Blended rather than substituted, two thirds to the measurement. The check is
    half an hour long and says so, and its own confidence field exists because it
    knows it is short; letting it overwrite months of review history would be
    taking the smaller sample on its own account.
  */
  const placed = signals.placement?.skills?.[skill];
  if (!placed) return modelled;
  const fromCheck = expectationFromPlacement(placed, level);
  return fromCheck === null ? modelled : Math.round(0.65 * fromCheck + 0.35 * modelled);
}

export function readinessFor(signals: ReadinessSignals, level: ExamLevel): LevelReadiness {
  const coverage = coverageAt(signals, level);
  const expected = Object.fromEntries(
    SKILLS.map((skill) => [skill, expectedPart(signals, skill, coverage, level)]),
  ) as Record<SkillKey, number>;

  const seen = Object.fromEntries(
    SKILLS.map((skill) => [
      skill,
      signals.skills[skill].attempts > 0 || Boolean(signals.placement?.skills?.[skill]),
    ]),
  ) as Record<SkillKey, boolean>;

  const modelled = Math.round(SKILLS.reduce((sum, s) => sum + expected[s], 0) / SKILLS.length);

  /*
    A sitting of this very paper is the best evidence there is. It does not
    replace the model outright, because one bad evening is one bad evening.

    BUT THE BLEND MAY NOT CARRY THE FIGURE ACROSS THE LINE THE SITTING SETTLED,
    and it did. The model is a coverage share times a recall figure, and
    coverage is how much of *this app's* word list for the level a learner has
    met, which is not the examination's: somebody who has learned Estonian
    elsewhere and taken this paper to check can pass it knowing sixty of the
    five hundred words the course happens to teach. Their coverage is 0.12,
    their modelled score is single digits, and thirty-five percent of that is
    enough to drag a real result under sixty.

    Swept over the combinations a learner can actually be in: **90 of 288 put
    "You sat this and scored 85 percent, which is a pass" over a confidence of
    46**, and a sitting at exactly the pass mark read 25. That is a headline
    being a second opinion on the sentence under it, which is the fault
    `lib/assessment/plan.ts` has a paragraph about; here it is worse, because
    one of the two is a fact and the other is an estimate of it.

    "One bad evening" is an argument for not letting a low score condemn
    somebody, and it is not an argument for letting a low model overrule a high
    sitting. So the model still moves the number, and it moves it *within* what
    the sitting established: a paper passed cannot be modelled below a pass, and
    a paper failed cannot be modelled above one. Where the two agree, which is
    most of the time, nothing changes at all.
  */
  const sat = signals.attempts.find((a) => a.level === level);
  const blended = sat ? Math.round(0.65 * sat.pct + 0.35 * modelled) : modelled;
  const expectedTotal = !sat
    ? blended
    : sat.passed
      ? Math.max(blended, PASS_PCT)
      : Math.min(blended, PASS_PCT - 1);

  const evidence = evidenceFrom(signals);
  const spread = spreadFor(evidence, Boolean(sat));
  const raw = Math.round(passChance(expectedTotal, spread) * 100);
  const ceiling = sat ? Math.max(CEILING[evidence], CEILING.fair) : CEILING[evidence];
  const confidence = Math.max(1, Math.min(ceiling, raw));

  return {
    level,
    confidence,
    expected,
    seen,
    expectedTotal,
    evidence,
    measured: Boolean(sat),
    verdict: verdictFor(level, confidence, evidence, sat),
  };
}

/**
 * Where a confidence figure stops being one thing and starts being another.
 *
 * Exported because a second screen now reads the same percentages. The cohort
 * rollup (lib/classroom/cohort.ts) sorts a group into the same three bands this
 * verdict is written in, and a band drawn at 70 there against 75 here would put
 * a learner "on track" on one screen and "close" on another with one number
 * behind both. One table, read twice.
 */
export const LIKELY_PCT = 75;
export const CLOSE_PCT = 55;
export const DISTANT_PCT = 25;

function verdictFor(
  level: ExamLevel,
  confidence: number,
  evidence: Evidence,
  sat: PastAttempt | undefined,
): string {
  if (sat) {
    return sat.passed
      ? `You sat this and scored ${sat.pct} percent, which is a pass.`
      : `You sat this and scored ${sat.pct} percent. A pass is ${PASS_PCT}.`;
  }
  const hedge = evidence === "thin" ? " We are working from very little, so treat it as a guess." : "";
  if (confidence >= LIKELY_PCT) return `You would very likely pass ${level} today.${hedge}`;
  if (confidence >= CLOSE_PCT) return `${level} is within reach, and it would be close.${hedge}`;
  if (confidence >= DISTANT_PCT) return `${level} is a stretch at the moment.${hedge}`;
  return `${level} is a long way off for now, which is worth knowing.${hedge}`;
}

/** The whole picture, every level at once. */
export function assessReadiness(signals: ReadinessSignals): Readiness {
  const levels = EXAM_LEVELS.map((level) => readinessFor(signals, level));
  const evidence = evidenceFrom(signals);

  /*
    The highest level the app would bet on, and the one it would not.

    "Would bet on" is deliberately the same threshold as a pass: anything lower
    and the app is recommending a sitting it expects to fail.

    THE CLIMB STOPS AT THE FIRST LEVEL THAT IS NOT PASSED, which is the rule
    `lib/assessment/score.ts` scores a placement check on and explains at
    length, and it was not the rule here. This took the highest passable level
    anywhere in the list and the lowest unpassable one, which are the same two
    levels only while the ladder falls from left to right, and it does not. The
    confidence at each level rests on how much of *this app's* word list for
    that level has stuck, and the lists are wildly different sizes: 1,069
    entries at B1 against 99 at C1, so somebody who has met every C1 word the
    dictionary happens to carry outscores their own B2. A sitting inverts it
    outright, since a paper failed is clamped below the pass mark and a paper
    passed above it, and a learner can fail B1 on a bad evening and pass B2 in
    September.

    Swept over 3,125 vocabulary states, 802 of them put the two the wrong way
    round, and the card said so in words: "We'd bet on you passing C1 today"
    over "B2 is next, and the gaps below are what's in your way", and at the
    bottom of the range "We'd bet on you passing A2" to somebody whose own
    record showed A1 sat and failed at 20 percent.

    A level is a claim about everything you can do at it, so a level the app
    would not bet on ends the climb whatever sits above it. `next` is then the
    level the climb stopped at, one above `assessed` by construction, and the
    two can no longer disagree.
  */
  let assessed: ExamLevel | null = null;
  let next: ExamLevel | null = null;
  for (const l of levels) {
    if (l.confidence >= PASS_PCT) {
      assessed = l.level;
      continue;
    }
    next = l.level;
    break;
  }

  return {
    levels,
    assessed,
    next,
    evidence,
    strengths: strengthsFrom(signals, assessed),
    gaps: gapsFrom(signals, next ?? assessed ?? "A2"),
  };
}

// ── Telling somebody what to do about it ─────────────────────────────────────

/**
 * A confidence percentage on its own is a verdict, not advice.
 *
 * "You are 41 percent likely to pass B1" leaves a learner knowing exactly one
 * thing they cannot act on. So every gap below names the thing that is costing
 * marks, says how far off it is, and links to the screen where it can be
 * practiced. If a gap cannot be turned into somewhere to go, it does not belong
 * in this list.
 *
 * The strengths are not decoration either. A learner deciding whether to book a
 * sitting needs to know which parts they can leave alone, and somebody grinding
 * vocabulary they already know is losing time they could spend on the part that
 * is actually failing them.
 */

/** Below this a skill is worth naming as a gap. */
export const WEAK_SKILL_PCT = 65;
/** And above this, as a strength. */
export const STRONG_SKILL_PCT = 82;
/** A case needs this many reviews before its percentage means anything. */
export const MIN_CASE_REVIEWS = 6;
export const WEAK_CASE_PCT = 70;
export const STRONG_CASE_PCT = 88;

/** Where each part is practiced, so a gap can hand over a destination. */
const PRACTICE: Record<SkillKey, { href: string; cta: string }> = {
  writing: { href: "/review/write", cta: "Write a sentence" },
  listening: { href: "/review/dictation", cta: "Take a dictation" },
  reading: { href: "/review/cloze", cta: "Fill some gaps" },
  speaking: { href: "/review/speaking", cta: "Record yourself" },
};

function strengthsFrom(signals: ReadinessSignals, assessed: ExamLevel | null): Feedback[] {
  const out: Feedback[] = [];

  if (assessed) {
    const row = signals.vocabulary[assessed];
    out.push({
      id: "level",
      title: `${assessed} vocabulary is there`,
      detail: row && row.available > 0
        ? `${row.known} of the ${row.available} words the dictionary holds at ${assessed} have stuck.`
        : `Enough of the ${assessed} material has stuck to sit the paper.`,
    });
  }

  for (const skill of SKILLS) {
    const evidence = signals.skills[skill];
    if (evidence.attempts >= 5 && evidence.pct >= STRONG_SKILL_PCT) {
      out.push({
        id: `skill-${skill}`,
        title: `${SKILL_LABEL[skill]} is holding up`,
        detail: `${evidence.pct} percent across ${evidence.attempts} goes. Leave it alone and spend the time elsewhere.`,
      });
    }
  }

  const solid = signals.cases
    .filter((c) => c.reviews >= MIN_CASE_REVIEWS && c.pct >= STRONG_CASE_PCT)
    .slice(0, 3);
  if (solid.length > 0) {
    out.push({
      id: "cases",
      title: solid.length === 1 ? "One case is solid" : `${solid.length} cases are solid`,
      detail: `${solid.map((c) => `${c.caseEt} at ${c.pct} percent`).join(", ")}. That is the half of the grammar you can stop worrying about.`,
    });
  }

  if (signals.accuracy.reviews >= 100 && signals.accuracy.pct >= 85) {
    out.push({
      id: "recall",
      title: "Recall is reliable",
      detail: `${signals.accuracy.pct} percent across ${signals.accuracy.reviews} reviews. What you have learned, you have kept.`,
    });
  }

  return out;
}

function gapsFrom(signals: ReadinessSignals, target: ExamLevel): Feedback[] {
  const out: Feedback[] = [];

  // Vocabulary first, because it is the one gap that makes every part harder.
  const row = signals.vocabulary[target];
  if (row && row.available > 0) {
    const missing = row.available - row.known;
    const pct = Math.round((row.known / row.available) * 100);
    if (pct < 80) {
      out.push({
        id: "vocabulary",
        // "513 words short at A1" under a B1 target read as being short of A1,
        // which is the first sentence a nervous learner screenshots for their
        // teacher. It is the band of the words still to meet.
        title: `${missing} ${target} words still to meet`,
        detail: `${row.known} of ${row.available} have stuck, which is ${pct} percent. The paper draws on all of them.`,
        href: "/learn",
        cta: "Open the path",
      });
    }
  }

  /*
    A skill the app has nothing on is worse than a skill it has bad news about:
    a zero in any one part fails the paper, and a part nobody has ever practiced
    is the likeliest place to find one.

    ONLY ONE PART CAN BE THE WORST. The first version said "this is the part
    costing you the most marks" under every part below the threshold, which on a
    beginner's screen was four cards each claiming to be the biggest problem.
    They are ranked, and only the first one gets that sentence.
  */
  const weakest = SKILLS
    .filter((s) => signals.skills[s].attempts > 0 && signals.skills[s].pct < WEAK_SKILL_PCT)
    .sort((a, b) => signals.skills[a].pct - signals.skills[b].pct)[0];

  for (const skill of SKILLS) {
    const evidence = signals.skills[skill];
    const where = PRACTICE[skill];
    const placed = signals.placement?.skills?.[skill];
    if (evidence.attempts === 0 && placed) {
      // Measured, just not by anything that leaves a review row.
      if (PLACEMENT_RANK[placed] !== undefined && PLACEMENT_RANK[placed]! < 2) {
        out.push({
          id: `placed-${skill}`,
          title: `The level check put your ${SKILL_LABEL[skill].toLowerCase()} at ${placed}`,
          detail:
            "It is the weakest kind of evidence a paper can rest on and the only kind this part " +
            "has, because nothing else in your history tells listening and speaking apart.",
          href: where.href,
          cta: where.cta,
        });
      }
    } else if (evidence.attempts === 0) {
      out.push({
        id: `unpractised-${skill}`,
        // Not "you have never practiced it": a review row carries no note of
        // which mode wrote it, so the app genuinely cannot tell a dictation from
        // a flip of the same card. What it can say is that it has nothing.
        title: `Nothing here tells us about your ${SKILL_LABEL[skill].toLowerCase()}`,
        detail:
          "It is a quarter of the paper, and a zero in any one part fails the whole thing however " +
          "good the other three are. Sitting a paper is what puts a number on it.",
        href: where.href,
        cta: where.cta,
      });
    } else if (evidence.pct < WEAK_SKILL_PCT) {
      out.push({
        id: `weak-${skill}`,
        title: `${SKILL_LABEL[skill]} is at ${evidence.pct} percent`,
        detail: skill === weakest
          ? `Across ${evidence.attempts} goes, and it is the part costing you the most marks.`
          : `Across ${evidence.attempts} goes.`,
        href: where.href,
        cta: where.cta,
      });
    }
  }

  const weak = signals.cases
    .filter((c) => c.reviews >= MIN_CASE_REVIEWS && c.pct < WEAK_CASE_PCT)
    .slice(0, 3);
  for (const c of weak) {
    out.push({
      id: `case-${c.caseKey}`,
      title: `The ${c.caseEt}, the ${c.caseEn.toLowerCase()}, is at ${c.pct} percent`,
      detail: `${c.reviews} reviews, and it is still going wrong. Case endings carry marks in every written part.`,
      href: `/grammar/${c.caseKey.toLowerCase()}`,
      cta: "Read the rule",
    });
  }

  if (signals.accuracy.reviews >= 30 && signals.accuracy.pct < 75) {
    out.push({
      id: "recall",
      title: `Recall is at ${signals.accuracy.pct} percent`,
      detail: "Some cards are being learned and lost again rather than kept. The clinic names which.",
      href: "/review/clinic",
      cta: "Open the clinic",
    });
  }

  if (signals.totalReviews < EVIDENCE_FAIR) {
    out.push({
      id: "evidence",
      title: "We do not know you well enough yet",
      detail: `Everything above rests on ${signals.totalReviews} reviews. Another few weeks of daily review and these numbers start meaning something.`,
      href: "/review",
      cta: "Review now",
    });
  }

  return out;
}
