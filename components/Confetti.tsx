"use client";

import { useState } from "react";

const COLORS = ["var(--accent)", "var(--good)", "var(--hard)", "var(--again)", "var(--easy)"];

/**
 * A short burst of falling pieces. Purely decorative (aria-hidden) and CSS-driven,
 * so `prefers-reduced-motion` — handled globally in globals.css — turns it into a
 * silent no-op rather than something that needs its own reduced-motion branch.
 */
export function Confetti({ count = 60 }: { count?: number }) {
  const [pieces] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.35,
      duration: 1.6 + Math.random() * 1.1,
      color: COLORS[i % COLORS.length],
      rotate: Math.round(Math.random() * 360),
      drift: Math.round((Math.random() - 0.5) * 140),
    })),
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-[-12px] block h-2.5 w-1.5 rounded-[1px]"
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationName: "confetti-fall",
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
            animationTimingFunction: "ease-in",
            animationFillMode: "forwards",
            "--confetti-drift": `${p.drift}px`,
            "--confetti-rotate": `${p.rotate}deg`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
