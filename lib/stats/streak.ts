/**
 * The streak: consecutive days with a review behind them, and the shields that
 * bridge a missed one.
 *
 * It lived in `lib/achievements/badges.ts` and outlived it. The badges and the
 * XP levels they were weighed in were withdrawn while the app's own content is
 * being got right; the streak was never part of that. It is the one figure on
 * Today that answers "did I turn up", it is what the week strip is drawn from,
 * and a shield is a row somebody has already banked.
 *
 * Pure, framework-free, and it takes its clock rather than reading one: a
 * streak that breaks at the wrong midnight is worse than no streak at all.
 * Anything running on a server passes the learner's own, because the default
 * reads whichever zone the process happens to sit in. See lib/time/day.ts.
 */

import { dayClock, type DayClock, type DayKey } from "@/lib/time/day";

/**
 * Consecutive-day streak from review timestamps, counting from today or yesterday.
 *
 * Days are the learner's own calendar days, not UTC ones and not the
 * deployment's: a streak that breaks at the wrong midnight is worse than no
 * streak at all. That is what `clock` carries, and it has to be passed by
 * anything running on a server, because the default reads whichever zone the
 * process happens to sit in. See lib/time/day.ts.
 */
export function computeStreak(
  dates: Date[],
  now: Date = new Date(),
  clock: DayClock = dayClock(),
): number {
  if (dates.length === 0) return 0;
  const days = new Set(dates.map((d) => clock.dayKey(d)));
  let streak = 0;
  let cursor = now;
  // Today not yet reviewed does not break a streak that is alive from yesterday.
  if (!days.has(clock.dayKey(cursor))) cursor = clock.shiftDay(cursor, 1);
  while (days.has(clock.dayKey(cursor))) {
    streak++;
    cursor = clock.shiftDay(cursor, 1);
  }
  return streak;
}

export interface StreakShieldResult {
  streak: number;
  /** Gap days bridged by a shield on *this* call — the caller persists these. */
  newlyShieldedDates: string[];
  /** Shields left after this call's newly-shielded days are spent. */
  shieldsRemaining: number;
}

/**
 * Like computeStreak, but a missed day is bridged by a streak shield instead
 * of breaking the streak — Duolingo's "streak freeze". Each shield covers
 * exactly one missed day; with several in stock, several missed days —
 * even consecutive ones — can each be bridged, until shields run out.
 *
 * `previouslyShieldedDates` are days a shield has already covered on an
 * earlier call; they count toward the streak like a real review and never
 * spend another shield. The walk back through history stops at the earliest
 * date `reviewDates` or `previouslyShieldedDates` actually knows about —
 * without that bound, an idle account with shields banked would have them
 * silently bridge years of pre-history that was never really a streak.
 */
export function computeStreakWithShields(
  reviewDates: readonly (Date | DayKey)[],
  shieldsAvailable: number,
  previouslyShieldedDates: string[] = [],
  now: Date = new Date(),
  clock: DayClock = dayClock(),
): StreakShieldResult {
  const reviewed = new Set(reviewDates.map((d) => (typeof d === "string" ? d : clock.dayKey(d))));
  const shielded = new Set(previouslyShieldedDates);
  const newlyShieldedDates: string[] = [];
  let shieldsLeft = shieldsAvailable;
  let streak = 0;

  // Lexicographic comparison works directly on YYYY-MM-DD strings.
  const known = [...reviewed, ...shielded];
  const earliestKnownDay = known.length > 0 ? known.reduce((a, b) => (a < b ? a : b)) : null;

  let cursor = now;
  const today = clock.dayKey(cursor);
  // Today not yet reviewed does not break a streak that is alive from yesterday.
  if (!reviewed.has(today) && !shielded.has(today)) cursor = clock.shiftDay(cursor, 1);

  for (;;) {
    const day = clock.dayKey(cursor);
    if (earliestKnownDay === null || day < earliestKnownDay) break;
    if (reviewed.has(day) || shielded.has(day)) {
      streak++;
    } else if (shieldsLeft > 0) {
      shieldsLeft--;
      newlyShieldedDates.push(day);
      streak++;
    } else {
      break;
    }
    cursor = clock.shiftDay(cursor, 1);
  }

  return { streak, newlyShieldedDates, shieldsRemaining: shieldsLeft };
}
