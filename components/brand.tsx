import type { CSSProperties } from "react";

/**
 * Õ — the mascot.
 *
 * Estonian's most recognisable letter is already a round face with a squiggle on
 * top, so the mascot is just that letter taken literally: a soft ring, two eyes,
 * a tilde for hair. It carries the brand in the sidebar, on the landing page and
 * in every empty state, which is why it is a component and not an asset.
 */
export function Mascot({
  size = 40,
  className = "",
  style,
  blink = true,
  mood = "happy",
}: {
  size?: number;
  className?: string;
  style?: CSSProperties;
  /** Slow idle blink. Off for static contexts like a favicon-sized mark. */
  blink?: boolean;
  mood?: "happy" | "thinking" | "cheer";
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      style={style}
      role="img"
      aria-label="Kodukeel"
    >
      <defs>
        <linearGradient id="mascot-face" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--blush)" />
        </linearGradient>
      </defs>

      {/* The bowl of the õ. */}
      <circle cx="32" cy="38" r="21" fill="url(#mascot-face)" />
      <circle cx="32" cy="38" r="9.5" fill="var(--surface)" opacity="0.16" />

      {/* The tilde, worn as a tuft of hair. */}
      <path
        d="M23 15.5q4.5-7.5 9 0t9 0"
        fill="none"
        stroke="url(#mascot-face)"
        strokeWidth="4.6"
        strokeLinecap="round"
      />

      {/* Eyes and cheeks. */}
      <g fill="var(--surface)" style={blink ? { animation: "blink 5.5s ease-in-out infinite", transformOrigin: "32px 35px" } : undefined}>
        <circle cx="25" cy="35" r="3.1" />
        <circle cx="39" cy="35" r="3.1" />
      </g>
      <g fill="var(--surface)" opacity="0.35">
        <circle cx="20.5" cy="42" r="2.6" />
        <circle cx="43.5" cy="42" r="2.6" />
      </g>

      {mood === "thinking" ? (
        <path d="M27 45h10" stroke="var(--surface)" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      ) : (
        <path
          d={mood === "cheer" ? "M26 43.5c2.4 4.6 9.2 4.6 11.6 0" : "M27 44c1.8 3 8.2 3 10 0"}
          stroke="var(--surface)"
          strokeWidth="2.6"
          strokeLinecap="round"
          fill="none"
        />
      )}
    </svg>
  );
}

/** The mascot plus the name, as used in the sidebar and the landing nav. */
export function Wordmark({ size = 34, subtitle }: { size?: number; subtitle?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <Mascot size={size} />
      <span className="flex flex-col">
        <span lang="et" className="text-xl font-bold leading-none tracking-tight" style={{ color: "var(--ink)" }}>
          Kodukeel
        </span>
        {subtitle && (
          <span className="label-xs mt-1" style={{ color: "var(--ink-3)" }}>
            {subtitle}
          </span>
        )}
      </span>
    </span>
  );
}
