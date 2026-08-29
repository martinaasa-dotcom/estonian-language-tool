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
 * Speech is free and, on a miss, one short upstream request. A listening round
 * legitimately meets a dozen new words in a minute, so holding it to the tutor's
 * burst allowance would break a real session to solve a problem it does not
 * have. The generosity is bounded: only cache misses ever get here.
 */
const BURST_MULTIPLIER: Record<UsageKind, number> = { TUTOR: 1, GRADER: 1, TTS: 6 };

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
    const scaled = {
      ...limits,
      burstCalls: limits.burstCalls * BURST_MULTIPLIER[kind],
      dailyCallsPerUser: limits.dailyCallsPerUser * BURST_MULTIPLIER[kind],
    };
    return checkQuota(await snapshotUsage(ownerId, kind, now), scaled, now);
  } catch (error) {
    reportError(error, { at: "usage/authoriseCall", ownerId, extra: { kind } });
    return {
      allowed: false,
      reason: "GLOBAL_SPEND",
      message: "Anu is unavailable for a moment — the usage ledger could not be read.",
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
