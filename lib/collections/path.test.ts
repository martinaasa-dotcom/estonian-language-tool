import { describe, expect, it } from "vitest";
import { PATH, unitById, unitProgress } from "./path";
import { NOUNS } from "@/prisma/data/nouns";
import { VERBS } from "@/prisma/data/verbs";
import { ADJECTIVES, PHRASES } from "@/prisma/data/other";
import { ADVANCED_ADJECTIVES, ADVANCED_NOUNS, ADVANCED_VERBS } from "@/prisma/data/advanced";

/**
 * The path references the built-in dictionary by lemma. A typo would silently
 * shrink a unit rather than fail loudly, so it is checked here against the seed
 * data itself — the same source `npm run db:seed` writes from.
 */
const SEEDED = new Set<string>([
  ...NOUNS.map((n) => n[0]),
  ...ADVANCED_NOUNS.map((n) => n[0]),
  ...VERBS.map((v) => v[0]),
  ...ADVANCED_VERBS.map((v) => v[0]),
  ...ADJECTIVES.map((a) => a[0]),
  ...ADVANCED_ADJECTIVES.map((a) => a[0]),
  ...PHRASES.map((p) => p[0]),
]);

describe("the learning path", () => {
  it("has unique unit ids", () => {
    const ids = PATH.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only references words the built-in dictionary actually carries", () => {
    const missing: string[] = [];
    for (const unit of PATH) {
      for (const lemma of unit.lemmas) if (!SEEDED.has(lemma)) missing.push(`${unit.id}: ${lemma}`);
    }
    expect(missing).toEqual([]);
  });

  it("never repeats a word inside one unit", () => {
    for (const unit of PATH) {
      expect(new Set(unit.lemmas).size, unit.id).toBe(unit.lemmas.length);
    }
  });

  it("keeps every unit to a sitting", () => {
    for (const unit of PATH) {
      expect(unit.lemmas.length, unit.id).toBeGreaterThanOrEqual(8);
      expect(unit.lemmas.length, unit.id).toBeLessThanOrEqual(24);
    }
  });

  it("runs from easiest to hardest", () => {
    const order = ["A1", "A2", "B1", "B2", "C1"];
    const levels = PATH.map((u) => order.indexOf(u.cefr));
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
  });

  it("asks for government cards exactly where government is the point", () => {
    const rektsioon = unitById("rektsioon");
    expect(rektsioon?.cardTypes).toContain("GOVERNMENT");
  });

  it("resolves a unit by id, and nothing by a bad one", () => {
    expect(unitById("kodu")?.title).toBe("Kodu");
    expect(unitById("not-a-unit")).toBeUndefined();
  });
});

describe("unitProgress", () => {
  const lemmas = ["a", "b", "c", "d"];

  it("is 'new' before anything is added", () => {
    const p = unitProgress({ availableLemmas: lemmas, startedLemmas: [], knownLemmas: [] });
    expect(p).toMatchObject({ state: "new", pct: 0, started: 0, known: 0 });
  });

  it("counts a started word as half and a known word as whole", () => {
    const p = unitProgress({ availableLemmas: lemmas, startedLemmas: ["a", "b"], knownLemmas: ["a"] });
    // one known (1) + one started-not-known (0.5) out of four = 38%
    expect(p.pct).toBe(38);
    expect(p.state).toBe("learning");
  });

  it("is done only when every word is known", () => {
    const nearly = unitProgress({ availableLemmas: lemmas, startedLemmas: lemmas, knownLemmas: ["a", "b", "c"] });
    expect(nearly.state).toBe("learning");
    const all = unitProgress({ availableLemmas: lemmas, startedLemmas: lemmas, knownLemmas: lemmas });
    expect(all).toMatchObject({ state: "done", pct: 100 });
  });

  it("ignores progress on words the unit does not contain", () => {
    const p = unitProgress({ availableLemmas: lemmas, startedLemmas: ["z"], knownLemmas: ["z"] });
    expect(p).toMatchObject({ started: 0, known: 0, pct: 0 });
  });

  it("locks a unit whose words are missing from the dictionary entirely", () => {
    const p = unitProgress({ availableLemmas: [], startedLemmas: [], knownLemmas: [] });
    expect(p.state).toBe("locked");
  });
});
