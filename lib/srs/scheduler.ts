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

/** Applies a grade and returns the card's next scheduling state. */
export function grade(current: SchedulingState, rating: RatingValue, now = new Date()): SchedulingState {
  const result = scheduler.next(toFsrsCard(current), now, rating as Grade);
  return fromFsrsCard(result.card);
}

/** What each button would schedule, for the interval preview under the buttons. */
export function previewIntervals(current: SchedulingState, now = new Date()): Record<RatingValue, string> {
  const out = {} as Record<RatingValue, string>;
  for (const r of [1, 2, 3, 4] as const) {
    const next = grade(current, r, now);
    out[r] = humaniseInterval(next.due, now);
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
