/**
 * Turning the review log into the pictures a learner (or a teacher) can act on.
 *
 * Everything here is a pure function over plain timestamps and ratings, with no
 * Prisma types in sight — the page hands it rows, it hands back buckets. That
 * keeps the interesting logic (day boundaries, empty ranges, off-by-one at the
 * edges of a heatmap) unit-testable without a database.
 *
 * All bucketing uses the learner's local calendar day, via lib/time/day.ts.
 */

import { dayKey, daysBetween, recentDayKeys, shiftDay } from "@/lib/time/day";

export interface ReviewPoint {
  reviewedAt: Date;
  rating: number;
}

export interface DayBucket {
  /** `YYYY-MM-DD`. */
  day: string;
  count: number;
  /** 0 (nothing) to 4 (a heavy day), for the heatmap's colour ramp. */
  level: 0 | 1 | 2 | 3 | 4;
}

/**
 * A GitHub-style contribution grid over the last `days` days.
 *
 * The intensity scale is relative to the learner's own busiest day rather than
 * a fixed number: 20 reviews is a big day for someone with a small deck and a
 * quiet one for someone with 500 cards, and a fixed scale would tell one of
 * them a lie.
 */
export function buildHeatmap(dates: Date[], days = 182, from: Date = new Date()): DayBucket[] {
  const counts = new Map<string, number>();
  for (const d of dates) {
    const key = dayKey(d);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const keys = recentDayKeys(days, from);
  const busiest = Math.max(0, ...keys.map((k) => counts.get(k) ?? 0));

  return keys.map((day) => {
    const count = counts.get(day) ?? 0;
    return { day, count, level: intensity(count, busiest) };
  });
}

function intensity(count: number, busiest: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) return 0;
  if (busiest <= 1) return 4;
  const ratio = count / busiest;
  if (ratio > 0.75) return 4;
  if (ratio > 0.5) return 3;
  if (ratio > 0.25) return 2;
  return 1;
}

export interface ForecastDay {
  day: string;
  /** Cards falling due on that day. */
  count: number;
  /** Days from today: 0 is today, 1 tomorrow. */
  offset: number;
}

/**
 * What the next `days` days of reviewing actually look like.
 *
 * Anything already overdue is folded into today rather than shown in the past,
 * because that is where the work sits: a card due last Tuesday is due now.
 */
export function buildForecast(dueDates: Date[], days = 14, from: Date = new Date()): ForecastDay[] {
  const buckets = new Map<number, number>();
  for (const due of dueDates) {
    const offset = Math.max(0, daysBetween(from, due));
    if (offset >= days) continue;
    buckets.set(offset, (buckets.get(offset) ?? 0) + 1);
  }

  return Array.from({ length: days }, (_, offset) => ({
    offset,
    day: dayKey(shiftDay(from, -offset)),
    count: buckets.get(offset) ?? 0,
  }));
}

export interface RatingBreakdown {
  again: number;
  hard: number;
  good: number;
  easy: number;
  total: number;
  /** Share rated Good or Easy, 0–100. `null` when there is nothing to average. */
  accuracy: number | null;
}

export function ratingBreakdown(reviews: { rating: number }[]): RatingBreakdown {
  const b = { again: 0, hard: 0, good: 0, easy: 0, total: 0, accuracy: null as number | null };
  for (const r of reviews) {
    if (r.rating === 1) b.again++;
    else if (r.rating === 2) b.hard++;
    else if (r.rating === 3) b.good++;
    else if (r.rating === 4) b.easy++;
    else continue;
    b.total++;
  }
  if (b.total > 0) b.accuracy = Math.round(((b.good + b.easy) / b.total) * 100);
  return b;
}

export interface DailyLoad {
  day: string;
  reviews: number;
  /** Percent recalled that day, or `null` on a day with no reviews. */
  accuracy: number | null;
}

/** Reviews and accuracy per day, oldest first — the "how am I trending" chart. */
export function dailyLoad(reviews: ReviewPoint[], days = 30, from: Date = new Date()): DailyLoad[] {
  const tally = new Map<string, { total: number; ok: number }>();
  for (const r of reviews) {
    const key = dayKey(r.reviewedAt);
    const entry = tally.get(key) ?? { total: 0, ok: 0 };
    entry.total++;
    if (r.rating >= 3) entry.ok++;
    tally.set(key, entry);
  }

  return recentDayKeys(days, from).map((day) => {
    const entry = tally.get(day);
    return {
      day,
      reviews: entry?.total ?? 0,
      accuracy: entry && entry.total > 0 ? Math.round((entry.ok / entry.total) * 100) : null,
    };
  });
}

export interface CaseAccuracy {
  grammCase: string;
  total: number;
  accuracy: number;
}

/**
 * Accuracy per grammatical case.
 *
 * `minReviews` guards against the cruellest kind of false signal: one missed
 * comitative card reading as "0% — comitative is your weakness".
 */
export function caseAccuracy(
  reviews: { targetCase: string | null; rating: number }[],
  minReviews = 3,
): CaseAccuracy[] {
  const tally = new Map<string, { ok: number; total: number }>();
  for (const r of reviews) {
    if (!r.targetCase) continue;
    const entry = tally.get(r.targetCase) ?? { ok: 0, total: 0 };
    entry.total++;
    if (r.rating >= 3) entry.ok++;
    tally.set(r.targetCase, entry);
  }

  return [...tally.entries()]
    .filter(([, v]) => v.total >= minReviews)
    .map(([grammCase, v]) => ({
      grammCase,
      total: v.total,
      accuracy: Math.round((v.ok / v.total) * 100),
    }))
    .sort((a, b) => a.accuracy - b.accuracy || b.total - a.total);
}

/** The busiest hour of the day, for the "you study best at…" line. Null when thin. */
export function bestStudyHour(reviews: ReviewPoint[], minReviews = 20): number | null {
  if (reviews.length < minReviews) return null;
  const hours = new Array<number>(24).fill(0);
  for (const r of reviews) hours[r.reviewedAt.getHours()]!++;
  let best = 0;
  for (let h = 1; h < 24; h++) if (hours[h]! > hours[best]!) best = h;
  return hours[best]! > 0 ? best : null;
}
