import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bucketDigest,
  bucketForOwner,
  bucketForRequest,
  checkRateLimit,
  clientIp,
  trustsProxyHeaders,
  rateLimited,
  resetRateLimitForTests,
  windowStartMs,
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

  /*
    WHICH HEADER, AND WHICH HOP IN IT.

    `x-vercel-forwarded-for` is written and overwritten by one platform, so it
    is trustworthy exactly there and is a value the caller typed anywhere else.
    Reading it under `TRUST_PROXY_HEADERS` on a self-hosted deployment hands a
    caller their own bucket key, which is an unlimited number of allowances.
  */
  const ON_VERCEL = { VERCEL: "1" };

  it("prefers the platform's own forwarding header where the platform sets it", () => {
    expect(
      clientIp(
        req({ "x-vercel-forwarded-for": "198.51.100.4", "x-forwarded-for": "1.1.1.1" }),
        ON_VERCEL,
      ),
    ).toBe("198.51.100.4");
  });

  it("ignores the platform's header on a deployment that is not that platform", () => {
    expect(
      clientIp(
        req({ "x-vercel-forwarded-for": "198.51.100.4", "x-forwarded-for": "203.0.113.7" }),
        TRUSTED,
      ),
    ).toBe("203.0.113.7");
  });

  it("takes the first hop on the platform that overwrites the whole header", () => {
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.7, 70.41.3.18" }), ON_VERCEL))
      .toBe("203.0.113.7");
  });

  /*
    A self-hosted proxy *appends*, so the leftmost element is whatever the
    caller put there and the rightmost is the hop the trusted proxy added
    about the connection it actually accepted.
  */
  it("takes the nearest hop behind a proxy that appends", () => {
    expect(clientIp(req({ "x-forwarded-for": "9.9.9.9, 203.0.113.7" }), TRUSTED))
      .toBe("203.0.113.7");
  });

  it("cannot be given a bucket key by a caller who forges the whole chain", () => {
    const forged = (n: number) => clientIp(req({ "x-forwarded-for": `${n}.0.0.1, 203.0.113.7` }), TRUSTED);
    expect(new Set([forged(1), forged(2), forged(3)]).size).toBe(1);
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

/*
  A FULL MAP EVICTS SOMETHING EXPIRED, NOT SOMETHING BUSY.

  `checkRateLimit` sweeps unconditionally at the top, which stamps the sweep
  clock, and then swept again inside the "map is full" branch: that second call
  returned immediately every time, because no time had passed. So a full map
  never reclaimed an expired bucket on demand and fell through to deleting the
  oldest-inserted key, which is a live caller. Ten thousand distinct keys in a
  minute is a school network on an anonymous route, or owner ids times
  endpoints on a busy day, and the caller it evicted got a fresh allowance in
  the middle of their window.

  Driven at the real ceiling rather than at a lowered one, because the constant
  is what the branch tests against and a test that could only pass against a
  smaller map would not be testing this.
*/
describe("when the bucket map is full", () => {
  it("reclaims an expired bucket rather than evicting a live one", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-09-02T12:00:00Z"));
      // The one we care about: taken first, so it is the oldest by insertion
      // and would be the one the fallback deletes.
      expect(checkRateLimit("live", 2, 3_600_000).ok).toBe(true);

      /*
        Fill the map to exactly its ceiling with buckets that expire in a
        second, and no further: one more while they are all still live would
        trip the eviction branch here, with nothing expired to reclaim, and
        take `live` before the moment this test is about.
      */
      for (let i = 0; i < 9_999; i += 1) checkRateLimit(`filler-${i}`, 1, 1_000);

      // Past their window, and past the sweep's own one-minute throttle so the
      // top-of-function sweep is the thing that stamps the clock.
      vi.setSystemTime(new Date("2026-09-02T12:00:02Z"));
      checkRateLimit("newcomer", 1, 1_000);

      // The live bucket kept its count: one request left of two, not a fresh
      // allowance.
      expect(checkRateLimit("live", 2, 3_600_000).ok).toBe(true);
      expect(checkRateLimit("live", 2, 3_600_000).ok).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the pieces the shared counter is built out of", () => {
  it("floors a moment to its own window, so every instance agrees", () => {
    const minute = 60_000;
    const at = Date.parse("2026-09-05T12:34:56.789Z");
    expect(windowStartMs(at, minute)).toBe(Date.parse("2026-09-05T12:34:00Z"));

    // Two instances asking about two moments inside one minute get one window.
    expect(windowStartMs(at, minute)).toBe(
      windowStartMs(Date.parse("2026-09-05T12:34:01Z"), minute),
    );
    // And the next second over is the next window, not a rounding of this one.
    expect(windowStartMs(Date.parse("2026-09-05T12:35:00Z"), minute)).toBe(
      Date.parse("2026-09-05T12:35:00Z"),
    );
  });

  it("floors an hour window to the hour, because the export uses one", () => {
    expect(windowStartMs(Date.parse("2026-09-05T12:34:56Z"), 3_600_000))
      .toBe(Date.parse("2026-09-05T12:00:00Z"));
  });

  it("tells two callers apart without writing down who they are", () => {
    const mine = bucketDigest("tts:o:8f14e45f-ea8b-4d1e-9b3a-2c5d7e0a1b42");
    const yours = bucketDigest("tts:o:1c3d5e79-1234-4abc-8def-9876543210fe");

    expect(mine).not.toBe(yours);
    expect(mine).toBe(bucketDigest("tts:o:8f14e45f-ea8b-4d1e-9b3a-2c5d7e0a1b42"));
    expect(mine).toMatch(/^[0-9a-f]{64}$/);

    // The point of the digest: the id is not in the row.
    expect(mine).not.toContain("8f14e45f");
  });

  it("keeps one caller's two endpoints in two buckets", () => {
    const owner = "o:8f14e45f-ea8b-4d1e-9b3a-2c5d7e0a1b42";
    expect(bucketDigest(`tts:${owner}`)).not.toBe(bucketDigest(`export:${owner}`));
  });
});
