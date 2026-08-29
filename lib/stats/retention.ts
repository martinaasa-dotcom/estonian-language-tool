/**
 * Retention, derived from the review log rather than collected.
 *
 * The app has no analytics, no third-party tracker and no identifier beyond
 * the one that signs a person in, and the privacy page says so. None of that
 * has to change to know whether people come back, because `Review` is
 * append-only and every row already carries an owner and a timestamp. Whether
 * somebody returned on their seventh day is a question the existing data
 * answers, in the same way XP and streaks are computed rather than stored
 * (ADR-014). The alternative, an events table and a vendor, would collect more
 * about each person in order to learn less.
 *
 * Pure, and hermetic: it takes days as strings and a clock as an argument, so
 * the tests do not need a database, a network or today's date.
 */

/** A UTC day, "YYYY-MM-DD". The same key the usage ledger files under. */
export type Day = string;

export interface LearnerActivity {
  /** The day of this person's first review ever. */
  firstDay: Day;
  /** Every distinct day they reviewed on. Order does not matter. */
  activeDays: Day[];
}

/**
 * How many days after joining a return has to fall to count, and how wide the
 * window is.
 *
 * Exact-day retention ("did they review on day 7") is the textbook definition
 * and it is too sharp for an app somebody uses in the evenings: a learner who
 * came back on day 8 came back. So each milestone is a bracket, widening with
 * distance because a miss matters less the further out you are. The brackets
 * are published in the output rather than left implicit, because a retention
 * number whose definition is not stated is not a number.
 */
export const MILESTONES = [
  { key: "d1", offset: 1, windowDays: 1 },
  { key: "d7", offset: 7, windowDays: 3 },
  { key: "d30", offset: 30, windowDays: 7 },
] as const;

export type MilestoneKey = (typeof MILESTONES)[number]["key"];

/**
 * The smallest cohort whose rates are reported.
 *
 * Below this a percentage is both statistically meaningless and a privacy
 * problem: "one of two people came back" is a fact about a person. Small
 * cohorts still report their size, because hiding that would make the totals
 * lie.
 */
export const MIN_COHORT = 5;

export interface CohortRow {
  /** The Monday that starts this cohort's week. */
  cohort: Day;
  /** How many people reviewed for the first time that week. */
  learners: number;
  /**
   * Percentage returning at each milestone, 0 to 100.
   *
   * Null means "not answerable", never zero, and there are two ways to get
   * there: the cohort is too small to report, or it is too young to have
   * reached the milestone. A cohort three days old has no thirty day number,
   * and printing 0 for one would understate every recent week on the chart.
   */
  rates: Record<MilestoneKey, number | null>;
  /** True when the rates are hidden for size rather than for age. */
  suppressed: boolean;
}

const DAY_MS = 86_400_000;

function toUtc(day: Day): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}

export function dayKey(at: Date): Day {
  return at.toISOString().slice(0, 10);
}

function addDays(day: Day, days: number): Day {
  return dayKey(new Date(toUtc(day) + days * DAY_MS));
}

/** The Monday on or before this day, so cohorts are weeks rather than dates. */
export function weekStart(day: Day): Day {
  const date = new Date(toUtc(day));
  // getUTCDay is 0 for Sunday, which is six days into the week, not before it.
  const back = (date.getUTCDay() + 6) % 7;
  return addDays(day, -back);
}

/** Did this person review in the window a milestone opens? */
function returnedAt(
  learner: LearnerActivity,
  milestone: (typeof MILESTONES)[number],
  active: Set<Day>,
): boolean {
  for (let offset = 0; offset < milestone.windowDays; offset++) {
    if (active.has(addDays(learner.firstDay, milestone.offset + offset))) return true;
  }
  return false;
}

/** Has enough time passed for this cohort's milestone to mean anything? */
function measurable(
  cohort: Day,
  milestone: (typeof MILESTONES)[number],
  today: Day,
): boolean {
  // The last person in a cohort joined on its final day, so the window closes
  // a week later than the cohort's own start.
  const closes = addDays(cohort, 6 + milestone.offset + milestone.windowDays - 1);
  return toUtc(closes) <= toUtc(today);
}

/**
 * Weekly cohorts, oldest first.
 *
 * Every learner belongs to the week of their first review, forever. That is
 * what makes the rows comparable: a cohort's D7 cannot improve after the fact
 * because somebody came back in month three.
 */
export function cohortRetention(learners: LearnerActivity[], now: Date): CohortRow[] {
  const today = dayKey(now);
  const byCohort = new Map<Day, LearnerActivity[]>();

  for (const learner of learners) {
    const cohort = weekStart(learner.firstDay);
    const bucket = byCohort.get(cohort);
    if (bucket) bucket.push(learner);
    else byCohort.set(cohort, [learner]);
  }

  const rows: CohortRow[] = [];
  for (const [cohort, members] of byCohort) {
    const suppressed = members.length < MIN_COHORT;
    const rates = {} as Record<MilestoneKey, number | null>;

    for (const milestone of MILESTONES) {
      if (suppressed || !measurable(cohort, milestone, today)) {
        rates[milestone.key] = null;
        continue;
      }
      let returned = 0;
      for (const learner of members) {
        if (returnedAt(learner, milestone, new Set(learner.activeDays))) returned += 1;
      }
      rates[milestone.key] = Math.round((returned / members.length) * 1000) / 10;
    }

    rows.push({ cohort, learners: members.length, rates, suppressed });
  }

  return rows.sort((a, b) => a.cohort.localeCompare(b.cohort));
}

export interface ActivitySummary {
  /** People who reviewed on the day itself. */
  dau: number;
  /** People who reviewed in the seven days ending today. */
  wau: number;
  /** People who reviewed in the thirty days ending today. */
  mau: number;
  /**
   * WAU over MAU, as a percentage. The one number that says whether this is a
   * habit or a series of visits, and the one hardest to flatter.
   */
  stickiness: number | null;
}

export function activitySummary(learners: LearnerActivity[], now: Date): ActivitySummary {
  const today = dayKey(now);
  const since = (days: number) => addDays(today, -(days - 1));
  const within = (days: number) =>
    learners.filter((l) => l.activeDays.some((d) => d >= since(days) && d <= today)).length;

  const wau = within(7);
  const mau = within(30);
  return {
    dau: within(1),
    wau,
    mau,
    stickiness: mau === 0 ? null : Math.round((wau / mau) * 1000) / 10,
  };
}
