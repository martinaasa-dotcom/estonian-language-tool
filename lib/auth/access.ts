/**
 * Who may sign in, and where they may be sent afterwards.
 *
 * Both functions are pure and exhaustively tested: they are the two places where
 * a value the caller controls decides something security-relevant, and neither
 * should ever need a database to make up its mind.
 */

/**
 * The characters RFC 3986 allows in a path, query or fragment.
 *
 * Written as an allowlist rather than a list of things to reject, because the
 * rejection list is the one that is quietly incomplete: it has to anticipate
 * backslashes, tabs, newlines, nulls and whatever the next parser differential
 * turns out to be. Anything outside this set means the value did not come from
 * a link this app generated.
 */
const SAFE_PATH = /^\/[A-Za-z0-9\-._~%!$&'()*+,;=:@/?#[\]]*$/;

/** A scheme (`javascript:`, `data:`) hiding after any number of leading slashes. */
const HIDDEN_SCHEME = /^\/+[A-Za-z][A-Za-z0-9+.-]*:/;

/**
 * Narrows an OAuth `next=` parameter to a path on this site.
 *
 * `new URL(next, origin)` looks like it resolves relative to the origin, but an
 * absolute URL wins over the base — so `?next=https://evil.example` produced a
 * redirect off-site carrying a freshly minted session. Anything that is not a
 * plain rooted path is discarded rather than repaired; no legitimate caller
 * needs one.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next) return "/";
  // Must start with exactly one "/". "//host" and "/\host" are protocol-relative
  // URLs that browsers happily send to another origin.
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  if (!SAFE_PATH.test(next)) return "/";
  // ":" is legal in a path segment, so a scheme has to be ruled out separately.
  if (HIDDEN_SCHEME.test(next)) return "/";
  return next;
}

/** Splits a comma or whitespace separated env list into lowercase entries. */
function envList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export interface AccessPolicy {
  /** Exact addresses that may sign in. */
  emails: string[];
  /** Domains whose addresses may sign in, without the "@". */
  domains: string[];
  /** True when no allowlist is configured and sign-up is open to anyone. */
  open: boolean;
}

/**
 * Just the two variables this module reads, so a test can pass a plain object
 * instead of casting a whole `ProcessEnv` into being.
 */
export interface AccessEnv {
  ALLOWED_EMAILS?: string | undefined;
  ALLOWED_EMAIL_DOMAINS?: string | undefined;
  [key: string]: string | undefined;
}

export function readAccessPolicy(env: AccessEnv = process.env): AccessPolicy {
  const emails = envList(env.ALLOWED_EMAILS);
  const domains = envList(env.ALLOWED_EMAIL_DOMAINS).map((d) => d.replace(/^@/, ""));
  return { emails, domains, open: emails.length === 0 && domains.length === 0 };
}

/**
 * Whether this address may use the app.
 *
 * Open by default: this is a public language tool, and the per-user AI quota in
 * `lib/usage` — not a guest list — is what stops an open door becoming an open
 * bill. Setting either env var turns the same deployment into a private one for
 * a class or a family, which is the other way people run it.
 *
 * The domain is taken from the *last* `@`, which is where a mail address's
 * domain actually lives, and compared whole. A suffix test would admit
 * `attacker@evilkool.ee` against an allowlist of `kool.ee`.
 */
export function isAllowedEmail(
  email: string | null | undefined,
  policy: AccessPolicy = readAccessPolicy(),
): boolean {
  if (policy.open) return true;
  if (!email) return false;
  const normalised = email.trim().toLowerCase();
  const at = normalised.lastIndexOf("@");
  if (at <= 0 || at === normalised.length - 1) return false;
  if (policy.emails.includes(normalised)) return true;
  return policy.domains.includes(normalised.slice(at + 1));
}
