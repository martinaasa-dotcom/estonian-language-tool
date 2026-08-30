"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  crossStyle,
  GHOST_LAG_MS,
  GHOST_MS,
  markGeometry,
  NAV_MOTION,
  type NavAxis,
  type NavDir,
  type NavMark,
  type NavSurface,
  restingStyle,
  sameMark,
  swellFrames,
  travelDirection,
  travelKeyframes,
} from "@/lib/ux/navMotion";

export type NavMarkerState = {
  /** Goes on the well: the rail's column, or the phone bar's capsule. */
  ref: React.RefObject<HTMLDivElement | null>;
  /** The current place's cell. Null on a screen the rail has no row for. */
  mark: NavMark | null;
  /** The cell under the pointer or the keyboard, and whether anything is. */
  hover: NavMark | null;
  hovering: boolean;
  /** False until the marker has been placed once, so it does not fly in. */
  travels: boolean;
};

/**
 * How long the marker will stand where a press put it with no answer from the
 * page. Long on purpose: see the press effect at the bottom of this file.
 */
const GIVES_UP_MS = 4000;

/**
 * THE TWO PANES BEHIND THE NAVIGATION'S CELLS: the marker that says which
 * place you are in, and the fainter one that follows your pointer.
 *
 * Both surfaces mark the current cell with `data-nav-on` and give every cell
 * `data-nav-cell`, so this hook is the only thing that knows how a pane is
 * found or when it is allowed to move, and the rail and the bar cannot drift
 * apart on either. The pointer pane is wired here rather than passed in as
 * props, listening on the well itself, so a surface that grows a cell gets it
 * with nothing to remember.
 *
 * The measuring is `offsetTop` and `offsetLeft`, which are layout and so are
 * untouched by any transform playing over them: the measurement stands still
 * while the picture stretches. That is what lets the bar's capsule breathe
 * without the marker inside it losing its place.
 */
export function useNavMarker(surface: NavSurface, axis: NavAxis): NavMarkerState {
  const tune = NAV_MOTION[surface];
  const ref = useRef<HTMLDivElement>(null);
  const [mark, setMark] = useState<NavMark | null>(null);
  const [hover, setHover] = useState<NavMark | null>(null);
  const [hovering, setHovering] = useState(false);
  const [travels, setTravels] = useState(false);

  /*
    The last measurement, kept beside the state rather than read out of it.
    Measuring runs after every render, so the comparison that decides whether
    anything moved has to be readable without waiting for one, and working out
    a direction inside a state updater is wrong twice over: React may call it
    twice, and it may not call it at all.
  */
  const lastMark = useRef<NavMark | null>(null);
  const lastHover = useRef<NavMark | null>(null);
  /** The cell the pointer or the keyboard is on, so a resize can re-measure it. */
  const hoverCell = useRef<HTMLElement | null>(null);
  /** Each animation in flight, so a second one replaces it rather than stacking. */
  const gliding = useRef<Animation | null>(null);
  const ghosting = useRef<Animation | null>(null);
  const breathing = useRef<Animation | null>(null);
  /** The cell a press is betting on, until the page agrees or the bet is off. */
  const aimed = useRef<HTMLElement | null>(null);
  const aimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /*
    Whether the press has already become a click, which is to say a navigation
    is under way. See the press effect at the bottom: a bet the page is about
    to confirm must not be called off, or the marker walks all the way home
    and all the way back for nothing.
  */
  const going = useRef(false);
  /** A bet being reverted arrives rather than travels. See `callOff`. */
  const reverting = useRef(false);
  /** Whether this surface was off screen when it was last looked at. */
  const wasHidden = useRef(false);

  const markOf = useCallback(
    (cell: HTMLElement): NavMark =>
      axis === "x"
        ? markGeometry(cell.offsetLeft, cell.offsetWidth)
        : markGeometry(cell.offsetTop, cell.offsetHeight),
    [axis],
  );

  /** The cell's size across the axis it does not travel. See `crossStyle`. */
  const crossOf = useCallback(
    (cell: HTMLElement): NavMark =>
      axis === "x"
        ? markGeometry(cell.offsetTop, cell.offsetHeight)
        : markGeometry(cell.offsetLeft, cell.offsetWidth),
    [axis],
  );

  /*
    Move a pane to a cell, on the compositor.

    The resting length and transform go on the element first, so it is correct
    the instant the animation ends and the scale is exactly 1 while it stands
    still. The travel is then played over the top from wherever the pane
    actually was. Nothing fills forwards: the element's own style is already
    the destination.
  */
  const glide = useCallback(
    (
      el: HTMLElement | null,
      from: NavMark | null,
      to: NavMark,
      cross: NavMark,
      running: { current: Animation | null },
      opts: { durationMs: number; lagMs: number },
    ) => {
      if (!el) return;
      Object.assign(el.style, crossStyle(cross, axis), restingStyle(to, axis));
      if (!from || typeof el.animate !== "function" || stillMotion()) return;
      if (sameMark(from, to)) return;
      running.current?.cancel();
      running.current = el.animate(travelKeyframes(from, to, { axis, ...opts }), {
        duration: opts.durationMs,
      });
    },
    [axis],
  );

  /*
    The capsule's breath, run on the well itself for the length of one travel,
    and cancelled rather than stacked on. Two animations of one property both
    apply with the newer winning, so when the newer finishes and drops off, an
    older one still running takes the bar back over and it jumps. Tapping
    quickly along the bar is exactly how somebody would find that.

    The Web Animations API rather than a class, because this has to restart on
    every travel and two journeys in the same direction change no attribute
    between them, so nothing in the markup would tell CSS to run it again.
  */
  const swell = useCallback(
    (host: HTMLElement, dir: NavDir) => {
      if (typeof host.animate !== "function" || stillMotion()) return;
      const frames = swellFrames(dir, tune.swellPeak);
      if (!frames) return;
      breathing.current?.cancel();
      breathing.current = host.animate(frames, { duration: tune.swellMs });
    },
    [tune],
  );

  const measure = useCallback(() => {
    const host = ref.current;
    if (!host) return;
    if (!onScreen(host)) {
      // The surface the other breakpoint draws. See `onScreen`.
      wasHidden.current = true;
      aimed.current = null;
      return;
    }
    /* Back on screen: arrive on the cell rather than travel across to it. */
    const arriving = wasHidden.current;
    wasHidden.current = false;
    const on = host.querySelector<HTMLElement>("[data-nav-on]");
    /*
      A press outstanding, so the marker is already where the reader aimed it
      and the page has not caught up yet. The bet is settled when the page
      answers with that same cell, or when the cell stops existing.
    */
    if (aimed.current && (on === aimed.current || !host.contains(aimed.current))) {
      aimed.current = null;
    }
    const target = aimed.current ?? on;
    const next = target ? markOf(target) : null;
    if (!sameMark(lastMark.current, next)) {
      if (lastMark.current && next && !reverting.current && !arriving) {
        swell(host, travelDirection(lastMark.current, next));
      }
      if (target && next) {
        /*
          A REVERTED BET ARRIVES, IT DOES NOT TRAVEL. Reverting is a
          correction rather than a journey, and animating it draws a second
          full trip down the rail for a place the reader never went to, which
          is exactly what somebody would report as a glitch.
        */
        glide(
          host.querySelector<HTMLElement>(".nav-marker"),
          reverting.current || arriving ? null : lastMark.current,
          next,
          crossOf(target),
          gliding,
          { durationMs: tune.travelMs, lagMs: tune.lagMs },
        );
      }
      lastMark.current = next;
      setMark(next);
    }

    const cell = hoverCell.current;
    const overIt = cell && host.contains(cell) && onScreen(cell) ? markOf(cell) : null;
    if (cell && overIt && !sameMark(lastHover.current, overIt)) {
      glide(
        host.querySelector<HTMLElement>(".nav-ghost"),
        lastHover.current,
        overIt,
        crossOf(cell),
        ghosting,
        { durationMs: GHOST_MS, lagMs: GHOST_LAG_MS },
      );
      lastHover.current = overIt;
      setHover(overIt);
    }
  }, [crossOf, glide, markOf, swell, tune]);

  /*
    No dependency list on purpose. What moves the marker is not one value but
    which page is open, how many rows are drawn and how long their labels
    turned out to be. Listing those goes stale; measuring after every render
    does not, and the guard above settles in one extra pass.
  */
  useLayoutEffect(() => {
    measure();
  });

  useEffect(() => {
    const host = ref.current;
    if (!host || typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(() => measure());
    watch.observe(host);
    /*
      The cells, never every child. Both panes are children too and both of
      them change length continuously for the length of a travel, so watching
      them would put a measurement, and the layout read inside it, on every
      frame of every journey, to answer a question about cells that have not
      moved.
    */
    for (const cell of Array.from(host.querySelectorAll<HTMLElement>("[data-nav-cell]"))) {
      watch.observe(cell);
    }
    return () => watch.disconnect();
  }, [measure]);

  /*
    The pointer's pane. Two sources, tracked apart: where the pointer is and
    where the keyboard is. They come and go independently and either one alone
    is reason to draw the pane, and one shared flag gets it wrong in a way you
    find immediately, because pressing a cell moves focus to it, which fires
    `focusout` on whatever held focus before, and a single flag cleared there
    takes the pane out from under the cursor still sitting on the cell.

    The pointer wins when both are on something, being the more immediate of
    the two. On leaving, the geometry is kept and only the flag drops, so the
    pane fades out where it was rather than sliding home on its way to nothing.
  */
  useEffect(() => {
    const host = ref.current;
    if (!host) return;

    const cellUnder = (target: EventTarget | null): HTMLElement | null =>
      target instanceof Element ? target.closest<HTMLElement>("[data-nav-cell]") : null;

    let pointerOn: HTMLElement | null = null;
    let focusOn: HTMLElement | null = null;

    const settle = () => {
      const cell = pointerOn ?? focusOn;
      if (!cell) {
        setHovering(false);
        return;
      }
      hoverCell.current = cell;
      const next = markOf(cell);
      glide(
        host.querySelector<HTMLElement>(".nav-ghost"),
        lastHover.current,
        next,
        crossOf(cell),
        ghosting,
        { durationMs: GHOST_MS, lagMs: GHOST_LAG_MS },
      );
      lastHover.current = next;
      setHover(next);
      setHovering(true);
    };

    const over = (event: PointerEvent) => {
      /*
        A finger does not hover. Without this the pane is left sitting under
        the last cell tapped, which on a phone is every cell the learner has
        ever pressed, one at a time, for ever.
      */
      if (event.pointerType === "touch") return;
      const cell = cellUnder(event.target);
      if (!cell || !host.contains(cell)) return;
      pointerOn = cell;
      settle();
    };

    const out = () => {
      pointerOn = null;
      settle();
    };

    const focus = (event: FocusEvent) => {
      const cell = cellUnder(event.target);
      if (!cell || !host.contains(cell)) return;
      /*
        `:focus-visible`, not plain focus. Tapping a link focuses it, so a bare
        `focusin` handler shows the pane on a phone and leaves it under the
        last cell tapped, which is the same failure the touch guard above
        exists for arriving through the other door. The browser already draws
        this line: it sets focus-visible for a keyboard and withholds it for a
        finger.
      */
      if (typeof cell.matches === "function" && !cell.matches(":focus-visible")) return;
      focusOn = cell;
      settle();
    };

    const blur = () => {
      focusOn = null;
      settle();
    };

    host.addEventListener("pointerover", over);
    host.addEventListener("pointerleave", out);
    host.addEventListener("pointercancel", out);
    host.addEventListener("focusin", focus);
    host.addEventListener("focusout", blur);
    return () => {
      host.removeEventListener("pointerover", over);
      host.removeEventListener("pointerleave", out);
      host.removeEventListener("pointercancel", out);
      host.removeEventListener("focusin", focus);
      host.removeEventListener("focusout", blur);
    };
  }, [crossOf, glide, markOf]);

  /*
    THE MARKER LEAVES ON THE PRESS, NOT ON THE PAGE.

    Which cell is on is read from the current path, so without this the marker
    cannot begin to move until the router has committed the new route. Every
    bit of the motion above would then be downstream of the network rather
    than of the finger, and these pages are rendered on a server: the wait is
    real, and it is longest exactly when the connection is worst. Prefetching
    makes it short, and short and attached are different feelings.

    It is a bet, so it has to be able to lose, and it loses three ways: the
    release landed somewhere other than the cell it started on, since a press
    dragged off is not a tap; the page answered with a different cell; or
    nothing answered at all inside `GIVES_UP_MS`. That last one is long on
    purpose, because snapping the marker home mid-wait looks far more broken
    than letting it stand where the reader put it.
  */
  useEffect(() => {
    const host = ref.current;
    if (!host) return;

    const callOff = () => {
      if (aimTimer.current) {
        clearTimeout(aimTimer.current);
        aimTimer.current = null;
      }
      if (!aimed.current) return;
      aimed.current = null;
      going.current = false;
      reverting.current = true;
      try {
        measure();
      } finally {
        reverting.current = false;
      }
    };

    const aim = (cell: HTMLElement) => {
      const well = ref.current;
      if (!well || !well.contains(cell)) return;
      if (cell === well.querySelector("[data-nav-on]")) return;
      aimed.current = cell;
      going.current = false;
      if (aimTimer.current) clearTimeout(aimTimer.current);
      aimTimer.current = setTimeout(callOff, GIVES_UP_MS);
      measure();
    };

    const goes = (target: EventTarget | null): HTMLElement | null =>
      target instanceof Element ? target.closest<HTMLElement>("[data-nav-goes]") : null;

    const press = (event: PointerEvent) => {
      /*
        Only a plain primary press goes anywhere in this tab. A middle click or
        a held modifier opens the page in another one, and a marker moving for
        a place the reader is still not in is the one way this is worse than
        waiting.
      */
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const cell = goes(event.target);
      if (cell) aim(cell);
    };

    /*
      A release anywhere but on the cell it started on is not a tap, and no
      navigation follows it. On the document rather than the well, because a
      finger that wandered off has usually left the bar entirely.
    */
    const release = (event: PointerEvent) => {
      if (!aimed.current || going.current) return;
      if (goes(event.target) !== aimed.current) callOff();
    };

    /*
      ONCE THE PRESS HAS BECOME A CLICK IT IS NO LONGER A BET.

      A navigation is under way, and the only things allowed to settle the
      marker after that are the page answering and the timeout. Without this,
      any later pointer event landing off the cell calls the bet off, and
      calling off repositions the marker to whatever is still marked, which
      during a navigation is the row you are LEAVING. A second tap does it, a
      press anywhere on the page while the new one renders does it, and on a
      phone the browser taking the gesture for a scroll does it on an ordinary
      tap.

      Measured on this rail before the fix, one navigation drew three travels:
      127 to 817 on the press, 817 back to 127 a tenth of a second later, then
      127 to 817 again when the page arrived.
    */
    const went = (event: MouseEvent) => {
      if (!aimed.current) return;
      if (goes(event.target) === aimed.current) going.current = true;
    };

    /* A keyboard never presses, and Enter is how it opens a link. */
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.metaKey || event.ctrlKey) return;
      const cell = goes(event.target);
      if (cell) aim(cell);
    };

    /* A cancel before the click is a genuinely abandoned press. */
    const abandon = () => {
      if (going.current) return;
      callOff();
    };

    host.addEventListener("pointerdown", press);
    host.addEventListener("click", went);
    host.addEventListener("keydown", key);
    document.addEventListener("pointerup", release);
    document.addEventListener("pointercancel", abandon);
    return () => {
      host.removeEventListener("pointerdown", press);
      host.removeEventListener("click", went);
      host.removeEventListener("keydown", key);
      document.removeEventListener("pointerup", release);
      document.removeEventListener("pointercancel", abandon);
      if (aimTimer.current) clearTimeout(aimTimer.current);
    };
  }, [measure]);

  /*
    Held still until it has been placed once, or the first paint of every
    signed-in screen draws a marker sliding in from the top of a rail nobody
    has touched.
  */
  useEffect(() => {
    if (!mark || travels) return;
    const frame = requestAnimationFrame(() => setTravels(true));
    return () => cancelAnimationFrame(frame);
  }, [mark, travels]);

  return { ref, mark, hover, hovering, travels };
}

/**
 * A SURFACE NOBODY IS LOOKING AT MUST NOT MEASURE ITSELF.
 *
 * Both surfaces are always mounted: the rail is `hidden md:flex` and the bar
 * is `md:hidden`, so at every width one of the two is `display: none`. An
 * element with no layout box reports `offsetLeft` and `offsetWidth` as **0**,
 * and measuring one writes `{start: 0, size: 0}` down as that surface's last
 * known marker. Cross the breakpoint and the travel is computed from there,
 * which is a collapsed pill at the far edge sweeping the whole width to reach
 * the cell you were on all along. Measured on the phone bar before this
 * existed: crossing from 1280 to 390 drew `x 0 scaleX 0.01 -> x 288`.
 *
 * So: no layout box, no measuring, no animating, nothing written down. Any
 * outstanding bet goes with it, since the press that placed it was on a
 * surface the reader is no longer looking at. And the first measure after a
 * surface comes back **arrives** rather than travels, because where its
 * marker was last is not a place anybody should watch it come back from.
 */
function onScreen(el: HTMLElement): boolean {
  return el.getClientRects().length > 0;
}

function stillMotion(): boolean {
  return (
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
