"use client";

import { useEffect, useRef, useState } from "react";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { MascotWatch } from "@/components/MascotWatch";

/**
 * ANU, COMING DOWN THE LANDING PAGE WITH YOU.
 *
 * She is the one thing on this page nobody else offers and she was on it as a
 * paragraph and a sample question, third card of three. Inside the app she
 * sits in the corner of every screen, so this is the same seat on the one
 * screen a stranger sees: her face in the corner, her eyes on the pointer, and
 * a line of her own for whichever section the reader has reached. When the
 * page moves on she hops once, which is her keeping up rather than being
 * carried, and her mood changes with the subject: thinking over the case
 * table and the questions, cheering at the door.
 *
 * WHICH SECTION IS "REACHED" IS THE ONE MOST ON SCREEN, read through an
 * `IntersectionObserver` with a handful of thresholds rather than a scroll
 * listener, so nothing here runs on the scroll path. The hero wins on
 * arrival because it is the first thing observed, and a section takes over
 * only when more of it is visible than of the one before, which is what
 * stops her changing her line twice while two sections share the window.
 *
 * SHE IS A LINK, not a decoration, and the link goes where she lives. A
 * stranger who presses the tutor expects to talk to her, and the honest
 * answer is that she answers inside, so the target is sign-in and the label
 * says so. The bubble beside her is decoration and is marked as such: it is
 * her line for a sighted reader, and a screen reader gets the link's label
 * without a speech bubble read out over it every time the page scrolls.
 *
 * NOT ON A PHONE. Below `sm` the corner she would take is the corner the
 * page's own full-width button ends in, and a phone has no pointer for her
 * to watch; the cards still carry her. No `backdrop-filter`, because she is
 * `fixed` over content that moves, and that pairing is what CLAUDE.md
 * forbids. `bottom-notice` is the same clearance the in-app button reads, so
 * the two sit in the same place on either side of the door.
 */
export interface AnuLine {
  /** The id of the section this line belongs to. */
  readonly at: string;
  readonly mood: "happy" | "thinking" | "cheer";
  readonly text: string;
}

export function LandingAnu({ lines }: { lines: readonly AnuLine[] }) {
  const [current, setCurrent] = useState(0);
  const [hopping, setHopping] = useState(false);
  // What the observer last settled on, kept outside React so the callback
  // can compare without a state updater doing side effects for it.
  const settled = useRef(0);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const visible = new Map<string, number>();
    const targets = lines
      .map((l) => document.getElementById(l.at))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;

    const observer = new IntersectionObserver((entries) => {
      for (const e of entries) visible.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0);
      let best = -1;
      let bestId: string | null = null;
      for (const l of lines) {
        const ratio = visible.get(l.at) ?? 0;
        if (ratio > best) { best = ratio; bestId = l.at; }
      }
      if (bestId === null || best <= 0) return;
      const next = lines.findIndex((l) => l.at === bestId);
      if (next === settled.current) return;
      settled.current = next;
      setCurrent(next);
      setHopping(true);
    }, { threshold: [0, 0.15, 0.3, 0.45, 0.6, 0.75] });

    for (const el of targets) observer.observe(el);
    return () => observer.disconnect();
  }, [lines]);

  const line = lines[current] ?? lines[0];
  if (!line) return null;

  /*
    An `aside` rather than a `div`, because she sits outside `main` and the
    footer, and a link outside every landmark is content a screen reader user
    can only find by tabbing into it. axe reports it as such. A complementary
    landmark named for her is what she is: beside the page, not part of it.
  */
  return (
    <aside
      aria-label="Anu"
      className="bottom-notice fixed right-[max(1rem,env(safe-area-inset-right))] z-40 hidden flex-col items-end gap-2 sm:flex"
    >
      <p
        key={line.at}
        aria-hidden
        className="anu-say max-w-[15rem] rounded-[var(--r-lg)] rounded-br-md border px-3.5 py-2 text-sm leading-snug"
        style={{ background: "var(--surface)", borderColor: "var(--rule)", color: "var(--ink-2)", boxShadow: "var(--shadow-sm)" }}
      >
        {line.text}
      </p>
      <Link
        href="/sign-in"
        aria-label="Start learning, and ask Anu inside"
        className={`press lift flex h-14 w-14 items-center justify-center rounded-full border ${hopping ? "anu-hop" : ""}`}
        style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow-lg)" }}
        onAnimationEnd={(e) => { if (e.animationName === "anu-hop") setHopping(false); }}
      >
        <MascotWatch size={34} mood={line.mood} />
      </Link>
    </aside>
  );
}
