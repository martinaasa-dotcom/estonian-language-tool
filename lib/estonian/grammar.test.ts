import { describe, expect, it } from "vitest";
import { CASES } from "./cases";
import { allCaseReferences, caseReference, CASE_GROUPS, CASE_NOTES } from "./grammar";

describe("case notes", () => {
  it("covers every case exactly once", () => {
    expect(CASE_NOTES).toHaveLength(CASES.length);
    const keys = CASE_NOTES.map((n) => n.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const spec of CASES) expect(keys).toContain(spec.key);
  });

  it("orders the reference the way the cases are taught", () => {
    expect(allCaseReferences().map((r) => r.key)).toEqual(CASES.map((c) => c.key));
  });

  it("pairs each note with its grammatical spec", () => {
    const inessive = caseReference("INESSIVE");
    expect(inessive?.spec.et).toBe("seesütlev");
    expect(inessive?.spec.question).toBe("milles? kus?");
    expect(inessive?.summary).toMatch(/inside/i);
  });

  it("returns nothing for a case that does not exist", () => {
    expect(caseReference("DATIVE")).toBeUndefined();
    expect(caseReference("")).toBeUndefined();
  });

  it("says something useful in every field", () => {
    for (const note of CASE_NOTES) {
      expect(note.summary.length).toBeGreaterThan(20);
      expect(note.watchOut.length).toBeGreaterThan(40);
      expect(note.uses.length).toBeGreaterThanOrEqual(2);
      for (const use of note.uses) expect(use.length).toBeGreaterThan(8);
    }
  });
});

/**
 * A tripwire, not a proof.
 *
 * This is the one module that writes *about* Estonian at length, and the
 * temptation to slip in an example is exactly what ADR-005 forbids: a form
 * written here is unattested, and the page renders it beside real ones from
 * Ekilex where nothing marks it as invented. A regex cannot tell prose from a
 * smuggled form — `majas` is four ordinary letters — but Estonian of any length
 * reaches for its own letters almost immediately, so this catches the realistic
 * case. The actual guarantee is structural: every form and sentence on the
 * grammar page is read out of the dictionary, and this module supplies none.
 */
describe("nothing here is written in Estonian", () => {
  const ESTONIAN_LETTERS = /[õäöüšž]/i;

  const strings = [
    ...CASE_NOTES.flatMap((n) => [n.summary, n.watchOut, ...n.uses, n.englishHook ?? ""]),
    ...CASE_GROUPS.flatMap((g) => [g.title, g.blurb]),
  ];

  it("has no Estonian letters in any note", () => {
    for (const text of strings) {
      expect(text, `"${text}"`).not.toMatch(ESTONIAN_LETTERS);
    }
  });

  it("would catch one if it appeared", () => {
    expect("näiteks: ta läheb tuppa").toMatch(ESTONIAN_LETTERS);
  });
});

describe("case groups", () => {
  it("places every case in exactly one group", () => {
    const grouped = CASE_GROUPS.flatMap((g) => g.keys);
    expect(grouped).toHaveLength(CASES.length);
    expect(new Set(grouped).size).toBe(CASES.length);
    for (const spec of CASES) expect(grouped).toContain(spec.key);
  });

  it("keeps the principal parts together and first", () => {
    expect(CASE_GROUPS[0]?.keys).toEqual(["NOMINATIVE", "GENITIVE", "PARTITIVE"]);
    expect(CASES.filter((c) => c.principal).map((c) => c.key)).toEqual([
      "NOMINATIVE", "GENITIVE", "PARTITIVE",
    ]);
  });
});
