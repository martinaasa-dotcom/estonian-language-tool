"use client";

import Link from "next/link";
import type { ComponentProps, CSSProperties, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft";
type Size = "sm" | "md" | "lg";

/**
 * Buttons are fully rounded, and only the primary one carries the gradient —
 * one loud action per screen, everything else quiet. `press` gives every button
 * the same small physical dip on click, which is most of what makes the app feel
 * responsive rather than merely fast.
 */
const STYLES: Record<Variant, CSSProperties & { className?: string }> = {
  primary: {
    color: "var(--accent-ink)",
    borderColor: "transparent",
    boxShadow: "var(--shadow-accent)",
    className: "grad-accent",
  },
  secondary: { background: "var(--surface)", color: "var(--ink)", borderColor: "var(--rule)", boxShadow: "var(--shadow-sm)" },
  soft: { background: "var(--accent-soft)", color: "var(--accent-deep)", borderColor: "transparent" },
  ghost: { background: "transparent", color: "var(--ink-2)", borderColor: "transparent" },
  danger: { background: "var(--again-soft)", color: "var(--again)", borderColor: "transparent" },
};

const SIZES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-[13px]",
  md: "px-4 py-2.5 text-[14px]",
  lg: "px-6 py-3.5 text-[15.5px]",
};

const base =
  "press inline-flex items-center justify-center gap-2 rounded-full border font-semibold " +
  "transition-all duration-200 hover:brightness-[1.04] hover:-translate-y-px " +
  "disabled:pointer-events-none disabled:opacity-45";

function split(variant: Variant) {
  const { className = "", ...style } = STYLES[variant];
  return { extraClass: className, style: style as CSSProperties };
}

export function Button({
  variant = "secondary", size = "md", className = "", children, ...rest
}: ComponentProps<"button"> & { variant?: Variant; size?: Size; children: ReactNode }) {
  const { extraClass, style } = split(variant);
  return (
    <button {...rest} className={`${base} ${SIZES[size]} ${extraClass} ${className}`} style={style}>
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "secondary", size = "md", className = "", children, href, target, rel,
}: {
  variant?: Variant; size?: Size; className?: string; children: ReactNode;
  href: string; target?: string; rel?: string;
}) {
  const { extraClass, style } = split(variant);
  return (
    <Link href={href} target={target} rel={rel} className={`${base} ${SIZES[size]} ${extraClass} ${className}`} style={style}>
      {children}
    </Link>
  );
}
