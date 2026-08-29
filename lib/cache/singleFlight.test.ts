import { afterEach, describe, expect, it, vi } from "vitest";
import {
  inFlightCount, isRecentMiss, rememberMiss, resetMissesForTests,
  resetSingleFlightForTests, singleFlight, singleFlightTagged,
} from "@/lib/cache/singleFlight";

afterEach(() => {
  resetSingleFlightForTests();
  resetMissesForTests();
});

describe("one request per thing", () => {
  it("runs the work once however many callers arrive during it", async () => {
    const work = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return "clip";
    });
    const all = await Promise.all([
      singleFlight("k", work), singleFlight("k", work), singleFlight("k", work),
    ]);
    expect(work).toHaveBeenCalledTimes(1);
    expect(all).toEqual(["clip", "clip", "clip"]);
  });

  it("keeps different keys apart", async () => {
    const work = vi.fn(async () => "x");
    await Promise.all([singleFlight("a", work), singleFlight("b", work)]);
    expect(work).toHaveBeenCalledTimes(2);
  });

  it("forgets the promise once it settles, so the next caller asks again", async () => {
    await singleFlight("k", async () => "first");
    expect(inFlightCount()).toBe(0);
    const second = await singleFlight("k", async () => "second");
    expect(second).toBe("second");
  });

  it("never remembers a failure as a failure", async () => {
    /*
      The fault this guards against is a `finally` that got dropped in a copy
      of this pattern: one bad minute upstream would then be cached for the
      life of the instance, and the feature would stay dead until a deploy.
    */
    await expect(singleFlight("k", async () => { throw new Error("upstream"); }))
      .rejects.toThrow("upstream");
    expect(inFlightCount()).toBe(0);
    await expect(singleFlight("k", async () => "recovered")).resolves.toBe("recovered");
  });

  it("gives every joiner the same failure rather than only the first", async () => {
    const work = () => Promise.reject(new Error("upstream"));
    const results = await Promise.allSettled([singleFlight("k", work), singleFlight("k", work)]);
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
  });
});

describe("who actually made the request", () => {
  it("tells the one that fetched apart from the ones that joined", async () => {
    /*
      `/api/tts` records a usage row per request made of TartuNLP, not per clip
      served. A joiner made no request, so charging it one would tighten every
      learner's speech allowance by exactly the burst this deduplication just
      absorbed, which is backwards.
    */
    let release: (v: string) => void = () => {};
    const work = () => new Promise<string>((r) => { release = r; });

    const first = singleFlightTagged("k", work);
    const second = singleFlightTagged("k", work);
    const third = singleFlightTagged("k", work);
    release("clip");

    expect((await first).joined).toBe(false);
    expect((await second).joined).toBe(true);
    expect((await third).joined).toBe(true);
  });

  it("counts the next caller as a fetcher again once the first has settled", async () => {
    expect((await singleFlightTagged("k", async () => 1)).joined).toBe(false);
    expect((await singleFlightTagged("k", async () => 2)).joined).toBe(false);
  });
});

describe("remembering that there was no answer", () => {
  it("holds a miss for its window and then lets it go", () => {
    rememberMiss("sona", 60_000, 1_000);
    expect(isRecentMiss("sona", 2_000)).toBe(true);
    expect(isRecentMiss("sona", 60_999)).toBe(true);
    // The deadline itself is over, not still running.
    expect(isRecentMiss("sona", 61_000)).toBe(false);
  });

  it("has never heard of a key nobody missed", () => {
    expect(isRecentMiss("anything")).toBe(false);
  });

  it("drops an expired entry as it reads it, so the map does not grow on reads", () => {
    rememberMiss("k", 10, 0);
    expect(isRecentMiss("k", 1_000)).toBe(false);
    // Reading it again takes the never-heard-of path rather than the expiry one.
    expect(isRecentMiss("k", 1_000)).toBe(false);
  });

  it("stays bounded when a script asks for two thousand words that do not exist", () => {
    for (let i = 0; i < 2_500; i += 1) rememberMiss(`w${i}`, 60_000, 0);
    // The earliest are gone, the latest are held, and nothing grew without limit.
    expect(isRecentMiss("w0", 1)).toBe(false);
    expect(isRecentMiss("w2499", 1)).toBe(true);
  });
});
