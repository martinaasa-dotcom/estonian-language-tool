"use client";

import { useEffect, useRef } from "react";
import { Mascot } from "@/components/brand";

/**
 * The mascot, watching the pointer.
 *
 * A separate client component rather than a flag inside `Mascot`, because the
 * mark is drawn on nearly every screen in the app and a pointer listener does
 * not belong in any of them. This one is used where the mascot is large and is
 * the thing you are looking at: the landing page's closing panel and sign-in.
 *
 * The eyes are aimed by two custom properties on the wrapper. They inherit down
 * into the SVG, so nothing here reaches into the mark's own geometry, and the
 * mark stays one drawing shared with the four icon files.
 *
 * Two details that are decisions rather than defaults. The travel is capped at
 * 1.7 user units, which is a little over half an eye's radius: further and the
 * eyes leave the face. And it settles once the pointer is a few hundred pixels
 * away rather than tracking to the edge of the screen, because a face that
 * keeps staring from across a page is unsettling rather than friendly.
 */
export function MascotWatch({
  size = 68,
  className = "",
  mood = "happy",
}: {
  size?: number;
  className?: string;
  mood?: "happy" | "thinking" | "cheer";
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let pending: PointerEvent | null = null;
    let frame = 0;

    // getBoundingClientRect in a pointermove handler forces a reflow on every
    // event, so the read happens once per frame instead.
    const apply = () => {
      frame = 0;
      const e = pending;
      pending = null;
      if (!e) return;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const distance = Math.hypot(dx, dy);
      if (distance < 1) return;
      const reach = Math.min(1, distance / 260);
      const k = (1.7 * reach) / distance;
      el.style.setProperty("--watch-x", `${(dx * k).toFixed(2)}px`);
      el.style.setProperty("--watch-y", `${(dy * k * 0.7).toFixed(2)}px`);
    };

    const onMove = (e: PointerEvent) => {
      pending = e;
      if (!frame) frame = requestAnimationFrame(apply);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <span ref={ref} className={className} style={{ display: "inline-block", lineHeight: 0 }}>
      <Mascot size={size} mood={mood} watch />
    </span>
  );
}
