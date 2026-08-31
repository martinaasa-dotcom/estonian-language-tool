import type { CSSProperties } from "react";

/**
 * Õ — the mascot.
 *
 * Estonian's most recognisable letter is already a round face with a squiggle on
 * top, so the mascot is just that letter taken literally: a soft ring, two eyes,
 * a tilde for hair. It carries the brand in the sidebar, on the landing page and
 * in every empty state, which is why it is a component and not an asset.
 *
 * The tilde sits clear of the head, and that is the letter rather than a
 * preference. On an õ the diacritic is a separate stroke above the bowl; this
 * one used to reach four and a half units into it, so it read as a cowlick
 * growing out of the scalp instead of a mark over a letter. Lifting it is also
 * what makes it animatable: a stroke fused to the head has nothing it can do,
 * and a stroke floating above one can breathe.
 *
 * The gradient is in `userSpaceOnUse` over the whole mark, not the default
 * `objectBoundingBox`. Painted per element, the tilde ran the full violet to
 * blush ramp across its own 22 units while the head beneath it was still
 * violet, so the two pieces were lit differently. Touching the head that was
 * invisible. Clear of it, it is the first thing anybody would see.
 */
export function Mascot({
  size = 40,
  className = "",
  style,
  animate = true,
  mood = "happy",
}: {
  size?: number;
  className?: string;
  style?: CSSProperties;
  /** Slow idle blink and the tilde's drift. Off wherever the mark is a label
   *  rather than a character: a chat avatar repeated down a thread, the offline
   *  screen, anything favicon-sized. */
  animate?: boolean;
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
        <linearGradient id="mascot-face" gradientUnits="userSpaceOnUse" x1="12" y1="6" x2="52" y2="58">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--blush)" />
        </linearGradient>
      </defs>

      {/* The bowl of the õ. */}
      <circle cx="32" cy="40" r="18" fill="url(#mascot-face)" />
      <circle cx="32" cy="40" r="8.1" fill="var(--surface)" opacity="0.16" />

      {/* The tilde, worn as a tuft of hair, and the only part that moves. */}
      <path
        d="M21 11.65q5.5-6.5 11 0t11 0"
        fill="none"
        stroke="url(#mascot-face)"
        strokeWidth="4.2"
        strokeLinecap="round"
        style={
          animate
            ? {
                animation: `tilde-drift ${mood === "cheer" ? "1.9s" : "3.4s"} ease-in-out infinite`,
                transformOrigin: "32px 11.65px",
              }
            : undefined
        }
      />

      {/* Eyes and cheeks. */}
      <g
        fill="var(--surface)"
        style={animate ? { animation: "blink 5.5s ease-in-out infinite", transformOrigin: "32px 37px" } : undefined}
      >
        <circle cx="26" cy="37" r="2.9" />
        <circle cx="38" cy="37" r="2.9" />
      </g>
      <g fill="var(--surface)" opacity="0.35">
        <circle cx="22.1" cy="43.4" r="2.2" />
        <circle cx="41.9" cy="43.4" r="2.2" />
      </g>

      {mood === "thinking" ? (
        <path d="M26.8 45.4h10.4" stroke="var(--surface)" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      ) : (
        <path
          d={mood === "cheer" ? "M25.8 44.4c2.2 4.4 10.2 4.4 12.4 0" : "M26.6 45.4c1.9 3.2 8.9 3.2 10.8 0"}
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
        <span lang="et" className="est text-xl font-bold leading-none tracking-tight" style={{ color: "var(--ink)" }}>
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
