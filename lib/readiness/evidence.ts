import { isFormSlot } from "@/lib/srs/slots";

/**
 * WHAT THE LOG SAYS ABOUT ONE WORD, READ FOR READINESS.
 *
 * `lib/srs/mastery.ts` reads the same rows and asks a different question: has
 * this word been asked in enough ways to call it known. This asks the three a
 * conversation asks. Can you recognise it when it comes at you, can you
 * produce it when it is your turn, and how long does that take you.
 *
 * WHICH ANSWERS ARE WHICH. `Review.slot` records what a card asked
 * (`lib/srs/slots.ts`): a case, a named part of a verb, or the card's own
 * type. A recognition card shows Estonian and asks for the meaning, which is
 * the word coming *at* you. Everything else asks for Estonian back, a
 * meaning into a word, a stem into a case, a verb into a person, a gap into
 * the form the sentence wants, and that is the word being *produced*. A row
 * written before the column exists carries `targetCase` or nothing, and a row
 * with nothing on it is counted as recognition, which is the safe direction:
 * the one thing this module promises is that recognition on its own never
 * clears the second rung, so an unlabelled answer may not be allowed to.
 *
 * WHY THE CLOCK COUNTS. `Review.durationMs` is how long the card was on the
 * screen before it was graded, and nothing in the app had ever read it. It
 * is the one signal here about pace, and pace is the thing that breaks people
 * at a counter: knowing the word for a receipt and taking six seconds to
 * reach it are both true of the same person, and only the second one decides
 * what happens next. So the median time over *correct* production answers is
 * kept per word. Only correct ones, because a wrong answer's time measures
 * the search for a word that was not found, and only rows with a time on
 * them, since a grade replayed from the offline outbox after a backup can
 * carry none.
 *
 * Pure. No React, no Prisma. The clock is passed in.
 */

export interface ReviewRow {
  rating: number;
  slot: string | null;
  targetCase: string | null;
  durationMs: number;
  reviewedAt: Date;
}

export interface Tally {
  asked: number;
  right: number;
  /** Median time to a correct answer, in milliseconds. Null below `MIN_TIMED`. */
  medianMs: number | null;
  /** Whether the most recent answer was right. Null when never asked. */
  lastRight: boolean | null;
}

export interface WordEvidence {
  recognise: Tally;
  produce: Tally;
  /** Distinct forms (cases, verb parts) answered right at least once. */
  formsRight: number;
  /** Days since the last answer of any kind. Null when never asked. */
  daysSince: number | null;
}

/** Timed correct answers needed before a median is worth printing. */
export const MIN_TIMED = 3;

/**
 * Recall over a wall clock is capped where `grade()` caps it, and anything
 * over a minute is a card left open rather than a word being searched for.
 */
export const TIMED_CEILING_MS = 60_000;

/** What kind of question a slot recorded. See the header. */
export function askedFor(row: { slot: string | null; targetCase: string | null }): "recognise" | "produce" {
  const slot = row.slot ?? row.targetCase ?? "";
  if (slot === "" || slot === "RECOGNITION") return "recognise";
  return "produce";
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const EMPTY: Tally = { asked: 0, right: 0, medianMs: null, lastRight: null };

/** Rows may arrive in any order; the most recent is found by its timestamp. */
export function wordEvidence(rows: readonly ReviewRow[], now: Date): WordEvidence {
  if (rows.length === 0) {
    return { recognise: EMPTY, produce: EMPTY, formsRight: 0, daysSince: null };
  }

  const groups = { recognise: [] as ReviewRow[], produce: [] as ReviewRow[] };
  const forms = new Set<string>();
  let latest = rows[0]!;
  for (const row of rows) {
    groups[askedFor(row)].push(row);
    if (row.reviewedAt > latest.reviewedAt) latest = row;
    const slot = row.slot ?? row.targetCase ?? "";
    if (row.rating >= 3 && slot && isFormSlot(slot)) forms.add(slot);
  }

  const tally = (group: ReviewRow[]): Tally => {
    if (group.length === 0) return EMPTY;
    const right = group.filter((r) => r.rating >= 3);
    const timed = right
      .map((r) => r.durationMs)
      .filter((ms) => ms > 0 && ms <= TIMED_CEILING_MS);
    const last = group.reduce((a, b) => (b.reviewedAt > a.reviewedAt ? b : a));
    return {
      asked: group.length,
      right: right.length,
      medianMs: timed.length >= MIN_TIMED ? median(timed) : null,
      lastRight: last.rating >= 3,
    };
  };

  return {
    recognise: tally(groups.recognise),
    produce: tally(groups.produce),
    formsRight: forms.size,
    daysSince: Math.max(0, Math.floor((now.getTime() - latest.reviewedAt.getTime()) / 86_400_000)),
  };
}
