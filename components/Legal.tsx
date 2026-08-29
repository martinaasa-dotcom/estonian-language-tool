import type { ReactNode } from "react";
import Link from "next/link";

/** Shared shell for the policy pages, which are reachable without a session. */
export function Legal({ title, updated, children }: {
  title: string; updated: string; children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-10 md:px-8 md:py-16">
      <Link
        href="/"
        className="label-xs inline-block"
        style={{ color: "var(--ink-3)" }}
      >
        Kodukeel
      </Link>
      <h1
        className="est mt-3 text-3xl font-bold leading-tight tracking-tight"
        style={{ color: "var(--ink)" }}
      >
        {title}
      </h1>
      <p className="mt-1.5 text-sm" style={{ color: "var(--ink-3)" }}>
        Last updated {updated}
      </p>
      <div className="mt-8 space-y-8">{children}</div>
      <p className="mt-14 text-sm" style={{ color: "var(--ink-3)" }}>
        <Link href="/privacy" className="underline underline-offset-2">Privacy</Link>
        {" · "}
        <Link href="/terms" className="underline underline-offset-2">Terms</Link>
        {" · "}
        <Link href="/sign-in" className="underline underline-offset-2">Sign in</Link>
      </p>
    </div>
  );
}

export function S({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="est text-[19px] font-semibold" style={{ color: "var(--ink)" }}>
        {title}
      </h2>
      <div className="mt-2.5 space-y-3">{children}</div>
    </section>
  );
}

export function P({ children }: { children: ReactNode }) {
  return (
    <p className="text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
      {children}
    </p>
  );
}
