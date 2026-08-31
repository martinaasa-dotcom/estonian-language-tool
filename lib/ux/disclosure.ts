/**
 * How much of this app a learner is shown, and when.
 *
 * The feedback that produced this module was that the app is overwhelming for
 * somebody just getting started, and the cause was not any one screen. It was
 * that every screen showed everything the app can do to everybody, from the
 * first minute. Today led with three figures, a ring, an XP meter, a week
 * strip, three quests, a task list, a unit card, six practice tiles, a word of
 * the day and a tutor pitch, and eleven of those twelve are meaningless to
 * somebody who has never graded a card: a streak of nought, a goal ring at
 * nought percent, a "word to revisit" from a deck they have not read yet.
 *
 * So the rule is one table rather than a ternary per panel, and it lives here
 * rather than in the pages, because the fault it fixes is precisely that each
 * screen decided on its own and every one of them decided "show it".
 *
 * Two thresholds, and both are the learner's own history rather than a clock:
 *
 *   - `arriving` until they have graded a single card. There is exactly one
 *     useful thing on the screen at that point and it is the way in. A figure
 *     computed from an empty log is not information, it is furniture.
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
  /** Streak, week strip, banked shields. */
  "streak",
  /** XP, level and the bar towards the next one. */
  "level",
  /** The three daily quests. */
  "quests",
  /** Homework and class tasks. */
  "tasks",
  /** The practice and game modes. */
  "practice",
  /** A word from the weakest cards. */
  "word",
  /** Anu, and the pitch for her when she is not set up. */
  "tutor",
] as const;

export type Panel = (typeof PANELS)[number];

const SHOWN: Record<Stage, readonly Panel[]> = {
  /*
    One way in and one thing to learn. A learner at this stage has either no
    deck or no history, and every other panel here would be reporting on a log
    with nothing in it.
  */
  arriving: ["review", "next"],
  /*
    The daily loop, the reason to come back tomorrow, and somewhere to go when
    stuck. Not the charts: a level bar at 40 XP and a word of the day drawn
    from four cards are noise that has to be scrolled past.
  */
  starting: ["review", "next", "streak", "quests", "tutor"],
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
 * rather than a thing to press. Three is a choice, and four is still a choice
 * on a screen that has a dozen other things on it. The rounds a stage does not
 * show are on /practice, one row of the rail away, which is where somebody
 * looking for a game is already going.
 */
export function practiceTiles(stage: Stage): number {
  return stage === "settled" ? 4 : 3;
}
