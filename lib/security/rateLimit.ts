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
 *
 * WHAT THIS IS AND IS NOT A BACKSTOP FOR, since it used to be described as
 * though it were the first line of defence for spending. It is not. On
 * serverless a burst spread across cold starts meets an empty Map every time,
 * so the thing that actually bounds cost is the Postgres ledger in
 * `lib/usage/`, which reserves a call inside the same transaction that reads
 * the counters and is therefore the same number whichever instance answers.
 * This limiter is in front of that to keep an obvious loop from making a
 * hundred database round trips on its way to being refused, and to cap the
 * one route the ledger does not price at all, which is speech.
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
  const vercel = req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = req.headers.get("x-real-ip")?.trim();
  return vercel || forwarded || real || null;
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
