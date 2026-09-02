/**
 * Daily quests — Duolingo's best-copied idea, with the manipulative half left out.
 *
 * Three small goals, chosen deterministically from the date so they are the same
 * all day for the same learner and different tomorrow. Every one of them is
 * measurable from data the app already keeps (the review log, card rows, tasks),
 * which means:
 *
 * - nothing needs to be stored to track progress, so a quest cannot get stuck
 *   half-complete after a refresh;
 * - a quest can never ask for something the app cannot see, so it can never be
 *   quietly impossible;
 * - the rotation is a pure function, and therefore testable.
 *
 * Deliberately absent: anything that punishes a miss. Quests add, they never
 * take away — the streak shield already covers the "don't lose it all" anxiety,
 * and a study app that makes you feel bad is a study app you stop opening.
 */

export interface QuestStats {
  /** Reviews recorded today. */
  reviewsToday: number;
  /** Reviews today whose card had never been seen before. */
  newCardsToday: number;
  /** Reviews today the marker graded Good or Easy, or the learner said they knew. */
  recalledToday: number;
  /** Cards added to the deck today. */
  cardsAddedToday: number;
  /** Tasks ticked off today. */
  tasksDoneToday: number;
  /** Cards still due right now. */
  dueRemaining: number;
  /** The learner's own daily review goal. */
  dailyGoal: number;
}

export interface Quest {
  key: string;
  title: string;
  /** What counts, in one line. */
  detail: string;
  /** Lucide icon name, mapped to a component in the UI. */
  icon: string;
  target: number;
  progress: number;
  done: boolean;
  /** Bonus XP shown next to the quest. Motivational, not spendable. */
  reward: number;
}

interface QuestSpec {
  key: string;
  title: (target: number) => string;
  detail: string;
  icon: string;
  target: (s: QuestStats) => number;
  progress: (s: QuestStats) => number;
  reward: number;
  /** Skipped when the data can't support it — e.g. no cards are due at all. */
  applies?: (s: QuestStats) => boolean;
}

const SPECS: readonly QuestSpec[] = [
  {
    key: "reviews_goal",
    title: (t) => `Review ${t} cards`,
    detail: "Any mode counts, review, sprint, listening or match",
    icon: "GraduationCap",
    target: (s) => Math.max(5, s.dailyGoal),
    progress: (s) => s.reviewsToday,
    reward: 20,
  },
  {
    key: "meet_new",
    title: (t) => `Meet ${t} new words`,
    detail: "Cards you have never been shown before",
    icon: "Sparkles",
    target: () => 5,
    progress: (s) => s.newCardsToday,
    reward: 20,
  },
  {
    key: "clear_due",
    title: () => "Clear everything due",
    detail: "Finish the day with nothing waiting",
    icon: "CheckCheck",
    target: () => 1,
    progress: (s) => (s.dueRemaining === 0 && s.reviewsToday > 0 ? 1 : 0),
    reward: 25,
    applies: (s) => s.dueRemaining > 0 || s.reviewsToday > 0,
  },
  {
    key: "sharp_recall",
    /*
      It said "right first time, with no peeking", and `Review` has no column
      for either. A flip card is self-graded and nothing records whether the
      answer was on screen first, so what this counts is what it has always
      counted: a card the learner marked as recalled. Promising a stricter bar
      than the log can hold is how a quest teaches somebody to ignore one.
    */
    title: (t) => `Recall ${t} cards`,
    detail: "Cards you got right, in any mode",
    icon: "Target",
    target: (s) => Math.max(8, Math.round(s.dailyGoal * 0.6)),
    progress: (s) => s.recalledToday,
    reward: 20,
  },
  {
    key: "grow_deck",
    title: (t) => `Add ${t} new cards to your deck`,
    detail: "From the dictionary, a unit on the path, or a pasted list",
    icon: "Plus",
    target: () => 4,
    progress: (s) => s.cardsAddedToday,
    reward: 15,
  },
];

/** A small stable hash of the day key, so the rotation looks arbitrary but isn't. */
function dayHash(dayKey: string): number {
  let h = 0;
  for (let i = 0; i < dayKey.length; i++) h = (h * 31 + dayKey.charCodeAt(i)) >>> 0;
  return h;
}

const QUESTS_PER_DAY = 3;

/**
 * The three quests for `dayKey`, with today's progress filled in.
 *
 * The first slot is always the review-count quest: it is the one that maps onto
 * the actual daily goal, and burying it behind a rotation would make the goal
 * ring and the quest list disagree about what the day's work is.
 */
export function questsForDay(dayKey: string, stats: QuestStats): Quest[] {
  const [anchor, ...pool] = SPECS;
  const eligible = pool.filter((q) => !q.applies || q.applies(stats));
  const offset = dayHash(dayKey) % Math.max(1, eligible.length);

  const chosen: QuestSpec[] = anchor ? [anchor] : [];
  for (let i = 0; chosen.length < QUESTS_PER_DAY && i < eligible.length; i++) {
    chosen.push(eligible[(offset + i) % eligible.length]!);
  }

  return chosen.map((spec) => {
    const target = Math.max(1, spec.target(stats));
    const progress = Math.max(0, spec.progress(stats));
    return {
      key: spec.key,
      title: spec.title(target),
      detail: spec.detail,
      icon: spec.icon,
      target,
      progress: Math.min(progress, target),
      done: progress >= target,
      reward: spec.reward,
    };
  });
}

/** Bonus XP from the quests finished today. */
export function questBonusXp(quests: Quest[]): number {
  return quests.filter((q) => q.done).reduce((sum, q) => sum + q.reward, 0);
}
