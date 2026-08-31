import { describe, expect, it } from "vitest";
import { glossSenses, matchesGloss, senseIndex } from "./gloss";

describe("glossSenses", () => {
  it("splits on what a lexicographer separated", () => {
    expect(glossSenses("moose, European elk")).toEqual(["moose", "european elk"]);
  });

  it("drops an infinitive marker and an article", () => {
    expect(glossSenses("to love")).toEqual(["love"]);
    expect(glossSenses("a year")).toEqual(["year"]);
    expect(glossSenses("the present")).toEqual(["present"]);
  });

  it("drops a parenthetical note about the sense", () => {
    expect(glossSenses("(light) meal, snack")).toEqual(["meal", "snack"]);
  });
});

describe("matchesGloss", () => {
  it("finds the sense the almanac asked for", () => {
    expect(matchesGloss("pancake, crepe", "pancake")).toBe(true);
    expect(matchesGloss("crop, harvest, yield", "harvest")).toBe(true);
  });

  it("refuses a substring that runs through a comma", () => {
    /*
      The two that made this module exist. A `contains` match on "dark" reaches
      a slur and a `contains` match on "love" reaches "love child", and either
      one would have been printed on the home page under a heading saying it
      was chosen for today.
    */
    expect(matchesGloss("darkie, dark-skinned person, black person", "dark")).toBe(false);
    expect(matchesGloss("love child, natural child, bastard", "love")).toBe(false);
    expect(matchesGloss("heart attack", "heart")).toBe(false);
  });

  it("still matches the word itself", () => {
    expect(matchesGloss("dark", "dark")).toBe(true);
    expect(matchesGloss("love", "love")).toBe(true);
  });
});

describe("senseIndex", () => {
  it("puts the everyday sense ahead of a stretched one", () => {
    expect(senseIndex("fire", "fire")).toBe(0);
    expect(senseIndex("blaze, flame, fire", "fire")).toBe(2);
  });

  it("reports a miss as a miss", () => {
    expect(senseIndex("bread, black bread", "butter")).toBe(-1);
  });
});
