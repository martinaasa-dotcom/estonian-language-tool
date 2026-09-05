/**
 * The one address this deployment lives at, and where a request on any other
 * address is sent.
 *
 * WHY THIS EXISTS: GOOGLE SIGN-IN WAS LANDING ON THE WRONG HOST.
 *
 * A Vercel deployment answers on two names at least, `<app>.vercel.app` and
 * whatever domain was pointed at it, and sign-in is the one path that cannot
 * survive the difference. `signInWithOAuth` asks Supabase to send the learner
 * back to `<origin>/auth/callback`, and Supabase honors that only where the
 * address is on the project's Redirect URLs list; anywhere else it falls back
 * to the project's Site URL, silently. So somebody signing in on the custom
 * domain came back on `kodukeel.vercel.app`, and the exchange there failed,
 * because the PKCE verifier is a cookie on the domain they started from. What
 * they saw was a generic "that sign-in did not go through" on a host they had
 * not typed, and pressing the button again from there worked, which is the
 * exact shape of a fault everybody describes as finicky and nobody reports.
 *
 * The dashboard half of that is the operator's, and the README says what to
 * add. This is the app's half: with `NEXT_PUBLIC_SITE_URL` set, a request on
 * any other host is answered with a permanent redirect to the same path on
 * the canonical one, before anything else looks at it. Then there is only ever
 * one origin for the verifier cookie, the session cookie and the callback to
 * agree on, and a stale bookmark on the platform's own name lands where the
 * app now lives.
 *
 * It is `NEXT_PUBLIC_` because it is genuinely public: it is the address on
 * the front of the site. Nothing here is a secret and CI's bundle scan skips
 * it for that reason.
 *
 * Three things are deliberately NOT redirected, and each is a deployment that
 * would otherwise bounce to production.
 *
 *   A Vercel preview. Every preview has a host of its own by design, and one
 *   that sent its visitors to production would be a preview nobody could
 *   look at. `VERCEL_ENV` says which kind of deployment this is.
 *
 *   A loopback address. `vercel env pull` hands a developer the production
 *   variables, this one included, and a dev server on localhost that bounced
 *   every request to the live site would be unusable.
 *
 *   A request with no host at all, which is not a browser, and has nothing to
 *   be sent anywhere.
 *
 * Pure, so the rule is unit tested rather than driven through a deployment.
 */

/** The two variables this module reads. */
export interface CanonicalEnv {
  NEXT_PUBLIC_SITE_URL?: string | undefined;
  VERCEL?: string | undefined;
  VERCEL_ENV?: string | undefined;
  [key: string]: string | undefined;
}

/**
 * The canonical origin, parsed, or null when none is configured or the value
 * is not an absolute http(s) URL. A bare hostname is not accepted, because
 * guessing the scheme is how a redirect to `http://` ends up in front of a
 * site that only answers on `https://`.
 */
export function canonicalOrigin(env: CanonicalEnv = process.env): URL | null {
  const raw = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return new URL(url.origin);
}

/** Hosts a developer runs the app on, which are never sent to production. */
function isLoopback(hostname: string): boolean {
  return hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname === "127.0.0.1"
    || hostname === "[::1]"
    || hostname === "::1";
}

/**
 * Where a request should be sent instead, or null where it is already home.
 *
 * `host` is the `Host` header as the request arrived, port included where one
 * was sent; `pathAndSearch` is what to carry across, since a learner bounced
 * off a stale bookmark should land on the page they bookmarked and a
 * `?next=` on the sign-in page has to survive the hop.
 */
export function canonicalRedirect(
  host: string | null | undefined,
  pathAndSearch: string,
  env: CanonicalEnv = process.env,
): string | null {
  const canonical = canonicalOrigin(env);
  if (!canonical) return null;
  if (env.VERCEL && env.VERCEL_ENV !== "production") return null;
  const trimmed = host?.trim().toLowerCase();
  if (!trimmed) return null;
  let arrived: URL;
  try {
    arrived = new URL(`${canonical.protocol}//${trimmed}`);
  } catch {
    return null;
  }
  if (isLoopback(arrived.hostname)) return null;
  if (arrived.host === canonical.host) return null;
  const path = pathAndSearch.startsWith("/") ? pathAndSearch : `/${pathAndSearch}`;
  return `${canonical.origin}${path}`;
}
