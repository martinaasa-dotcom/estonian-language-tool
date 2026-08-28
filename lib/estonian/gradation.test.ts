import { describe, expect, it } from "vitest";
import { classifyGradation } from "./gradation";

describe("classifyGradation", () => {
  it.each([
    // [nominative, genitive, type, note fragment]
    ["lukk",   "luku",    "QUALITATIVE", "kk : k"],
    ["sepp",   "sepa",    "QUALITATIVE", "pp : p"],
    ["pott",   "poti",    "QUALITATIVE", "tt : t"],
    ["märk",   "märgi",   "QUALITATIVE", "k : g"],
    ["kaup",   "kauba",   "QUALITATIVE", "p : b"],
    ["uus",    "uue",     "QUALITATIVE", "s : ∅"],
  ])("classifies %s : %s as %s (%s)", (nom, gen, type, note) => {
    const result = classifyGradation(nom, gen);
    expect(result.type).toBe(type);
    expect(result.note).toBe(note);
  });

  it("reports an alternation honestly when a vowel changes too (tuba : toa)", () => {
    const result = classifyGradation("tuba", "toa");
    expect(result.type).toBe("QUALITATIVE");
    // The `b` vanishes and the stem vowel shifts; we describe rather than force a pattern.
    expect(result.note).toBeDefined();
  });

  it.each([
    ["raamat", "raamatu"],
    ["auto",   "auto"],
    ["tore",   "toreda"],
  ])("finds no alternation in %s : %s", (nom, gen) => {
    expect(classifyGradation(nom, gen).type).toBe("NONE");
  });

  it("never crashes on empty or single-character input", () => {
    expect(classifyGradation("", "").type).toBe("NONE");
    expect(classifyGradation("a", "b").type).toBeDefined();
  });
});

import { classifyVerbGradation } from "./gradation";

describe("classifyVerbGradation", () => {
  it.each([
    ["lugema",  "loen",   "g : ∅"],
    ["hakkama", "hakkan", undefined],
  ])("compares %s with %s after stripping endings", (ma, pres, note) => {
    const result = classifyVerbGradation(ma, pres);
    expect(result.note).toBe(note);
  });

  it("strips the -ma and -n before comparing, not after", () => {
    // Without stripping this would report the endings as an alternation.
    expect(classifyVerbGradation("lugema", "loen").note).not.toContain("m");
  });
});

describe("classifyGradation — patterns that are not gradation", () => {
  it.each([
    ["inimene", "inimese"],
    ["aeglane", "aeglase"],
    ["õpilane", "õpilase"],
    ["keeruline", "keerulise"],
  ])("does not report the -ne : -se declension type as gradation (%s : %s)", (nom, gen) => {
    expect(classifyGradation(nom, gen).type).toBe("NONE");
  });
});

describe("classifyGradation — clusters and reverse direction", () => {
  it.each([
    ["tund", "tunni", "nd : nn"],
    ["hind", "hinna", "nd : nn"],
    ["kuld", "kulla", "ld : ll"],
    ["kord", "korra", "rd : rr"],
  ])("reads %s : %s as a cluster alternation", (nom, gen, note) => {
    expect(classifyGradation(nom, gen).note).toBe(note);
  });

  it.each([
    ["toode", "toote", "d : t"],
    ["mõte", "mõtte", "t : tt"],
  ])("handles reverse gradation, weak nominative to strong genitive (%s : %s)", (nom, gen, note) => {
    expect(classifyGradation(nom, gen).note).toBe(note);
  });
});
