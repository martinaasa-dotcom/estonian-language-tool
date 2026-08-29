import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bucketForOwner,
  bucketForRequest,
  checkRateLimit,
  clientIp,
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

  it("falls back to the address when there is nobody behind the request", () => {
    expect(bucketForRequest(req({ "x-forwarded-for": "203.0.113.7" }), null)).toBe("i:203.0.113.7");
  });

  it("cannot collide an owner bucket with an address bucket", () => {
    expect(bucketForOwner("203.0.113.7")).not.toBe(bucketForRequest(req({ "x-real-ip": "203.0.113.7" })));
  });

  it("prefers the platform's own forwarding header over one a client can write", () => {
    expect(
      clientIp(req({ "x-vercel-forwarded-for": "198.51.100.4", "x-forwarded-for": "1.1.1.1" })),
    ).toBe("198.51.100.4");
  });

  it("takes the first hop when a chain is forwarded", () => {
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.7, 70.41.3.18" }))).toBe("203.0.113.7");
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
