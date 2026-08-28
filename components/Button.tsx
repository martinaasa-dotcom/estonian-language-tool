"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const STYLES: Record<Variant, { background: string; color: string; border: string }> = {
  primary: { background: "var(--accent)", color: "var(--accent-ink)", border: "var(--accent)" },
  secondary: { background: "var(--surface)", color: "var(--ink)", border: "var(--rule)" },
  ghost: { background: "transparent", color: "var(--ink-2)", border: "transparent" },
  danger: { background: "var(--again-soft)", color: "var(--again)", border: "transparent" },
};

const base =
  "inline-flex items-center justify-center gap-2 rounded-md border px-3.5 py-2 text-[14px] font-medium " +
  "transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-45";

export function Button({
  variant = "secondary", className = "", children, ...rest
}: ComponentProps<"button"> & { variant?: Variant; children: ReactNode }) {
  const s = STYLES[variant];
  return (
    <button
      {...rest}
      className={`${base} ${className}`}
      style={{ background: s.background, color: s.color, borderColor: s.border }}
    >
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "secondary", className = "", children, href,
}: { variant?: Variant; className?: string; children: ReactNode; href: string }) {
  const s = STYLES[variant];
  return (
    <Link
      href={href}
      className={`${base} ${className}`}
      style={{ background: s.background, color: s.color, borderColor: s.border }}
    >
      {children}
    </Link>
  );
}
