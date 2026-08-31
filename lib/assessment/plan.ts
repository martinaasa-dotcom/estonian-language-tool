import { PRE_A1, type Band, type Level } from "./types";
import { rank } from "./score";

/**
 * How long this is actually going to take.
 *
 * The point of this module is to be the least flattering screen in the app. A
 * learning app that answers "how long until I speak Estonian" with a streak
 * counter is answering a different question than the one asked, and the honest
 * answer is measured in hundreds of hours. Saying so on day one costs a few
 * sign-ups and saves the ones who stay from finding out in March.
 *
 * Every number below is somebody else's published estimate, named where it is
 * used, and given as a range because that is how they are published. None of it
 * is measured on this app's own learners, and the copy says that too. Once
 * there is a review log to read, the app can stop quoting averages and start
 * quoting the learner: `lib/stats/` already computes the real pace.
 *
 * Pure arithmetic and constants. No React, no database.
 */

export interface HourRange {
  low: number;
  high: number;
}

/**
 * Cumulative study hours to reach each level, for an English speaker learning
 * Estonian.
 *
 * Two published sources, neither of which is about Estonian and CEFR at once,
 * so they are combined and the range is left wide.
 *
 * The shape comes from the guided-learning-hours estimates published for the
 * CEFR levels, commonly quoted as roughly 90 to 100 hours to A1, 180 to 200 to
 * A2, 350 to 400 to B1, 500 to 600 to B2 and 700 to 800 to C1. Those are for a
 * European language close to English.
 *
 * The scale comes from the US Foreign Service Institute, which groups Estonian
 * with Finnish and Hungarian in its harder category and budgets about 1 100
 * classroom hours to reach professional working proficiency, against about 600
 * for French or Spanish. Estonian therefore sits near the top of every band
 * rather than the middle, which is why the numbers here are close to double the
 * quoted CEFR figures at the upper levels.
 *
 * These are hours of *study*, not hours in this app. That distinction is the
 * whole reason the projection below separates the two.
 */
export const CUMULATIVE_HOURS: Record<Band, HourRange> = {
  A1: { low: 100, high: 160 },
  A2: { low: 220, high: 330 },
  B1: { low: 450, high: 650 },
  B2: { low: 750, high: 1000 },
  C1: { low: 1100, high: 1500 },
};

/** Hours already behind a learner at a level. Nothing, below A1. */
function hoursAt(level: Level): HourRange {
  if (level === PRE_A1) return { low: 0, high: 0 };
  return CUMULATIVE_HOURS[level];
}

/** The study still to do between two levels. Zero when the target is passed. */
export function hoursBetween(from: Level, to: Band): HourRange {
  if (rank(from) >= rank(to)) return { low: 0, high: 0 };
  const start = hoursAt(from);
  const end = CUMULATIVE_HOURS[to];
  return { low: Math.max(0, end.low - start.low), high: Math.max(0, end.high - start.high) };
}

export type Verdict =
  /** Already at or past the target level. */
  | "arrived"
  /** The plan gets there with room to spare. */
  | "comfortable"
  /** It fits, but only if nothing slips. */
  | "tight"
  /** It does not fit, and pretending otherwise helps nobody. */
  | "short"
  /** No deadline was given, so there is nothing to fit into. */
  | "open";

export interface PlanInput {
  from: Level;
  to: Band;
  /** The daily goal, in review minutes. */
  minutesPerDay: number;
  /** Days a week the learner expects to actually open the app. */
  daysPerWeek: number;
  /** Weeks until the deadline. Null when there is no deadline. */
  weeksAvailable: number | null;
}

export interface Projection {
  from: Level;
  to: Band;
  /** Study hours between the two levels, from the table above. */
  hours: HourRange;
  /** Hours a week the learner's stated pace puts into this app. */
  appHoursPerWeek: number;
  /** Weeks to the target if the app were the only study. It will not be. */
  weeksOnAppAlone: HourRange;
  /** Hours the app will contribute inside the deadline. */
  appHoursAvailable: number | null;
  /** Study hours a week still to find elsewhere, to make the deadline. */
  otherHoursPerWeek: HourRange | null;
  verdict: Verdict;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The projection.
 *
 * It deliberately reports two different things. `weeksOnAppAlone` is what a
 * daily-goal ring implies if you take it at face value, and it is usually a
 * shocking number. `otherHoursPerWeek` is the real answer: how much study has
 * to happen outside this app for the deadline to survive contact with the
 * hours above. Both are ranges, because the hours they come from are.
 */
export function project(input: PlanInput): Projection {
  const hours = hoursBetween(input.from, input.to);
  const daysPerWeek = Math.min(7, Math.max(1, input.daysPerWeek));
  const appHoursPerWeek = round1((Math.max(0, input.minutesPerDay) * daysPerWeek) / 60);

  const weeksOnAppAlone: HourRange = appHoursPerWeek > 0
    ? { low: Math.ceil(hours.low / appHoursPerWeek), high: Math.ceil(hours.high / appHoursPerWeek) }
    : { low: 0, high: 0 };

  if (rank(input.from) >= rank(input.to)) {
    return {
      from: input.from, to: input.to, hours, appHoursPerWeek,
      weeksOnAppAlone: { low: 0, high: 0 },
      appHoursAvailable: input.weeksAvailable === null ? null : 0,
      otherHoursPerWeek: null,
      verdict: "arrived",
    };
  }

  if (input.weeksAvailable === null) {
    return {
      from: input.from, to: input.to, hours, appHoursPerWeek, weeksOnAppAlone,
      appHoursAvailable: null, otherHoursPerWeek: null, verdict: "open",
    };
  }

  const weeks = Math.max(1, input.weeksAvailable);
  const appHoursAvailable = round1(appHoursPerWeek * weeks);
  const other: HourRange = {
    low: round1(Math.max(0, (hours.low - appHoursAvailable) / weeks)),
    high: round1(Math.max(0, (hours.high - appHoursAvailable) / weeks)),
  };

  /*
    The bands are drawn where a person's week actually breaks. Nothing more to
    find is "comfortable". Up to five hours a week is a class and some reading,
    which is a normal life with a language in it. Past ten hours a week, on top
    of a job, is not a plan, it is a wish, and saying so now is the useful thing.
  */
  const verdict: Verdict = other.high === 0 ? "comfortable" : other.low > 10 ? "short" : "tight";

  return {
    from: input.from, to: input.to, hours, appHoursPerWeek, weeksOnAppAlone,
    appHoursAvailable, otherHoursPerWeek: other, verdict,
  };
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
      "a word's genitive and most of its paradigm follows. The unpredictable part is three forms, not fourteen.",
    source: "The Estonian case system, as this app models it in lib/estonian",
  },
  {
    id: "exam",
    icon: "Stamp",
    claim:
      "The state language exams run at A2, B1, B2 and C1. Naturalisation asks for B1. If you are working " +
      "towards an official level, check the current requirement with the authority that sets it, because " +
      "this app is not the source of truth for that.",
    source: "Estonian state language proficiency exams (tasemeeksam)",
  },
];
