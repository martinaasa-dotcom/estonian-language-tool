import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { supabaseConfigured } from "@/lib/auth/mode";
import { ButtonLink } from "@/components/Button";
import { MascotWatch } from "@/components/MascotWatch";
import { SignInForm } from "./SignInForm";

export const metadata = { title: "Sign in" };

export const dynamic = "force-dynamic";

const PROMISES = [
  "A dictionary that answers with every form of the word",
  "Cards scheduled by FSRS, plus sprints, listening and match",
  "Anu explains the grammar, and never invents a form",
];

export default function SignInPage() {
  const configured = supabaseConfigured();

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <span className="wash" style={{ background: "var(--wash-1)", width: 520, height: 520, top: -200, left: -120 }} />
        <span className="wash" style={{ background: "var(--wash-2)", width: 460, height: 460, bottom: -220, right: -140, opacity: 0.65 }} />
      </div>

      <div className="relative w-full max-w-[440px]">
        <Link
          href="/welcome"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-60"
          style={{ color: "var(--ink-3)" }}
        >
          <ArrowLeft size={14} aria-hidden /> Back to the tour
        </Link>

        <div
          className="pop-in rounded-[var(--r-xl)] border p-8 text-center"
          style={{ background: "var(--surface)", borderColor: "var(--rule)", boxShadow: "var(--shadow-lg)" }}
        >
          <MascotWatch size={62} className="float mx-auto" />
          <h1 className="mt-5 text-2xl font-bold leading-tight tracking-tight" style={{ color: "var(--ink)" }}>
            Tere tulemast tagasi
          </h1>
          <p className="mx-auto mt-2 max-w-[36ch] text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
            Learn Estonian the way it is actually taught, by its cases. Sign in to reach your deck,
            your dictionary and every review you have ever done.
          </p>

          <div className="mt-7">
            {configured ? (
              <SignInForm />
            ) : (
              <div className="rounded-[var(--r-lg)] p-5 text-left" style={{ background: "var(--raised)" }}>
                <p className="text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                  This copy is running in local mode, no accounts, no sign-in, everything stored in
                  the database on this machine. Add{" "}
                  <code className="text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
                  <code className="text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to your{" "}
                  <code className="text-xs">.env</code> to turn on Google sign-in and
                  per-person decks.
                </p>
                <ButtonLink href="/" variant="primary" className="mt-4 w-full">Start studying</ButtonLink>
              </div>
            )}
          </div>

          <ul className="mt-7 flex flex-col gap-2.5 border-t pt-6 text-left" style={{ borderColor: "var(--rule-soft)" }}>
            {PROMISES.map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-sm" style={{ color: "var(--ink-2)" }}>
                <span
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                  style={{ background: "var(--mint-soft)", color: "var(--mint-ink)" }}
                >
                  <Check size={12} strokeWidth={3} aria-hidden />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>

        <p className="mx-auto mt-6 max-w-[46ch] text-center text-xs" style={{ color: "var(--ink-3)" }}>
          Estonian forms and example sentences from Ekilex (Institute of the Estonian Language,
          CC BY 4.0). English glosses from English Wiktionary (CC BY-SA 4.0). Speech from the
          University of Tartu.
        </p>
      </div>
    </main>
  );
}
