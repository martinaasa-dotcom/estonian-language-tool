"use client";

import type { NavMarkerState } from "@/lib/layout/navMarker";

/**
 * The two panes behind the navigation's cells, drawn once for both surfaces.
 *
 * The order is the whole of the layering: the pointer's pane comes first so it
 * sits under the marker, both come before the cells, and neither takes a
 * pointer event. Point at the row you are already on and the two stack, which
 * is right, since that row is both where you are and what you are reaching
 * for and should look like both.
 *
 * How they move is in `app/nav.css` and where they are is in
 * `lib/layout/navMarker.ts`, which writes both axes onto them from the cell's
 * own layout box, so nothing here has to know whether it is drawing a column
 * or a row. What the marker is painted is the one thing the two surfaces do
 * not share, and the well declares it as `--nav-marker-bg` rather than
 * handing it down here: the same two values paint the current row while no
 * pane has been placed yet, and one declaration is what keeps a hard load and
 * a hydrated page the same picture.
 */
export function NavMarker({ state }: { state: NavMarkerState }) {
  const { mark, hover, hovering } = state;
  return (
    <>
      <span
        aria-hidden
        className={`nav-ghost rounded-full ${hover && hovering ? "opacity-100" : "opacity-0"}`}
        style={{ background: "var(--raised)" }}
        /* Every pixel of the geometry is written onto the element by
           `useNavMarker`, along both axes, so where a pane rests and how it
           travels are one story. See `glide` there, and `crossStyle` for why
           its width is measured off the cell rather than typed as an inset. */
      />
      <span
        aria-hidden
        className={`nav-marker rounded-full ${mark ? "opacity-100" : "opacity-0"}`}
        data-travels={state.travels ? "" : undefined}
      />
    </>
  );
}
