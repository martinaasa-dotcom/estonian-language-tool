import { describe, expect, it } from "vitest";
import {
  dayKey,
  markDismissed,
  markOffered,
  NEW_MEMORY,
  OFFER_ON_DAY,
  readMemory,
  rememberDay,
  shouldOffer,
  writeMemory,
} from "./offer";

const CAN = { standalone: false, canInstall: true };

/** Opens the app on `n` distinct days, one after another. */
function afterDays(n: number) {
  let memory = NEW_MEMORY;
  for (let i = 1; i <= n; i += 1) memory = rememberDay(memory, `2026-08-0${i}`);
  return memory;
}

describe("the install offer", () => {
  it("says nothing on a first visit", () => {
    expect(shouldOffer(afterDays(1), CAN)).toBe(false);
  });

  it("waits for the day it was told to wait for", () => {
    expect(shouldOffer(afterDays(OFFER_ON_DAY - 1), CAN)).toBe(false);
    expect(shouldOffer(afterDays(OFFER_ON_DAY), CAN)).toBe(true);
  });

  it("counts days rather than visits", () => {
    let memory = NEW_MEMORY;
    for (let i = 0; i < 20; i += 1) memory = rememberDay(memory, "2026-08-01");
    expect(memory.days).toEqual(["2026-08-01"]);
    expect(shouldOffer(memory, CAN)).toBe(false);
  });

  it("never offers twice, even to somebody who ignored it", () => {
    const shown = markOffered(afterDays(OFFER_ON_DAY));
    expect(shouldOffer(shown, CAN)).toBe(false);
    expect(shouldOffer(rememberDay(shown, "2026-09-14"), CAN)).toBe(false);
  });

  it("never offers again after the X", () => {
    const gone = markDismissed(afterDays(OFFER_ON_DAY));
    expect(shouldOffer(gone, CAN)).toBe(false);
    expect(shouldOffer(readMemory(writeMemory(gone)), CAN)).toBe(false);
  });

  it("stays quiet when it is already installed, or when nothing can install it", () => {
    const ready = afterDays(OFFER_ON_DAY);
    expect(shouldOffer(ready, { standalone: true, canInstall: true })).toBe(false);
    expect(shouldOffer(ready, { standalone: false, canInstall: false })).toBe(false);
  });

  it("keeps the older dismissal, so nobody is asked a second time by an upgrade", () => {
    const migrated = readMemory(null, true);
    expect(migrated.dismissed).toBe(true);
    expect(shouldOffer(rememberDay(rememberDay(rememberDay(migrated, "a"), "b"), "c"), CAN)).toBe(false);
  });

  it("survives a round trip, and anything that is not one", () => {
    const memory = markOffered(afterDays(2));
    expect(readMemory(writeMemory(memory))).toEqual(memory);
    expect(readMemory("not json at all")).toEqual(NEW_MEMORY);
    expect(readMemory("[1,2,3]")).toEqual(NEW_MEMORY);
    expect(readMemory('{"days":"tuesday"}')).toEqual(NEW_MEMORY);
  });

  it("remembers no more days than it needs", () => {
    const memory = afterDays(9);
    expect(memory.days).toHaveLength(OFFER_ON_DAY);
  });

  it("names a day by the local calendar", () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });
});
