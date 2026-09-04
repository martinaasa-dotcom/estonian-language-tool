"use client";

import { deleteLocalDatabase } from "./db";

/**
 * Forgetting a learner on a device they are leaving.
 *
 * SIGNING OUT USED TO CLEAR ONE COOKIE AND NOTHING ELSE. Everything the app had
 * kept in the browser to make review work on a train stayed behind for whoever
 * signed in next on the same machine: the pages the service worker had cached,
 * which are somebody's own deck, their progress charts and the words they keep
 * getting wrong, rendered and ready to serve; the last review session, stashed
 * with every card in it; any grade still queued in the outbox; and a mock exam
 * paper they had started, composition included. A school computer, a shared
 * laptop at home and a phone handed to a friend to try the app are all the
 * ordinary case rather than the edge one, and the app's own privacy notice
 * promises that what it keeps on a device is kept for the person who put it
 * there.
 *
 * So this is what a sign-out does now, after the outbox has been given its
 * chance to reach the server (`flush` in `components/OfflineProvider.tsx`).
 * Three stores, one function, and every step swallows its own failure: a
 * browser that blocks storage throws on the accessor, and a sign-out that
 * cannot complete because a cache would not delete is a sign-out that leaves
 * somebody signed in on a shared machine, which is the worse outcome.
 *
 * What it does *not* touch is what is not about a person: the theme, the
 * install prompt's memory, and the audio and build caches the worker keeps.
 * Those are facts about the device, the same for whoever signs in next, and
 * a word read aloud is not a secret.
 */
export async function forgetThisDevice(): Promise<void> {
  await Promise.all([deleteLocalDatabase(), forgetPages(), forgetSittings()]);
  forgetOwner();
}

/**
 * The other way one person's data meets another: nobody signed out. A session
 * that expired on a shared laptop, and a different account signing in on top
 * of it, leaves the first person's pages in the worker's cache for the second
 * to be served the next time the network drops. So the shell remembers which
 * account last used this browser, as a short digest that identifies nobody,
 * and the moment a different one appears everything the first one left is
 * removed. A grade still queued from the first account is dropped rather than
 * replayed, because it would be applied to the wrong deck.
 *
 * Returns whether anything was forgotten, which is what the caller's own
 * telemetry or test wants to know and nothing on screen needs to.
 */
export async function forgetIfOwnerChanged(owner: string): Promise<boolean> {
  let previous: string | null = null;
  try {
    previous = window.localStorage.getItem(OWNER_KEY);
  } catch {
    return false;
  }
  const changed = previous !== null && previous !== owner;
  if (changed) await forgetThisDevice();
  try {
    window.localStorage.setItem(OWNER_KEY, owner);
  } catch {
    // Storage blocked: nothing was kept, so there is nothing to protect.
  }
  return changed;
}

const OWNER_KEY = "kodukeel.owner";

function forgetOwner(): void {
  try {
    window.localStorage.removeItem(OWNER_KEY);
  } catch {
    // As above.
  }
}

/**
 * The worker names its page cache `${VERSION}-pages` in `public/sw.js`, and
 * this is the other half of that pairing: the suffix is what a sign-out
 * deletes by, across every version the browser still holds, and an invariant
 * reads both files so the two cannot drift.
 */
export const PAGES_CACHE_SUFFIX = "-pages";
const CACHE_PREFIX = "kodukeel-";

async function forgetPages(): Promise<void> {
  try {
    if (typeof caches === "undefined") return;
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith(CACHE_PREFIX) && k.endsWith(PAGES_CACHE_SUFFIX))
        .map((k) => caches.delete(k)),
    );
  } catch {
    // Storage blocked, or no worker was ever registered. Nothing to forget.
  }
}

/**
 * An unfinished mock exam is kept under this prefix by
 * `app/(app)/exam/[level]/resume.ts`, which reads the constant from here so a
 * renamed key is still a key a sign-out removes.
 */
export const SITTING_KEY_PREFIX = "kodukeel.exam.";

/**
 * And an unfinished puzzle under this one, by `app/(app)/sonad/resume.ts`.
 *
 * Smaller than a paper and the same argument: it is one person's morning left
 * on a shared machine, and the next person opening the app should find the
 * board empty rather than half solved by somebody else. Swept by prefix for
 * the reason the sittings are, since which days were played is not something
 * a sign-out can know.
 */
export const PUZZLE_KEY_PREFIX = "kodukeel.puzzle.";

/**
 * And a conversation under this one, by `app/(app)/situations/resume.ts`:
 * the run in progress, and a finished run that could not be sent yet. A
 * transcript is fiction about a role card and it is still somebody's
 * evening, on a shared machine.
 */
export const SCENE_KEY_PREFIX = "kodukeel.scene.";

function forgetSittings(): void {
  forgetByPrefix(SITTING_KEY_PREFIX);
  forgetByPrefix(PUZZLE_KEY_PREFIX);
  forgetByPrefix(SCENE_KEY_PREFIX);
}

function forgetByPrefix(prefix: string): void {
  try {
    const store = window.localStorage;
    const doomed: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key && key.startsWith(prefix)) doomed.push(key);
    }
    for (const key of doomed) store.removeItem(key);
  } catch {
    // As above.
  }
}
