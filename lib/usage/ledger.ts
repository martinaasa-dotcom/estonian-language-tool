import { prisma } from "@/lib/db";
import { reportError } from "@/lib/observability/report";
import { estimateCostMicros } from "./pricing";
import {
  type QuotaDecision, type UsageSnapshot, checkQuota, readLimits, utcDay,
} from "./quota";

export type UsageKind = "TUTOR" | "GRADER" | "TTS";

/**
 * The metered side of the app: what has been spent, and whether the next call
 * may go ahead.
 *
 * The counters live in Postgres rather than in memory because the app runs on
 * serverless functions — an in-process counter is per-instance, resets on every
 * cold start, and so caps nothing. Three indexed aggregates per call is a price
 * worth paying for a limit that is actually a limit.
 */

/**
 * What each kind of call is allowed, as a multiple of the configured base.
 *
 * One number for all three was wrong in both directions at once. The base is
 * the tutor's allowance, ten conversations a day, and applying it unchanged to
 * the other two would have made the app worse at the things that cost almost
 * nothing:
 *
 *   TUTOR   the expensive one, and the one worth rationing. A full answer over
 *           a long conversation, at the base allowance.
 *   GRADER  a few hundred tokens about one sentence. The verdict a learner
 *           acts on is decided by string comparison against the dictionary
 *           before any of this runs, so what is rationed here is only the note
 *           that comes after it. Thirty of those is a real practice session.
 *   TTS     free, cached on disk and in Supabase Storage, and joined when two
 *           requests for the same clip are in flight. Only a miss reaches
 *           here at all. A listening round legitimately meets a dozen new
 *           words in a minute, so a tight cap would break a real session to
 *           solve a problem that does not exist.
 *
 * Everything stays free at every one of these numbers. They exist so that one
 * enthusiastic person cannot spend the day's budget before anyone else arrives.
 */
const ALLOWANCE: Record<UsageKind, { burst: number; daily: number }> = {
  TUTOR: { burst: 1, daily: 1 },
  GRADER: { burst: 1, daily: 3 },
  TTS: { burst: 6, daily: 30 },
};

/** What this user and the site as a whole have used, for `checkQuota`. */
export async function snapshotUsage(
  ownerId: string,
  kind: UsageKind,
  now = new Date(),
): Promise<UsageSnapshot> {
  const limits = readLimits();
  const day = utcDay(now);
  const burstSince = new Date(now.getTime() - limits.burstWindowSeconds * 1000);

  const [burstCalls, dailyCalls, userSpend, globalSpend] = await Promise.all([
    prisma.usageEvent.count({ where: { ownerId, kind, createdAt: { gte: burstSince } } }),
    prisma.usageEvent.count({ where: { ownerId, kind, day } }),
    prisma.usageEvent.aggregate({ where: { ownerId, day }, _sum: { costMicros: true } }),
    prisma.usageEvent.aggregate({ where: { day }, _sum: { costMicros: true } }),
  ]);

  return {
    burstCalls,
    dailyCalls,
    dailyMicros: userSpend._sum.costMicros ?? 0,
    globalMicros: globalSpend._sum.costMicros ?? 0,
  };
}

/**
 * Whether this call may proceed.
 *
 * Fails *closed*: if the ledger cannot be read, the call is refused. The whole
 * point of the cap is the case where something is wrong, and "the database
 * hiccuped" is not a reason to start spending without a limit.
 */
export async function authoriseCall(
  ownerId: string,
  kind: UsageKind,
  now = new Date(),
): Promise<QuotaDecision> {
  try {
    const limits = readLimits();
    const allowance = ALLOWANCE[kind];
    const scaled = {
      ...limits,
      burstCalls: limits.burstCalls * allowance.burst,
      dailyCallsPerUser: limits.dailyCallsPerUser * allowance.daily,
      // The reserve is counted in the same currency as the daily allowance, so
      // it scales with it. Otherwise three TTS misses would look like a heavy
      // user and mute a listening round on a busy day.
      reserveCallsPerUser: limits.reserveCallsPerUser * allowance.daily,
    };
    return checkQuota(await snapshotUsage(ownerId, kind, now), scaled, now);
  } catch (error) {
    reportError(error, { at: "usage/authoriseCall", ownerId, extra: { kind } });
    return {
      allowed: false,
      reason: "GLOBAL_SPEND",
      message: "Anu is unavailable for a moment. The usage ledger could not be read.",
      retryAfterSeconds: 30,
    };
  }
}

/**
 * Files a completed call.
 *
 * Never throws: the call already happened and the learner already has their
 * answer, so a failed ledger write must not turn a good response into an error.
 * It is logged loudly instead, because a silent one would mean the cap is
 * quietly measuring less than it should.
 */
export async function recordUsage(input: {
  ownerId: string;
  kind: UsageKind;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /**
   * Overrides the price table. Pass 0 for a service that genuinely costs
   * nothing — without it, TartuNLP's speaker name ("mari") looks like an
   * unknown model and gets charged at the deliberately punitive unknown rate,
   * which would exhaust the global cap on free speech synthesis.
   */
  costMicros?: number;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  try {
    await prisma.usageEvent.create({
      data: {
        ownerId: input.ownerId,
        kind: input.kind,
        provider: input.provider,
        model: input.model,
        inputTokens: Math.max(0, Math.round(input.inputTokens)),
        outputTokens: Math.max(0, Math.round(input.outputTokens)),
        costMicros: input.costMicros ??
          estimateCostMicros(input.model, input.inputTokens, input.outputTokens),
        day: utcDay(now),
      },
    });
  } catch (error) {
    // Loud on purpose: a lost row means the spend cap is measuring less than
    // was actually spent, which is the one failure mode the cap exists to stop.
    reportError(error, {
      at: "usage/recordUsage",
      ownerId: input.ownerId,
      extra: { kind: input.kind, model: input.model },
    });
  }
}

/** Today's spend and call count for one user, for the Settings meter. */
export async function usageToday(ownerId: string, now = new Date()) {
  const day = utcDay(now);
  const [calls, spend] = await Promise.all([
    prisma.usageEvent.count({ where: { ownerId, day, kind: { in: ["TUTOR", "GRADER"] } } }),
    prisma.usageEvent.aggregate({ where: { ownerId, day }, _sum: { costMicros: true } }),
  ]);
  return { calls, micros: spend._sum.costMicros ?? 0, limits: readLimits() };
}
