/**
 * A best-effort, per-instance rate limiter for the routes that spend
 * somebody else's quota.
 *
 * Three of them do. `/api/tutor` costs money or burns a free model's daily
 * allowance; `/api/tts` is a free academic service run by the University of
 * Tartu, and being a polite consumer of it is stated in that route already;
 * `/api/share` renders an image per call. None of that needs a distributed
 * limiter, and this deliberately is not one: buckets live in the memory of
 * one warm instance, so a burst spread across cold starts can slip past. It
 * still catches the pattern that actually happens, which is one retry loop or
 * one script hammering one endpoint, and it costs no infrastructure at all.
 * Swap it for a shared store the day the traffic justifies one.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

/** Cap, so a flood of unique keys cannot grow this Map without bound. */
const MAX_BUCKETS = 10_000;

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
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
    sweep(now);
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

/** Client IP as the platform sets it. The first hop is the platform, so it can be believed. */
export function clientIp(req: { headers: { get(name: string): string | null } }): string {
  const vercel = req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = req.headers.get("x-real-ip")?.trim();
  return vercel || forwarded || real || "unknown";
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

export function bucketForRequest(
  req: { headers: { get(name: string): string | null } },
  ownerId?: string | null,
): string {
  return ownerId ? bucketForOwner(ownerId) : `i:${clientIp(req)}`;
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
