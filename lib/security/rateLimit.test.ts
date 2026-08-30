import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bucketForOwner,
  bucketForRequest,
  checkRateLimit,
  clientIp,
  trustsProxyHeaders,
  rateLimited,
  resetRateLimitForTests,
} from "@/lib/security/rateLimit";

beforeEach(() => resetRateLimitForTests());

function req(headers: Record<string, string> = {}) {
  return { headers: { get: (name: string) => headers[name.toLowerCase()] ?? null } };
}

describe("the bucket", () => {
  it("allows exactly the limit and then refuses", () => {
    for (let i = 0; i < 3; i += 1) expect(checkRateLimit("k", 3, 60_000).ok).toBe(true);
    expect(checkRateLimit("k", 3, 60_000).ok).toBe(false);
  });

  it("says how long to wait, in real seconds", () => {
    vi.useFakeTimers();
    try {
      checkRateLimit("k", 1, 60_000);
      vi.advanceTimersByTime(20_000);
      const refused = checkRateLimit("k", 1, 60_000);
      expect(refused.ok).toBe(false);
      expect(refused.retryAfterSec).toBe(40);
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens again when the window has passed", () => {
    vi.useFakeTimers();
    try {
      expect(checkRateLimit("k", 1, 1_000).ok).toBe(true);
      expect(checkRateLimit("k", 1, 1_000).ok).toBe(false);
      vi.advanceTimersByTime(1_001);
      expect(checkRateLimit("k", 1, 1_000).ok).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps two callers apart", () => {
    expect(checkRateLimit("a", 1, 60_000).ok).toBe(true);
    expect(checkRateLimit("b", 1, 60_000).ok).toBe(true);
    expect(checkRateLimit("a", 1, 60_000).ok).toBe(false);
  });
});

describe("who a request is charged to", () => {
  /*
    The whole reason this is not the IP. Twenty-five students in one classroom
    are one address, and a review session asks for audio on nearly every card:
    charged per IP, the class would spend the allowance in the first few
    seconds and every one of them would be told to slow down.
  */
  it("charges a signed-in learner to themselves, not to their school's network", () => {
    const school = req({ "x-forwarded-for": "203.0.113.7" });
    expect(bucketForRequest(school, "learner-a")).not.toBe(bucketForRequest(school, "learner-b"));
    expect(bucketForRequest(school, "learner-a")).toBe(bucketForOwner("learner-a"));
  });

  /*
    The environment is passed in rather than inherited, throughout. A test that
    reads `process.env` for a decision this important is a test that reports
    the machine it ran on: green on CI, red on a laptop with the variable
    exported, and the failure reads as a bug in the limiter.
  */
  const TRUSTED = { TRUST_PROXY_HEADERS: "1" };

  it("falls back to the address when a proxy is trusted and nobody is signed in", () => {
    expect(bucketForRequest(req({ "x-forwarded-for": "203.0.113.7" }), null, TRUSTED))
      .toBe("i:203.0.113.7");
  });

  it("cannot collide an owner bucket with an address bucket", () => {
    expect(bucketForOwner("203.0.113.7"))
      .not.toBe(bucketForRequest(req({ "x-real-ip": "203.0.113.7" }), null, TRUSTED));
  });

  it("prefers the platform's own forwarding header over one a client can write", () => {
    expect(
      clientIp(
        req({ "x-vercel-forwarded-for": "198.51.100.4", "x-forwarded-for": "1.1.1.1" }),
        TRUSTED,
      ),
    ).toBe("198.51.100.4");
  });

  it("takes the first hop when a chain is forwarded", () => {
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.7, 70.41.3.18" }), TRUSTED))
      .toBe("203.0.113.7");
  });
});

describe("an address nobody vouches for", () => {
  /*
    `X-Forwarded-For` is a header, and on a deployment that is not behind a
    proxy that overwrites it, it is a value the caller chose. Reading it
    anyway does not merely fail to identify people: it lets one caller mint a
    fresh bucket per request, so the spoofer gets an unlimited number of
    allowances while an honest caller shares one. An unverified key is worse
    than none.
  */
  const UNTRUSTED = {};

  it("does not believe a forwarded-for header from nowhere in particular", () => {
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.7" }), UNTRUSTED)).toBeNull();
    expect(clientIp(req({ "x-real-ip": "203.0.113.7" }), UNTRUSTED)).toBeNull();
    // Not even the platform's own, since a client can write that one too when
    // the platform is not there to overwrite it.
    expect(clientIp(req({ "x-vercel-forwarded-for": "198.51.100.4" }), UNTRUSTED)).toBeNull();
  });

  it("puts every unattributed caller in one bucket rather than one each", () => {
    const a = bucketForRequest(req({ "x-forwarded-for": "203.0.113.7" }), null, UNTRUSTED);
    const b = bucketForRequest(req({ "x-forwarded-for": "198.51.100.4" }), null, UNTRUSTED);
    expect(a).toBe(b);
  });

  it("still charges a signed-in learner to themselves", () => {
    // The ordinary case on any deployment with sign-in, and it never depends
    // on a header at all.
    expect(bucketForRequest(req({}), "learner-a", UNTRUSTED)).toBe(bucketForOwner("learner-a"));
  });

  it("trusts the platform when the platform is the one saying so", () => {
    expect(clientIp(req({ "x-vercel-forwarded-for": "198.51.100.4" }), { VERCEL: "1" }))
      .toBe("198.51.100.4");
  });

  it("takes an operator at their word when they set the flag", () => {
    for (const flag of ["1", "true", "yes", "TRUE"]) {
      expect(trustsProxyHeaders({ TRUST_PROXY_HEADERS: flag })).toBe(true);
    }
    for (const flag of ["0", "false", "no", ""]) {
      expect(trustsProxyHeaders({ TRUST_PROXY_HEADERS: flag })).toBe(false);
    }
    expect(trustsProxyHeaders({})).toBe(false);
  });
});

describe("the refusal", () => {
  it("names a number of seconds rather than telling someone to guess", async () => {
    const response = rateLimited({ ok: false, retryAfterSec: 12 }, "Slow down.");
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("12");
    expect(await response.json()).toEqual({ error: "Slow down." });
  });
});
