"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { createClient } from "@/lib/supabase/client";
import { ssoDomainFor } from "@/lib/auth/sso";

/**
 * Three ways in, and the second and third exist because the first excludes people.
 *
 * Google was the only door here, which is fine for a class that already has
 * school accounts and is a wall for everybody else: somebody with no Google
 * account, or unwilling to attach one to a language app, could not reach the
 * product at all. A mailed link asks for an address and nothing else.
 *
 * Google stays the loud action, because it is one press and no waiting, and
 * the mailed link is the quiet one underneath. Both land on the same
 * `/auth/callback`, so the allowlist and the `next=` narrowing are checked in
 * exactly one place for both.
 *
 * The mailed half is drawn by default and a deployment whose mail does not
 * go out hides it with `EMAIL_SIGN_IN="off"`. The reasoning for that being
 * the way round it is lives on the page that reads the switch.
 *
 * THE THIRD WAY IS THE SAME BOX, NOT A THIRD BUTTON. A company running a
 * pilot signs in through its own provider, and the one thing this screen
 * needs to know is whether the address somebody typed belongs to it. So the
 * form takes a work address like any other and `ssoDomainFor` decides where
 * it goes: to the identity provider where the domain is one the deployment
 * configured, and to the mailed link otherwise. A button labelled "single
 * sign-on" beside the other two would be a door that refuses most of the
 * people who press it, and the domains are read on the server so this
 * component never reaches for the environment.
 *
 * `signInWithSSO` hands back a URL and does not follow it, which is the one
 * place it differs from the two calls above, so the redirect is ours to make.
 *
 * THE LINK HAS TO BE OPENED IN THIS BROWSER, and the screen says so rather
 * than letting somebody find out. `signInWithOtp` mints a PKCE verifier and
 * leaves it in a cookie here, so a link forwarded to a phone arrives at a
 * browser with nothing to exchange the code against. That is a property of
 * the flow rather than a bug, and the one sentence explaining it is cheaper
 * than the dead end it prevents.
 */
export function SignInForm({
  emailLink,
  ssoDomains = [],
}: {
  emailLink: boolean;
  /** Domains this deployment has an identity provider for. Empty means none. */
  ssoDomains?: readonly string[];
}) {
  const [pending, setPending] = useState<"google" | "email" | "sso" | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The address we mailed, which is also the flag that we mailed anything. */
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  const ssoPolicy = useMemo(() => ({ domains: [...ssoDomains] }), [ssoDomains]);
  const sso = ssoDomains.length > 0;
  /** The provider this address would go to, recomputed as they type. */
  const ssoDomain = sso ? ssoDomainFor(email, ssoPolicy) : null;

  /** Where the provider sends somebody back to, carrying the page they wanted. */
  function callbackUrl(): string {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next") ?? "/";
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  }

  async function signInWithGoogle() {
    setPending("google");
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (error) {
      setError(`${error.message}. If this keeps happening, Google sign-in may not be turned on for this copy yet.`);
      setPending(null);
    }
  }

  /**
   * Hand somebody over to their company's provider.
   *
   * Unlike the other two, this call returns a URL and stays where it is, so
   * nothing happens unless we go. A response with neither a URL nor an error
   * is the one case that would otherwise look like a button that did nothing,
   * and it gets a sentence of its own.
   */
  async function signInWithSso(domain: string) {
    setPending("sso");
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithSSO({
      domain,
      options: { redirectTo: callbackUrl() },
    });
    if (error) {
      setError(`${error.message}. If this keeps happening, ${domain} may not be set up for single sign-on here yet.`);
      setPending(null);
      return;
    }
    if (!data?.url) {
      setError(`We could not reach the sign-in page for ${domain}. Try again, and tell whoever set this up if it keeps happening.`);
      setPending(null);
      return;
    }
    window.location.assign(data.url);
  }

  async function continueWithEmail(event: React.FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (!address) return;
    const domain = ssoDomainFor(address, ssoPolicy);
    if (domain) return signInWithSso(domain);
    if (!emailLink) {
      setError("That address is not one this copy signs in through a company provider. Use Google above, or ask whoever set this up.");
      return;
    }
    setPending("email");
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: callbackUrl() },
    });
    setPending(null);
    if (error) {
      setError(`${error.message}. If this keeps happening, email sign-in may not be turned on for this copy yet.`);
      return;
    }
    setSentTo(address);
  }

  if (sentTo) {
    return (
      <div className="rounded-[var(--r-lg)] p-5 text-left" style={{ background: "var(--raised)" }}>
        <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
          Check your email
        </p>
        <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
          We sent a link to <span style={{ color: "var(--ink)" }}>{sentTo}</span>. Open it in this
          browser and you are in. It stops working after an hour.
        </p>
        <button
          type="button"
          onClick={() => { setSentTo(null); setError(null); }}
          className="tap-tint mt-3 rounded-[var(--r)] text-sm font-semibold underline underline-offset-2"
          style={{ color: "var(--accent-deep)" }}
        >
          Use a different address
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/*
        `size="lg"` rather than a padding of its own. The ad-hoc `px-6 py-3`
        this carried put the button at 41px tall on a 360px phone, under the
        44px floor every other control in the app clears, and nothing had ever
        measured it: in local mode this screen draws a panel about local mode
        instead, so no browser suite reached the button until
        `scripts/test-signin.mjs` did.
      */}
      <Button
        variant="primary"
        size="lg"
        onClick={signInWithGoogle}
        disabled={pending !== null}
        className="w-full"
      >
        {pending === "google" ? "Redirecting…" : "Continue with Google"}
      </Button>

      {(emailLink || sso) && (
        <>
          <div className="flex items-center gap-3" aria-hidden>
            <span className="h-px flex-1" style={{ background: "var(--rule-soft)" }} />
            <span className="text-xs font-medium" style={{ color: "var(--ink-3)" }}>or</span>
            <span className="h-px flex-1" style={{ background: "var(--rule-soft)" }} />
          </div>

          <form onSubmit={continueWithEmail} className="text-left">
            <label htmlFor="sign-in-email" className="label-xs mb-2 block" style={{ color: "var(--ink-3)" }}>
              {sso ? "Your email or work address" : "Your email address"}
            </label>
            <input
              id="sign-in-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="field-lg w-full text-sm"
              style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
            />
            <Button
              type="submit"
              variant="secondary"
              size="lg"
              disabled={pending !== null || email.trim() === ""}
              className="mt-3 w-full"
            >
              {pending === "email" ? "Sending…" : null}
              {pending === "sso" ? "Taking you there…" : null}
              {pending === null
                ? ssoDomain
                  ? "Continue with your work account"
                  : emailLink
                    ? "Email me a link"
                    : "Continue"
                : null}
            </Button>
            {/*
              The hint says what the box will do with what is in it, and it
              changes once the address says which. Two sentences describing
              both doors at once is the reader working out which half is
              about them.
            */}
            <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
              {ssoDomain
                ? `We will send you to the ${ssoDomain} sign-in you already use.`
                : emailLink
                  ? sso
                    ? "No password to make up or forget. A work address goes to your company sign-in, and anything else gets a link to open in this browser."
                    : "No password to make up or forget. Open the link in this browser."
                  : "Use the work address your company signs in with."}
            </p>
          </form>
        </>
      )}

      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--again-ink)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
