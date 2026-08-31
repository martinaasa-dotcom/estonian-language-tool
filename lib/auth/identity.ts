import type { SupabaseClient } from "@supabase/supabase-js";

/*
  WHO IS SIGNED IN, ANSWERED WITHOUT ASKING THE AUTH SERVER EVERY TIME.

  `getUser()` is a network call. That is the whole point of it: it hands the
  access token to Supabase and asks whether it is still good, which is the
  safest possible answer and costs a round trip from the deployment to the auth
  service. This app was making three of them on every signed-in page load. The
  middleware made one for the gate, `requireUserId()` made a second, and
  `currentLearner()` made a third, each one waiting on the last, and none of
  them able to reuse another's answer because they were separate `cache()`
  entries around separate clients.

  With the project and the learner in different parts of the world that is
  most of the wait between pressing "Continue with Google" and reading a
  screen. It is also how a slow minute at the auth service became a 504: the
  middleware had no deadline on that call, so it waited until the platform
  gave up on it at twenty-five seconds and served a gateway error, which is
  the worst available way to say "the login server is busy".

  Two changes, and this module holds both.

  `getClaims()` replaces `getUser()`. A Supabase access token is a signed JWT,
  so with asymmetric signing keys the signature can be verified here, against
  a key set cached in the process, and no round trip happens at all. The
  fallback is the old behaviour rather than a weaker one: on a project still
  using the legacy shared secret there is no public key to verify against, so
  `getClaims()` calls `getUser()` itself and the answer is exactly as
  authoritative as before. Migrating the project to signing keys is what turns
  the remaining round trip off, and it is a dashboard setting rather than a
  code change.

  What that trades is freshness. A session revoked elsewhere (signed out on
  another device, the account deleted) is caught by `getUser()` on the next
  request and by a locally verified token only once that token expires, which
  is the access token lifetime the project sets, an hour by default. The
  allowlist is not part of that trade: the address is a claim inside the
  token, so `isAllowedEmail` still runs on every gated request and revoking
  access still takes effect immediately.

  And every call gets a deadline. `boundedTransport` is the fetch the client
  is built with, so the deadline covers the token refresh and the fallback
  alike, and it records whether the service answered at all. That is what
  makes the third state below possible, and the third state is the one that
  matters: a timeout is not an answer, and reading it as "signed out" would
  sign a learner out of their own deck over a bad minute at somebody else's
  server.
*/

/**
 * How long the auth service gets before the request stops waiting for it.
 *
 * The same 2,500ms the dictionary gives Ekilex, and for the same reason: a
 * service this app does not run is allowed to be slow, and is not allowed to
 * decide how long somebody sits in front of a blank screen. A healthy call
 * here is under 300ms, so anything near this deadline is already a fault.
 */
export const AUTH_TIMEOUT_MS = 2_500;

/** Who is signed in, for greetings and the opt-in class leaderboard. */
export interface Learner {
  id: string;
  /** Google's name, the email's local part, or a local-mode placeholder. */
  name: string;
  email: string | null;
  avatarUrl: string | null;
}

/**
 * The three answers, because "we could not tell" is not "signed out".
 *
 * `out` is a fact: no cookie, an expired token that could not be refreshed, or
 * the auth service saying no. `unreachable` is the absence of a fact, and the
 * two have to be told apart before anything decides what to do about them.
 */
export type Identity =
  | { state: "in"; learner: Learner }
  | { state: "out" }
  | { state: "unreachable" };

/**
 * The cookie `@supabase/ssr` keeps the session in, derived the way it derives
 * it: `sb-<project ref>-auth-token`, from the first label of the project URL.
 *
 * Worth deriving rather than guessing, because it is what lets a request with
 * no session cookie be answered as signed out without building a client or
 * touching the network. That is every visitor who has not signed in yet,
 * which on a public app is most of them.
 */
export function authCookieName(
  url: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string | null {
  const raw = url?.trim();
  if (!raw) return null;
  try {
    const ref = new URL(raw).hostname.split(".")[0];
    return ref ? `sb-${ref}-auth-token` : null;
  } catch {
    return null;
  }
}

/**
 * Whether these cookie names carry a session.
 *
 * A session too large for one cookie is stored in chunks named `<key>.0`,
 * `<key>.1`, so the match is the key itself or the key with a numbered
 * suffix. Nothing else counts: the PKCE code verifier written during a
 * sign-in is `<key>-code-verifier`, and treating that as a session would put
 * every visitor mid-handshake back on the slow path.
 *
 * With no project URL configured this returns true, which is the honest
 * answer for "we cannot rule it out" and hands the question to the client.
 */
/** The `.0`, `.1` a session too large for one cookie is split across. */
const CHUNK_SUFFIX = /^(?:0|[1-9][0-9]*)$/;

export function hasSessionCookie(
  names: Iterable<string>,
  key: string | null = authCookieName(),
): boolean {
  if (!key) return true;
  for (const name of names) {
    if (name === key) return true;
    if (name.startsWith(`${key}.`) && CHUNK_SUFFIX.test(name.slice(key.length + 1))) return true;
  }
  return false;
}

/**
 * A `fetch` with a deadline on it, which remembers whether it was met.
 *
 * Handed to `createServerClient` as `global.fetch`, so it covers everything
 * the auth client does rather than one call somebody remembered to wrap: the
 * claims check, the token refresh underneath it, and the sign-out on the
 * allowlist path.
 *
 * `reached` is set from the transport rather than read off an error class,
 * because those are the two things that have to be told apart and only the
 * transport knows which is which. A request that never completed is a fact
 * about the network. A 401, an expired token or a bad signature all arrive as
 * an ordinary response and are facts about the session.
 */
export interface Transport {
  /** Hand this to `createServerClient` as `global.fetch`. */
  readonly fetch: typeof globalThis.fetch;
  /** False once a call failed to complete: timed out, refused, cut off. */
  reached: boolean;
}

export function boundedTransport(ms: number = AUTH_TIMEOUT_MS): Transport {
  const transport: Transport = {
    reached: true,
    fetch: async (input, init) => {
      const deadline = AbortSignal.timeout(ms);
      const signal =
        init?.signal && typeof AbortSignal.any === "function"
          ? AbortSignal.any([init.signal, deadline])
          : (init?.signal ?? deadline);
      try {
        return await fetch(input, { ...init, signal });
      } catch (error) {
        transport.reached = false;
        throw error;
      }
    },
  };
  return transport;
}

/** The bits of a verified access token this app reads. */
interface Claims {
  sub: string;
  email?: string | undefined;
  user_metadata?: Record<string, unknown> | undefined;
}

/** A trimmed string, or nothing, from a claim that may be any shape. */
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function learnerFromClaims(claims: Claims): Learner {
  const meta = claims.user_metadata ?? {};
  const email = text(claims.email) ?? null;
  return {
    id: claims.sub,
    name: text(meta.full_name) ?? text(meta.name) ?? email?.split("@")[0] ?? "you",
    email,
    avatarUrl: text(meta.avatar_url) ?? null,
  };
}

/**
 * Resolve the request's identity from a client built on `transport`.
 *
 * The client and the transport have to be the same pair: `reached` is what
 * separates "the token says nobody" from "nobody answered", and a transport
 * belonging to some other client answers a question about some other call.
 */
export async function readIdentity(
  supabase: SupabaseClient,
  transport: Transport,
): Promise<Identity> {
  try {
    const { data } = await supabase.auth.getClaims();
    if (data) return { state: "in", learner: learnerFromClaims(data.claims) };
  } catch {
    // Nothing thrown here is an answer. The auth client turns a refused or
    // abandoned request into an error result rather than a throw, so reaching
    // this at all means something further out went wrong, and the one thing
    // this must not do with that is call somebody signed out.
    return { state: "unreachable" };
  }
  return transport.reached ? { state: "out" } : { state: "unreachable" };
}
