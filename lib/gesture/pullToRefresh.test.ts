import { describe, expect, it } from "vitest";
import {
  PULL_CEILING,
  PULL_MAX_WAIT_MS,
  PULL_MIN_VISIBLE_MS,
  PULL_RING_CIRCUMFERENCE,
  PULL_SLOP,
  PULL_TRIGGER,
  pullArmed,
  pullDashOffset,
  pullIntent,
  pullOpacity,
  pullProgress,
  pullScale,
  pullTravel,
} from "@/lib/gesture/pullToRefresh";

describe("the page moves, and it moves less than the finger does", () => {
  it("starts exactly under the finger", () => {
    /*
      The derivative at zero is 1, which is the half that matters most: the
      first pixel of the pull is the first pixel of the finger, so the page
      feels attached rather than lagging. Measured as a difference quotient,
      which is what a thumb actually experiences.
     */
    expect(pullTravel(0.01) / 0.01).toBeCloseTo(1, 2);
  });

  it("gets heavier the further it goes", () => {
    const first = pullTravel(10) - pullTravel(0);
    const later = pullTravel(90) - pullTravel(80);
    expect(later).toBeLessThan(first);
  });

  it("can never travel past the ceiling, however hard anybody drags", () => {
    expect(pullTravel(10_000)).toBeLessThanOrEqual(PULL_CEILING);
    expect(pullTravel(-40)).toBe(0);
  });

  it("leaves give in the track once it has armed", () => {
    // What tells a thumb it has arrived somewhere rather than hit the end.
    expect(PULL_TRIGGER).toBeLessThan(PULL_CEILING);
  });

  it("asks for a deliberate pull rather than a twitch", () => {
    // Roughly 84px of finger buys the 56px that arms it.
    expect(pullTravel(85)).toBeGreaterThanOrEqual(PULL_TRIGGER);
    expect(pullTravel(83)).toBeLessThan(PULL_TRIGGER);
    expect(pullTravel(40)).toBeLessThan(PULL_TRIGGER);
  });
});

describe("the ring", () => {
  it("is complete and at full size at exactly the moment it arms", () => {
    // Both continuous, and both landing together: there is no frame where
    // something appears, jumps, or changes character.
    expect(pullProgress(PULL_TRIGGER)).toBe(1);
    expect(pullOpacity(pullProgress(PULL_TRIGGER))).toBe(1);
    expect(pullScale(pullProgress(PULL_TRIGGER))).toBeCloseTo(1, 5);
    expect(pullDashOffset(pullProgress(PULL_TRIGGER))).toBe(0);
  });

  it("is invisible and unstarted at rest", () => {
    expect(pullOpacity(pullProgress(0))).toBe(0);
    expect(pullDashOffset(0)).toBe(PULL_RING_CIRCUMFERENCE);
  });

  it("never overshoots when the pull goes past the trigger", () => {
    expect(pullProgress(PULL_CEILING)).toBe(1);
    expect(pullOpacity(4)).toBe(1);
    expect(pullScale(4)).toBeCloseTo(1, 5);
  });

  it("arms only at the trigger", () => {
    expect(pullArmed(PULL_TRIGGER - 0.1)).toBe(false);
    expect(pullArmed(PULL_TRIGGER)).toBe(true);
  });

  it("is shown long enough to be read, and never for ever", () => {
    expect(PULL_MIN_VISIBLE_MS).toBeGreaterThan(200);
    expect(PULL_MAX_WAIT_MS).toBeGreaterThan(PULL_MIN_VISIBLE_MS);
  });
});

describe("which gesture this is, decided once", () => {
  it("waits inside the slop, where the finger has not said yet", () => {
    expect(pullIntent(0, 0)).toBe("wait");
    expect(pullIntent(PULL_SLOP - 1, PULL_SLOP - 1)).toBe("wait");
  });

  it("gives a sideways swipe back to whatever scrolls sideways", () => {
    expect(pullIntent(40, 5)).toBe("scroll");
  });

  it("gives an upward drag back to the page", () => {
    expect(pullIntent(0, -40)).toBe("scroll");
  });

  it("takes a downward drag", () => {
    expect(pullIntent(2, 40)).toBe("pull");
  });
});
