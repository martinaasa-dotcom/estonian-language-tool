/**
 * The clips a page has already fetched, so playing a word twice is free.
 *
 * A BLOB URL IS A FILE THE BROWSER HOLDS UNTIL YOU TELL IT NOT TO.
 *
 * `Speak` and `PairsSession` each kept their own `Map` of object URLs and
 * neither ever revoked one. `Speak`'s was module-level, which means it
 * outlived every navigation and grew for as long as the tab was open;
 * `PairsSession`'s was a ref, which means its clips were unreachable the
 * moment the round ended and still held. Review plays audio on nearly every
 * card and a listening round legitimately meets a dozen new words a minute,
 * so a long session on a phone accumulated a WAV per word, for the session,
 * with nothing able to release them. `Recorder` had this right from the
 * start, revoking the previous URL and stopping its tracks; these two did
 * not, and the audit read the presence of a cache as the absence of a
 * problem.
 *
 * One module rather than a `Map` in each caller, for the reason
 * `lib/cache/singleFlight.ts` gives about itself: a second copy of a pattern
 * with a cleanup step in it is where the cleanup step gets dropped. It also
 * happens to be better behavior, since a word met in Pairs and again in
 * Review is now one clip rather than two.
 *
 * Bounded and least-recently-used. An unbounded cache with revocation is
 * still an unbounded cache; the point of evicting is that something gets
 * released. The cap is generous enough that a card and its example sentence,
 * a repeat, and a step backwards through a round all hit, and small enough
 * that what is held is a few megabytes rather than a session's worth.
 */

/**
 * How many clips are kept.
 *
 * A review card plays at most a word and one sentence, and going back is a
 * step or two, so anything past a couple of dozen is a clip nobody is about
 * to ask for again. Sized in clips rather than bytes because a `Blob`'s size
 * is knowable but an object URL's cost is not ours to measure, and a count is
 * a bound a reader can check against the screen.
 */
const MAX_CLIPS = 24;

/** Injectable so this can be tested without a DOM. Nothing else overrides it. */
export interface ObjectUrls {
  create(blob: Blob): string;
  revoke(url: string): void;
}

const browserUrls: ObjectUrls = {
  create: (blob) => URL.createObjectURL(blob),
  revoke: (url) => URL.revokeObjectURL(url),
};

/** Insertion order is the LRU order; a hit re-inserts to the end. */
const clips = new Map<string, string>();

/**
 * The url for a clip already fetched, or null.
 *
 * A hit counts as use: it moves to the end of the queue, so the word being
 * drilled right now is the last thing evicted rather than the first.
 */
export function cachedClip(key: string): string | null {
  const url = clips.get(key);
  if (url === undefined) return null;
  clips.delete(key);
  clips.set(key, url);
  return url;
}

/**
 * Files a freshly fetched clip and returns its url.
 *
 * Evicting revokes, which is the whole point of the module: without that this
 * is a `Map` that forgets where it put things rather than a cache that
 * releases them.
 */
export function rememberClip(key: string, blob: Blob, urls: ObjectUrls = browserUrls): string {
  const existing = clips.get(key);
  // Two callers can miss on the same key at once. The second one's blob is
  // the same audio, so keep the url already handed out and let the duplicate
  // go rather than orphaning a url something may already be playing.
  if (existing !== undefined) return cachedClip(key)!;

  const url = urls.create(blob);
  clips.set(key, url);

  while (clips.size > MAX_CLIPS) {
    const oldest = clips.keys().next();
    if (oldest.done) break;
    const stale = clips.get(oldest.value)!;
    clips.delete(oldest.value);
    urls.revoke(stale);
  }

  return url;
}

/** Releases everything. For tests, and for a caller that knows it is done. */
export function forgetClips(urls: ObjectUrls = browserUrls): void {
  for (const url of clips.values()) urls.revoke(url);
  clips.clear();
}

/** How many clips are held. For tests and for nothing else. */
export function heldClipCount(): number {
  return clips.size;
}
