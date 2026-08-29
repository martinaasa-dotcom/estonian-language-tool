"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/Button";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/auth/access";

/**
 * The three ways a visitor arrives here: fresh, bounced by the allowlist, or
 * after an OAuth exchange that failed. Each says something different, because
 * "sign-in failed" when the real answer is "you are not on the list" sends
 * people round the loop again.
 */
export function SignInForm() {
  const params = useSearchParams();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const denied = params.get("denied") === "1";
  const failed = params.get("error") === "1";

  async function signInWithGoogle() {
    setPending(true);
    setError(null);
    const supabase = createClient();
    // Narrowed on the way out as well as on the way back: a link handed to a
    // learner should not be able to aim the post-sign-in redirect off-site.
    const next = safeNext(params.get("next"));
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setError(error.message);
      setPending(false);
    }
  }

  return (
    <>
      {denied && (
        <p
          role="alert"
          className="max-w-sm rounded-lg px-4 py-3 text-center text-[14px]"
          style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}
        >
          That account is not on the list for this site. If you think it should be,
          ask whoever runs it to add your address.
        </p>
      )}
      {failed && !denied && (
        <p role="alert" className="text-[14px]" style={{ color: "var(--again)" }}>
          Sign-in did not complete. Please try again.
        </p>
      )}
      <Button variant="primary" onClick={signInWithGoogle} disabled={pending}>
        {pending ? "Redirecting…" : "Continue with Google"}
      </Button>
      {error && (
        <p role="alert" className="text-[14px]" style={{ color: "var(--again)" }}>
          {error}
        </p>
      )}
    </>
  );
}
