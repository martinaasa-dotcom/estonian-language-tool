import { cachedClip, rememberClip } from "./clipCache";
import { CLEAN, type Condition } from "./conditions";
import { needsMixer, playThrough } from "./mixer";

/**
 * One clip, fetched once.
 *
 * `Speak` and the pairs round each carried their own copy of "look in the
 * cache, otherwise POST to /api/tts and remember the blob", and a third copy
 * was about to be written for prefetching the next card. Three copies of a
 * cache key is where two of them stop agreeing about what is in it: a voice
 * added to the key in one place and not another would play the wrong voice
 * from cache and look like the setting not saving.
 *
 * So the key is built here, once, from everything that changes the sound:
 * the text, the speed, and the voice. The server hashes the same three. A
 * hearing condition (`lib/audio/conditions.ts`) changes the speed the service
 * is asked for and nothing else the server sees; the room it is heard in is
 * made in the browser after the fetch, so it is not part of the key.
 *
 * Browser only, since it mints object URLs. Never throws on a play that the
 * browser refuses; a clip that could not be fetched rejects, which is the one
 * outcome a caller has to act on.
 */
export interface ClipRequest {
  readonly text: string;
  readonly slow?: boolean;
  readonly voice?: string;
  /**
   * How it is delivered: the rate, the room, the line. Clean when absent,
   * which is what every screen that has not asked gets. `slow` wins over a
   * condition's own speed, because "play it slowly" is the learner's request
   * and the condition is the round's.
   */
  readonly condition?: Condition;
}

export const SLOW_SPEED = 0.6;

/** The rate the service is asked for. */
export function speedOf({ slow, condition }: ClipRequest): number {
  if (slow) return SLOW_SPEED;
  return (condition ?? CLEAN).speed;
}

export function clipKey(request: ClipRequest): string {
  return `${request.text}|${speedOf(request)}|${request.voice ?? ""}`;
}

/** The object URL for a clip, from the page cache or the network. */
export async function fetchClip(request: ClipRequest): Promise<string> {
  const key = clipKey(request);
  const held = cachedClip(key);
  if (held) return held;
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: request.text,
      speed: speedOf(request),
      ...(request.voice ? { voice: request.voice } : {}),
    }),
  });
  if (!res.ok) throw new Error(String(res.status));
  return rememberClip(key, await res.blob());
}

/**
 * Warms the cache for a clip about to be wanted, and says nothing if it
 * cannot. The next card's word is fetched while this one is being answered,
 * so pressing the speaker on it is instant rather than a round trip to a
 * speech service.
 */
export function prefetchClip(request: ClipRequest): void {
  if (typeof window === "undefined" || !request.text.trim()) return;
  void fetchClip(request).catch(() => undefined);
}

/**
 * A CLIP THE BROWSER REFUSED TO AUTOPLAY IS NOT A CLIP THAT FAILED.
 *
 * Every browser blocks `HTMLAudioElement.play()` on a page the reader has not
 * touched yet, and rejects it with a `NotAllowedError`. The clip is in hand,
 * the service answered, and the same call on a press will be allowed: it is a
 * fact about the gesture, not about the audio.
 *
 * `components/Speak.tsx` knew that and said so in a comment. The minimal-pairs
 * round did not: it wrapped the fetch and the play in one `try` and set
 * `audioFailed` on either, and that state replaces the whole drill with "No
 * audio, no drill. It runs on TartuNLP and needs a connection." The round
 * autoplays on mount, which is the no-gesture case by construction, so on
 * every phone and every Safari a learner opening the drill was told their
 * connection was the problem, given a button back to Today, and never shown
 * the 80px play button sitting behind that screen which would have worked.
 * A failure that misnames its cause sends the reader to the wrong place, which
 * is the rule `scripts/test-restore.mjs` has a paragraph about.
 *
 * So the distinction lives here, once, and both callers read it. `blocked`
 * means "ask for a press"; anything else throws and is a real absence.
 */
export type PlayOutcome = "played" | "blocked";

export async function playClip(
  request: ClipRequest,
  { unasked = false }: { unasked?: boolean } = {},
): Promise<PlayOutcome> {
  const url = await fetchClip(request);
  // The room is the mixer's job; a quiet room is the element's, as it always was.
  const condition = request.slow ? CLEAN : (request.condition ?? CLEAN);
  if (needsMixer(condition)) return playThrough(url, condition, { unasked });
  try {
    await new Audio(url).play();
  } catch (error) {
    if (unasked && error instanceof DOMException && error.name === "NotAllowedError") {
      return "blocked";
    }
    throw error;
  }
  return "played";
}
