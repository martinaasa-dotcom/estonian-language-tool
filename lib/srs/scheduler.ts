import { createEmptyCard, fsrs, generatorParameters, State, type Card as FsrsCard, type Grade } from "ts-fsrs";

/**
 * FSRS rather than SM-2 (ADR-003): same retention for meaningfully fewer reviews,
 * and a retention target you can actually set.
 *
 * Fuzz is on. Without it, every card added in one sitting comes back in one clump,
 * forever.
 */
const scheduler = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: true }));

export const RATINGS = [
  { value: 1, key: "1", label: "Again", hint: "No idea", tone: "again" },
  { value: 2, key: "2", label: "Hard", hint: "Struggled", tone: "hard" },
  { value: 3, key: "3", label: "Good", hint: "Got it", tone: "good" },
  { value: 4, key: "4", label: "Easy", hint: "Instant", tone: "easy" },
] as const;

export type RatingValue = 1 | 2 | 3 | 4;

/**
 * The two answers a person actually has about their own recall, and the one
 * table every screen that has to ask reads.
 *
 * `RATINGS` is unchanged and still the scheduler's own vocabulary: `submit`
 * takes any of the four, `checkAnswer` still returns 2 for a near miss, and
 * `Review` carries exactly what it always did. What changed is who gets asked.
 * Four buttons sat under every card in the app, and on most of them they were
 * putting a question the app had already answered for itself: a typed answer is
 * compared against a form the dictionary vouches for, and a multiple choice is
 * right or it is not. Where nothing can be compared, the honest choice is two
 * options rather than four, because the difference between Hard and Good is the
 * difference between a six and a ten minute interval, which is a question about
 * a scheduler nobody can see, put to somebody who is trying to learn Estonian.
 *
 * Two screens reach this: a flip card in review, and speaking, where ADR-018
 * says the learner is the only judge there is. One table rather than a copy
 * each, so the two cannot drift into asking differently worded questions about
 * the same thing.
 *
 * Keyed 1 and 2 in the order they are drawn, so the digit and the button agree.
 */
export const SELF_GRADES = [
  { rating: 1 as RatingValue, key: "1", label: "Not yet" },
  { rating: 3 as RatingValue, key: "2", label: "Got it" },
] as const;

/** The FSRS scheduling fields we persist on a Card row. */
export interface SchedulingState {
  due: Date;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview: Date | null;
  /**
   * FSRS's position within the learning steps. Must be round-tripped: dropping it
   * pins a card in Learning forever, so it never graduates to Review.
   */
  learningSteps: number;
}

function toFsrsCard(s: SchedulingState): FsrsCard {
  return {
    due: s.due,
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsedDays,
    scheduled_days: s.scheduledDays,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state as State,
    last_review: s.lastReview ?? undefined,
    learning_steps: s.learningSteps,
  } as FsrsCard;
}

function fromFsrsCard(c: FsrsCard): SchedulingState {
  return {
    due: c.due,
    stability: c.stability,
    difficulty: c.difficulty,
    elapsedDays: c.elapsed_days,
    scheduledDays: c.scheduled_days,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as number,
    lastReview: c.last_review ?? null,
    learningSteps: (c as FsrsCard & { learning_steps?: number }).learning_steps ?? 0,
  };
}

export function emptyScheduling(now = new Date()): SchedulingState {
  return fromFsrsCard(createEmptyCard(now));
}

/**
 * Whether a card is still being learned rather than merely rehearsed.
 *
 * FSRS keeps four states, and the interesting line runs between Review and the
 * other three. New and Learning are a memory not yet formed; Relearning is one
 * that has just broken. Review is the only state that means the recall has
 * held, so it is the only state where scaffolding costs something: propping up
 * a card in Review measures the prop.
 *
 * The state number is FSRS's own, and reading it as a bare integer at a call
 * site is how a scheduler change becomes a silent behaviour change somewhere
 * that never mentioned the scheduler.
 */
export function isStillLearning(state: number): boolean {
  return state === State.New || state === State.Learning || state === State.Relearning;
}

/**
 * A review can never have happened before the one before it.
 *
 * FSRS computes `delta_t` as the days between a card's `lastReview` and the
 * moment being graded, and rejects a negative one outright: `FSRSValidationError:
 * Invalid delta_t "-1"`. That throw comes out of a Server Action as a 500, and
 * the review screens catch it so the round keeps going, which means the learner
 * sees nothing at all and their grade is quietly dropped.
 *
 * A card whose `lastReview` is in the future is not hypothetical. A clock that
 * was wrong when a grade was taken offline, a backup restored from a machine in
 * another timezone, or a fixture that generates history around "now" all produce
 * one, and once a card has one **every future attempt to grade it fails**, for
 * good, silently. The demo fixture had eight such cards, which is how this
 * surfaced.
 *
 * Clamping the moment up to `lastReview` makes the elapsed time zero, which is
 * exactly what the scheduler already does for two reviews in the same instant.
 * Refusing the grade instead would punish the learner for a clock.
 */
function notBefore(now: Date, lastReview: Date | null): Date {
  return lastReview && lastReview > now ? lastReview : now;
}

/** Applies a grade and returns the card's next scheduling state. */
export function grade(current: SchedulingState, rating: RatingValue, now = new Date()): SchedulingState {
  const at = notBefore(now, current.lastReview);
  const result = scheduler.next(toFsrsCard(current), at, rating as Grade);
  return fromFsrsCard(result.card);
}

/** What each button would schedule, for the interval preview under the buttons. */
export function previewIntervals(current: SchedulingState, now = new Date()): Record<RatingValue, string> {
  const out = {} as Record<RatingValue, string>;
  for (const r of [1, 2, 3, 4] as const) {
    const next = grade(current, r, now);
    out[r] = humaniseInterval(next.due, notBefore(now, current.lastReview));
  }
  return out;
}

export function humaniseInterval(due: Date, from = new Date()): string {
  const mins = Math.round((due.getTime() - from.getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

export const STATE_LABELS: Record<number, string> = {
  0: "New",
  1: "Learning",
  2: "Review",
  3: "Relearning",
};
