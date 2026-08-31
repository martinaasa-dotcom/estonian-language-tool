"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { createClient } from "@/lib/supabase/client";

/**
 * Two ways in, and the second one exists because the first excludes people.
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
 * The mailed half is drawn only when the deployment says its mail actually
 * goes out (`EMAIL_SIGN_IN`), because Supabase's built-in sender is a couple
 * of messages an hour for the whole project. The reasoning is on the page
 * that reads the switch.
 *
 * THE LINK HAS TO BE OPENED IN THIS BROWSER, and the screen says so rather
 * than letting somebody find out. `signInWithOtp` mints a PKCE verifier and
 * leaves it in a cookie here, so a link forwarded to a phone arrives at a
 * browser with nothing to exchange the code against. That is a property of
 * the flow rather than a bug, and the one sentence explaining it is cheaper
 * than the dead end it prevents.
 */
export function SignInForm({ emailLink }: { emailLink: boolean }) {
  const [pending, setPending] = useState<"google" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The address we mailed, which is also the flag that we mailed anything. */
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [email, setEmail] = useState("");

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

  async function emailALink(event: React.FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (!address) return;
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

      {emailLink && (
        <>
          <div className="flex items-center gap-3" aria-hidden>
            <span className="h-px flex-1" style={{ background: "var(--rule-soft)" }} />
            <span className="text-xs font-medium" style={{ color: "var(--ink-3)" }}>or</span>
            <span className="h-px flex-1" style={{ background: "var(--rule-soft)" }} />
          </div>

          <form onSubmit={emailALink} className="text-left">
            <label htmlFor="sign-in-email" className="label-xs mb-2 block" style={{ color: "var(--ink-3)" }}>
              Your email address
            </label>
            <input
              id="sign-in-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="w-full rounded-[var(--r-lg)] border px-4 py-3 text-sm outline-none"
              style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
            />
            <Button
              type="submit"
              variant="secondary"
              size="lg"
              disabled={pending !== null || email.trim() === ""}
              className="mt-3 w-full"
            >
              {pending === "email" ? "Sending…" : "Email me a link"}
            </Button>
            <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
              No password to make up or forget. Open the link in this browser.
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
