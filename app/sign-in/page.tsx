import Link from "next/link";
import { BookOpen, GraduationCap, Sparkles } from "lucide-react";
import { supabaseConfigured } from "@/lib/auth/mode";
import { SignInForm } from "./SignInForm";

export const dynamic = "force-dynamic";

const PITCH = [
  { icon: BookOpen, text: "A dictionary that answers with the whole paradigm, not just a translation." },
  { icon: GraduationCap, text: "Flashcards scheduled by FSRS, plus speed rounds, listening and match games." },
  { icon: Sparkles, text: "Anu explains the grammar — and never invents an Estonian form." },
];

export default function SignInPage() {
  const configured = supabaseConfigured();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-5 py-16">
      <div className="text-center">
        <h1 lang="et" className="est text-[38px] font-bold leading-none" style={{ color: "var(--ink)" }}>
          Kodukeel
        </h1>
        <p className="mt-2 text-[15px]" style={{ color: "var(--ink-2)" }}>
          Learn Estonian the way it is actually taught — by its cases.
        </p>
      </div>

      <ul className="flex max-w-[46ch] flex-col gap-3">
        {PITCH.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-3 text-[14px]" style={{ color: "var(--ink-2)" }}>
            <Icon size={17} aria-hidden className="mt-0.5 shrink-0" style={{ color: "var(--accent)" }} />
            {text}
          </li>
        ))}
      </ul>

      {configured ? (
        <SignInForm />
      ) : (
        <div
          className="max-w-[52ch] rounded-lg border p-5 text-center"
          style={{ borderColor: "var(--rule)", background: "var(--surface)" }}
        >
          <p className="text-[14px]" style={{ color: "var(--ink-2)" }}>
            This copy is running in local mode — no accounts, no sign-in, everything stored in the
            database on this machine. Add <code className="text-[13px]">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
            and <code className="text-[13px]">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to your{" "}
            <code className="text-[13px]">.env</code> to turn on Google sign-in and per-person decks.
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex rounded-md border px-4 py-2 text-[14px] font-medium"
            style={{ borderColor: "var(--accent)", background: "var(--accent)", color: "var(--accent-ink)" }}
          >
            Start studying
          </Link>
        </div>
      )}

      <p className="max-w-[46ch] text-center text-[12px]" style={{ color: "var(--ink-3)" }}>
        Dictionary data from Ekilex (Institute of the Estonian Language, CC BY 4.0). Speech from the
        University of Tartu.
      </p>
    </main>
  );
}
