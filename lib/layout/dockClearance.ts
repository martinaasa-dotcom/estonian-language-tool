"use client";

import { useLayoutEffect } from "react";

/*
  WHAT IS REALLY AT THE BOTTOM OF THE WINDOW, PUBLISHED ON <html> SO ANYTHING
  THAT HAS TO SIT CLEAR OF IT CAN ASK.

  Three notices in this app pin themselves to the bottom: the offline banner,
  the install prompt and the achievement toasts. Each used to carry its own
  offset, typed by hand against the phone tab bar as it looked that week.
  Three guesses at one measurement, and none of them knew whether the tab bar
  was even on the screen: it is `md:hidden`, and it is not rendered at all on
  the landing page, sign-in or first-run setup, which live outside the app
  shell. Every one of those pages floated a notice most of an inch up an
  otherwise empty screen.

  A MEASUREMENT RATHER THAN A SELECTOR. `:has(nav)` would answer "yes" for a
  bar that is in the DOM and drawing nothing, which is exactly what
  `md:hidden` produces on every desktop. Measuring answers no, and answers it
  again the moment the window is resized across the breakpoint.

  THE ELEMENT, NEVER A REF. Call sites hand this a callback ref, so the
  measurement runs against the node React actually mounted. A `RefObject`
  read in a layout effect is a snapshot of whatever was current when the
  effect ran, which is the wrong node the moment a component remounts.
*/

/** The docks currently drawn, and how tall each is. */
const docks = new Map<HTMLElement, number>();

/** Drawn, not merely mounted: nothing hidden, and something to measure. */
function drawn(el: HTMLElement): boolean {
  if (el.getClientRects().length === 0) return false;
  return getComputedStyle(el).visibility !== "hidden";
}

function publish() {
  const root = document.documentElement;
  let tallest = 0;
  docks.forEach((height) => {
    if (height > tallest) tallest = height;
  });

  if (tallest > 0) {
    root.setAttribute("data-dock", "");
    // The bar's height plus the gap it already floats above the edge in.
    root.style.setProperty("--dock-clearance", `${Math.ceil(tallest + 16)}px`);
  } else {
    root.removeAttribute("data-dock");
    root.style.removeProperty("--dock-clearance");
  }
}

/**
 * Measure a bottom dock and publish its clearance for as long as it is drawn.
 *
 * Re-measures on resize, because the bar is `md:hidden`: crossing the
 * breakpoint is the single most common way for the answer to change, and it
 * fires no other event.
 */
export function useDockClearance(el: HTMLElement | null) {
  useLayoutEffect(() => {
    if (!el) return;

    const measure = () => {
      const height = drawn(el) ? el.getBoundingClientRect().height : 0;
      // A bar under this is not a bar. It is a collapsed element mid-layout,
      // and treating it as one would publish a clearance of nearly nothing.
      if (height < 16) docks.delete(el);
      else docks.set(el, height);
      publish();
    };

    measure();
    window.addEventListener("resize", measure);
    // Catches the bar growing or shrinking for any other reason, on the
    // browsers that have it. Resize alone is enough on the rest.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(el);

    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
      docks.delete(el);
      publish();
    };
  }, [el]);
}
