import type { ReactNode } from "react";

export function Page({ title, lead, actions, children }: {
  title: string; lead?: string; actions?: ReactNode; children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-4xl px-5 py-8 md:px-10 md:py-12">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="est text-[30px] font-bold leading-tight tracking-tight" style={{ color: "var(--ink)" }}>
            {title}
          </h1>
          {lead && <p className="mt-1.5 max-w-[60ch] text-[14.5px]" style={{ color: "var(--ink-2)" }}>{lead}</p>}
        </div>
        {actions}
      </header>
      {children}
    </div>
  );
}

export function Card({ children, className = "", as: Tag = "div" }: {
  children: ReactNode; className?: string; as?: "div" | "section" | "article" | "li";
}) {
  return (
    <Tag
      className={`rounded-lg border p-5 ${className}`}
      style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow)" }}
    >
      {children}
    </Tag>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="label-xs" style={{ color: "var(--ink-3)" }}>{children}</h2>
      {hint && <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>{hint}</span>}
    </div>
  );
}

const TONES = {
  neutral: ["var(--raised)", "var(--ink-2)"],
  accent: ["var(--accent-soft)", "var(--accent)"],
  good: ["var(--good-soft)", "var(--good)"],
  hard: ["var(--hard-soft)", "var(--hard)"],
  again: ["var(--again-soft)", "var(--again)"],
} as const;

export function Chip({ children, tone = "neutral", title, caseSensitive }: {
  children: ReactNode; tone?: keyof typeof TONES; title?: string;
  /** Keeps the label as written — uppercasing mangles forms like `b : ∅`. */
  caseSensitive?: boolean;
}) {
  const [bg, fg] = TONES[tone];
  return (
    <span
      title={title}
      className="label-xs inline-flex items-center gap-1.5 rounded px-2 py-1 whitespace-nowrap"
      style={{ background: bg, color: fg, textTransform: caseSensitive ? "none" : undefined }}
    >
      {children}
    </span>
  );
}

/** Empty state. Every view has one — a view without an empty state is not finished. */
export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div
      className="rounded-lg border border-dashed px-6 py-12 text-center"
      style={{ borderColor: "var(--rule)" }}
    >
      <p className="est text-[19px] font-semibold" style={{ color: "var(--ink)" }}>{title}</p>
      <p className="mx-auto mt-2 max-w-[46ch] text-[14px]" style={{ color: "var(--ink-2)" }}>{body}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function Stat({ value, label, tone }: { value: ReactNode; label: string; tone?: string }) {
  return (
    <div>
      <div className="est tnum text-[30px] font-bold leading-none" style={{ color: tone ?? "var(--ink)" }}>
        {value}
      </div>
      <div className="label-xs mt-2" style={{ color: "var(--ink-3)" }}>{label}</div>
    </div>
  );
}
