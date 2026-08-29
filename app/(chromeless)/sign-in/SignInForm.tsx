"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { createClient } from "@/lib/supabase/client";

export function SignInForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithGoogle() {
    setPending(true);
    setError(null);
    const supabase = createClient();
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next") ?? "/";
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setError(error.message);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <Button variant="primary" onClick={signInWithGoogle} disabled={pending} className="px-6 py-3">
        {pending ? "Redirecting…" : "Continue with Google"}
      </Button>
      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--again-ink)" }}>
          {error}, if this keeps happening, the Google provider may not be enabled in Supabase yet.
        </p>
      )}
    </div>
  );
}
