import { describe, expect, it } from "vitest";
import { caseIndex, caseWritten, readCase, tidyForm } from "./whichCase";
import { stemsFromParts } from "./derive";

/*
  `raamat` is the word every grammar page in this app demonstrates with,
  because its principal parts are all different: nimetav `raamat`, omastav
  `raamatu`, osastav `raamatut`. So every one of its cases is spelled by
  exactly one case and all fourteen can be named.
*/
const raamat = stemsFromParts({
  NOM_SG: "raamat", GEN_SG: "raamatu", PART_SG: "raamatut",
});

/*
  `tuba` is the word the illative rules were written about. Its nominative and
  its partitive are the same word, and its short illative `tuppa` is a form no
  suffix reaches.
*/
const tuba = stemsFromParts({
  NOM_SG: "tuba", GEN_SG: "toa", PART_SG: "tuba", ILL_SG_SHORT: "tuppa",
});

describe("caseIndex", () => {
  it("names a case that nothing else is spelled like", () => {
    const index = caseIndex(raamat);
    expect(readCase(index, "raamatus")).toEqual({ kind: "one", key: "INESSIVE" });
    expect(readCase(index, "raamatust")).toEqual({ kind: "one", key: "ELATIVE" });
    expect(readCase(index, "raamatuga")).toEqual({ kind: "one", key: "COMITATIVE" });
    expect(readCase(index, "raamatu")).toEqual({ kind: "one", key: "GENITIVE" });
  });

  it("refuses to name a spelling that two cases share", () => {
    // The whole reason this is a verdict rather than a key: `tuba` is its own
    // nimetav and its own osastav, and calling it either is a coin toss.
    const verdict = readCase(caseIndex(tuba), "tuba");
    expect(verdict.kind).toBe("shared");
    if (verdict.kind === "shared") {
      expect([...verdict.keys].sort()).toEqual(["NOMINATIVE", "PARTITIVE"]);
    }
  });

  it("knows the short illative, which no suffix reaches", () => {
    expect(readCase(caseIndex(tuba), "tuppa")).toEqual({ kind: "one", key: "ILLATIVE" });
  });

  it("keeps the long illative beside it, since both are right", () => {
    expect(readCase(caseIndex(tuba), "toasse")).toEqual({ kind: "one", key: "ILLATIVE" });
  });

  it("does not claim a word that is not a form of this one", () => {
    expect(readCase(caseIndex(raamat), "koeraga")).toEqual({ kind: "unknown" });
    expect(readCase(caseIndex(raamat), "")).toEqual({ kind: "unknown" });
  });

  it("reports a short illative spelled like a principal part as shared", () => {
    /*
      `aadress` is the measured case in `CLAUDE.md`: 1,937 of the 2,700 short
      illatives in the shipped dictionary are spelled like the nominative, the
      genitive or the partitive. A rule that read the ending would announce
      every one of those as an illative.
    */
    const aadress = stemsFromParts({
      NOM_SG: "aadress", GEN_SG: "aadressi", PART_SG: "aadressi", ILL_SG_SHORT: "aadressi",
    });
    const verdict = readCase(caseIndex(aadress), "aadressi");
    expect(verdict.kind).toBe("shared");
    // And the long one, which is the form somebody writing a sentence needs,
    // is still named.
    expect(readCase(caseIndex(aadress), "aadressisse")).toEqual({ kind: "one", key: "ILLATIVE" });
  });

  it("builds nothing from a word with no genitive stem", () => {
    const index = caseIndex(stemsFromParts({ NOM_SG: "aitäh" }));
    expect(readCase(index, "aitähis")).toEqual({ kind: "unknown" });
  });
});

describe("caseWritten", () => {
  const index = caseIndex(raamat);

  it("finds the form in a sentence and names its case", () => {
    const found = caseWritten(index, "Ma loen raamatust, mis on laual.");
    expect(found?.written).toBe("raamatust");
    expect(found?.verdict).toEqual({ kind: "one", key: "ELATIVE" });
  });

  it("matches whole words, never a substring", () => {
    // `raamatu` sits inside `raamatute`, and reporting the genitive for a
    // sentence carrying the plural would teach the opposite of the lesson.
    expect(caseWritten(index, "Raamatute lugemine.")).toBeNull();
  });

  it("reads through punctuation and capitals", () => {
    expect(caseWritten(index, "Raamatuga!")?.verdict).toEqual({ kind: "one", key: "COMITATIVE" });
  });

  it("returns nothing when the sentence holds no form of the word", () => {
    expect(caseWritten(index, "Koer magab toas.")).toBeNull();
  });
});

describe("tidyForm", () => {
  it("keeps Estonian's own letters and drops everything else", () => {
    expect(tidyForm("Sõbraga,")).toBe("sõbraga");
    expect(tidyForm("  ")).toBe("");
  });
});
