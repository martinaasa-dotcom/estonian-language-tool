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
 *   - a per-user daily limit stops one enthusiastic person monopolizing the key,
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
  /**
   * The tail of the global budget held back for people who have barely used
   * Anu today. 0.25 means the last quarter is reserved.
   */
  globalReserveFraction: number;
  /** Calls a user may still make once the budget is down to that reserve. */
  reserveCallsPerUser: number;
}

/**
 * Sized for an app that is free to everybody and has to stay that way.
 *
 * The whole product works with no AI at all: review, the dictionary, every
 * drill, the writing exercise's actual verdict, offline. Anu is the one part
 * that costs money per use, so she is the one part with a small allowance. Ten
 * conversations a day is enough to understand what she is for and not enough
 * for anyone to run up a bill with. The number is the base; `lib/usage/ledger`
 * scales it per kind, because a grader note and a cache miss on speech are not
 * the same thing as a tutoring conversation.
 *
 * The per-user spend cap is a backstop rather than the control. At ten tutor
 * answers and thirty grader notes it should never be the thing that bites.
 */
export const DEFAULT_LIMITS: QuotaLimits = {
  burstCalls: 8,
  burstWindowSeconds: 60,
  dailyCallsPerUser: 10,
  dailyMicrosPerUser: 500_000,        // $0.50
  dailyMicrosGlobal: 20_000_000,      // $20.00
  globalReserveFraction: 0.25,
  reserveCallsPerUser: 3,
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
  AI_GLOBAL_RESERVE_FRACTION?: string | undefined;
  AI_RESERVE_CALLS_PER_USER?: string | undefined;
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
    // Clamped rather than trusted: a fraction above 1 would reserve more than
    // the budget and refuse the first call of the day.
    globalReserveFraction: Math.min(
      0.9,
      num(env.AI_GLOBAL_RESERVE_FRACTION, DEFAULT_LIMITS.globalReserveFraction),
    ),
    reserveCallsPerUser: num(env.AI_RESERVE_CALLS_PER_USER, DEFAULT_LIMITS.reserveCallsPerUser),
  };
}

export interface UsageSnapshot {
  /** Calls this user made inside the burst window. */
  burstCalls: number;
  /** Calls this user made today (UTC), of the kind being asked about. */
  dailyCalls: number;
  /**
   * Calls this user made today (UTC), of every kind.
   *
   * The reserve below asks "has this person already had a few answers today",
   * and `dailyCalls` answers a narrower question: a few answers *of this
   * kind*. So a learner on their tenth tutor call was held back while the
   * same learner's first scan, the dearest single call in the app, went
   * through as if they had asked nothing all day, and 29 grader calls went
   * with it. The reserve is about the person, so it counts the person.
   */
  dailyCallsAllKinds: number;
  /** Micro-dollars this user spent today (UTC). */
  dailyMicros: number;
  /** Micro-dollars everyone spent today (UTC). */
  globalMicros: number;
}

export type QuotaDenial =
  | "BURST"
  | "DAILY_CALLS"
  | "DAILY_SPEND"
  /** The shared budget is into its reserve, and this user has had their share. */
  | "GLOBAL_BUSY"
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
/*
  THE MESSAGES NAME NO ONE FEATURE, and they used to name Anu.

  That was true when the tutor and the scan were the only paths that reached a
  model. A conversation reaches one now, so a learner standing at a reception
  desk was told "you have reached today's limit for Anu", which is a screen
  naming a feature they are not using: a failure may not misname its cause, and
  the cause here is the day's shared allowance rather than any one part of the
  app. This module is pure and is handed a `kind`-free snapshot on purpose, so
  the honest sentence is the one that is true of every caller.
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
      message: "That is a lot at once. Give it a few seconds.",
      retryAfterSeconds: limits.burstWindowSeconds,
    };
  }

  if (usage.dailyCalls >= limits.dailyCallsPerUser) {
    return {
      allowed: false,
      reason: "DAILY_CALLS",
      message:
        "You have used today's share of the parts that ask a model. Everything " +
        "else (review, the dictionary, your deck) keeps working, and it resets " +
        "at midnight UTC.",
      retryAfterSeconds: secondsUntilUtcMidnight(now),
    };
  }

  if (usage.dailyMicros >= limits.dailyMicrosPerUser) {
    return {
      allowed: false,
      reason: "DAILY_SPEND",
      message:
        "You have used today's share of the budget for the parts that ask a " +
        "model. It resets at midnight UTC.",
      retryAfterSeconds: secondsUntilUtcMidnight(now),
    };
  }

  /*
    The shared budget, in two steps rather than one cliff.

    A single global cap is first come, first served: whoever arrives early
    spends it, and everybody after them finds Anu switched off, including
    somebody opening the app for the first time. The people most likely to be
    turned away are the ones who have used it least, which is exactly backwards.

    So the last slice of the budget is a reserve. Once spending reaches it,
    anyone who has already had a few answers today waits, and anyone who has
    not can still ask. It costs the heavy user their eleventh conversation and
    buys a newcomer their first, which is the right trade for a free app that
    strangers are still deciding about.
  */
  const reserveFrom = limits.dailyMicrosGlobal * (1 - limits.globalReserveFraction);
  if (
    usage.globalMicros >= reserveFrom &&
    usage.globalMicros < limits.dailyMicrosGlobal &&
    usage.dailyCallsAllKinds >= limits.reserveCallsPerUser
  ) {
    return {
      allowed: false,
      reason: "GLOBAL_BUSY",
      message:
        "The rest of today's shared budget is being kept for people who have not " +
        "asked anything yet, and it resets at midnight UTC. Everything else " +
        "(review, the dictionary, your deck) keeps working.",
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
        "This deployment has reached its shared daily budget for AI. This is not " +
        "about your account. It resets at midnight UTC.",
      retryAfterSeconds: secondsUntilUtcMidnight(now),
    };
  }

  return { allowed: true };
}

/** The UTC day key a ledger row is filed under, e.g. "2026-08-29". */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}
