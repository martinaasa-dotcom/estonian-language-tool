import { describe, expect, it } from "vitest";
import { bothSetsOrdinary, localCasesFor, takesOutsideCases } from "./place";

/**
 * The countries this app teaches at A1 are the words the rule exists for, so
 * they are the words the test names.
 */
describe("takesOutsideCases", () => {
  it("holds for the -maa countries the course teaches", () => {
    for (const lemma of ["Saksamaa", "Venemaa", "Inglismaa"]) {
      expect(takesOutsideCases(lemma), lemma).toBe(true);
    }
  });

  it("holds for the everyday -maa nouns, which say abroad and homeland", () => {
    for (const lemma of ["välismaa", "kodumaa", "isamaa", "aiamaa"]) {
      expect(takesOutsideCases(lemma), lemma).toBe(true);
    }
  });

  it("does not reach an ordinary noun", () => {
    for (const lemma of ["tuba", "raamat", "linn", "Eesti", "Soome", "amet"]) {
      expect(takesOutsideCases(lemma), lemma).toBe(false);
    }
  });

  it("leaves maa alone, because both sets are ordinary Estonian for it", () => {
    expect(bothSetsOrdinary("maa")).toBe(true);
    expect(localCasesFor("maa")).toEqual([]);
  });

  it("drills the outside trio for a country and the inside trio otherwise", () => {
    expect(localCasesFor("Saksamaa")).toEqual(["ADESSIVE", "ABLATIVE", "ALLATIVE"]);
    expect(localCasesFor("tuba")).toEqual(["INESSIVE", "ELATIVE", "ILLATIVE"]);
  });
});
