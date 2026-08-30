import type { CSSProperties, ReactNode } from "react";
import { Mascot } from "@/components/brand";

/**
 * Three soft pastel lights, fixed behind the page content.
 *
 * They are what stops a mostly-white app reading as a spreadsheet: colour is
 * present everywhere at 5% strength, so the colour that appears at full strength
 * (a due count, a grade button) still means something. Decorative, so aria-hidden.
 */
export function Wash() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <span className="wash" style={{ background: "var(--wash-1)", width: 520, height: 520, top: -180, left: -140 }} />
      <span className="wash" style={{ background: "var(--wash-2)", width: 460, height: 460, top: 180, right: -200, opacity: 0.6 }} />
      <span className="wash" style={{ background: "var(--wash-3)", width: 420, height: 420, bottom: -200, left: "35%", opacity: 0.55 }} />
    </div>
  );
}

export function Page({ title, titleLang, lead, actions, children, eyebrow }: {
  title: string;
  /**
   * Set to "et" where the heading is the Estonian name of a grammar point
   * rather than English prose. A reference page is titled the way a course
   * titles it, and a screen reader needs telling which language to say it in.
   */
  titleLang?: string;
  lead?: string; actions?: ReactNode; children: ReactNode; eyebrow?: string;
}) {
  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-10 md:py-12">
      <header className="fade-up mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          {eyebrow && (
            <p className="label-xs mb-2" style={{ color: "var(--accent-deep)" }}>{eyebrow}</p>
          )}
          <h1 lang={titleLang} className="est text-3xl font-bold leading-[1.1] tracking-tight md:text-4xl" style={{ color: "var(--ink)" }}>
            {title}
          </h1>
          {lead && <p className="mt-2 max-w-[62ch] text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>{lead}</p>}
        </div>
        {actions}
      </header>
      {children}
    </div>
  );
}

/**
 * The text colour for a given hue's tint.
 *
 * A trap worth naming: every hue has an `-ink` token meaning "text on this
 * hue's 8% tint", but `--accent-ink` was already taken — it is the white that
 * sits on the *solid* accent button. The accent's tint ink is `--accent-deep`.
 * Anything building a token name from a tone has to come through here, or it
 * paints white text on a pale lilac tile.
 */
export function toneInk(tone: string): string {
  return tone === "accent" ? "var(--accent-deep)" : `var(--${tone}-ink)`;
}

const CARD_TONES = {
  plain: { background: "var(--surface)", borderColor: "var(--rule)" },
  accent: { background: "var(--accent-soft)", borderColor: "transparent" },
  mint: { background: "var(--mint-soft)", borderColor: "transparent" },
  butter: { background: "var(--butter-soft)", borderColor: "transparent" },
  peach: { background: "var(--peach-soft)", borderColor: "transparent" },
  blush: { background: "var(--blush-soft)", borderColor: "transparent" },
  sky: { background: "var(--sky-soft)", borderColor: "transparent" },
} as const;

export type CardTone = keyof typeof CARD_TONES;

export function Card({ children, className = "", as: Tag = "div", tone = "plain", hover, style }: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article" | "li";
  tone?: CardTone;
  /** Lifts on hover. For cards that are themselves a link or a control. */
  hover?: boolean;
  style?: CSSProperties;
}) {
  return (
    <Tag
      className={`rounded-[var(--r-lg)] border p-5 md:p-6 ${hover ? "lift" : ""} ${className}`}
      style={{
        ...CARD_TONES[tone],
        boxShadow: tone === "plain" ? "var(--shadow-sm)" : "none",
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}

/**
 * The top-level column of a page: one section under another, with air between.
 *
 * There were five rhythms doing this job. Pages stacked their sections at
 * gap-5, gap-6, gap-7, gap-8 and gap-9 depending on who wrote them, so moving
 * between Progress and Practice changed how tightly the app breathed for no
 * reason a reader could name. A rhythm nobody can predict is one more thing to
 * absorb on every screen.
 *
 * So this is the rhythm, and it is deliberately generous: 32px between one
 * section and the next, which is comfortably more than the 20px inside a card
 * and the 8px between rows in a list. Space is what says "these are separate
 * things" before a heading has to.
 *
 * It is only for the outermost column. Grids of cards, rows in a list and the
 * inside of a card keep their own tighter spacing, because proximity is what
 * says those belong together.
 */
export function Stack({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-col gap-8 ${className}`}>{children}</div>;
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="label-xs" style={{ color: "var(--ink-3)" }}>{children}</h2>
      {hint && <span className="text-xs" style={{ color: "var(--ink-3)" }}>{hint}</span>}
    </div>
  );
}

const TONES = {
  neutral: ["var(--raised)", "var(--ink-2)"],
  accent: ["var(--accent-soft)", "var(--accent-deep)"],
  good: ["var(--good-soft)", "var(--good-ink)"],
  hard: ["var(--hard-soft)", "var(--hard-ink)"],
  again: ["var(--again-soft)", "var(--again-ink)"],
  sky: ["var(--sky-soft)", "var(--sky-ink)"],
  blush: ["var(--blush-soft)", "var(--blush-ink)"],
} as const;

export function Chip({ children, tone = "neutral", title, caseSensitive, wrap }: {
  children: ReactNode; tone?: keyof typeof TONES; title?: string;
  /** Keeps the label as written — uppercasing mangles forms like `b : ∅`. */
  caseSensitive?: boolean;
  /**
   * Lets a chip run onto a second line instead of holding one.
   *
   * A chip is a short label, so not wrapping is the right default and stays
   * the default. It is wrong for the one place a chip carries a dictionary
   * gloss: those are as long as the word needs, and "gymnasium, secondary
   * school, high school" is 404px of unbreakable line inside a 350px card. It
   * pushed 76px of the exam paper off the side of a 390px phone, and only
   * once the course dictionary replaced the shorter seeded glosses, so the
   * markup had been correct about everything except how long a real gloss is.
   */
  wrap?: boolean;
}) {
  const [bg, fg] = TONES[tone];
  return (
    <span
      title={title}
      className={`label-xs inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${
        wrap ? "max-w-full whitespace-normal" : "whitespace-nowrap"
      }`}
      style={{ background: bg, color: fg, textTransform: caseSensitive ? "none" : undefined }}
    >
      {children}
    </span>
  );
}

/** Empty state. Every view has one — a view without an empty state is not finished. */
export function Empty({ title, body, action, mood = "thinking" }: {
  title: string; body: string; action?: ReactNode; mood?: "happy" | "thinking" | "cheer";
}) {
  return (
    <div
      className="pop-in relative overflow-hidden rounded-[var(--r-xl)] border border-dashed px-6 py-12 text-center"
      style={{ borderColor: "var(--rule)", background: "var(--surface)" }}
    >
      <span
        aria-hidden
        className="wash"
        style={{ background: "var(--wash-1)", width: 260, height: 260, top: -120, left: "50%", marginLeft: -130, opacity: 0.5 }}
      />
      <div className="relative">
        <Mascot size={54} mood={mood} className="mx-auto float" />
        <p className="est mt-4 text-xl font-bold" style={{ color: "var(--ink)" }}>{title}</p>
        <p className="mx-auto mt-2 max-w-[48ch] text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>{body}</p>
        {action && <div className="mt-6 flex justify-center">{action}</div>}
      </div>
    </div>
  );
}

export function Stat({ value, label, tone, icon }: {
  value: ReactNode; label: string; tone?: string; icon?: ReactNode;
}) {
  return (
    <div>
      {icon && <div className="mb-2">{icon}</div>}
      <div className="est tnum text-3xl font-bold leading-none tracking-tight" style={{ color: tone ?? "var(--ink)" }}>
        {value}
      </div>
      <div className="label-xs mt-2" style={{ color: "var(--ink-3)" }}>{label}</div>
    </div>
  );
}

/**
 * A stat in its own pastel tile. Used where the numbers *are* the content
 * (Today, the session summaries) rather than a footnote to it.
 */
export function StatTile({ value, label, tone = "accent", icon, hint }: {
  value: ReactNode; label: string; tone?: Exclude<CardTone, "plain">; icon?: ReactNode; hint?: string;
}) {
  // The ink, not the hue: a tile's label and figure sit on that hue's own tint,
  // where the hue itself lands near 2.5:1 (see the token block in globals.css).
  const fg = {
    accent: "var(--accent-deep)", mint: "var(--mint-ink)", butter: "var(--butter-ink)",
    peach: "var(--peach-ink)", blush: "var(--blush-ink)", sky: "var(--sky-ink)",
  }[tone];

  return (
    <div
      className="flex flex-col gap-1 rounded-[var(--r)] px-3 py-3 sm:px-4 sm:py-3.5"
      style={{ background: CARD_TONES[tone].background }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="label-xs min-w-0" style={{ color: fg }}>{label}</span>
        {icon && <span className="shrink-0" style={{ color: fg, opacity: 0.75 }}>{icon}</span>}
      </div>
      <span className="est tnum text-2xl font-bold leading-none" style={{ color: fg }}>{value}</span>
      {hint && <span className="text-2xs" style={{ color: fg }}>{hint}</span>}
    </div>
  );
}

/**
 * A progress ring. Used for the daily goal, unit progress and level progress,
 * which all want the same shape — a conic gradient rather than an SVG arc,
 * because it animates cheaply and needs no viewBox arithmetic.
 */
export function Ring({ pct, size = 64, thickness = 6, label, children, tone = "var(--accent)" }: {
  pct: number;
  size?: number;
  thickness?: number;
  /** Screen-reader text. Required: a bare ring says nothing without it. */
  label: string;
  children?: ReactNode;
  tone?: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div
      className="relative flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, background: `conic-gradient(${tone} ${clamped * 3.6}deg, var(--raised) 0deg)` }}
      role="img"
      aria-label={label}
    >
      <div
        className="flex items-center justify-center rounded-full"
        style={{ width: size - thickness * 2, height: size - thickness * 2, background: "var(--surface)" }}
      >
        {children}
      </div>
    </div>
  );
}

/** A horizontal progress bar with an accessible value. */
export function Meter({ pct, label, tone = "var(--accent)", height = 8 }: {
  pct: number; label: string; tone?: string; height?: number;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div
      className="w-full overflow-hidden rounded-full"
      style={{ background: "var(--raised)", height }}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${clamped}%`, background: tone }}
      />
    </div>
  );
}

/** A short, non-blocking note: a tip, a warning, a confirmation. */
export function Note({ tone = "neutral", children }: {
  tone?: keyof typeof TONES; children: ReactNode;
}) {
  const [bg, fg] = TONES[tone];
  return (
    <p className="rounded-[var(--r)] px-4 py-3 text-sm" style={{ background: bg, color: fg }}>
      {children}
    </p>
  );
}

/**
 * A loading placeholder with the shape of the thing it stands in for.
 * Every route gets one — a blank screen while data loads reads as a broken app.
 */
export function Skeleton({ className = "", height = 16 }: { className?: string; height?: number }) {
  return (
    <div
      className={`animate-pulse rounded-[var(--r)] ${className}`}
      style={{ height, background: "var(--raised)" }}
      aria-hidden
    />
  );
}
