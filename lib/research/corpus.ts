/**
 * What a lot of people learning Estonian get wrong, counted, with nobody in it.
 *
 * Every graded review already lands in `Review` carrying what was asked and how
 * it went, because the scheduler needs exactly that. `lib/stats/history.ts`
 * already turns those rows into accuracy per grammatical case, and every
 * learner sees their own version of it on Progress. `lib/classroom/roster.ts`
 * already does the group version for a class, gated so that a small room cannot
 * be read back to one pupil. This is the same two pieces aimed at a whole
 * deployment rather than at one person or one classroom: which case, which
 * gradation pattern, which word, and how often it comes back right.
 *
 * That number does not exist anywhere else. A textbook's difficulty ordering is
 * somebody's judgement, a classroom's is twenty-five people, and a corpus of
 * written Estonian records what natives produce rather than where learners
 * fail. This records the second thing at a size no single course reaches, and
 * it costs nothing to collect because it was collected already: not one row is
 * written for it, and nothing new is asked of anybody.
 *
 * ---
 *
 * WHAT MAKES IT SAFE TO HAND SOMEBODY IS THIS FILE, so it is worth saying
 * plainly what the danger is. A table of averages looks anonymous and often is
 * not. A cell only one person contributed to is that person's answers with a
 * percentage sign on it, and a cell ten people contributed to where one of them
 * supplied nine tenths of the reviews is very nearly the same thing.
 * Statistical disclosure control is a small, well understood field about
 * exactly this, and four of its rules are implemented here rather than
 * described:
 *
 * 1. **A threshold rule.** A cell is published only if at least `MIN_LEARNERS`
 *    distinct people contributed to it and it rests on at least `MIN_REVIEWS`
 *    answers. Below either, the cell is withheld entirely: not reported as a
 *    size, not reported as zero. `/api/metrics` reports a small cohort's size
 *    with no rates, because there the totals would otherwise lie. Here nothing
 *    is published that depends on the totals, so nothing is said at all.
 *
 * 2. **A dominance rule.** No single learner may account for more than
 *    `MAX_LEARNER_SHARE` of a cell's answers. Ten people is not ten people when
 *    one of them is nine tenths of the data, and this is the check a plain
 *    head count misses. Official statistics have applied the same rule to
 *    business tables for decades.
 *
 * 3. **Complementary suppression.** A group of cells that hides exactly one of
 *    them, and publishes the rest, has not hidden it: it is recoverable by
 *    subtraction from any total the reader can reconstruct. So a group that
 *    hides one cell hides a second, the smallest of the ones that passed. No
 *    section publishes a total of its own either, which is the other half of
 *    the same argument.
 *
 * 4. **Deliberate imprecision.** Answer counts are rounded and learner counts
 *    are reported as a band rather than a number. Two vintages of this file
 *    otherwise let a reader difference them and recover what happened in
 *    between, which is the one attack the three rules above do not touch. It
 *    costs a researcher nothing: a proportion resting on 4,830 answers and one
 *    resting on 4,834 are the same finding.
 *
 * The thresholds are the same in every section, which is a decision rather than
 * laziness. It makes one sentence true of the whole file, and one sentence is
 * what an operator can actually check before sending it to anybody.
 *
 * ---
 *
 * Pure, like `lib/stats/retention.ts` next door and for the same reason: the
 * database read lives in the route, this takes tallies and hands back a
 * publishable table, and the tests need no Postgres to say whether the gate
 * holds. Nothing here ever sees an owner id except to count how many distinct
 * ones there were, and the id itself cannot reach an output field.
 */

/**
 * The smallest number of distinct people behind a published cell.
 *
 * Ten rather than the five `/api/metrics` uses, and the difference is who reads
 * the answer. That endpoint is the operator looking at their own deployment
 * from behind a token. This file is meant to be sent to somebody outside it,
 * and a number that leaves the building should cost more to publish than one
 * that does not. Ten is also where most statistical offices settle for a table
 * derived from records about people.
 */
export const MIN_LEARNERS = 10;

/**
 * The smallest number of answers behind a published cell.
 *
 * This one is statistics rather than privacy. Ten people who between them
 * answered a comitative card eleven times produce a percentage that moves nine
 * points if one of them was tired, and a table full of those reads as findings
 * when it is noise. Fifty is where a proportion starts being worth printing at
 * the precision this file prints it to.
 */
export const MIN_REVIEWS = 50;

/**
 * The largest share of one cell's answers that may come from one person.
 *
 * The threshold rule counts heads and the dominance rule weighs them, and
 * without the second the first is theatre: a cell can clear ten learners while
 * being one person's evening plus nine people's single answers, and its
 * accuracy is then that person's accuracy. Half is the classic cut, and it is
 * strict in practice, since a cell that passes the other two rules is usually
 * spread much wider than this.
 */
export const MAX_LEARNER_SHARE = 0.5;

/** Answer counts are rounded to a multiple of this before they are published. */
export const COUNT_ROUNDING = 10;

/**
 * The bands a learner count is reported in.
 *
 * A head count is the identifying dimension in a table like this, so it is the
 * one blurred hardest: "between 50 and 99 people" supports every claim a reader
 * of this file needs to make, and supports no claim at all about which people.
 * The ladder starts at `MIN_LEARNERS`, because nothing below it is published.
 */
export const LEARNER_BANDS: readonly { from: number; label: string }[] = [
  { from: 1000, label: "1000+" },
  { from: 500, label: "500-999" },
  { from: 250, label: "250-499" },
  { from: 100, label: "100-249" },
  { from: 50, label: "50-99" },
  { from: 20, label: "20-49" },
  { from: 10, label: "10-19" },
];

/** How a count below the smallest band reads, where one is shown at all. */
export const BELOW_BAND = `fewer than ${LEARNER_BANDS[LEARNER_BANDS.length - 1]!.from}`;

/** Nobody at all, which is a different statement from "too few to say". */
export const NO_LEARNERS = "0";

/**
 * One person's contribution to one cell, which is the finest thing this module
 * is handed and the finest thing that has to exist for the dominance rule to be
 * answerable at all.
 *
 * The database groups to this before anything reaches Node, so no individual
 * review is ever materialised here, and `learner` is an opaque key used for
 * counting and for nothing else. It is never read, never compared against
 * anything outside its own cell, and never reaches an output field.
 */
export interface Contribution {
  /** The cell this falls in: one value per dimension the section declares. */
  keys: readonly string[];
  learner: string;
  reviews: number;
  correct: number;
  /**
   * Of those, the ones asked of a card the scheduler had stopped treating as
   * new. Counted apart because they are the honest denominator for "did they
   * know it": see `MATURE_STATE` and the note on `Cell.mature`.
   */
  matureReviews: number;
  matureCorrect: number;
}

/** Why a cell was withheld. Reported as a count, never against a cell. */
export type SuppressionReason = "learners" | "reviews" | "dominance";

export interface Summary {
  /** Answers behind the figure, rounded to `COUNT_ROUNDING`. */
  reviews: number;
  /** People behind it, as a band from `LEARNER_BANDS`. */
  learners: string;
  /** Percent answered correctly, 0 to 100. */
  accuracyPct: number;
}

export interface Cell {
  /** One value per dimension, in the order the section declares them. */
  keys: readonly string[];
  /** Every answer in this cell. */
  all: Summary;
  /**
   * The same cell over mature reviews only, or null where the mature subset
   * does not pass the gate on its own. It is gated separately and deliberately:
   * a cell can rest on two hundred answers from thirty people and have four
   * mature ones from one of them, and publishing that as a percentage hands out
   * exactly what the gate exists to withhold.
   */
  mature: Summary | null;
}

export interface Section {
  id: string;
  title: string;
  /** What the columns of `keys` mean, in order. */
  dimensions: readonly string[];
  /** What this table is for, and what it cannot be read as. */
  note: string;
  cells: Cell[];
  /** How many cells the gate withheld, so a reader knows the table is partial. */
  suppressed: number;
}

/** A section before its numbers exist: what the route asks the database for. */
export interface SectionSpec {
  id: string;
  title: string;
  dimensions: readonly string[];
  note: string;
  /**
   * How many leading dimensions group cells for complementary suppression.
   *
   * A one dimensional table is one group. A crosstab is grouped by its first
   * dimension, because that is the axis whose total a reader can reconstruct:
   * the `case` table publishes how many answers the partitive rests on, so the
   * row of `case_by_level` splitting the partitive is where a lone hidden cell
   * comes back by subtraction. Grouping wider would suppress far more than the
   * argument justifies.
   */
  groupBy: number;
}

/** Round to the nearest `COUNT_ROUNDING`, which is what a published count is. */
export function roundCount(n: number): number {
  return Math.round(n / COUNT_ROUNDING) * COUNT_ROUNDING;
}

/**
 * A learner count as a band.
 *
 * Below the smallest band it says so, which is the honest reading for a figure
 * describing the corpus as a whole, where the alternative is silence about how
 * much was left out. A cell never reaches here below the threshold, because it
 * is withheld before this is asked.
 */
export function bandLearners(n: number): string {
  if (n <= 0) return NO_LEARNERS;
  for (const band of LEARNER_BANDS) if (n >= band.from) return band.label;
  return BELOW_BAND;
}

interface Tally {
  learner: string;
  n: number;
  ok: number;
}

/**
 * The gate itself: three rules over one set of per-person tallies.
 *
 * Returns the publishable summary, or the reason it is withheld. Every figure
 * in every section goes through this once for all answers and once for the
 * mature ones, and there is no path to a published number that does not.
 */
export function gate(tallies: readonly Tally[]): Summary | SuppressionReason {
  let reviews = 0;
  let correct = 0;
  let largest = 0;
  let learners = 0;
  for (const t of tallies) {
    if (t.n <= 0) continue;
    learners++;
    reviews += t.n;
    correct += t.ok;
    if (t.n > largest) largest = t.n;
  }

  if (learners < MIN_LEARNERS) return "learners";
  if (reviews < MIN_REVIEWS) return "reviews";
  if (largest / reviews > MAX_LEARNER_SHARE) return "dominance";

  return {
    reviews: roundCount(reviews),
    learners: bandLearners(learners),
    accuracyPct: Math.round((correct / reviews) * 100),
  };
}

/** The key of the group a cell falls in for complementary suppression. */
function groupKey(keys: readonly string[], groupBy: number): string {
  return keys.slice(0, groupBy).join(" ");
}

/**
 * Turn one section's contributions into the table that gets published.
 *
 * The order of what happens here is the whole of the safety argument. Cells are
 * gated first; then a group that hid exactly one cell hides its smallest
 * survivor as well; and only what is left is rounded and banded. Running the
 * complementary pass over rounded counts would let a group of near-equal
 * survivors pick a different victim each vintage, which is a way of leaking the
 * ordering it was meant to protect.
 */
export function buildSection(
  spec: SectionSpec,
  contributions: readonly Contribution[],
): Section {
  const cells = new Map<string, { keys: readonly string[]; all: Tally[]; mature: Tally[] }>();
  for (const c of contributions) {
    const id = c.keys.join(" ");
    let cell = cells.get(id);
    if (!cell) {
      cell = { keys: c.keys, all: [], mature: [] };
      cells.set(id, cell);
    }
    cell.all.push({ learner: c.learner, n: c.reviews, ok: c.correct });
    if (c.matureReviews > 0) {
      cell.mature.push({ learner: c.learner, n: c.matureReviews, ok: c.matureCorrect });
    }
  }

  interface Candidate {
    keys: readonly string[];
    group: string;
    raw: number;
    all: Summary | null;
    mature: Summary | null;
  }

  const candidates: Candidate[] = [];
  for (const cell of cells.values()) {
    const all = gate(cell.all);
    const mature = gate(cell.mature);
    candidates.push({
      keys: cell.keys,
      group: groupKey(cell.keys, spec.groupBy),
      raw: cell.all.reduce((sum, t) => sum + t.n, 0),
      all: typeof all === "string" ? null : all,
      mature: typeof mature === "string" ? null : mature,
    });
  }

  /*
    A group that withheld exactly one cell withholds a second. Which second is
    settled by the unrounded count, smallest first, with the joined keys as the
    tie-break, so the choice is a fact about the data rather than about the
    order a query happened to return rows in. That is the same argument this
    app makes everywhere else about a comparator that can return zero.
  */
  const byGroup = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const held = byGroup.get(c.group);
    if (held) held.push(c);
    else byGroup.set(c.group, [c]);
  }
  for (const group of byGroup.values()) {
    if (group.filter((c) => !c.all).length !== 1) continue;
    const victim = group
      .filter((c) => c.all)
      .sort((a, b) => a.raw - b.raw || a.keys.join(" ").localeCompare(b.keys.join(" ")))[0];
    if (victim) {
      victim.all = null;
      victim.mature = null;
    }
  }

  const published: Cell[] = [];
  let suppressed = 0;
  for (const c of candidates) {
    if (!c.all) {
      suppressed++;
      continue;
    }
    published.push({ keys: c.keys, all: c.all, mature: c.mature });
  }

  /*
    Worst first, which is the order the question is asked in: somebody opening
    this wants to know what learners get wrong, not what the alphabet says.
    Ties go to the better evidenced cell and then to the keys, so the order is
    total and two runs over the same data cannot disagree.
  */
  published.sort(
    (a, b) =>
      a.all.accuracyPct - b.all.accuracyPct ||
      b.all.reviews - a.all.reviews ||
      a.keys.join(" ").localeCompare(b.keys.join(" ")),
  );

  return {
    id: spec.id,
    title: spec.title,
    dimensions: spec.dimensions,
    note: spec.note,
    cells: published,
    suppressed,
  };
}
