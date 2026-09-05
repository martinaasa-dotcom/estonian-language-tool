import { CLOSE_PCT, LIKELY_PCT, type Evidence, type Readiness } from "@/lib/exam/readiness";
import type { ExamLevel } from "@/lib/exam/spec";

/**
 * A GROUP SEEN BY WHOEVER IS PAYING FOR IT, WHICH IS NOT THE SAME SEAT AS A
 * TEACHER'S.
 *
 * A class and a sponsored group of colleagues are the same rows underneath:
 * people who joined something, each with their own deck and their own review
 * log, none of it copied anywhere. What differs is who is looking and what they
 * have a reason to know.
 *
 * `lib/classroom/roster.ts` already drew that line once, for a teacher, and
 * widened it once deliberately: a teacher sees which case one named student
 * keeps missing, on the argument that the aggregate told them the class was
 * weak on the partitive and nothing about who to sit next to. That argument is
 * a pedagogical one and it does not survive being moved into a workplace. An
 * employer has no lesson to plan. What they have is a budget they are spending
 * and a date their employee has to pass an examination by, and "Kadri keeps
 * getting the partitive wrong" answers neither question while being exactly the
 * kind of thing that follows somebody into a review they cannot see.
 *
 * So a workplace cohort is not the teacher's roster with fields hidden in the
 * view. It is a narrower query that never reads the per-person case data at
 * all, feeding a shape that has nowhere to put it. A field that is not in the
 * type cannot be printed by the next screen somebody writes.
 *
 * Pure: no React, no Prisma, no clock beyond what the caller passes in. The
 * database half is `workplaceRoster` in lib/classroom/roster.ts.
 */

export const COHORT_KINDS = ["CLASS", "WORKPLACE"] as const;
export type CohortKind = (typeof COHORT_KINDS)[number];

/** What each kind is called where somebody has to choose between them. */
export const COHORT_LABEL: Record<CohortKind, string> = {
  CLASS: "A class",
  WORKPLACE: "A workplace group",
};

export const COHORT_DETAIL: Record<CohortKind, string> = {
  CLASS: "You teach it. You see who is keeping up and which case each person is weakest at.",
  WORKPLACE: "You sponsor it. You see who is practicing and who is on track, never their mistakes.",
};

/**
 * The stored string, read back.
 *
 * Anything unrecognised is a class, because that is what every row written
 * before this column existed is, and because a group whose kind cannot be read
 * should fall to the shape whose consent screen everybody in it already saw.
 */
export function cohortKind(raw: string | null | undefined): CohortKind {
  return raw === "WORKPLACE" ? "WORKPLACE" : "CLASS";
}

// ── Where somebody stands, in words rather than a number ─────────────────────

/**
 * A band, and deliberately not a percentage.
 *
 * The learner's own examination hub prints "41 percent likely to pass B1",
 * which is the right figure to show somebody about themselves: they know what
 * they have done, they can act on it, and the evidence tier beside it says what
 * it is worth. The same number read by an employer about a named employee is a
 * different object. It looks exact, it cannot be argued with by the person it
 * describes, and nothing about a sponsorship decision needs three significant
 * figures. What HR can act on is "this person is on track" or "this person
 * needs help", and that is a band.
 *
 * `unknown` is not a fourth grade. It is the honest answer where the log is too
 * thin to say anything, and it is common: somebody two weeks into a deck has a
 * confidence figure the model itself caps at 60 for want of evidence.
 */
export type ReadinessBand = "likely" | "close" | "far" | "unknown";

export const BAND_LABEL: Record<ReadinessBand, string> = {
  likely: "On track",
  close: "Close",
  far: "Needs time",
  unknown: "Too early to say",
};

/**
 * How much history has to sit behind a band before it is put next to a name.
 *
 * `evidenceFrom` calls anything under 150 reviews "thin" and the model caps its
 * own confidence at 60 to say so. That cap is enough when the reader is the
 * learner. It is not enough when the reader signs the invoice: "needs time"
 * beside an employee's name, computed off nine reviews, is a judgment the data
 * cannot carry, and the person it lands on has no way to see the arithmetic.
 * Below this tier the band is `unknown` whatever the model says.
 */
export const MIN_EVIDENCE_TO_BAND: Evidence = "fair";

const EVIDENCE_RANK: Record<Evidence, number> = { thin: 0, fair: 1, good: 2 };

export function bandFor(confidence: number, evidence: Evidence): ReadinessBand {
  if (EVIDENCE_RANK[evidence] < EVIDENCE_RANK[MIN_EVIDENCE_TO_BAND]) return "unknown";
  if (confidence >= LIKELY_PCT) return "likely";
  if (confidence >= CLOSE_PCT) return "close";
  return "far";
}

// ── The rollup ───────────────────────────────────────────────────────────────

/** One member, as the batched query hands them over. */
export interface CohortInput {
  ownerId: string;
  displayName: string;
  /** Null where the member has no review history to assess at all. */
  readiness: Readiness | null;
  reviewsThisWeek: number;
  /** Days since their last review; null if they have never reviewed. */
  daysSinceLastReview: number | null;
}

/**
 * One member, as a sponsor sees them.
 *
 * There is no confidence percentage on this type and no weakest case, and both
 * absences are the point. A number that is not carried cannot be printed by a
 * screen written next year by somebody who did not read the header above.
 */
export interface CohortMember {
  ownerId: string;
  displayName: string;
  band: ReadinessBand;
  /** What the band rests on, carried so no screen can show one without it. */
  evidence: Evidence;
  reviewsThisWeek: number;
  daysSinceLastReview: number | null;
}

export interface CohortSummary {
  /** The paper the bands are about. A band means nothing without one. */
  level: ExamLevel;
  members: CohortMember[];
  counts: Record<ReadinessBand, number>;
  /** Members who reviewed at all in the last seven days. */
  active: number;
  /** The weakest tier behind any band here, which is what the group's figure is worth. */
  evidence: Evidence;
}

/** How many days without a review before a member reads as having stopped. */
export const QUIET_DAYS = 7;

export function summariseCohort(input: CohortInput[], level: ExamLevel): CohortSummary {
  const members: CohortMember[] = input.map((row) => {
    const at = row.readiness?.levels.find((l) => l.level === level);
    const evidence = row.readiness?.evidence ?? "thin";
    return {
      ownerId: row.ownerId,
      displayName: row.displayName,
      band: at ? bandFor(at.confidence, evidence) : "unknown",
      evidence,
      reviewsThisWeek: row.reviewsThisWeek,
      daysSinceLastReview: row.daysSinceLastReview,
    };
  });

  /*
    Alphabetical, and that is a decision rather than a default.

    The teacher's roster sorts by reviews this week, which in a classroom is a
    leaderboard and is meant to be one. The same sort in a workplace ranks
    colleagues against each other by how much homework they did, on a screen
    their employer is looking at, and puts whoever is struggling most at the
    bottom of a list with their name on it. Sorting by band instead is no
    better: it moves them to the top.

    The counts below are what tells a sponsor whether anybody needs help. The
    list is for looking somebody up, so it is ordered the way a list of names is
    ordered.
  */
  members.sort((a, b) => a.displayName.localeCompare(b.displayName) || a.ownerId.localeCompare(b.ownerId));

  const counts: Record<ReadinessBand, number> = { likely: 0, close: 0, far: 0, unknown: 0 };
  for (const member of members) counts[member.band]++;

  // The group's figure is worth what its weakest evidence is worth. Taking the
  // best, or a mean, would let one long-standing member's record vouch for a
  // cohort of people who joined last week.
  const evidence = members.reduce<Evidence>((worst, member) => (
    EVIDENCE_RANK[member.evidence] < EVIDENCE_RANK[worst] ? member.evidence : worst
  ), members.length > 0 ? "good" : "thin");

  return {
    level,
    members,
    counts,
    active: members.filter((m) => m.daysSinceLastReview !== null && m.daysSinceLastReview <= QUIET_DAYS).length,
    evidence,
  };
}
