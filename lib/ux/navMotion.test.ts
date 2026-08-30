import { describe, expect, it } from "vitest";
import {
  crossStyle,
  markGeometry,
  NAV_MOTION,
  type NavAxis,
  type NavMark,
  restingStyle,
  sameMark,
  swellFrames,
  travelDirection,
  travelKeyframes,
} from "./navMotion";

/** The pill's start and end at one keyframe, in pixels, whichever axis it is on. */
function edges(frame: Keyframe, to: NavMark, axis: NavAxis): { start: number; end: number } {
  const move = axis === "x" ? "translateX" : "translateY";
  const stretch = axis === "x" ? "scaleX" : "scaleY";
  const at = new RegExp(`${move}\\((-?[\\d.]+)px\\) ${stretch}\\(([\\d.]+)\\)`);
  const found = at.exec(String(frame.transform));
  if (!found) throw new Error(`not a ${axis} travel frame: ${String(frame.transform)}`);
  const start = Number(found[1]);
  return { start, end: start + Number(found[2]) * to.size };
}

const cell = (start: number) => markGeometry(start, 40);

describe("a mark", () => {
  it("is the same mark when nothing moved", () => {
    expect(sameMark(cell(0), cell(0))).toBe(true);
    expect(sameMark(cell(0), cell(40))).toBe(false);
    expect(sameMark(null, null)).toBe(true);
    expect(sameMark(null, cell(0))).toBe(false);
  });

  it("has no direction when a cell only changed size", () => {
    // A row that grew under a still marker is not a journey, and a bar that
    // breathes at nothing is a bar with a twitch.
    expect(travelDirection(markGeometry(80, 40), markGeometry(80, 60))).toBe(null);
    expect(travelDirection(cell(0), cell(40))).toBe("forward");
    expect(travelDirection(cell(40), cell(0))).toBe("back");
  });

  it("is placed across the other axis by measurement, not by an inset", () => {
    /*
      This was typed once, as the rail's own padding, and it came out four
      pixels narrow: the rail is a scroll container, so its padding box takes
      in the gutter the scrollbar sits in and a pane inset from both edges is
      narrower than the row it is meant to be under. A cell knows how wide it
      is; nothing else has to.
    */
    expect(crossStyle(markGeometry(16, 202), "y")).toEqual({ left: "16px", width: "202px" });
    expect(crossStyle(markGeometry(6, 61), "x")).toEqual({ top: "6px", height: "61px" });
  });

  it("rests at a scale of exactly 1, from the well's own corner", () => {
    /*
      The round ends of the pill are true circles whenever it is standing
      still; they are only allowed to go oval in flight. The zero offset is
      the other half: a pane with no offset on the axis it travels is left at
      its static position, one padding in, while the cell it is chasing
      reports an offset measured from the padding box. That drew the rail's
      marker 16px below every row it was under.
    */
    expect(restingStyle(cell(120), "x")).toEqual({
      left: "0px",
      width: "40px",
      transform: "translateX(120px) scaleX(1)",
    });
    expect(restingStyle(cell(120), "y")).toEqual({
      top: "0px",
      height: "40px",
      transform: "translateY(120px) scaleY(1)",
    });
  });
});

describe("the travel", () => {
  const run = { durationMs: 300, lagMs: 20 };

  it("starts where the pill was and ends exactly on the cell it went to", () => {
    for (const axis of ["x", "y"] as const) {
      const from = cell(0);
      const to = cell(200);
      const frames = travelKeyframes(from, to, { axis, ...run });
      const first = edges(frames[0]!, to, axis);
      const last = edges(frames[frames.length - 1]!, to, axis);
      expect(first.start).toBeCloseTo(from.start, 4);
      expect(first.end).toBeCloseTo(from.start + from.size, 4);
      expect(last.start).toBeCloseTo(to.start, 4);
      expect(last.end).toBeCloseTo(to.start + to.size, 4);
      expect(frames[frames.length - 1]!.offset).toBe(1);
    }
  });

  it("stretches on the way, and gathers itself up again", () => {
    /*
      The whole of the effect. A pill that leaves as a rectangle and arrives as
      the same rectangle has only told you that it is somewhere else now; one
      that smears across the ground it covers has told you where it came from.
    */
    const to = cell(200);
    const frames = travelKeyframes(cell(0), to, { axis: "x", ...run });
    const lengths = frames.map((f) => {
      const { start, end } = edges(f, to, "x");
      return end - start;
    });
    expect(Math.max(...lengths)).toBeGreaterThan(to.size * 1.15);
    expect(lengths[lengths.length - 1]).toBeCloseTo(to.size, 4);
  });

  it("stretches further the further it goes", () => {
    // Which is what a fixed keyframe cannot do: one row up is a nudge and the
    // length of the rail is a smear, without anybody choosing that.
    const longest = (distance: number) => {
      const to = cell(distance);
      return Math.max(
        ...travelKeyframes(cell(0), to, { axis: "y", ...run }).map((f) => {
          const { start, end } = edges(f, to, "y");
          return end - start;
        }),
      );
    };
    expect(longest(400)).toBeGreaterThan(longest(80));
  });

  it("leads with the edge that is nearer where it is going", () => {
    /*
      Travelling forward the far edge sets off first and the near one follows;
      going back it is the other way about. Get this the wrong way round and
      the pill squashes rather than stretches.
    */
    const to = cell(200);
    const forward = travelKeyframes(cell(0), to, { axis: "x", ...run });
    const mid = edges(forward[Math.floor(forward.length / 4)]!, to, "x");
    expect(mid.end - 0).toBeGreaterThan(mid.start + to.size);

    const home = cell(0);
    const back = travelKeyframes(cell(200), home, { axis: "x", ...run });
    const midBack = edges(back[Math.floor(back.length / 4)]!, home, "x");
    expect(midBack.start).toBeLessThan(200 - 0);
    expect(midBack.end - midBack.start).toBeGreaterThan(home.size);
  });

  it("has a value for every frame a browser could draw", () => {
    // Sampled at 8ms, which is what stops a compositor animation reading as
    // three positions and a jump.
    const frames = travelKeyframes(cell(0), cell(200), { axis: "x", ...run });
    expect(frames.length).toBeGreaterThanOrEqual(run.durationMs / 8);
  });
});

describe("the capsule's breath", () => {
  it("scales both axes together, never one", () => {
    /*
      Upside Lab got this wrong once, off a measurement whose window missed the
      capsule's real edges and so reported a height that never moved. That one
      number produced a horizontal scale, and scaling one axis stretches the
      letterforms sideways, which is what makes a bar feel wrong. A uniform
      scale magnifies type instead of distorting it.
    */
    const frames = swellFrames("forward", NAV_MOTION.bar.swellPeak) ?? [];
    expect(frames.length).toBeGreaterThan(8);
    for (const frame of frames) {
      expect(String(frame.transform)).toMatch(/^scale\([\d.]+\)$/);
    }
  });

  it("swells late and settles through an undershoot", () => {
    // It takes about forty percent of its life to reach the peak and comes
    // back under rest before settling, which is something springy rather than
    // an ease. A peak at a tenth of the way in with no undershoot is a flinch.
    const frames = swellFrames("forward", 1.04)!;
    const scale = frames.map((f) => Number(/scale\(([\d.]+)\)/.exec(String(f.transform))![1]));
    const peak = scale.indexOf(Math.max(...scale));
    expect(frames[peak]!.offset).toBeGreaterThan(0.3);
    expect(frames[peak]!.offset).toBeLessThan(0.5);
    expect(Math.min(...scale.slice(peak))).toBeLessThan(1);
    expect(scale[scale.length - 1]).toBe(1);
  });

  it("is nothing at all for a surface that does not breathe", () => {
    /*
      The rail does not. It is a column of sixteen rows beside the page it just
      changed, and a swell there would be a tall object lurching about a
      decision the reader has already made. Sixteen keyframes of `scale(1)`
      would look the same and would still hand the compositor an animation to
      run, so the off switch is here rather than in the numbers alone.
    */
    expect(NAV_MOTION.rail.swellPeak).toBe(1);
    expect(swellFrames("forward", NAV_MOTION.rail.swellPeak)).toBe(null);
    expect(swellFrames(null, NAV_MOTION.bar.swellPeak)).toBe(null);
  });
});
