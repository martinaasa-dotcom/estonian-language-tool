import { useId, type CSSProperties } from "react";

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
 * growing out of the scalp instead of a mark over a letter. Clearing it is also
 * what makes it animatable: a stroke fused to the head has nothing it can do,
 * and a stroke with daylight under it can bounce.
 *
 * The gradient is in `userSpaceOnUse` over the whole mark, not the default
 * `objectBoundingBox`. Painted per element, the tilde ran the full violet to
 * blush ramp across its own 22 units while the head beneath it was still
 * violet, so the two pieces were lit differently. Touching the head that was
 * invisible. Clear of it, it is the first thing anybody would see.
 *
 * Every moving part is its own group. They all animate `transform`, and the last
 * declaration on an element wins, so the eyes can only glance and blink at once
 * by nesting one inside the other. Keyframes and the reasoning about their
 * periods live in app/globals.css.
 */
const TIMING: Record<string, { tilde: string; face: string }> = {
  happy: { tilde: "tilde-drift 4.2s ease-in-out infinite", face: "1" },
  cheer: { tilde: "tilde-hop 1.9s cubic-bezier(0.34, 1.56, 0.64, 1) infinite", face: "0.62" },
  thinking: { tilde: "tilde-sway 5.4s ease-in-out infinite", face: "1.35" },
};

export function Mascot({
  size = 40,
  className = "",
  style,
  animate = true,
  watch = false,
  mood = "happy",
}: {
  size?: number;
  className?: string;
  style?: CSSProperties;
  /** The blink, the glance, the breath, the smile and the hair. Off wherever the
   *  mark is a label rather than a character: a chat avatar repeated down a
   *  thread, the offline screen, anything favicon-sized. */
  animate?: boolean;
  /** Let the eyes be aimed from outside, through `--watch-x` and `--watch-y` on
   *  any ancestor. `components/MascotWatch.tsx` is what sets them; this stays a
   *  plain server component so the mark does not pull a listener into every
   *  page that draws it. The idle glance switches off when it is on, because two
   *  things moving the same eyes is a twitch rather than a look. */
  watch?: boolean;
  mood?: "happy" | "thinking" | "cheer";
}) {
  const t = TIMING[mood] ?? TIMING.happy!;
  /* Moods scale every facial period by one factor, so cheering speeds the whole
     face up together rather than leaving the blink at its idle rate while the
     hair hops. */
  /*
    A DOCUMENT HOLDS SEVERAL OF THESE AND `url(#id)` RESOLVES AGAINST ALL OF IT.

    The gradient's id was a fixed string, so the first element carrying it won
    for every mascot on the page. The rail draws one and the rail is
    `hidden md:flex`, so below 768 the winning gradient sat inside a
    `display: none` subtree and Chromium painted nothing with it: measured at
    390, two of them in the document with the first one hidden, which left the
    Ask Anu button in the corner of every phone screen an empty circle and the
    empty state on /suggestions two eyes floating on a white card. The brand
    mark was broken at the width this app is measured at.
  */
  const faceId = useId();

  const beat = (seconds: number) => `${(seconds * Number(t.face)).toFixed(2)}s`;
  const on = (name: string, seconds: number, origin: string): CSSProperties | undefined =>
    animate ? { animation: `${name} ${beat(seconds)} ease-in-out infinite`, transformOrigin: origin } : undefined;

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
        <linearGradient id={faceId} gradientUnits="userSpaceOnUse" x1="12" y1="6" x2="52" y2="58">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--blush)" />
        </linearGradient>
      </defs>

      {/* The bowl of the õ, and everything drawn on it, breathing as one piece so
          the features do not swim about inside the head. */}
      <g style={on("mascot-breathe", 4, "32px 40px")}>
        <circle cx="32" cy="40" r="18" fill={`url(#${faceId})`} />
        <circle cx="32" cy="40" r="8.1" fill="var(--surface)" opacity="0.16" />

        <g style={watch ? { transform: "translate(var(--watch-x, 0px), var(--watch-y, 0px))" } : undefined}>
          <g style={watch ? undefined : on("mascot-look", 7.3, "32px 37px")}>
            <g fill="var(--surface)" style={on("blink", 5.5, "32px 37px")}>
              <circle cx="26" cy="37" r="2.9" />
              <circle cx="38" cy="37" r="2.9" />
            </g>
          </g>
        </g>

        <g fill="var(--surface)" opacity="0.35">
          <circle cx="22.1" cy="43.4" r="2.2" />
          <circle cx="41.9" cy="43.4" r="2.2" />
        </g>

        {/* Thinking is a straight line, and a straight line widening is a mouth
            being stretched rather than a face pulling one, so it holds still. */}
        {mood === "thinking" ? (
          <path d="M26.8 45.4h10.4" stroke="var(--surface)" strokeWidth="2.6" strokeLinecap="round" fill="none" />
        ) : (
          <path
            d={mood === "cheer" ? "M25.8 44.4c2.2 4.4 10.2 4.4 12.4 0" : "M26.6 45.4c1.9 3.2 8.9 3.2 10.8 0"}
            stroke="var(--surface)"
            strokeWidth="2.6"
            strokeLinecap="round"
            fill="none"
            style={on("mascot-smile", 6.1, "32px 45.4px")}
          />
        )}
      </g>

      {/* The hair. The only part with daylight under it, so the only part that
          can properly move. */}
      <path
        d="M21 15.15q5.5-6.5 11 0t11 0"
        fill="none"
        stroke={`url(#${faceId})`}
        strokeWidth="4.2"
        strokeLinecap="round"
        style={animate ? { animation: t.tilde, transformOrigin: "32px 15.15px" } : undefined}
      />
    </svg>
  );
}

/**
 * The mascot plus the name, as used in the sidebar and the landing nav.
 *
 * It does not shrink and the name does not break, which is two declarations
 * rather than a preference. `overflow-wrap: anywhere` is inherited from the
 * body and counts towards min-content, so the automatic minimum of a flex item
 * holding this is one character wide: put the wordmark in a row beside anything
 * that wants the space and it gives up all of it. The landing footer is that
 * row, and it read "Kodukee" with the "l" on the line under it, which is the
 * one word on the page that may never be hyphenated or wrapped, because it is
 * a name rather than a sentence. Fixed here rather than at each caller: a
 * wordmark squeezed by its neighbour is a property of the wordmark, and the
 * next row somebody puts it in would break it again.
 */
export function Wordmark({ size = 34, subtitle }: { size?: number; subtitle?: string }) {
  return (
    <span className="flex shrink-0 items-center gap-2.5">
      <Mascot size={size} />
      <span className="flex flex-col">
        <span
          lang="et"
          className="whitespace-nowrap text-xl font-bold leading-none tracking-tight"
          style={{ color: "var(--ink)" }}
        >
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
