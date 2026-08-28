"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/Button";
import { Mascot } from "@/components/brand";
import { createClient } from "@/lib/supabase/client";

const PROMISES = [
  "Your deck, your history, your account",
  "Everything exports as JSON, any time",
  "No card, no trial countdown",
];

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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <span className="wash" style={{ background: "var(--wash-1)", width: 520, height: 520, top: -200, left: -120 }} />
        <span className="wash" style={{ background: "var(--wash-2)", width: 460, height: 460, bottom: -220, right: -140, opacity: 0.65 }} />
      </div>

      <div className="relative w-full max-w-[420px]">
        <Link
          href="/welcome"
          className="mb-6 inline-flex items-center gap-1.5 text-[13.5px] font-medium transition-opacity hover:opacity-60"
          style={{ color: "var(--ink-3)" }}
        >
          <ArrowLeft size={14} aria-hidden /> Back to the tour
        </Link>

        <div
          className="pop-in rounded-[var(--r-xl)] border p-8 text-center"
          style={{ background: "var(--surface)", borderColor: "var(--rule)", boxShadow: "var(--shadow-lg)" }}
        >
          <Mascot size={62} className="float mx-auto" />
          <h1 className="est mt-5 text-[28px] font-bold leading-tight tracking-tight" style={{ color: "var(--ink)" }}>
            Tere tulemast tagasi
          </h1>
          <p className="mx-auto mt-2 max-w-[34ch] text-[14.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
            Sign in to reach your dictionary, your deck and every review you have ever done.
          </p>

          <Button
            variant="primary"
            size="lg"
            onClick={() => void signInWithGoogle()}
            disabled={pending}
            className="mt-7 w-full"
          >
            {pending ? "Redirecting…" : "Continue with Google"}
          </Button>

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-[var(--r)] px-4 py-2.5 text-[13.5px]"
              style={{ background: "var(--again-soft)", color: "var(--again)" }}
            >
              {error}
            </p>
          )}

          <ul className="mt-7 flex flex-col gap-2 border-t pt-6 text-left" style={{ borderColor: "var(--rule-soft)" }}>
            {PROMISES.map((p) => (
              <li key={p} className="flex items-center gap-2.5 text-[13.5px]" style={{ color: "var(--ink-2)" }}>
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                  style={{ background: "var(--mint-soft)", color: "var(--mint)" }}
                >
                  <Check size={12} strokeWidth={3} aria-hidden />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
