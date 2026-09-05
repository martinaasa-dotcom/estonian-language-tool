import { describe, expect, it } from "vitest";
import { CARD_SOURCES, DEFAULT_SOURCE, isCardSource, isYourOwn, YOUR_OWN_SOURCES } from "./sources";

/**
 * WHOSE IDEA A WORD WAS, AND THE ONE VALUE THAT CANNOT SAY.
 *
 * `/review/lookups` reads this, so a source moving from one side of the line to
 * the other changes which words a learner is asked about. The two that must not
 * move are `DICTIONARY`, which was written by a unit add and by a dictionary
 * entry alike and so is claimed by neither, and `SCENE`, whose words are the
 * course's because a scene names unit ids.
 */
describe("card sources", () => {
  it("recognizes every source the app writes and nothing else", () => {
    for (const source of CARD_SOURCES) expect(isCardSource(source)).toBe(true);
    expect(isCardSource("SOMETHING_ELSE")).toBe(false);
    expect(isCardSource(42)).toBe(false);
    expect(isCardSource(null)).toBe(false);
    expect(isCardSource(undefined)).toBe(false);
  });

  it("counts the one-at-a-time adds as the learner's own", () => {
    for (const source of ["LOOKUP", "MANUAL", "TUTOR", "IMPORT", "SCAN", "ALMANAC"]) {
      expect(isYourOwn(source)).toBe(true);
    }
  });

  it("does not claim the material this app chose", () => {
    for (const source of ["COURSE", "FREQUENCY", "SCENE"]) expect(isYourOwn(source)).toBe(false);
  });

  it("claims nothing about a card written before the two were told apart", () => {
    expect(isCardSource("DICTIONARY")).toBe(true);
    expect(isYourOwn("DICTIONARY")).toBe(false);
  });

  it("files an unknown source under one this app writes", () => {
    expect(isCardSource(DEFAULT_SOURCE)).toBe(true);
  });

  it("keeps every own source inside the closed list", () => {
    for (const source of YOUR_OWN_SOURCES) expect(CARD_SOURCES).toContain(source);
  });
});
