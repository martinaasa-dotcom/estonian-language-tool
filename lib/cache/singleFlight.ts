/**
 * One upstream request per thing, however many callers ask at once.
 *
 * A cache that is consulted before a call and written after it has a gap
 * exactly as wide as the call, and that gap is where the traffic is. The TTS
 * route worked this out first and said so at length: a class of twenty-five
 * starting the same unit together asks for the same word inside the same
 * second, every one of them misses, and a free academic service gets
 * twenty-five identical requests. The fix is to record the promise before
 * awaiting it, so everybody who arrives during the window awaits the same one.
 *
 * That was a `Map` and a `finally` living in one route handler. It is here
 * because the dictionary needed the same thing and copying it would have made
 * two of it, and because the second copy is where the `finally` gets dropped
 * and a failed fetch is remembered as a failure for ever.
 *
 * Per warm instance, like the rate limiter, and for the same reason: it costs
 * no infrastructure and it removes the burst that actually happens. A burst
 * spread across cold starts still gets through, which is fine, because that is
 * not the shape of the problem.
 */
const inFlight = new Map<string, Promise<unknown>>();

export async function singleFlight<T>(key: string, work: () => Promise<T>): Promise<T> {
  return (await singleFlightTagged(key, work)).value;
}

/**
 * The same thing, and whether this caller is the one that actually did it.
 *
 * The distinction is not decoration. `/api/tts` records a usage row per clip
 * it fetches from TartuNLP, deliberately not per clip it serves, because the
 * row exists to show how heavily this app leans on a free academic service.
 * A caller that joined somebody else's request did not make a request, so
 * charging it one would quietly tighten every learner's speech allowance by
 * counting requests that were never sent.
 */
export async function singleFlightTagged<T>(
  key: string,
  work: () => Promise<T>,
): Promise<{ value: T; joined: boolean }> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return { value: await existing, joined: true };

  /*
    `finally` deletes the entry whether the work resolved or threw, so a
    failure is retried by the next caller rather than cached. The promise is
    put in the map before it is awaited, which is the whole point: an `await`
    here first would reopen the gap this closes.
  */
  const promise = work().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return { value: await promise, joined: false };
}

/** Whether anything is currently being fetched under this key. For tests. */
export function inFlightCount(): number {
  return inFlight.size;
}

export function resetSingleFlightForTests(): void {
  inFlight.clear();
}

/**
 * A bounded memo of questions that came back with no answer.
 *
 * Asking again is not free, and a word that is not in Ekilex is not in Ekilex
 * a second later either. Without this, a search for a word that does not exist
 * costs two round trips to a free academic service on every single render of
 * the page, for ever, and the person typing it is by definition retrying.
 *
 * Deliberately small and deliberately short. It exists to absorb a retry loop
 * and a page reload, not to remember anything: a word genuinely added to
 * Ekilex tomorrow must be findable tomorrow, and the reader must never have to
 * be told to clear a cache they cannot see.
 */
const misses = new Map<string, number>();
const MISS_MAX = 2_000;

export function rememberMiss(key: string, ttlMs: number, now = Date.now()): void {
  if (misses.size >= MISS_MAX) {
    // Cheapest possible eviction, and correct for this shape: entries go in in
    // insertion order and every one of them expires on the same schedule, so
    // the oldest key is also the one closest to being useless.
    const oldest = misses.keys().next().value;
    if (oldest !== undefined) misses.delete(oldest);
  }
  misses.set(key, now + ttlMs);
}

export function isRecentMiss(key: string, now = Date.now()): boolean {
  const until = misses.get(key);
  if (until === undefined) return false;
  if (now >= until) {
    misses.delete(key);
    return false;
  }
  return true;
}

export function resetMissesForTests(): void {
  misses.clear();
}
