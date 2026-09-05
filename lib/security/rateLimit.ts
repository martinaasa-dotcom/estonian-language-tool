/**
 * A best-effort, per-instance rate limiter for the routes that spend
 * somebody else's quota.
 *
 * `/api/tutor`, `/api/write` and `/api/exam/write` each cost money or burn a
 * free model's daily allowance; `/api/scan` costs a vision call; `/api/tts` is
 * a free academic service run by the University of Tartu, and being a polite
 * consumer of it is stated in that route already; `/api/share` renders an image
 * per call; `/api/export` reads every table this account owns and `/api/restore`
 * parses a file the caller chose the size of. None of that needs a distributed
 * limiter, and this deliberately is not one: buckets live in the memory of
 * one warm instance, so a burst spread across cold starts can slip past. It
 * still catches the pattern that actually happens, which is one retry loop or
 * one script hammering one endpoint, and it costs no infrastructure at all.
 * Swap it for a shared store the day the traffic justifies one.
 *
 * WHAT THIS IS AND IS NOT A BACKSTOP FOR, since it used to be described as
 * though it were the first line of defense for spending. It is not. On
 * serverless a burst spread across cold starts meets an empty Map every time,
 * so the thing that actually bounds cost is the Postgres ledger in
 * `lib/usage/`, which reserves a call inside the same transaction that reads
 * the counters and is therefore the same number whichever instance answers.
 * This limiter is in front of that to keep an obvious loop from making a
 * hundred database round trips on its way to being refused.
 *
 * AND THE FOUR ROUTES THE LEDGER DOES NOT PRICE NO LONGER RELY ON IT ALONE.
 * Speech, the share card, the export and the restore used to have this Map and
 * nothing else, which made the honest description of their limit "however many
 * instances happen to be warm". That is the first question a buyer's engineer
 * asks and the right one to ask. `lib/usage/sharedLimit.ts` counts those in a
 * row every instance can see, and calls straight through to this function
 * first, so a caller who is already over is still refused for free and the
 * loop this was written for still costs no round trip. What lives here is the
 * cheap verdict and the two pure pieces at the bottom that both limiters have
 * to agree on.
 *
 * THE LIST ABOVE USED TO SAY "THREE OF THEM" AND NAME THREE, and it was five
 * by then. That is how `/api/write` went without one: it is `/api/exam/write`
 * with a different prompt, its twin was throttled from the day it landed, and
 * the only difference between them was which had been written first. Prose
 * kept four routes honest and did not catch the fifth, which is the argument
 * `lib/usage/ledger.ts` makes about itself, so an invariant reads the routes
 * rather than this paragraph.
 */

import { createHash } from "node:crypto";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

/** Cap, so a flood of unique keys cannot grow this Map without bound. */
const MAX_BUCKETS = 10_000;

/**
 * Drop every expired bucket.
 *
 * Rate-limited to once a minute on the ordinary path, because this walks the
 * whole map and the ordinary path is every request. `force` is for the one
 * caller that cannot afford to be told "not yet": a full map about to evict a
 * live bucket, below.
 */
function sweep(now: number, force = false) {
  if (!force && now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the caller may retry. Only set when ok is false. */
  retryAfterSec?: number;
}

/**
 * @param key   Caller plus endpoint, e.g. `tutor:${ownerId}`.
 * @param limit Requests allowed inside the window.
 * @param windowMs Window length.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  if (buckets.size >= MAX_BUCKETS && !buckets.has(key)) {
    /*
      FORCED, BECAUSE THE SWEEP ABOVE HAS ALREADY SET `lastSweep`.

      `sweep(now)` on the line before this block ran unconditionally and stamped
      the clock, so this second call returned immediately every single time:
      `now - lastSweep` is zero. A full map therefore never reclaimed an
      expired bucket on demand and fell straight through to deleting the
      oldest-inserted key, which is a live caller and quite possibly a busy
      one. On a deployment with more than MAX_BUCKETS distinct keys in a
      minute, that hands somebody a fresh allowance in the middle of their
      window and resets a counter that was doing its job.

      Expired first, always. Only if nothing has expired does a live bucket go.
    */
    sweep(now, true);
    if (buckets.size >= MAX_BUCKETS) {
      const oldest = buckets.keys().next().value;
      if (oldest !== undefined) buckets.delete(oldest);
    }
  }

  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (bucket.count >= limit) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { ok: true };
}

/** Forget every bucket, as a cold instance would. For tests. */
export function resetRateLimitForTests() {
  buckets.clear();
  lastSweep = 0;
}

/*
  THE TWO PURE PIECES THE SHARED COUNTER IS BUILT OUT OF.

  `lib/usage/sharedLimit.ts` is the half that talks to Postgres, and it lives
  over there because this directory is asserted free of Prisma. What can be
  decided without a database is decided here, next to the in-memory limiter it
  has to agree with: two modules disagreeing about where a window starts would
  give one answer in memory and another in the table, and the disagreement
  would only show up as a limit that behaves differently on a warm instance.
*/

/**
 * The start of the window a moment falls in, floored to the window's own
 * length so that every instance computes the same one for the same moment.
 *
 * A fixed window rather than a sliding one, which is the same choice the Map
 * above makes, and it has the same known edge: a caller can spend a full
 * allowance at the end of one window and another at the start of the next.
 * That is a factor of two on a limit set with an order of magnitude of room in
 * it, and the alternative is keeping every timestamp rather than a count.
 */
export function windowStartMs(now: number, windowMs: number): number {
  return Math.floor(now / windowMs) * windowMs;
}

/**
 * What the shared table stores instead of the key.
 *
 * The key is `tts:o:<uuid>`, so it carries an owner id, and a table of those
 * is a record of who was awake and when that nothing needs and nobody asked
 * for. A digest tells two callers apart, which is the whole job, and cannot be
 * read back into a person.
 *
 * Unsalted on purpose. A salt defends against somebody who has the table and
 * wants to confirm a guess, and anybody who has this table has the rows it was
 * derived from; what a salt would cost is that the same caller hashes
 * differently on two instances, which is the one property this needs.
 */
export function bucketDigest(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Whether a forwarded-for header on this deployment came from a proxy.
 *
 * It is a header. Anyone can send one, and this app used to read it whatever
 * it was standing behind: on Vercel that is correct, because the platform
 * overwrites `x-vercel-forwarded-for` on every request and a client cannot
 * reach past it. Self-hosted behind a reverse proxy that passes an incoming
 * `X-Forwarded-For` through untouched, it is a value the caller chose.
 *
 * And a bucket key the caller chooses is worse than no bucket key at all,
 * which is the part that decided this. An honest caller keeps one key and
 * gets one allowance. A caller who makes one up per request gets a fresh
 * allowance every time — an unlimited number of limits, which is not a limit.
 * So the untrusted case does not fall back to the header; it falls back to
 * one shared bucket, below.
 *
 * `VERCEL` is set by the platform itself. `TRUST_PROXY_HEADERS` is for
 * everybody else, and defaults off, because a deployment that has not thought
 * about its proxy has not got one.
 */
export function trustsProxyHeaders(env: Record<string, string | undefined> = process.env): boolean {
  const flag = env.TRUST_PROXY_HEADERS?.trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes") return true;
  return env.VERCEL === "1";
}

/**
 * Client IP, where the deployment is in a position to know it.
 *
 * Null when it is not, which is a real answer and not a failure: it says "this
 * request cannot be told apart from any other unattributed one", and the
 * caller below acts on that rather than inventing a distinction.
 */
export function clientIp(
  req: { headers: { get(name: string): string | null } },
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (!trustsProxyHeaders(env)) return null;

  /*
    WHICH HEADER, AND WHICH HOP IN IT, IS THE WHOLE OF THIS FUNCTION.

    It read `x-vercel-forwarded-for` first whenever proxy headers were trusted
    at all, including the self-hosted `TRUST_PROXY_HEADERS=1` case this
    function exists for. No proxy but Vercel's own sets that header and no
    proxy but Vercel's own strips it, so on a self-hosted deployment it is a
    value the caller typed: send a new one per request and you get an
    unlimited number of allowances, which is the exact fault the paragraph
    above rules out. It is read only where the platform that owns it is there.

    And the hop matters as much as the header. `X-Forwarded-For` is a list the
    client starts and each proxy appends to, so the *leftmost* element is
    whatever the caller put there and the *rightmost* is the one the trusted
    proxy added about the connection it actually accepted. Vercel overwrites
    the whole header, so its own is read from the left; a self-hosted proxy
    appends, so it is read from the right.
  */
  if (env.VERCEL === "1") {
    const vercel = req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
    const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const real = req.headers.get("x-real-ip")?.trim();
    return vercel || forwarded || real || null;
  }

  const hops = req.headers.get("x-forwarded-for")?.split(",") ?? [];
  const nearest = hops[hops.length - 1]?.trim();
  const real = req.headers.get("x-real-ip")?.trim();
  return nearest || real || null;
}

/*
  WHO TO CHARGE A REQUEST TO, AND WHY IT IS ALMOST NEVER THE IP.

  This app has classrooms in it. Twenty-five students on one school's network
  are one IP address, and a review session asks for audio on nearly every
  card, so a class starting together would spend a per-IP allowance in the
  first few seconds and every one of them would be told to slow down. A
  household on one router is the same fault with smaller numbers.

  Signed-in work is charged to the learner instead, which is what
  `bucketForOwner` is for and what every route here uses, since every one of
  them resolves an owner before it does anything. The IP is the fallback for
  a request with nobody behind it, and that is the case which actually needs
  a cap: an unauthenticated scrape loop has no session to be charged to.
*/
export function bucketForOwner(ownerId: string): string {
  return `o:${ownerId}`;
}

/**
 * The shared bucket for a request nothing can attribute.
 *
 * One key for all of them, and deliberately so. Where the deployment cannot
 * believe a forwarded-for header there is nothing else in a `Request` to tell
 * two anonymous callers apart, and a key made out of an untrusted header
 * hands a spoofer one allowance per request. Sharing one allowance is the
 * honest version of not knowing.
 *
 * In practice this is the local single-learner deployment (ADR-013), where
 * there is no sign-in and exactly one person, so one bucket is not a
 * compromise but the right shape. Any deployment with sign-in configured
 * charges its learners by owner and never arrives here.
 */
const UNATTRIBUTED = "i:unattributed";

export function bucketForRequest(
  req: { headers: { get(name: string): string | null } },
  ownerId?: string | null,
  env: Record<string, string | undefined> = process.env,
): string {
  if (ownerId) return bucketForOwner(ownerId);
  const ip = clientIp(req, env);
  return ip ? `i:${ip}` : UNATTRIBUTED;
}

/**
 * The refusal, worded for the person who hit it rather than for a log.
 *
 * `Retry-After` is a real number of seconds rather than a flat minute,
 * because "try again in a moment" with no moment named is the kind of message
 * a reader has to guess at.
 */
export function rateLimited(limit: RateLimitResult, message: string): Response {
  return Response.json(
    { error: message },
    { status: 429, headers: { "retry-after": String(limit.retryAfterSec ?? 60) } },
  );
}
