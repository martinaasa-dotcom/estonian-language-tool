import { prisma } from "@/lib/db";
import {
  bucketDigest, checkRateLimit, windowStartMs, type RateLimitResult,
} from "@/lib/security/rateLimit";

/**
 * The rate limiter that answers the same number whichever instance is asked.
 *
 * `lib/security/rateLimit.ts` is a Map in one warm instance. Its own header is
 * honest about what that buys and what it does not: it catches the retry loop
 * that actually happens, and a burst spread across cold starts meets an empty
 * Map every time. For the routes that spend money that was survivable, because
 * `authoriseCall` in `./ledger.ts` books a call inside the transaction that
 * reads the counters and is therefore the same number everywhere.
 *
 * Four routes are not priced by the ledger at all. `/api/tts` calls a free
 * service the University of Tartu runs and writes a file into storage nothing
 * prunes. `/api/share` renders an image per call. `/api/export` reads every
 * table an account owns, and `/api/restore` parses a file the caller chose the
 * size of. For those the Map was the only thing there was, so the honest
 * description of their limit was "however many instances happen to be warm",
 * which is the first thing a buyer's engineer asks about and the right thing
 * for them to ask.
 *
 * ONE STATEMENT, NO LOCK, BECAUSE THERE IS NOTHING TO READ FIRST. The ledger
 * takes an advisory lock because it reads four aggregates and then decides,
 * and check-then-act across ten tabs is what that lock exists to stop. Here
 * the count returned by the increment *is* the decision, so
 * `INSERT ... ON CONFLICT DO UPDATE SET count = count + 1 RETURNING count` is
 * atomic on its own and costs one round trip.
 *
 * THE MAP STAYS IN FRONT. A caller already over the limit should not make a
 * database round trip to be told so again, which is exactly the loop this is
 * meant to be cheap about, and the in-memory verdict is free. So the memory
 * limit is asked first and refuses on its own; the shared counter is only
 * reached by a request memory was willing to allow.
 */

/**
 * What to do when the database cannot answer.
 *
 * Not open and not closed, and the reasoning matters. Failing closed turns a
 * bad minute at Postgres into a total outage of speech, sharing, export and
 * restore, on an app whose every page reads the same database and is therefore
 * already in trouble. Failing open would drop a control the moment somebody
 * managed to put the database under load, which is when it is wanted.
 *
 * It degrades to exactly the behaviour this app had before this module
 * existed: the in-memory verdict, which has already been taken and was already
 * good enough to ship. Nothing is weakened relative to yesterday, and the
 * thing that bounds spending, the ledger, is a separate control that fails
 * closed on its own.
 */
const FALL_BACK_TO_MEMORY = true;

/** How often one instance will try to clear rows whose windows have passed. */
const PRUNE_EVERY_MS = 60_000;

let lastPrune = 0;

/**
 * Drop rows nobody will read again.
 *
 * Opportunistic rather than scheduled, for the reason the Map's own sweep is:
 * this app has no cron of its own to hang a job on, and a table that only
 * grows is a leak whatever its rows mean. Once a minute per instance, on a
 * range scan over the `expiresAt` index, and never awaited by the caller: a
 * learner waiting for a word to be read aloud should not also be waiting for
 * last hour's counters to be deleted.
 */
function pruneSoon(now: number): void {
  if (now - lastPrune < PRUNE_EVERY_MS) return;
  lastPrune = now;
  void prisma
    .$executeRaw`DELETE FROM "RateLimit" WHERE "expiresAt" < NOW()`
    .catch(() => {
      /*
        Swallowed on purpose, and it is the one place in this file that is.
        A prune that failed costs some dead rows and the next instance to come
        round tries again; reporting it would put a line in the log for every
        minute the database is unhappy, on top of the lines the request itself
        is already writing.
      */
    });
}

/**
 * Count one request against a window every instance shares.
 *
 * @param key      Caller plus endpoint, exactly as `checkRateLimit` takes it,
 *                 so the two limiters cannot be counting different things.
 * @param limit    Requests allowed inside the window.
 * @param windowMs Window length.
 */
export async function checkSharedRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): Promise<RateLimitResult> {
  /*
    Memory first. A caller who is already over refuses here for free, which is
    the whole reason the Map is still worth having: the shape this is guarding
    against is a loop, and a loop should not buy a round trip per iteration.
  */
  const local = checkRateLimit(key, limit, windowMs);
  if (!local.ok) return local;

  const startMs = windowStartMs(now, windowMs);
  const windowStart = new Date(startMs);
  const expiresAt = new Date(startMs + windowMs);

  try {
    /*
      LEAST(...) rather than a bare increment, so a caller hammering a refused
      endpoint cannot walk the counter up without bound inside its window. One
      past the limit says everything "over" needs to say.
    */
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimit" ("bucket", "windowStart", "count", "expiresAt")
      VALUES (${bucketDigest(key)}, ${windowStart}, 1, ${expiresAt})
      ON CONFLICT ("bucket", "windowStart")
      DO UPDATE SET "count" = LEAST("RateLimit"."count" + 1, ${limit + 1})
      RETURNING "count"
    `;

    pruneSoon(now);

    const count = rows[0]?.count ?? 1;
    if (count > limit) {
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000)) };
    }
    return { ok: true };
  } catch {
    /*
      No report() here. This runs on the hottest routes in the app and a
      database that is down is already being reported by whatever else on the
      page touched it; a second line per request would bury it.
    */
    if (FALL_BACK_TO_MEMORY) return local;
    return { ok: false, retryAfterSec: Math.ceil(windowMs / 1000) };
  }
}
