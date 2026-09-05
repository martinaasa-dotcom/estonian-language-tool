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
 * reads exactly the same on the first morning as in the second year. It was
 * held back anyway, on the strength of not being the review button, and the
 * result was a home page with two cards on it that a learner reasonably read
 * as an app with nothing in it. Restraint that leaves a screen looking broken
 * is not restraint.
 *
 * So the test a panel has to pass is "does this say something true and useful
 * on a log with nothing in it", not "is this the way in".
 *
 * AND THE TABLE IS HALF THE ANSWER, WHICH IS WHAT `TODAY_CARDS` IS FOR. A
 * panel worth drawing is not the same claim as a panel worth one of the six
 * boxes on the screen everybody opens with two minutes to spare. See the
 * constant at the foot of this file.
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
  /** Streak, week strip, banked shields. */
  "streak",
  /** Homework, class tasks and what is due when. */
  "tasks",
  /**
   * The two-minute round aimed at whatever is going wrong most.
   *
   * Withheld until `settled` because the round is drawn from which cases the
   * learner is worst at, and on a thin log there is no such thing. A card
   * offering two minutes on weaknesses nobody has measured yet is a button
   * promising something the round behind it cannot deliver, which is the test
   * a panel has to pass here.
   */
  "quest",
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
    Four things that are all true on a log with nothing in it: the way in,
    what the course does next, a word out of the dictionary with a reason
    attached to it, and the question about yesterday. That last one is not
    about the deck at all, it is about the learner's own day, and it is
    answerable on the first morning by anybody who lives here. It was held
    back with the errand on the argument that the errand pool is thin before
    a unit is started, which is true of the errand and not of the question:
    the count of conversations is the number this app says it is measured
    by, and holding it back from the people most likely to be silent loses
    the baseline a pilot compares the end of term against. The errand a new
    deck gets is "say hello to the first person you deal with", which is a
    fair first day. Everything else here would be reporting a nought.
  */
  arriving: ["review", "next", "word", "errand"],
  /*
    The daily loop, the reason to come back tomorrow, and what is due this
    week. Not the quest: four reviews is not enough to call any case a problem.
  */
  starting: ["review", "next", "word", "streak", "tasks", "errand"],
  /** Everything. By now every figure on it is drawn from enough to mean something. */
  settled: [...PANELS],
};

export function shows(stage: Stage, panel: Panel): boolean {
  return SHOWN[stage].includes(panel);
}

/**
 * HOW MANY CARDS TODAY MAY LEAD WITH, UNDER THE ONE THAT IS NOT ONE OF SEVERAL.
 *
 * The table above answers "is this panel worth drawing at all", which is a
 * question about the learner. It cannot answer "is this the fifth most useful
 * thing on the page this morning", which is a question about the page, and
 * that is the one Today was getting wrong: every panel a stage allowed was
 * drawn, so a settled learner opened fourteen cards, ten of which were reports
 * rather than things to do today. Somebody with two minutes before the bus
 * reads the top of that and nothing else.
 *
 * So the page names its cards in priority order and takes the first five. Five
 * because the hero above them is the sixth, and six is what fits on a phone
 * screen and a half: a card that has to be hunted for is a card that is not
 * being glanced at, which is the whole job of this screen.
 *
 * Nothing is deleted by this either. A card the cap drops is on its own page,
 * in the rail and in the palette, exactly as with the table above. What it
 * decides is which five earn the one screen everybody opens every morning.
 */
export const TODAY_CARDS = 5;
