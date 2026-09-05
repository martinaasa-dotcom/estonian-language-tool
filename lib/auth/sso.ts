/**
 * Whether a company can bring its own identity provider, and for which addresses.
 *
 * A workplace running a pilot has one way in already and it is the wrong shape
 * for them: Google is somebody else's account and a mailed link is a message in
 * an inbox their security team would rather nobody clicked. What they have is a
 * SAML provider they already sign into every morning, and Supabase can speak to
 * it. What this app has to decide is the small half of that: which email domains
 * belong to that provider, so somebody typing a work address is sent there
 * rather than being mailed a link.
 *
 * The provider itself is set up in the Supabase dashboard with the service role
 * key, outside this repository, which is why nothing here holds a certificate or
 * a metadata URL. One variable names the domains, and `signInWithSSO` is handed
 * one of them.
 *
 * Pure: no React, no Next, no Prisma, no database. Env arrives as a parameter
 * with a `process.env` default, exactly as `readAccessPolicy` takes it, so a
 * test states the deployment it is talking about rather than inheriting the
 * machine it runs on.
 */

/**
 * Splits a comma or whitespace separated env list into lowercase entries.
 *
 * The same parsing as `lib/auth/access.ts`, deliberately not imported from it:
 * that one is a private helper of a module about who may sign in, and this is a
 * module about how they do it. Two lines rather than a shared export whose two
 * callers would then have to agree about a change neither of them wanted.
 */
function envList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export interface SsoPolicy {
  /** Domains whose addresses go to an identity provider, without the "@". */
  domains: string[];
}

/** Just the one variable this module reads, in the shape `AccessEnv` takes. */
export interface SsoEnv {
  SSO_DOMAINS?: string | undefined;
  [key: string]: string | undefined;
}

export function readSsoPolicy(env: SsoEnv = process.env): SsoPolicy {
  return { domains: envList(env.SSO_DOMAINS).map((d) => d.replace(/^@/, "")) };
}

/**
 * Whether this deployment has enterprise sign-in at all.
 *
 * Read on the server and passed down as an answer rather than as an env var,
 * because a screen offering a door nobody configured is a dead end wearing a
 * button.
 */
export function ssoConfigured(env: SsoEnv = process.env): boolean {
  return readSsoPolicy(env).domains.length > 0;
}

/**
 * The configured domain this address belongs to, or null.
 *
 * The domain is taken from the *last* `@` and compared whole, which is
 * `isAllowedEmail`'s rule and matters here for the same reason: a suffix test
 * would send `someone@evilkool.ee` off to `kool.ee`'s identity provider, which
 * is a stranger being handed a company's sign-in page.
 */
export function ssoDomainFor(
  email: string | null | undefined,
  policy: SsoPolicy = readSsoPolicy(),
): string | null {
  if (!email) return null;
  const normalised = email.trim().toLowerCase();
  const at = normalised.lastIndexOf("@");
  if (at <= 0 || at === normalised.length - 1) return null;
  const domain = normalised.slice(at + 1);
  return policy.domains.includes(domain) ? domain : null;
}
