import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIMITS, checkQuota, readLimits, secondsUntilUtcMidnight, utcDay,
  type UsageSnapshot,
} from "./quota";
import {
  UNKNOWN_MODEL, estimateCostMicros, estimateTokens, formatMicros, isFreeModel,
  normaliseModel, priceFor,
} from "./pricing";

const clear: UsageSnapshot = { burstCalls: 0, dailyCalls: 0, dailyCallsAllKinds: 0, dailyMicros: 0, globalMicros: 0 };
const NOON = new Date("2026-08-29T12:00:00.000Z");

describe("checkQuota", () => {
  it("allows a call when nothing has been used", () => {
    expect(checkQuota(clear, DEFAULT_LIMITS, NOON).allowed).toBe(true);
  });

  it("allows the call that lands exactly one under each limit", () => {
    const usage: UsageSnapshot = {
      burstCalls: DEFAULT_LIMITS.burstCalls - 1,
      dailyCalls: DEFAULT_LIMITS.dailyCallsPerUser - 1,
      dailyCallsAllKinds: DEFAULT_LIMITS.dailyCallsPerUser - 1,
      dailyMicros: DEFAULT_LIMITS.dailyMicrosPerUser - 1,
      // Under the reserve threshold, not one micro under the hard cap: past
      // the threshold a user with nine calls behind them is meant to wait, and
      // that is the rule the block below covers.
      globalMicros: reserveFrom() - 1,
    };
    expect(checkQuota(usage, DEFAULT_LIMITS, NOON).allowed).toBe(true);
  });

  it("denies on the burst limit first, since it is the most recoverable", () => {
    const usage = { ...clear, burstCalls: DEFAULT_LIMITS.burstCalls, dailyCalls: 9999 };
    const decision = checkQuota(usage, DEFAULT_LIMITS, NOON);
    expect(decision.reason).toBe("BURST");
    expect(decision.retryAfterSeconds).toBe(DEFAULT_LIMITS.burstWindowSeconds);
  });

  it("denies on the per-user daily call limit", () => {
    const usage = { ...clear, dailyCalls: DEFAULT_LIMITS.dailyCallsPerUser };
    expect(checkQuota(usage, DEFAULT_LIMITS, NOON).reason).toBe("DAILY_CALLS");
  });

  it("denies on the per-user spend limit", () => {
    const usage = { ...clear, dailyMicros: DEFAULT_LIMITS.dailyMicrosPerUser };
    expect(checkQuota(usage, DEFAULT_LIMITS, NOON).reason).toBe("DAILY_SPEND");
  });

  it("denies on the global cap even when this user has spent nothing", () => {
    const usage = { ...clear, globalMicros: DEFAULT_LIMITS.dailyMicrosGlobal };
    const decision = checkQuota(usage, DEFAULT_LIMITS, NOON);
    expect(decision.reason).toBe("GLOBAL_SPEND");
    // The person who trips it did not cause it; the message must not imply they did.
    expect(decision.message).toMatch(/not about your account/i);
  });

  it("tells a daily denial to come back after midnight UTC", () => {
    const usage = { ...clear, dailyCalls: DEFAULT_LIMITS.dailyCallsPerUser };
    const decision = checkQuota(usage, DEFAULT_LIMITS, NOON);
    expect(decision.retryAfterSeconds).toBe(12 * 3600);
  });

  it("never reports a zero or negative retry delay", () => {
    const oneSecondToMidnight = new Date("2026-08-29T23:59:59.500Z");
    expect(secondsUntilUtcMidnight(oneSecondToMidnight)).toBeGreaterThan(0);
  });
});

describe("readLimits", () => {
  it("falls back to the defaults when nothing is configured", () => {
    expect(readLimits({})).toEqual(DEFAULT_LIMITS);
  });

  it("reads dollars and stores micro-dollars", () => {
    expect(readLimits({ AI_DAILY_USD_PER_USER: "0.25" }).dailyMicrosPerUser).toBe(250_000);
  });

  it("ignores a value that is not a usable number, rather than disabling the limit", () => {
    expect(readLimits({ AI_DAILY_CALLS_PER_USER: "lots" }).dailyCallsPerUser)
      .toBe(DEFAULT_LIMITS.dailyCallsPerUser);
    expect(readLimits({ AI_DAILY_USD_GLOBAL: "-5" }).dailyMicrosGlobal)
      .toBe(DEFAULT_LIMITS.dailyMicrosGlobal);
  });

  it("allows an explicit zero, which stops AI spending entirely", () => {
    expect(readLimits({ AI_DAILY_USD_GLOBAL: "0" }).dailyMicrosGlobal).toBe(0);
    const denied = checkQuota(clear, readLimits({ AI_DAILY_USD_GLOBAL: "0" }), NOON);
    expect(denied.allowed).toBe(false);
  });
});

describe("utcDay", () => {
  it("keys by UTC date, not local time", () => {
    expect(utcDay(new Date("2026-08-29T23:59:59.999Z"))).toBe("2026-08-29");
    expect(utcDay(new Date("2026-08-30T00:00:00.000Z"))).toBe("2026-08-30");
  });
});

describe("pricing", () => {
  it("strips an OpenRouter vendor prefix and a variant suffix", () => {
    expect(normaliseModel("anthropic/claude-sonnet-5")).toBe("claude-sonnet-5");
    expect(normaliseModel("openai/gpt-4o:extended")).toBe("gpt-4o");
    expect(normaliseModel("GPT-4O")).toBe("gpt-4o");
  });

  it("prices a known model from the table", () => {
    expect(priceFor("claude-sonnet-5")).toEqual({ inputPerMTok: 2, outputPerMTok: 10 });
    expect(priceFor("anthropic/claude-opus-5")).toEqual({ inputPerMTok: 5, outputPerMTok: 25 });
  });

  it("charges an unknown model at the dearest rate rather than at zero", () => {
    // A cap that fails open is not a cap.
    expect(priceFor("some-new-model-2027")).toEqual(UNKNOWN_MODEL);
    expect(estimateCostMicros("some-new-model-2027", 1_000_000, 0)).toBe(10_000_000);
  });

  it("prices an explicitly free model at zero", () => {
    expect(isFreeModel("z-ai/glm-5.2:free")).toBe(true);
    expect(estimateCostMicros("z-ai/glm-5.2:free", 1_000_000, 1_000_000)).toBe(0);
  });

  it("computes a cost that matches the published rate", () => {
    // 1M in + 1M out on sonnet-5 is $2 + $10.
    expect(estimateCostMicros("claude-sonnet-5", 1e6, 1e6)).toBe(12_000_000);
  });

  it("rounds a fractional cost up, never down to zero", () => {
    expect(estimateCostMicros("gpt-4o-mini", 1, 0)).toBe(1);
  });

  it("treats a negative token count as zero", () => {
    expect(estimateCostMicros("gpt-4o", -500, 0)).toBe(0);
  });

  it("over-counts tokens rather than under-counting them", () => {
    // Estonian agglutination tokenizes worse than English, and the safe
    // direction for a quota is to bind sooner.
    expect(estimateTokens("kolmekümne")).toBeGreaterThanOrEqual("kolmekümne".length / 4);
  });

  it("formats micro-dollars for a human", () => {
    expect(formatMicros(1_234_567)).toBe("$1.23");
    expect(formatMicros(0)).toBe("$0.00");
  });
});

/** Where the shared budget starts being held back for people who have had none. */
const reserveFrom = () =>
  DEFAULT_LIMITS.dailyMicrosGlobal * (1 - DEFAULT_LIMITS.globalReserveFraction);

/*
  The reserve exists because a single global cap is first come, first served.
  Whoever arrives early spends the day's budget and everyone after them finds
  Anu switched off, newcomers included. The people turned away are the ones who
  have used it least, which is backwards for an app strangers are still
  deciding about.
*/
describe("the reserve at the end of the shared budget", () => {
  const deepInReserve = DEFAULT_LIMITS.dailyMicrosGlobal - 1;

  it("still answers somebody who has asked nothing today", () => {
    const usage = { ...clear, globalMicros: deepInReserve };
    expect(checkQuota(usage, DEFAULT_LIMITS, NOON).allowed).toBe(true);
  });

  it("asks a heavy user to wait once the budget is into the reserve", () => {
    const usage = {
      ...clear,
      dailyCalls: DEFAULT_LIMITS.reserveCallsPerUser,
      dailyCallsAllKinds: DEFAULT_LIMITS.reserveCallsPerUser,
      globalMicros: deepInReserve,
    };
    const decision = checkQuota(usage, DEFAULT_LIMITS, NOON);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("GLOBAL_BUSY");
  });

  /*
    THE RESERVE IS ABOUT THE PERSON, SO IT COUNTS THE PERSON.

    It read `dailyCalls`, which `snapshotUsage` fills with calls *of the kind
    being asked about*. So a learner on their tenth tutor call waited, and the
    same learner's first scan, the dearest single call in the app at ten
    thousand micros reserved, went through as though they had asked nothing
    all day, with 29 grader calls behind it.
  */
  it("counts every kind of call when deciding who has already had a few", () => {
    const usage = {
      ...clear,
      // Nothing of *this* kind yet, and a full day of something else.
      dailyCalls: 0,
      dailyCallsAllKinds: DEFAULT_LIMITS.reserveCallsPerUser,
      globalMicros: deepInReserve,
    };
    const decision = checkQuota(usage, DEFAULT_LIMITS, NOON);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("GLOBAL_BUSY");
  });

  it("says it is not about this person's account", () => {
    const usage = {
      ...clear,
      dailyCalls: DEFAULT_LIMITS.reserveCallsPerUser,
      dailyCallsAllKinds: DEFAULT_LIMITS.reserveCallsPerUser,
      globalMicros: deepInReserve,
    };
    // The learner did nothing wrong and can do nothing about it, so the message
    // says what still works rather than implying they overspent.
    expect(checkQuota(usage, DEFAULT_LIMITS, NOON).message).toMatch(/review, the dictionary/);
  });

  it("does not hold anyone back while the budget is still comfortable", () => {
    const usage = { ...clear, dailyCalls: 9, dailyCallsAllKinds: 9, globalMicros: reserveFrom() - 1 };
    expect(checkQuota(usage, DEFAULT_LIMITS, NOON).allowed).toBe(true);
  });

  it("stops everybody once the budget is genuinely gone, reserve or not", () => {
    const usage = { ...clear, globalMicros: DEFAULT_LIMITS.dailyMicrosGlobal };
    const decision = checkQuota(usage, DEFAULT_LIMITS, NOON);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("GLOBAL_SPEND");
  });

  it("keeps the app free: nothing here charges anyone anything", () => {
    // The allowance is the whole mechanism. There is no plan, no tier and no
    // paid escape from any of these limits, by design.
    expect(Object.keys(DEFAULT_LIMITS)).not.toContain("plan");
  });
});
