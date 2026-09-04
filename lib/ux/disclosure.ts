/**
 * How much of this app a learner is shown, and when.
 *
 * The feedback that produced this module was that the app is overwhelming for
 * somebody just getting started, and the cause was not any one screen. It was
 * that every screen showed everything the app can do to everybody, from the
 * first minute. Today led with three figures, a ring, an XP meter, a week
 * strip, three quests, a task list, a unit card, six practice tiles, a word to
 * revisit and a tutor pitch, and most of those are meaningless to somebody who
 * has never graded a card: a streak of nought, a goal ring at nought percent,
 * a "word to revisit" drawn from a deck they have not read yet.
 *
 * So the rule is one table rather than a ternary per panel, and it lives here
 * rather than in the pages, because the fault it fixes is precisely that each
 * screen decided on its own and every one of them decided "show it".
 *
 * Two thresholds, and both are the learner's own history rather than a clock:
 *
 *   - `arriving` until they have graded a single card. A figure computed from
 *     an empty log is not information, it is furniture.
 *   - `starting` until roughly three days at the default goal. The daily loop
 *     and the reason to come back tomorrow are what matter; the charts,
 *     history and long-run tools have nothing to say yet.
 *   - `settled` after that, which is the app as it was.
 *
 * Nothing is *removed* by any of this. Every panel a stage withholds is still
 * reachable from the navigation, the command palette and its own page. This
 * decides what a screen leads with, which is a different question from what
 * the app contains, and it is the question the first ten minutes turn on.
 *
 * WHAT "COMPUTED FROM AN EMPTY LOG" DOES AND DOES NOT COVER, because the first
 * version of this table read it far too widely and day one paid for it.
 *
 * A streak of nought is furniture. A goal ring at nought percent is furniture.
 * A level bar at 40 XP out of 300 is furniture. Those are the panels this rule
 * was written for and they are still held back.
 *
 * The word of the day is not one of them: it comes out of the dictionary, it
 * is chosen by the date rather than by anything the learner has done, and it
 * reads exactly the same on the first morning as in the second year. Quick
 * practice is not one of them either; it is four doors, and a door is not a
 * measurement. Both were held back anyway, on the strength of not being the
 * review button, and the result was a home page with two cards on it that a
 * learner reasonably read as an app with nothing in it. Restraint that leaves
 * a screen looking broken is not restraint.
 *
 * So the test a panel has to pass is "does this say something true and useful
 * on a log with nothing in it", not "is this the way in".
 *
 * Pure: counts in, names out. No React, no Prisma, no clock.
 */

export type Stage = "arriving" | "starting" | "settled";

/** What the learner has actually done here. Both figures come off the review log. */
export interface Footing {
  /** Cards in the deck, suspended or not. */
  totalCards: number;
  /** Every review ever graded by this learner. Append-only, so it only grows. */
  reviewsAllTime: number;
}

/**
 * Three days at the default goal of fifteen.
 *
 * Not a round number chosen for looking like one: three days is the point at
 * which a streak is a streak rather than a coincidence, and the first day a
 * retention chart has two points to draw a line between.
 */
export const FOUND_FOOTING = 45;

export function stageOf({ totalCards, reviewsAllTime }: Footing): Stage {
  if (reviewsAllTime === 0 || totalCards === 0) return "arriving";
  if (reviewsAllTime < FOUND_FOOTING) return "starting";
  return "settled";
}

/**
 * The panels a stage may lead with.
 *
 * Written as what each stage shows rather than as what it hides, so reading the
 * table answers "what does a beginner see" directly instead of by subtraction.
 */
export const PANELS = [
  /** Due counts and the button into the daily loop. */
  "review",
  /** The next unit of the course. */
  "next",
  /**
   * A word from the dictionary the learner has not met, chosen by the date.
   *
   * Not a figure and not a measurement: `lib/progress/wordOfDay.ts` reads the
   * almanac and the dictionary, and neither of those knows how many cards
   * anybody has graded.
   */
  "word",
  /** The practice and game modes. */
  "practice",
  /** Streak, week strip, banked shields. */
  "streak",
  /** XP, level and the bar towards the next one. */
  "level",
  /** The three daily quests. */
  "quests",
  /** Homework, class tasks and what is due when. */
  "tasks",
  /** The words and the cases that keep going wrong. */
  "struggle",
  /**
   * The two-minute round aimed at whatever is going wrong most.
   *
   * Withheld until `settled` for the same reason `struggle` is, and it is the
   * same data one step further on: the round is drawn from which cases the
   * learner is worst at, and on a thin log there is no such thing. A card
   * offering two minutes on weaknesses nobody has measured yet is a button
   * promising something the round behind it cannot deliver, which is the test
   * a panel has to pass here.
   */
  "quest",
  /**
   * The level the learner is aiming at, how long they have, and the chance of
   * clearing it.
   *
   * Held to `settled` for the reason the figure itself gives: the confidence is
   * capped by how much evidence stands behind it, and on a thin log it is a
   * number the app has to caveat rather than one it can lead with. That is the
   * whole of what gates it now: it used to need a target as well, so a learner
   * who skipped one screen in first run had no confidence figure on the page
   * they open every morning. `examCountdown` falls back to the band the climb
   * stopped at and the card says the band is the app's rather than theirs.
   */
  "exam",
  /** Anu, and the pitch for her when she is not set up. */
  "tutor",
  /**
   * One thing to say to a real person today, and how it went. Held back
   * while arriving, because an errand is drawn from the units a learner has
   * started and on day one that is greetings alone; from `starting` on it is
   * the panel the whole app points at.
   */
  "errand",
] as const;

export type Panel = (typeof PANELS)[number];

const SHOWN: Record<Stage, readonly Panel[]> = {
  /*
    Four things that are all true on a log with nothing in it: the way in, what
    the course does next, a word out of the dictionary with a reason attached
    to it, and the doors to the practice modes. Everything else here would be
    reporting a nought.
  */
  arriving: ["review", "next", "word", "practice"],
  /*
    The daily loop, the reason to come back tomorrow, what is due this week and
    somewhere to go when stuck. Not the charts, and not the sticking points: a
    level bar at 40 XP is noise, and four reviews is not enough to call any
    word a problem.
  */
  starting: ["review", "next", "word", "practice", "streak", "quests", "tasks", "tutor", "errand"],
  /** Everything. By now every figure on it is drawn from enough to mean something. */
  settled: [...PANELS],
};

export function shows(stage: Stage, panel: Panel): boolean {
  return SHOWN[stage].includes(panel);
}

/**
 * How many practice tiles a stage puts on Today.
 *
 * Six was the whole palette laid out at once, which reads as a menu to study
 * rather than a thing to press. Four is still a choice on a screen that has a
 * dozen other things on it, and two is a choice while everything else is new.
 * The rounds a stage does not show are on /practice, one row of the rail away,
 * which is where somebody looking for a game is already going.
 *
 * Both figures are even, and that is the grid rather than a taste: Today lays
 * these out `grid-cols-2`, so an odd count leaves a hole in the corner. The
 * cut from six came in wanting three, which is the right instinct about how
 * many and the wrong number to draw two across.
 */
export function practiceTiles(stage: Stage): number {
  return stage === "settled" ? 4 : 2;
}
