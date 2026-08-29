import { Suspense } from "react";
import Link from "next/link";
import { SignInForm } from "./SignInForm";

export const metadata = { title: "Sign in · Kodukeel" };

export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Kodukeel</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--ink-3)" }}>
          Sign in to reach your dictionary, deck and review history.
        </p>
      </div>

      {/* useSearchParams needs a Suspense boundary to keep this page prerenderable. */}
      <Suspense fallback={<div className="h-10" />}>
        <SignInForm />
      </Suspense>

      <p className="text-center text-[13px]" style={{ color: "var(--ink-3)" }}>
        <Link href="/privacy" className="underline underline-offset-2">Privacy</Link>
        {" · "}
        <Link href="/terms" className="underline underline-offset-2">Terms</Link>
      </p>
    </main>
  );
}
