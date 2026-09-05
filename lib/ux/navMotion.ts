/**
 * How the navigation's marker moves, as arithmetic.
 *
 * The rail and the phone bar used to say where you were by painting the row
 * you were on and unpainting the one you left. That is two things happening
 * at once and it reads as two things: a light going out over here and another
 * coming on over there, with nothing connecting them. What connects them is
 * one pane rather than two states, and there are two of those panes: the
 * marker, which says where you are, and the pointer's own, which says what
 * you are reaching for. They are one object at two weights, which is the
 * whole of why the navigation reads as a place with a marker in it.
 *
 * WHETHER THAT PANE TRAVELS IS A QUESTION ABOUT THE INPUT, NOT THE DESIGN.
 * A thumb has nothing else to do while a server answers, so the phone bar's
 * marker slides from the cell you left to the cell you asked for. A pointer
 * has already arrived, and its pane has been following it down the rail all
 * along, so the rail's marker does not travel at all: it is simply there, on
 * the row under the cursor, on `pointerdown`. See `NAV_MOTION`.
 *
 * Borrowed, deliberately and with its measurements intact, from Upside Lab's
 * dock, which traced this off iOS frame by frame. Three things carry it and
 * each one is a rule rather than a flourish:
 *
 *   1. THE MARKER STRETCHES. Its leading edge sets off before its trailing
 *      edge follows, so the pill smears across the ground it is covering and
 *      gathers itself up on arrival. Which is why a mark here is TWO EDGES
 *      rather than a position and a size: give the leading one the short
 *      delay and the trailing one the long, and the stretch falls out of the
 *      arithmetic and scales with the distance. One row up is a nudge; the
 *      length of the rail is a smear. A fixed keyframe cannot do that.
 *
 *   2. IT RUNS ON THE COMPOSITOR. `top` and `left` are layout properties, so
 *      every frame of that transition is laid out and painted on the main
 *      thread, and the main thread is exactly what a page navigation is busy
 *      with: Lab measured its own marker running three frames, stalling for
 *      five while the new room rendered, then teleporting the rest of the way
 *      in one. So the travel is `transform`, handed to the compositor with
 *      its own clock, and the two independently eased edges are sampled into
 *      keyframes here because one transform cannot ease two edges by itself.
 *
 *   3. THE CAPSULE BREATHES, AND ON BOTH AXES AT ONCE. The phone bar swells
 *      about three percent and settles back through a slight undershoot. Lab
 *      got this wrong once in the instructive way: a bad measurement said the
 *      height never moved, which produced a horizontal-only scale, and
 *      scaling one axis stretches the letterforms sideways. A uniform scale
 *      magnifies type instead of distorting it. Never scale a bar on one axis.
 *
 * Pure: numbers in, numbers and keyframes out. The rail travels down its
 * column and the bar travels across, so every function here takes an axis
 * rather than assuming one, and `lib/layout/navMarker.ts` is what measures
 * the cells and plays what this returns.
 */

/** Which way a marker runs: across the phone bar, or down the rail. */
export type NavAxis = "x" | "y";

/** A cell's place in its well: where it starts and how long it is, in pixels. */
export type NavMark = { start: number; size: number };

/** Whether the next cell is further along the well. Null before, or on a resize. */
export type NavDir = "forward" | "back" | null;

/**
 * The two surfaces and what each is allowed to spend.
 *
 * They are not the same numbers because they are not the same object, and the
 * one that matters most is the rail's zero.
 *
 * A TRAVELING MARKER IS COMPANY FOR A FINGER AND AN ARGUMENT WITH A POINTER.
 * The phone bar is a floating capsule of five cells that a thumb hits, and a
 * thumb has nothing else to do while it waits, so a pill crossing the bar is
 * the app keeping the reader company through a wait that is real. A pointer
 * has already arrived: you clicked one row, you know which, and watching a
 * marker take a quarter of a second to agree with you is the rail being
 * slower than you are. Worse, it is a second answer to a settled question,
 * arriving next to the page you just changed.
 *
 * So the rail's travel is zero and `glide` writes the resting geometry and
 * returns: the marker is simply THERE, on the row you pressed, on
 * `pointerdown`. What carries the movement on that surface instead is the
 * pointer's own pane, which has been following the pointer down the column
 * all along, so by the time you press, the card is already under your cursor
 * and clicking only settles it. Reaching and arriving are one object at two
 * weights, and neither of them flies anywhere.
 *
 * The bar keeps the full run and the breath, which is the surface Lab traced
 * these off and the one a finger has no hover to spend the motion on instead.
 * The rail does not breathe at all: a column of sixteen rows swelling every
 * time somebody clicked a link would be a tall object lurching beside the
 * page it just changed.
 */
export const NAV_MOTION = {
  rail: { travelMs: 0, lagMs: 14, swellPeak: 1, swellMs: 0 },
  bar: { travelMs: 340, lagMs: 18, swellPeak: 1.03, swellMs: 460 },
} as const;

export type NavSurface = keyof typeof NAV_MOTION;

/** How long the pointer's fainter pane takes, and how far its tail lags. */
export const GHOST_MS = 200;
export const GHOST_LAG_MS = 6;

/**
 * The travel's curve: flat out, then a long glide. Fitted numerically to the
 * reference pill's own progress, so almost all of the distance is spent early
 * and the tail is long enough that the trailing edge is still visibly behind
 * the leading one.
 */
export const TRAVEL_EASE = [0.5, 0.2, 0.05, 0.95] as const;

/** One sample per 8ms, so every frame the browser could draw has a value. */
export const SAMPLE_MS = 8;

/** A cell's geometry, read off its own layout box. */
export function markGeometry(start: number, size: number): NavMark {
  return { start, size: Math.max(0, size) };
}

/** Whether two measurements are the same, so measuring can be idempotent. */
export function sameMark(a: NavMark | null, b: NavMark | null): boolean {
  if (!a || !b) return a === b;
  return a.start === b.start && a.size === b.size;
}

/**
 * Which edge leads, read off the start alone. A cell that grew under a still
 * marker has no direction, and answering null there is what stops a resize
 * being mistaken for a journey.
 */
export function travelDirection(was: NavMark, next: NavMark): NavDir {
  if (next.start > was.start) return "forward";
  if (next.start < was.start) return "back";
  return null;
}

function solve(p1x: number, p1y: number, p2x: number, p2y: number, t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i += 1) {
    const u = (lo + hi) / 2;
    const x = 3 * (1 - u) ** 2 * u * p1x + 3 * (1 - u) * u * u * p2x + u ** 3;
    if (x < t) lo = u;
    else hi = u;
  }
  const u = (lo + hi) / 2;
  return 3 * (1 - u) ** 2 * u * p1y + 3 * (1 - u) * u * u * p2y + u ** 3;
}

/**
 * Where the marker rests. Its own length is the destination's, so the scale is
 * exactly 1 and the round ends of the pill are true circles while it is still.
 *
 * The zero offset is not spare. An absolutely positioned element given no
 * offset on an axis stays at its static position, which is where it would
 * have been in flow: one padding in from the well's edge. A cell's own
 * `offsetTop` is measured from the padding box instead, so leaving it out
 * drew every marker exactly one padding along, on every row, for ever.
 * Measured at 16px down the rail before this line existed.
 */
export function restingStyle(mark: NavMark, axis: NavAxis) {
  return axis === "x"
    ? { left: "0px", width: `${mark.size}px`, transform: `translateX(${mark.start}px) scaleX(1)` }
    : { top: "0px", height: `${mark.size}px`, transform: `translateY(${mark.start}px) scaleY(1)` };
}

/**
 * The pane's placement across the axis it does not travel, measured off the
 * cell rather than typed as an inset.
 *
 * It was typed once, as the rail's own padding, and it was wrong by four
 * pixels: the rail is a scroll container, so its padding box includes the
 * gutter the scrollbar sits in and a pane inset from both edges comes out
 * narrower than the row it is meant to be under. A cell knows how wide it is.
 * Nothing else has to.
 */
export function crossStyle(cross: NavMark, axis: NavAxis) {
  return axis === "x"
    ? { top: `${cross.start}px`, height: `${cross.size}px` }
    : { left: `${cross.start}px`, width: `${cross.size}px` };
}

/**
 * THE CURVE IS ALWAYS THE SAME CURVE, SO IT IS SOLVED ONCE.
 *
 * `travelKeyframes` runs synchronously inside the `pointerdown` handler,
 * before the browser can dispatch the click that navigates, and it used to
 * binary-search the bezier twice for every sample: at 8ms over a 330ms travel
 * that is about 1,900 iterations of the solver on the press path, on every
 * tap, for a curve that never changes. A table of 1,024 points built once on
 * first use and read with a linear interpolation is exact to about 1e-6,
 * which is far finer than a sub-pixel position on a 40px row, and turns the
 * press path into 84 lookups.
 *
 * It takes no curve, deliberately: there is one travel curve in this app, and
 * a table keyed to nothing would quietly answer for the wrong one if a second
 * were ever passed in.
 */
const EASE_STEPS = 1024;
let easeTable: Float64Array | null = null;

function eased(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (!easeTable) {
    const [a, b, c, d] = TRAVEL_EASE;
    easeTable = new Float64Array(EASE_STEPS + 1);
    for (let i = 0; i <= EASE_STEPS; i += 1) easeTable[i] = solve(a, b, c, d, i / EASE_STEPS);
  }
  const at = t * EASE_STEPS;
  const i = Math.floor(at);
  return easeTable[i]! + (easeTable[i + 1]! - easeTable[i]!) * (at - i);
}

/**
 * The pill's travel, as compositor keyframes.
 *
 * The element is given the destination's own length before this plays, so the
 * animation ends at a scale of exactly 1 and the round ends of the pill are
 * true circles whenever it is standing still. They go slightly oval only in
 * flight, which is why the lag is small: a large one on a 32px pill reads as
 * an egg rather than as a stretch.
 */
export function travelKeyframes(
  from: NavMark,
  to: NavMark,
  opts: { axis: NavAxis; durationMs: number; lagMs: number },
): Keyframe[] {
  const { axis, durationMs, lagMs } = opts;
  const move = axis === "x" ? "translateX" : "translateY";
  const stretch = axis === "x" ? "scaleX" : "scaleY";
  const forward = to.start >= from.start;
  const fromEnd = from.start + from.size;
  const toEnd = to.start + to.size;

  const frames: Keyframe[] = [];
  for (let t = 0; t <= durationMs; t += SAMPLE_MS) {
    // The leading edge sets off first; the trailing one is delayed by the lag.
    const lead = eased(t / durationMs);
    const trail = eased((t - lagMs) / durationMs);
    const s = forward ? trail : lead;
    const e = forward ? lead : trail;
    const start = from.start + (to.start - from.start) * s;
    const end = fromEnd + (toEnd - fromEnd) * e;
    frames.push({
      offset: t / durationMs,
      transform: `${move}(${start}px) ${stretch}(${Math.max(0.01, (end - start) / to.size)})`,
      easing: "linear",
    });
  }
  frames.push({
    offset: 1,
    transform: `${move}(${to.start}px) ${stretch}(1)`,
    easing: "linear",
  });
  return frames;
}

/**
 * The capsule's own breath for one travel.
 *
 * Traced off the reference at 30fps and normalized against its own peak, with
 * t measured from the start of the travel. It takes forty percent of its life
 * to reach the peak and comes back through a slight undershoot before it
 * settles, which is the response of something springy. The curve it replaced
 * peaked at eleven percent with no undershoot, and that is a flinch.
 *
 * Null for a surface whose peak is 1, which is the rail saying it does not
 * breathe. Sixteen keyframes of `scale(1)` would look the same and would
 * still hand the compositor an animation to run, so the off switch has to be
 * here rather than in the numbers alone.
 */
export function swellFrames(dir: NavDir, peak: number): Keyframe[] | null {
  if (!dir) return null;
  const grown = peak - 1;
  if (grown <= 0) return null;
  const shape = [
    0, 0.26, 0.35, 0.49, 0.74, 0.94, 1, 0.9, 0.67, 0.41, 0.17, 0.05, -0.03,
    -0.035, -0.03, 0,
  ];
  return shape.map((v, i) => ({
    offset: i / (shape.length - 1),
    transform: `scale(${1 + grown * v})`,
    /*
      Linear between samples on purpose. They are one recorded frame apart, so
      the curve is already carried by the data, and an easing laid over it
      would be a second guess about a shape that was measured.
    */
    easing: "linear",
  }));
}
