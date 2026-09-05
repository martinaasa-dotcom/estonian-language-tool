import { describe, expect, it } from "vitest";
import {
  CLEAN, CONDITIONS, OPENS_AT, conditionById, conditionFor, describeHearing, hearingFrom, openConditions, removesWords,
} from "./conditions";

describe("hearing conditions", () => {
  it("reads a missing row as on and only the word off as off", () => {
    expect(hearingFrom(null)).toBe("on");
    expect(hearingFrom(undefined)).toBe("on");
    expect(hearingFrom("nonsense")).toBe("on");
    expect(hearingFrom("off")).toBe("off");
  });

  it("opens clean first and every condition eventually", () => {
    expect(openConditions(0, true).map((c) => c.id)).toEqual(["clean"]);
    expect(openConditions(1, true).map((c) => c.id)).toEqual(["clean"]);
    const all = openConditions(1000, true).map((c) => c.id);
    expect(all).toEqual(CONDITIONS.map((c) => c.id));
  });

  it("withholds a condition that removes words where every word is marked", () => {
    /*
      Dictation compares the typed sentence against the whole of it and grades
      the card off the verdict, so a clip that began two fifths in was marking
      a learner down for words it never played. Exactly one condition removes
      words, and a round that marks them may not draw it.
    */
    const removing = CONDITIONS.filter(removesWords).map((c) => c.id);
    expect(removing).toEqual(["half"]);
    const open = openConditions(1000, false).map((c) => c.id);
    expect(open).not.toContain("half");
    expect(open.length).toBe(CONDITIONS.length - 1);
    for (let reps = 0; reps < 60; reps++) {
      for (let pos = 0; pos < 8; pos++) {
        expect(removesWords(conditionFor(reps, pos, "on", false))).toBe(false);
      }
    }
  });

  it("opens in table order, so a later condition never opens before an earlier one", () => {
    let last = -1;
    for (const c of CONDITIONS) {
      expect(OPENS_AT[c.id]).toBeGreaterThanOrEqual(last);
      last = OPENS_AT[c.id];
    }
  });

  it("is clean throughout with the setting off", () => {
    for (let reps = 0; reps < 40; reps++) {
      for (let pos = 0; pos < 10; pos++) {
        expect(conditionFor(reps, pos, "off", true)).toBe(CLEAN);
      }
    }
  });

  it("is deterministic and reaches every open condition across a round", () => {
    const seen = new Set<string>();
    for (let pos = 0; pos < 20; pos++) {
      const a = conditionFor(OPENS_AT.half, pos, "on", true);
      const b = conditionFor(OPENS_AT.half, pos, "on", true);
      expect(a).toBe(b);
      seen.add(a.id);
    }
    expect([...seen].sort()).toEqual(CONDITIONS.map((c) => c.id).sort());
  });

  it("never hands a new word anything but a quiet room", () => {
    for (let pos = 0; pos < 20; pos++) {
      expect(conditionFor(0, pos, "on", true).id).toBe("clean");
      expect(conditionFor(1, pos, "on", true).id).toBe("clean");
    }
  });

  it("falls back to clean on an unknown id", () => {
    expect(conditionById("studio")).toBe(CLEAN);
    expect(conditionById("phone").id).toBe("phone");
  });

  it("keeps every effect inside what a browser can do honestly", () => {
    for (const c of CONDITIONS) {
      expect(c.speed).toBeGreaterThanOrEqual(0.5);
      expect(c.speed).toBeLessThanOrEqual(2);
      // A room is mixed from a decoded buffer, which cannot hold the pitch at
      // another rate, so a condition with a room keeps a normal one.
      if (c.noise !== null || c.band !== null || c.skip > 0) expect(c.speed).toBe(1);
      expect(c.skip).toBeGreaterThanOrEqual(0);
      expect(c.skip).toBeLessThan(0.6);
      if (c.noise) expect(c.noise.level).toBeLessThan(0.5);
      if (c.band) expect(c.band.lowHz).toBeLessThan(c.band.highHz);
      expect(c.said.length).toBeGreaterThan(0);
    }
  });

  it("says the room only when it was not a quiet one", () => {
    expect(describeHearing("Mari", CLEAN)).toBe("Read by Mari.");
    expect(describeHearing("Mari", conditionById("cafe"))).toBe("Read by Mari, over café noise.");
  });
});
