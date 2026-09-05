import { BANDS, PRE_A1, type Band, type HourRange, type Level } from "./types";
import { rank } from "./score";
import type { Reason } from "./goals";

export type { HourRange } from "./types";

/**
 * How long this is actually going to take, and what it takes to get there.
 *
 * A learning app that answers "how long until I speak Estonian" with a streak
 * counter is answering a different question than the one asked, and the honest
 * answer is measured in hundreds of hours. This module says so. What it does
 * not do any more is read that number pessimistically. The first verdicts were
 * drawn at the far end of every range against the least a week could hold, so
 * a B1 speaker with a year, living in Estonia and working in Estonian, read
 * "it fits, but only with study outside this app" over a tile saying the app
 * alone would take five hundred weeks. Both were true and neither was the
 * answer, which is that B2 in a year is about five hours a week of Estonian,
 * and somebody who has decided to do it will. The plan now assumes the person
 * in front of it means it: the distance is quoted honestly, the verdict is
 * drawn at the near end of it, and what it asks for is a number of hours a
 * week to commit to rather than a reason it will not work.
 *
 * Unflattering is not the same as one number for everybody, and for a while it
 * was. The plan quoted one table, assumed the same five found hours a week of
 * somebody in Tartu with an Estonian partner and somebody in Leeds with a
 * textbook, built on a level a learner had guessed in ninety seconds as though
 * a paper had measured it, and never once read the review log its own header
 * promised it would. So a B1 speaker was told B2 was as far off as a stranger
 * would find it, and a beginner living inside the language was told to go and
 * find a class. Every figure now says which of four things it rests on:
 *
 *   - the **published hours** between two levels, with the Estonian surcharge
 *     put where the difficulty actually is rather than spread evenly;
 *   - where the learner **stands**, measured skill by skill where a check was
 *     sat and widened where the level is their own guess;
 *   - what their **week already holds**, read off the reasons they gave;
 *   - and their **own pace**, off the review log, once there is one to read.
 *
 * Nothing here is measured on this app's learners as a population, and the
 * copy says that too. What is measured is the one learner in front of it.
 *
 * Pure arithmetic and constants. No React, no database.
 */

/**
 * Cumulative guided learning hours to each level, as published for the CEFR.
 *
 * The figures usually quoted, and quoted for a European language close to
 * English: roughly 90 to 100 hours to A1, 180 to 200 to A2, 350 to 400 to B1,
 * 500 to 600 to B2 and 700 to 800 to C1.
 */
export const GUIDED_LEARNING_HOURS: Record<Band, HourRange> = {
  A1: { low: 90, high: 100 },
  A2: { low: 180, high: 200 },
  B1: { low: 350, high: 400 },
  B2: { low: 500, high: 600 },
  C1: { low: 700, high: 800 },
};

/**
 * How much harder each step is in Estonian than in the language those hours
 * were published for.
 *
 * The scale comes from the US Foreign Service Institute, which groups Estonian
 * with Finnish and Hungarian and budgets about 1 100 classroom hours to
 * professional working proficiency against about 600 for French or Spanish.
 * The first version of this table applied that ratio evenly, near double at
 * every band, and that is not where the difficulty lives. What makes Estonian
 * slow is the morphology: fourteen cases, consonant gradation, the partial
 * object, and all of it has to be in place before anybody holds a
 * conversation. That is the A2 and B1 stretch. A1 is greetings, numbers and
 * the shop in any language, and it is only a little dearer here; and the step
 * from B1 to B2 is mostly vocabulary, register and reading stamina, which
 * cost about what they cost in French once the grammar underneath them works.
 * C1 is long everywhere, and Estonian's long tail of derivation and idiom is
 * genuinely longer, so the surcharge climbs again at the top.
 *
 * So the factor peaks at B1 and dips at B2, and the shape is asserted rather
 * than remembered. It is a judgment over published figures, stated as one;
 * nothing published gives the ratio band by band. The whole climb still lands
 * within the FSI ratio, which is what keeps it a reading of that source and
 * not a replacement for it.
 */
export const ESTONIAN_FACTOR: Record<Band, HourRange> = {
  A1: { low: 1.1, high: 1.4 },
  A2: { low: 1.5, high: 1.8 },
  B1: { low: 1.6, high: 1.9 },
  B2: { low: 1.3, high: 1.5 },
  C1: { low: 1.7, high: 2.0 },
};

/** Rounded to the nearest ten hours. A table in units of one is false precision. */
const ROUND_HOURS = 10;

function buildCumulative(): Record<Band, HourRange> {
  const out = {} as Record<Band, HourRange>;
  let low = 0;
  let high = 0;
  let previous: HourRange = { low: 0, high: 0 };
  for (const band of BANDS) {
    const published = GUIDED_LEARNING_HOURS[band];
    const factor = ESTONIAN_FACTOR[band];
    low += (published.low - previous.low) * factor.low;
    high += (published.high - previous.high) * factor.high;
    previous = published;
    out[band] = {
      low: Math.round(low / ROUND_HOURS) * ROUND_HOURS,
      high: Math.round(high / ROUND_HOURS) * ROUND_HOURS,
    };
  }
  return out;
}

/**
 * Cumulative study hours to reach each level, for an English speaker learning
 * Estonian: the published hours with the factor above applied step by step.
 *
 * These are hours of *study*, not hours in this app. That distinction is the
 * whole reason the projection below separates the two.
 */
export const CUMULATIVE_HOURS: Record<Band, HourRange> = buildCumulative();

/** Hours already behind a learner at a level. Nothing, below A1. */
function hoursAt(level: Level): HourRange {
  if (level === PRE_A1) return { low: 0, high: 0 };
  return CUMULATIVE_HOURS[level];
}

/**
 * The study still to do between two levels. Zero when the target is passed.
 *
 * Low against low and high against high, deliberately. A learner who reached
 * B1 in the fewer hours is the learner who will reach B2 in the fewer hours,
 * so the honest range for the step is the difference of the ends and not the
 * difference of the extremes, which would say a B1 speaker might be anywhere
 * from 100 to 550 hours off B2 and mean nothing.
 */
export function hoursBetween(from: Level, to: Band): HourRange {
  if (rank(from) >= rank(to)) return { low: 0, high: 0 };
  const start = hoursAt(from);
  const end = CUMULATIVE_HOURS[to];
  return { low: Math.max(0, end.low - start.low), high: Math.max(0, end.high - start.high) };
}

/** The level one band down, and below A1 there is nowhere further to go. */
function bandBelow(level: Level): Level {
  if (level === PRE_A1) return PRE_A1;
  const i = BANDS.indexOf(level);
  return i <= 0 ? PRE_A1 : BANDS[i - 1]!;
}

/**
 * Where a learner stands, and how the app knows.
 *
 * A level is the same letter whether a paper measured it or a stranger ticked
 * it on their first evening, and the plan used to treat the two identically.
 * They are not worth the same. A measured check also carries what the overall
 * hides: the per skill levels, and a learner who reads at B2 and listens at A1
 * is not a B1 with B1's distance to cover.
 */
export interface Standing {
  level: Level;
  /**
   * `measured` is a placement check this app sat; `estimated` is the learner's
   * own reading of themselves, or nothing at all, in which case the level is
   * below A1 and the guess is the app's.
   */
  source: "measured" | "estimated";
  /**
   * The scored skills' own levels, on a measured standing. Speaking is never
   * among them (ADR-018). Absent or empty, the overall stands for all of them.
   */
  skills?: readonly Level[];
}

/**
 * The study between where somebody stands and a target, read the way the
 * standing deserves.
 *
 * **Measured, skill by skill.** A level is the average of three measured
 * skills taken down to a band, and the hours to a target are the mean of the
 * hours each skill still has to cover, a skill already past the target
 * contributing none. For an even profile that is exactly `hoursBetween`. For
 * an uneven one it is three real distances averaged rather than one distance
 * from a level nobody is actually at, and it lands on either side of the
 * plain figure depending on the profile: a skill already at the target pulls
 * it down because that part is done, a skill far behind pulls it up because
 * the exam asks for all of it.
 *
 * **Estimated, widened downward only.** People place themselves within about
 * a band of where a paper puts them, more often above it at the lower levels.
 * So the near end of the range is taken at face value and the far end allows
 * for a start half a band lower. Only the far end, because a plan that quietly
 * shortened the distance for an optimistic guess would be flattering exactly
 * the learner most likely to be wrong, and a plan that lengthened both ends
 * would be calling every self-assessment a lie.
 *
 * Zero in both directions once the overall is at or past the target, whatever
 * the skills say: "arrived" is a claim about the level, and the level is the
 * overall.
 */
export function hoursFor(standing: Standing, to: Band): HourRange {
  if (rank(standing.level) >= rank(to)) return { low: 0, high: 0 };

  if (standing.source === "measured") {
    const skills = standing.skills ?? [];
    if (skills.length === 0) return hoursBetween(standing.level, to);
    let low = 0;
    let high = 0;
    for (const skill of skills) {
      const h = hoursBetween(skill, to);
      low += h.low;
      high += h.high;
    }
    return { low: low / skills.length, high: high / skills.length };
  }

  const stated = hoursBetween(standing.level, to);
  const lower = hoursBetween(bandBelow(standing.level), to);
  return { low: stated.low, high: (stated.high + lower.high) / 2 };
}

/** True when the skills moved the distance off the plain table, so the screen can say why. */
export function countedBySkill(standing: Standing, to: Band): boolean {
  if (standing.source !== "measured" || !standing.skills?.length) return false;
  const plain = hoursBetween(standing.level, to);
  const bySkill = hoursFor(standing, to);
  return plain.low !== bySkill.low || plain.high !== bySkill.high;
}

export type Verdict =
  /** Already at or past the target level. */
  | "arrived"
  /** The app's own pace alone covers the whole distance. */
  | "comfortable"
  /** It fits: the hours beyond the app are ones a normal week already holds. */
  | "tight"
  /**
   * It fits, if the learner commits to it: the hours beyond the app are more
   * than the week supplies on its own and still inside what a person who has
   * decided to do this puts in (`COMMIT_HOURS_PER_WEEK`).
   */
  | "possible"
  /** More than any normal week holds beside a life, so the date or the pace has to move. */
  | "short"
  /** No deadline was given, so there is nothing to fit into. */
  | "open"
  /** The date has already gone. There is no span left to divide by. */
  | "passed";

/**
 * The study a normal week absorbs outside this app when nothing in the
 * learner's life supplies any: a class and some reading.
 *
 * It is the figure the plan offers as the realistic addition to somebody
 * abroad with a textbook, and the floor under everybody else. Where the line
 * between "it fits" and "not by that date" is drawn used to be this number for
 * every learner, so it lived here rather than in the copy. It still lives
 * here, and the line is now drawn at `foundHours`, which starts from it.
 */
export const FOUND_HOURS_PER_WEEK = 5;

/**
 * The most a plan asks anybody to commit beyond this app, in hours a week.
 *
 * Ten is a serious evening course plus its homework, or an hour a day and a
 * long Saturday, which is what people who set a date and mean it actually do.
 * The verdict assumes the learner will, because a plan that assumes the
 * opposite is a reason rather than a plan. Above it the honest thing is to
 * say the date or the pace has to move.
 */
export const COMMIT_HOURS_PER_WEEK = 10;

/**
 * Hours a week of Estonian the learner's own situation puts within reach,
 * from the reasons they gave.
 *
 * The largest counts whole and each further one counts half, because the same
 * evening is not spent twice: somebody who lives here and has an Estonian
 * partner is talking to the same neighbors their partner introduced them to.
 * Nothing chosen is nothing offered.
 */
export function weeklyExposure(reasons: readonly Reason[]): HourRange {
  const ranked = [...reasons].map((r) => r.exposure).sort((a, b) => b.high - a.high || b.low - a.low);
  let low = 0;
  let high = 0;
  ranked.forEach((e, i) => {
    const weight = i === 0 ? 1 : 0.5;
    low += e.low * weight;
    high += e.high * weight;
  });
  return { low, high };
}

/**
 * Hours a week of Estonian beyond this app that this learner's week can hold:
 * the class and reading anybody can go and find, plus whatever their life
 * already supplies. A range, because the exposure is one.
 */
export function foundHours(reasons: readonly Reason[]): HourRange {
  const exposure = weeklyExposure(reasons);
  return { low: FOUND_HOURS_PER_WEEK + exposure.low, high: FOUND_HOURS_PER_WEEK + exposure.high };
}

/**
 * What the review log says about how much of this app a learner actually does.
 *
 * Measured by `lib/stats/pace.ts` off the timestamps and durations of real
 * reviews, never asked for. A stated pace is a hope and this is a record.
 */
export interface MeasuredPace {
  /** Hours a week spent answering in this app, over the window. */
  hoursPerWeek: number;
  /** Days a week with at least one review in them, over the window. */
  daysPerWeek: number;
  /** How many weeks the reading covers. */
  weeks: number;
  /**
   * Cards answered per minute of sitting, or null before a sitting has any
   * length. Not a plan figure: Today reads it to say how long the cards
   * waiting will take, at this learner's rate rather than at the default.
   */
  cardsPerMinute: number | null;
}

/**
 * Weeks of log before the app trusts it over what the learner said.
 *
 * Two, because one week is a holiday or a bad one, and the pace shown back to
 * somebody is a claim about them. Below it the stated pace stands and the
 * screen says so.
 */
export const MIN_PACE_WEEKS = 2;

export type PaceSource =
  /** What the learner said they would do, because there is no log yet to read. */
  | "stated"
  /** What the log says they did. */
  | "measured"
  /** The log covers the window and holds nothing, so the stated pace stands, flagged. */
  | "lapsed";

export interface PlanInput {
  standing: Standing;
  to: Band;
  /** The daily goal, in review minutes. */
  minutesPerDay: number;
  /** Days a week the learner expects to actually open the app. */
  daysPerWeek: number;
  /** Weeks until the deadline. Null when there is no deadline. */
  weeksAvailable: number | null;
  /** Hours a week of Estonian beyond this app the learner's week holds. `foundHours` builds it. */
  found: HourRange;
  /** The learner's own pace off the log, or null before there is one. */
  pace?: MeasuredPace | null;
}

export interface Projection {
  standing: Standing;
  to: Band;
  /** Study hours between where they stand and the target, read the way the standing deserves. */
  hours: HourRange;
  /**
   * Hours a week this app gets: the learner's measured pace where the log
   * covers enough weeks, their stated pace otherwise.
   *
   * Exact, not rounded. Everything below divides by it, and a figure rounded
   * for a tile is a figure that lies when it is used as a divisor: at three
   * minutes a day three days a week the true pace is 0.15 hours and the
   * rounded one is 0.2, which is a third more study than the learner said they
   * would do and took a quarter off the weeks it would take. Rounding is a
   * question about a screen, so `PlanPanel` answers it.
   */
  appHoursPerWeek: number;
  paceSource: PaceSource;
  /** Weeks the measured pace was read over. Null when the pace is the stated one. */
  paceWeeks: number | null;
  /** Weeks to the target if the app were the only study. It will not be. */
  weeksOnAppAlone: HourRange;
  /** Weeks until the deadline, as given. Null when there is none. */
  weeksAvailable: number | null;
  /** Hours the app will contribute inside the deadline. Exact, as above. */
  appHoursAvailable: number | null;
  /** Study hours a week still to find elsewhere, to make the deadline. */
  otherHoursPerWeek: HourRange | null;
  /** The found hours the verdict was drawn against, so the copy quotes the same figure. */
  found: HourRange;
  /**
   * Weeks to the target at the app's pace plus the found hours: the near end
   * with everything the week can hold, the far end with the least of it.
   */
  weeksWithFound: HourRange;
  verdict: Verdict;
}

/**
 * The projection.
 *
 * It deliberately reports two different things. `weeksOnAppAlone` is what a
 * daily-goal ring implies if you take it at face value, and it is usually a
 * shocking number. `otherHoursPerWeek` is the real answer: how much study has
 * to happen outside this app for the deadline to survive contact with the
 * hours above. Both are ranges, because the hours they come from are.
 *
 * Every figure it returns is exact. The panel rounds them on the way to a
 * screen, and nothing here rounds on the way to a division.
 */
export function project(input: PlanInput): Projection {
  const { standing, to, found } = input;
  const hours = hoursFor(standing, to);
  const daysPerWeek = Math.min(7, Math.max(1, input.daysPerWeek));
  const stated = (Math.max(0, input.minutesPerDay) * daysPerWeek) / 60;

  /*
    The log outranks the promise once it covers enough weeks to be a record
    rather than a mood. A window with nothing in it is a fact too, and a
    different one from "no log yet": the stated pace stands, and the screen
    says it is standing in for a fortnight that held nothing.
  */
  const pace = input.pace ?? null;
  const measured = pace !== null && pace.weeks >= MIN_PACE_WEEKS;
  const paceSource: PaceSource = !measured ? "stated" : pace.hoursPerWeek > 0 ? "measured" : "lapsed";
  const appHoursPerWeek = paceSource === "measured" ? pace!.hoursPerWeek : stated;
  const paceWeeks = measured ? pace!.weeks : null;

  const weeksOnAppAlone: HourRange = appHoursPerWeek > 0
    ? { low: Math.ceil(hours.low / appHoursPerWeek), high: Math.ceil(hours.high / appHoursPerWeek) }
    : { low: 0, high: 0 };

  // The fastest and the slowest the week could go: every found hour used, and the fewest.
  const weeksWithFound: HourRange = {
    low: weeksNeeded(hours, appHoursPerWeek, found.high).low,
    high: weeksNeeded(hours, appHoursPerWeek, found.low).high,
  };

  const common = {
    standing, to, hours, appHoursPerWeek, paceSource, paceWeeks, found, weeksWithFound,
    weeksAvailable: input.weeksAvailable,
  };

  if (rank(standing.level) >= rank(to)) {
    return {
      ...common,
      weeksOnAppAlone: { low: 0, high: 0 },
      weeksWithFound: { low: 0, high: 0 },
      appHoursAvailable: input.weeksAvailable === null ? null : 0,
      otherHoursPerWeek: null,
      verdict: "arrived",
    };
  }

  if (input.weeksAvailable === null) {
    return { ...common, weeksOnAppAlone, appHoursAvailable: null, otherHoursPerWeek: null, verdict: "open" };
  }

  /*
    A date that has gone is not a short deadline, it is no deadline at all, and
    the arithmetic below has nothing to divide by. Treating it as one week left
    is what produced "in 0 weeks your daily goal puts in about 0.4 of those
    hours" over a note asking for 1 099 hours a week, which is a screen nobody
    can act on. The honest answer is that the date is behind them.
  */
  if (input.weeksAvailable <= 0) {
    return { ...common, weeksOnAppAlone, appHoursAvailable: 0, otherHoursPerWeek: null, verdict: "passed" };
  }

  const weeks = input.weeksAvailable;
  const appHoursAvailable = appHoursPerWeek * weeks;
  const other: HourRange = {
    low: Math.max(0, (hours.low - appHoursAvailable) / weeks),
    high: Math.max(0, (hours.high - appHoursAvailable) / weeks),
  };

  /*
    The bands are drawn at the near end of the distance, on purpose. The
    published range says a B1 speaker is 200 to 330 hours from B2, and a
    learner who reached B1 in the fewer hours is the learner who reaches B2 in
    the fewer, so the near end is the honest figure for somebody who has
    decided to do this. Nothing more to find is "comfortable". Inside what the
    week already holds, a class and some reading plus whatever the learner's
    life supplies, is "tight", which the screen prints as "it fits". Inside
    what a committed person adds on top (`COMMIT_HOURS_PER_WEEK`) is
    "possible", printed as "it fits if you commit", with the number. Past that
    the date or the pace has to move, and saying so is the useful thing.

    Drawn against the projection's own `found`, so the headline and the note
    under it are one claim: `other.low` at or under `found.high` is exactly the
    condition for `weeksWithFound.low` to land inside the deadline.
  */
  const verdict: Verdict = other.high === 0
    ? "comfortable"
    : other.low <= found.high ? "tight"
      : other.low <= COMMIT_HOURS_PER_WEEK ? "possible" : "short";

  return { ...common, weeksOnAppAlone, appHoursAvailable, otherHoursPerWeek: other, verdict };
}

/**
 * What a deadline would have to move to, to become comfortable.
 *
 * Offered instead of a flat refusal: "not by June" is only half an answer, and
 * the other half is "September, at this pace".
 */
export function weeksNeeded(hours: HourRange, appHoursPerWeek: number, otherHoursPerWeek: number): HourRange {
  const perWeek = appHoursPerWeek + Math.max(0, otherHoursPerWeek);
  if (perWeek <= 0) return { low: 0, high: 0 };
  return { low: Math.ceil(hours.low / perWeek), high: Math.ceil(hours.high / perWeek) };
}

/**
 * The distance, in one sentence, for a screen that has room for one.
 *
 * Today's countdown card says how likely a pass is this morning and the exam
 * hub says how many weeks are left, and neither used to say whether the pace
 * this learner keeps gets them there by then. That is the plan's question,
 * and it is answered here off the projection rather than rephrased on each
 * screen, so the headline on the level check page and the line on Today are
 * one claim: same standing, same week, same pace, same figure.
 *
 * The pace is named for what it is. "The pace you have kept" is a record and
 * "the pace you said" is a promise, and a learner reading the second knows
 * what would change the number.
 */
export function distanceLine(plan: Projection): string {
  const weeks = (r: HourRange) => (r.low === r.high ? `${r.low}` : `${r.low} to ${r.high}`);
  if (plan.verdict === "arrived") {
    return `The level the app holds is already ${plan.to}, so what is left is the paper itself.`;
  }
  const pace = plan.paceSource === "measured"
    ? "the pace you have kept"
    : plan.paceSource === "lapsed"
      ? "the pace you said, since nothing has been reviewed here lately"
      : "the pace you said";
  const opening = `At ${pace}, plus what your week already holds, ${plan.to} is about ${weeks(plan.weeksWithFound)} weeks away.`;
  switch (plan.verdict) {
    case "open": return `${opening} No date is set, so that is the whole answer.`;
    case "passed": return `${opening} The date you gave has gone.`;
    case "comfortable": return `${opening} Your date is ${plan.weeksAvailable} weeks off, and this app alone covers it.`;
    case "tight": return `${opening} Your date is ${plan.weeksAvailable} weeks off. It fits, with the Estonian a normal week already holds beside the app.`;
    case "possible": return `${opening} Your date is ${plan.weeksAvailable} weeks off. It fits if you commit to it: about ${hoursAWeek(plan)} a week of Estonian beyond this app.`;
    default: return `${opening} Your date is ${plan.weeksAvailable} weeks off, so something has to move: the pace, the date, or the hours outside this app.`;
  }
}

/** The hours a week beyond the app a plan asks for, at the near end, as words. */
function hoursAWeek(plan: Projection): string {
  const need = plan.otherHoursPerWeek?.low ?? 0;
  const rounded = need >= 1 ? Math.round(need * 2) / 2 : Math.round(need * 10) / 10;
  return rounded === 1 ? "an hour" : `${rounded} hours`;
}

/**
 * New words a day a daily goal can actually sustain.
 *
 * A rule of thumb, and named as one. A card learned today is not one review, it
 * is roughly ten over its first year at a 90 percent retention target, which is
 * what this app's scheduler aims at. So a goal of fifteen cards a day settles
 * at something like one or two new cards a day once the reviews arrive, not
 * fifteen. Learners who do not know this set a goal of twenty, meet a wall of
 * two hundred due cards in week six, and stop.
 *
 * The app replaces this estimate with the learner's own numbers as soon as
 * there is a log to read.
 */
export const REVIEWS_PER_CARD_FIRST_YEAR = 10;

export function sustainableNewCardsPerDay(dailyGoal: number): number {
  return Math.max(1, Math.round(dailyGoal / REVIEWS_PER_CARD_FIRST_YEAR));
}

/**
 * Weeks to work through a number of cards, at a sustainable rate.
 *
 * Takes cards, not words, and that is the correction rather than a refactor.
 * It used to take words and multiply by two, which is the count for a unit that
 * drills nothing at all: a recognition card and a production card. Every A1
 * unit but the first also drills seven cases and up to two recorded sentences,
 * so the real figure there is near nine cards a word and near seven across the
 * course. A caller that has words and wants an answer should count the cards
 * those words build (`previewUnits` does), because the multiplier is a property
 * of the unit rather than a constant.
 */
export function weeksToLearn(cards: number, dailyGoal: number, daysPerWeek: number): number {
  const cardsPerWeek = sustainableNewCardsPerDay(dailyGoal) * Math.min(7, Math.max(1, daysPerWeek));
  return cardsPerWeek === 0 ? 0 : Math.ceil(Math.max(0, cards) / cardsPerWeek);
}

/**
 * Vocabulary sizes associated with each CEFR level.
 *
 * From research relating vocabulary size to CEFR level in English, principally
 * Milton's work on word families. Nothing equivalent has been published for
 * Estonian, and Estonian's derivation and compounding make "a word" a harder
 * thing to count in the first place. So this is a shape, not a target, and the
 * copy that shows it says so.
 */
export const VOCABULARY: Record<Band, HourRange> = {
  A1: { low: 500, high: 1500 },
  A2: { low: 1500, high: 2500 },
  B1: { low: 2500, high: 3250 },
  B2: { low: 3250, high: 3750 },
  C1: { low: 3750, high: 4500 },
};

export interface Fact {
  id: string;
  /** A lucide icon name. Turned into a component by components/icons.tsx. */
  icon: string;
  claim: string;
  /** Where the claim comes from, so it can be checked rather than believed. */
  source: string;
}

/**
 * The facts worth putting in front of somebody before they start, rather than
 * in a help page they will never open.
 *
 * Each one is either published research or a property of this app that a
 * learner would otherwise discover the hard way.
 */
export const FACTS: readonly Fact[] = [
  {
    id: "hours",
    icon: "Hourglass",
    claim:
      "Estonian is one of the harder languages for an English speaker. The US Foreign Service Institute " +
      "budgets around 1 100 classroom hours to reach professional working proficiency in it, against " +
      "about 600 for French or Spanish. Fifteen minutes a day is about 90 hours a year.",
    source: "Foreign Service Institute language difficulty categories",
  },
  {
    id: "shape",
    icon: "Mountain",
    claim:
      "The hard part is in the middle. Getting from A2 to B1 costs more than any other step, because that " +
      "is where the cases, the gradation and the object have to start working on their own. From B1 to B2 " +
      "the grammar is mostly in place and the step is nearer what it costs in any language.",
    source: "Published CEFR guided learning hours, with the Estonian surcharge placed where the morphology is",
  },
  {
    id: "spacing",
    icon: "Repeat",
    claim:
      "Reviewing a word at spreading intervals beats rereading it, and beats cramming, by a wide margin " +
      "in every study that has measured it. That is the one thing this app is genuinely built to do well.",
    source: "Cepeda and others, distributed practice meta-analysis, 2006",
  },
  {
    id: "retrieval",
    icon: "BrainCircuit",
    claim:
      "Being asked to recall a word does more for remembering it than seeing it again does. Typing the " +
      "answer is worth more than flipping the card, which is why typed answers are the default here.",
    source: "Roediger and Karpicke, testing effect, 2006",
  },
  {
    id: "load",
    icon: "TrendingUp",
    claim:
      "A card you learn today costs roughly ten reviews over its first year. A daily goal of fifteen cards " +
      "is therefore one or two genuinely new words a day once the reviews arrive, not fifteen.",
    source: "A rule of thumb from spaced-repetition practice, replaced by your own log once you have one",
  },
  {
    id: "cases",
    icon: "Languages",
    claim:
      "Estonian has fourteen cases, but eleven of them are one regular ending on the genitive stem. Learn " +
      "a word's genitive and most of its forms follow. The unpredictable part is three forms, not fourteen.",
    source: "The Estonian case system, as this app models it in lib/estonian",
  },
  {
    id: "exam",
    icon: "Stamp",
    claim:
      "The state language exams run at A2, B1, B2 and C1. Naturalization asks for B1. If you are working " +
      "toward an official level, check the current requirement with the authority that sets it, because " +
      "this app is not the source of truth for that.",
    source: "Estonian state language proficiency exams (tasemeeksam)",
  },
];
