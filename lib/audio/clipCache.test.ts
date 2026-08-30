import { beforeEach, describe, expect, it } from "vitest";
import {
  cachedClip, forgetClips, heldClipCount, rememberClip, type ObjectUrls,
} from "./clipCache";

/**
 * The clip cache, and the one property it exists for.
 *
 * Both audio callers already had a cache, which is why this was read as a
 * solved problem: `Speak` kept a module-level `Map` and `PairsSession` a ref.
 * Neither ever called `URL.revokeObjectURL`, so every clip a session played
 * was held by the browser until the tab closed. A cache that never releases
 * anything is a leak with a hit rate.
 *
 * So what is asserted here is not that a repeat play is a hit — that was
 * always true — but that something is let go when it stops being one. The
 * URL factory is injected so this runs without a DOM and, more to the point,
 * so a revoke can be counted.
 */

function fakeUrls() {
  const created: string[] = [];
  const revoked: string[] = [];
  let n = 0;
  const urls: ObjectUrls = {
    create: () => {
      const url = `blob:test/${(n += 1)}`;
      created.push(url);
      return url;
    },
    revoke: (url) => { revoked.push(url); },
  };
  return { urls, created, revoked };
}

const blob = () => new Blob(["wav"]);

let fake: ReturnType<typeof fakeUrls>;

beforeEach(() => {
  fake = fakeUrls();
  forgetClips(fake.urls);
  fake.revoked.length = 0;
  fake.created.length = 0;
});

describe("the clip cache", () => {
  it("hands back the same url for the same clip", () => {
    const first = rememberClip("tere|1", blob(), fake.urls);
    expect(cachedClip("tere|1")).toBe(first);
    // One clip fetched, one url made: a repeat play costs neither.
    expect(fake.created).toHaveLength(1);
  });

  it("knows nothing about a clip it has not held", () => {
    expect(cachedClip("never|1")).toBeNull();
  });

  it("tells a slow reading apart from an ordinary one", () => {
    // The speed is part of the key, or asking to hear a word slowly would
    // replay the version already fetched at full speed.
    const fast = rememberClip("tere|1", blob(), fake.urls);
    const slow = rememberClip("tere|0.6", blob(), fake.urls);
    expect(slow).not.toBe(fast);
  });

  it("revokes what it evicts", () => {
    /*
      The whole point. Without this the cache grows for the life of the tab,
      which is what both callers did: review plays audio on nearly every card
      and a listening round meets a dozen new words a minute.
    */
    for (let i = 0; i < 40; i += 1) rememberClip(`word-${i}|1`, blob(), fake.urls);

    expect(heldClipCount()).toBeLessThanOrEqual(24);
    expect(fake.revoked.length).toBe(fake.created.length - heldClipCount());
    // And it revoked the oldest, not an arbitrary one.
    expect(fake.revoked[0]).toBe(fake.created[0]);
  });

  it("keeps the clip being played now, not the one played first", () => {
    // Least recently *used*, so a word being drilled repeatedly survives a
    // round of new ones rather than being evicted by them.
    const kept = rememberClip("drilled|1", blob(), fake.urls);
    for (let i = 0; i < 20; i += 1) {
      rememberClip(`filler-${i}|1`, blob(), fake.urls);
      cachedClip("drilled|1");
    }
    for (let i = 20; i < 30; i += 1) rememberClip(`filler-${i}|1`, blob(), fake.urls);

    expect(cachedClip("drilled|1")).toBe(kept);
    expect(fake.revoked).not.toContain(kept);
  });

  it("never orphans a url two callers raced for", () => {
    // A card showing a word and its example sentence can miss on the same key
    // twice. The second blob is the same audio, and handing out a second url
    // would leave the first playing and unreachable.
    const first = rememberClip("tere|1", blob(), fake.urls);
    const second = rememberClip("tere|1", blob(), fake.urls);
    expect(second).toBe(first);
    expect(fake.created).toHaveLength(1);
    expect(fake.revoked).toHaveLength(0);
  });

  it("releases everything when asked", () => {
    rememberClip("a|1", blob(), fake.urls);
    rememberClip("b|1", blob(), fake.urls);
    forgetClips(fake.urls);
    expect(heldClipCount()).toBe(0);
    expect(fake.revoked).toHaveLength(2);
  });
});
