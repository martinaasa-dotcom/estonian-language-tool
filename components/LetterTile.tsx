"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import {
  leanFor, letterCharacter, letterVars, type LetterEdge,
} from "@/lib/ux/letterMotion";

/**
 * ONE OF THE FOUR LETTERS AN ENGLISH KEYBOARD HAS NOT GOT, LOOSE ON A PAGE.
 *
 * The ornament that was four spans of Tailwind on the landing page and is now
 * one component, because the moment they answer a pointer they need a listener
 * and a measurement, and four copies of a listener is four places for the
 * `removeEventListener` to be forgotten.
 *
 * TWO ELEMENTS, AND BOTH ARE LOAD-BEARING. The outer one is placed and leans;
 * the inner one wanders. A keyframe and a transition cannot share a property,
 * so a lean written onto the same element as the wander is a lean that never
 * happens. See `app/globals.css` for the pairing and why the suite that guards
 * the placement can still see both halves of it.
 *
 * IT MEASURES ITSELF ONCE, NOT ON EVERY MOVE. `getBoundingClientRect` in a
 * pointermove handler is a forced layout per event per letter, which is the
 * fault `lib/layout/navMarker.ts` was rewritten to stop making. The rectangle
 * is read on mount and again when the page scrolls or resizes, and a move is
 * then arithmetic. It is stale for at most a frame of a scroll, which for a
 * decoration is nothing.
 *
 * BOTH ELEMENTS ARE POSITIONED, and the inner one has to be. Every suite that
 * measures whether something is inside its box or drawn over something else
 * skips an element that positions itself, on the argument that a corner badge
 * or a decorative wash was put where it is deliberately. It reads the position
 * of the element itself rather than of its ancestors, so a letter whose tile
 * sat statically inside a placed wrapper would be walked as ordinary text
 * lying across a card. `inset-0` is what keeps it a decoration.
 *
 * `aria-hidden` and `pointer-events-none`, always. These are letters lying on
 * a page, not content and not controls: a screen reader that reads them out
 * says "õ ä ö ü" in the middle of a sentence about the partitive, and one that
 * took a pointer event would be a decoration swallowing a tap meant for the
 * card underneath it.
 */
/**
 * A hue's fill and its ink, which are two tokens and one character apart.
 *
 * Written out rather than built from the hue's name, because the accent is the
 * one that breaks the pattern: `--accent-ink` is the white that goes on the
 * solid button, and the ink for a word on `--accent-soft` is `--accent-deep`.
 * A tile that built its own token names would have painted that one white on
 * lilac. Peach is not here at all: it means "missed" on every other screen in
 * the app, and a decoration may not spend a colour that carries a meaning.
 */
const HUES = {
  blush: { fill: "var(--blush-soft)", ink: "var(--blush-ink)" },
  mint: { fill: "var(--mint-soft)", ink: "var(--mint-ink)" },
  sky: { fill: "var(--sky-soft)", ink: "var(--sky-ink)" },
  butter: { fill: "var(--butter-soft)", ink: "var(--butter-ink)" },
  accent: { fill: "var(--accent-soft)", ink: "var(--accent-deep)" },
} as const;

export type LetterHue = keyof typeof HUES;

export function LetterTile({
  letter,
  hue,
  edge,
  character,
  tilt,
  travel,
  room,
  delay = 0,
  reach = 260,
  pull,
  className = "",
  style,
}: {
  /** The letter itself. Estonian, and taken from the six the app already has. */
  letter: string;
  /** Which hue it wears. Peach is not on the list: it means "missed" on every
   *  other screen in the app and a decoration may not spend it. */
  hue: LetterHue;
  /** The edge of the thing it is tucked over, or null for a letter with room
   *  on every side. It decides which way it may travel and which way it leans. */
  edge: LetterEdge | null;
  /** Which of the four ways of moving. See lib/ux/letterMotion.ts. */
  character: string;
  /** Its resting slant, in degrees. */
  tilt: number;
  /** How far it may travel, in pixels, per axis. The caller's room, and the
   *  caller is the only one who knows it. */
  travel: { x: number; y: number };
  /** Scales the rock and the squash down where a placement is tight. */
  room?: number;
  /** Seconds of head start. */
  delay?: number;
  /** How near a pointer has to be before the letter notices, in pixels. */
  reach?: number;
  /** How far it goes to meet one. Defaults to the travel it already has, so a
   *  tight placement is tight for both. */
  pull?: number;
  /** Where it sits. Position and size, from the caller. */
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reachRef = useRef(reach);
  const pullRef = useRef(pull ?? Math.max(Math.abs(travel.x), Math.abs(travel.y), 6));
  const edgeRef = useRef(edge);
  reachRef.current = reach;
  pullRef.current = pull ?? Math.max(Math.abs(travel.x), Math.abs(travel.y), 6);
  edgeRef.current = edge;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let centre = { x: 0, y: 0 };
    let pending: PointerEvent | null = null;
    let frame = 0;

    const measure = () => {
      const r = el.getBoundingClientRect();
      centre = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };

    const apply = () => {
      frame = 0;
      const e = pending;
      pending = null;
      if (!e) return;
      const lean = leanFor({
        edge: edgeRef.current,
        pointer: { x: e.clientX, y: e.clientY },
        centre,
        reach: reachRef.current,
        pull: pullRef.current,
      });
      el.style.setProperty("--lean-x", `${lean.x}px`);
      el.style.setProperty("--lean-y", `${lean.y}px`);
      el.style.setProperty("--lean-turn", `${lean.turn}deg`);
    };

    const onMove = (e: PointerEvent) => {
      pending = e;
      if (!frame) frame = requestAnimationFrame(apply);
    };

    /* One read per scroll frame rather than one per pointer event. A letter
       whose rectangle is a frame out of date leans a pixel or two off, which
       is a decoration; a letter measured on every move is a forced layout on
       every move, which is the page. */
    let settling = 0;
    const remeasure = () => {
      if (settling) return;
      settling = requestAnimationFrame(() => { settling = 0; measure(); });
    };

    measure();
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", remeasure, { passive: true });
    window.addEventListener("resize", remeasure, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", remeasure);
      window.removeEventListener("resize", remeasure);
      if (frame) cancelAnimationFrame(frame);
      if (settling) cancelAnimationFrame(settling);
    };
  }, []);

  const vars = letterVars({
    character: letterCharacter(character), edge, tilt, travel, room, delay,
  });

  return (
    <span
      ref={ref}
      aria-hidden
      className={`letter-lean pointer-events-none absolute ${className}`}
      style={style}
    >
      <span
        className="drift absolute inset-0 flex items-center justify-center rounded-[var(--r-sm)] font-bold"
        style={{
          background: HUES[hue].fill,
          color: HUES[hue].ink,
          boxShadow: "var(--shadow-sm)",
          ...(vars as CSSProperties),
        }}
      >
        {letter}
      </span>
    </span>
  );
}
