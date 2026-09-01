import { describe, expect, it } from "vitest";
import {
  LETTER_CHARACTERS, freeAxis, inward, leanFor, letterCharacter, letterVars, NO_LEAN, returnLeg,
} from "./letterMotion";

describe("the characters", () => {
  it("gives every character its own period, so four letters are never in step", () => {
    const periods = LETTER_CHARACTERS.map((c) => c.time);
    expect(new Set(periods).size).toBe(periods.length);
  });

  it("names keyframes rather than describing motion, since the CSS carries it", () => {
    for (const c of LETTER_CHARACTERS) expect(c.keyframes).toMatch(/^letter-/);
  });

  it("hangs the pendulum from near its top and turns the rest about the middle", () => {
    expect(letterCharacter("swing").origin).not.toBe("50% 50%");
    expect(letterCharacter("wander").origin).toBe("50% 50%");
  });

  it("falls back to the quietest character rather than throwing on a typo", () => {
    expect(letterCharacter("nobody").name).toBe(LETTER_CHARACTERS[0]!.name);
    expect(letterCharacter("tumble").name).toBe("tumble");
  });
});

describe("the room a placement has", () => {
  it("hands the caller's travel through untouched", () => {
    const vars = letterVars({
      character: letterCharacter("hop"), edge: "top", tilt: -12, travel: { x: 24, y: 3 },
    });
    expect(vars["--drift-x"]).toBe("24px");
    expect(vars["--drift-y"]).toBe("3px");
    expect(vars["--float-tilt"]).toBe("-12deg");
  });

  it("scales the rock and the squash where a placement says it is tight", () => {
    const tight = letterVars({
      character: letterCharacter("tumble"), edge: "left", tilt: 0, travel: { x: 4, y: 1 }, room: 0.5,
    });
    expect(tight["--drift-turn"]).toBe("7deg");
    expect(tight["--drift-pop"]).toBe("0.04");
  });
});

describe("the way home", () => {
  it("overshoots along the edge, where a letter has room both ways", () => {
    const back = returnLeg({
      character: letterCharacter("wander"), edge: "top", tilt: 0, travel: { x: 20, y: 3 },
    });
    expect(back.x).toBeLessThan(0);
  });

  it("never reverses onto the axis pointing at the card", () => {
    for (const edge of ["top", "bottom", "left", "right"] as const) {
      const travel = { x: edge === "left" ? 4 : edge === "right" ? -4 : 20, y: edge === "top" ? 3 : edge === "bottom" ? -3 : 20 };
      const back = returnLeg({ character: letterCharacter("wander"), edge, tilt: 0, travel });
      const push = inward(edge);
      const outward = (v: { x: number; y: number }) => -(v.x * push.x + v.y * push.y);
      expect(outward(back)).toBeLessThanOrEqual(0);
    }
  });
});

describe("which way is onto the card", () => {
  it("travels along the edge it hangs off", () => {
    expect(freeAxis("top")).toBe("x");
    expect(freeAxis("bottom")).toBe("x");
    expect(freeAxis("left")).toBe("y");
    expect(freeAxis("right")).toBe("y");
  });

  it("points inward from every edge", () => {
    expect(inward("top")).toEqual({ x: 0, y: 1 });
    expect(inward("bottom")).toEqual({ x: 0, y: -1 });
    expect(inward("left")).toEqual({ x: 1, y: 0 });
    expect(inward("right")).toEqual({ x: -1, y: 0 });
  });
});

describe("answering a pointer", () => {
  const centre = { x: 500, y: 300 };

  it("stays still while the pointer is further away than its reach", () => {
    expect(leanFor({ edge: "top", pointer: { x: 900, y: 300 }, centre, reach: 200, pull: 10 }))
      .toEqual(NO_LEAN);
  });

  it("slides along its own edge towards the pointer", () => {
    const lean = leanFor({ edge: "top", pointer: { x: 560, y: 300 }, centre, reach: 200, pull: 10 });
    expect(lean.x).toBeGreaterThan(0);
    const back = leanFor({ edge: "top", pointer: { x: 440, y: 300 }, centre, reach: 200, pull: 10 });
    expect(back.x).toBeLessThan(0);
  });

  it("never moves a tucked letter off the card, whichever side the pointer is", () => {
    for (const edge of ["top", "bottom", "left", "right"] as const) {
      const push = inward(edge);
      for (const at of [{ x: 460, y: 260 }, { x: 540, y: 340 }, { x: 500, y: 250 }, { x: 430, y: 300 }]) {
        const lean = leanFor({ edge, pointer: at, centre, reach: 200, pull: 10 });
        // The component of the lean along the outward normal is never positive.
        expect(lean.x * push.x + lean.y * push.y).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("keeps a tucked letter still on the axis it has no room on", () => {
    const lean = leanFor({ edge: "top", pointer: { x: 560, y: 240 }, centre, reach: 200, pull: 10 });
    expect(Math.abs(lean.y)).toBeLessThanOrEqual(5);
  });

  it("caps how far it goes, however close the pointer gets", () => {
    const lean = leanFor({ edge: "left", pointer: { x: 500, y: 301 }, centre, reach: 400, pull: 8 });
    expect(Math.abs(lean.y)).toBeLessThanOrEqual(8 + 4);
    expect(Math.abs(lean.turn)).toBeLessThanOrEqual(9);
  });

  it("follows the pointer on both axes where a letter has room on every side", () => {
    const lean = leanFor({ edge: null, pointer: { x: 560, y: 360 }, centre, reach: 300, pull: 14 });
    expect(lean.x).toBeGreaterThan(0);
    expect(lean.y).toBeGreaterThan(0);
  });

  it("comes alive near rather than everywhere, which is what squaring buys", () => {
    const far = leanFor({ edge: null, pointer: { x: 660, y: 300 }, centre, reach: 200, pull: 14 });
    const near = leanFor({ edge: null, pointer: { x: 520, y: 300 }, centre, reach: 200, pull: 14 });
    expect(Math.abs(far.x)).toBeLessThan(Math.abs(near.x));
  });
});
