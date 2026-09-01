import { cachedClip, rememberClip } from "./clipCache";

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
 * the text, the speed, and the voice. The server hashes the same three.
 *
 * Browser only, since it mints object URLs. Never throws on a play that the
 * browser refuses; a clip that could not be fetched rejects, which is the one
 * outcome a caller has to act on.
 */
export interface ClipRequest {
  readonly text: string;
  readonly slow?: boolean;
  readonly voice?: string;
}

export const SLOW_SPEED = 0.6;

export function clipKey({ text, slow, voice }: ClipRequest): string {
  return `${text}|${slow ? SLOW_SPEED : 1}|${voice ?? ""}`;
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
      speed: request.slow ? SLOW_SPEED : 1,
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
