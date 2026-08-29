/**
 * The spend policy. Pure: it takes what has already been used and says whether
 * the next call may proceed.
 *
 * The original plan called for this in Phase 2 — "before heavy use, not after
 * the first bill" — and it was cut when the default model was free. The default
 * is a paid model again and sign-up is open, so an unmetered path is now one
 * stranger away from an unbounded invoice.
 *
 * Three limits, because they fail in different ways:
 *   - a burst limit stops a runaway client or a held-down key,
 *   - a per-user daily limit stops one enthusiastic person monopolising the key,
 *   - a global daily cost cap is the actual guarantee about the bill.
 */

export interface QuotaLimits {
  /** Calls one user may make in `burstWindowSeconds`. */
  burstCalls: number;
  burstWindowSeconds: number;
  /** Calls one user may make in a UTC day. */
  dailyCallsPerUser: number;
  /** Micro-dollars one user may spend in a UTC day. */
  dailyMicrosPerUser: number;
  /** Micro-dollars every user together may spend in a UTC day. */
  dailyMicrosGlobal: number;
}

/**
 * Defaults sized for a real learner rather than for a load test: about an hour
 * of steady tutoring a day. On gpt-4o a tutor answer runs a little under a cent,
 * so 120 calls is roughly a dollar a day per person and the global cap is the
 * backstop if a hundred people arrive at once.
 */
export const DEFAULT_LIMITS: QuotaLimits = {
  burstCalls: 8,
  burstWindowSeconds: 60,
  dailyCallsPerUser: 120,
  dailyMicrosPerUser: 1_500_000,      // $1.50
  dailyMicrosGlobal: 20_000_000,      // $20.00
};

function num(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export interface QuotaEnv {
  AI_BURST_CALLS?: string | undefined;
  AI_BURST_WINDOW_SECONDS?: string | undefined;
  AI_DAILY_CALLS_PER_USER?: string | undefined;
  AI_DAILY_USD_PER_USER?: string | undefined;
  AI_DAILY_USD_GLOBAL?: string | undefined;
  [key: string]: string | undefined;
}

/** Limits are configurable, but every one of them has a value. There is no "off". */
export function readLimits(env: QuotaEnv = process.env): QuotaLimits {
  return {
    burstCalls: num(env.AI_BURST_CALLS, DEFAULT_LIMITS.burstCalls),
    burstWindowSeconds: num(env.AI_BURST_WINDOW_SECONDS, DEFAULT_LIMITS.burstWindowSeconds),
    dailyCallsPerUser: num(env.AI_DAILY_CALLS_PER_USER, DEFAULT_LIMITS.dailyCallsPerUser),
    dailyMicrosPerUser: Math.round(
      num(env.AI_DAILY_USD_PER_USER, DEFAULT_LIMITS.dailyMicrosPerUser / 1e6) * 1e6,
    ),
    dailyMicrosGlobal: Math.round(
      num(env.AI_DAILY_USD_GLOBAL, DEFAULT_LIMITS.dailyMicrosGlobal / 1e6) * 1e6,
    ),
  };
}

export interface UsageSnapshot {
  /** Calls this user made inside the burst window. */
  burstCalls: number;
  /** Calls this user made today (UTC). */
  dailyCalls: number;
  /** Micro-dollars this user spent today (UTC). */
  dailyMicros: number;
  /** Micro-dollars everyone spent today (UTC). */
  globalMicros: number;
}

export type QuotaDenial =
  | "BURST"
  | "DAILY_CALLS"
  | "DAILY_SPEND"
  | "GLOBAL_SPEND";

export interface QuotaDecision {
  allowed: boolean;
  reason?: QuotaDenial;
  /** What to show the learner. Never mentions another user's usage. */
  message?: string;
  /** Seconds to wait, for the `Retry-After` header. */
  retryAfterSeconds?: number;
}

/**
 * Seconds until the next UTC midnight, for a `Retry-After` on a daily limit.
 * Callers pass `now` so this stays testable.
 */
export function secondsUntilUtcMidnight(now: Date): number {
  const midnight = Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0,
  );
  return Math.max(1, Math.ceil((midnight - now.getTime()) / 1000));
}

/**
 * Checked *before* a call, so the limits are boundaries the next call must stay
 * under. A user sitting exactly on `dailyCallsPerUser` has used their day.
 */
export function checkQuota(
  usage: UsageSnapshot,
  limits: QuotaLimits,
  now: Date,
): QuotaDecision {
  if (usage.burstCalls >= limits.burstCalls) {
    return {
      allowed: false,
      reason: "BURST",
      message: "That is a lot of questions at once. Give it a few seconds.",
      retryAfterSeconds: limits.burstWindowSeconds,
    };
  }

  if (usage.dailyCalls >= limits.dailyCallsPerUser) {
    return {
      allowed: false,
      reason: "DAILY_CALLS",
      message:
        "You have reached today's limit for Anu. Everything else — review, the " +
        "dictionary, your deck — keeps working, and the limit resets at midnight UTC.",
      retryAfterSeconds: secondsUntilUtcMidnight(now),
    };
  }

  if (usage.dailyMicros >= limits.dailyMicrosPerUser) {
    return {
      allowed: false,
      reason: "DAILY_SPEND",
      message:
        "You have used today's share of the tutor budget. It resets at midnight UTC.",
      retryAfterSeconds: secondsUntilUtcMidnight(now),
    };
  }

  // Checked last: it is the rarest, and the least actionable for the person who
  // happens to trip it. The message says so rather than blaming them.
  if (usage.globalMicros >= limits.dailyMicrosGlobal) {
    return {
      allowed: false,
      reason: "GLOBAL_SPEND",
      message:
        "Anu is resting — the site has reached its shared daily budget for AI. " +
        "This is not about your account. It resets at midnight UTC.",
      retryAfterSeconds: secondsUntilUtcMidnight(now),
    };
  }

  return { allowed: true };
}

/** The UTC day key a ledger row is filed under, e.g. "2026-08-29". */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}
