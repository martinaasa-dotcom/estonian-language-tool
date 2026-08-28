"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { createClient } from "@/lib/supabase/client";

export default function SignInPage() {
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
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Kodukeel</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--ink-3)" }}>
          Sign in to reach your dictionary, deck and review history.
        </p>
      </div>
      <Button variant="primary" onClick={signInWithGoogle} disabled={pending}>
        {pending ? "Redirecting…" : "Continue with Google"}
      </Button>
      {error && (
        <p role="alert" className="text-[14px]" style={{ color: "var(--again)" }}>
          {error}
        </p>
      )}
    </main>
  );
}
