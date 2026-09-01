import { describe, expect, it } from "vitest";
import { buildCaseTable, caseAnswer, stemsFrom, stemsFromParts } from "./derive";

/** No short illative recorded, so the suffix rule is the whole answer. */
const raamat = {
  nomSg: "raamat", genSg: "raamatu", partSg: "raamatut",
  partPl: "raamatuid", genPl: "raamatute", illSgShort: null,
};

/** The word that started this: the illative is `tuppa`, never `toasse`. */
const tuba = {
  nomSg: "tuba", genSg: "toa", partSg: "tuba",
  partPl: "tube", genPl: "tubade", illSgShort: "tuppa",
};

describe("buildCaseTable", () => {
  const table = buildCaseTable(raamat);
  const get = (key: string) => table.find((r) => r.spec.key === key);

  it("returns all fourteen cases", () => {
    expect(table).toHaveLength(14);
  });

  it("keeps the three principal parts as stored, not derived", () => {
    for (const key of ["NOMINATIVE", "GENITIVE", "PARTITIVE"]) {
      expect(get(key)?.origin).toBe("STORED");
    }
    expect(get("NOMINATIVE")?.singular).toBe("raamat");
    expect(get("GENITIVE")?.singular).toBe("raamatu");
    expect(get("PARTITIVE")?.singular).toBe("raamatut");
  });

  it("derives the ten regular cases from the genitive stem", () => {
    expect(get("INESSIVE")?.singular).toBe("raamatus");
    expect(get("ELATIVE")?.singular).toBe("raamatust");
    expect(get("ALLATIVE")?.singular).toBe("raamatule");
    expect(get("ADESSIVE")?.singular).toBe("raamatul");
    expect(get("ABLATIVE")?.singular).toBe("raamatult");
    expect(get("TRANSLATIVE")?.singular).toBe("raamatuks");
    expect(get("TERMINATIVE")?.singular).toBe("raamatuni");
    expect(get("ESSIVE")?.singular).toBe("raamatuna");
    expect(get("ABESSIVE")?.singular).toBe("raamatuta");
    expect(get("COMITATIVE")?.singular).toBe("raamatuga");
  });

  it("derives the illative too, where no short one is recorded", () => {
    expect(get("ILLATIVE")?.singular).toBe("raamatusse");
    expect(get("ILLATIVE")?.origin).toBe("DERIVED");
  });

  it("forms the nominative plural as genitive + d", () => {
    expect(get("NOMINATIVE")?.plural).toBe("raamatud");
  });

  it("builds plural obliques on the genitive plural when it is stored", () => {
    expect(get("INESSIVE")?.plural).toBe("raamatutes");
    expect(get("COMITATIVE")?.plural).toBe("raamatutega");
  });

  it("leaves plural obliques empty rather than inventing them (tuba : toa → tubade, not toade)", () => {
    const partial = buildCaseTable({ ...tuba, genPl: undefined });
    expect(partial.find((r) => r.spec.key === "INESSIVE")?.singular).toBe("toas");
    expect(partial.find((r) => r.spec.key === "INESSIVE")?.plural).toBeUndefined();
  });

  it("degrades safely when the genitive is unknown", () => {
    const partial = buildCaseTable({ nomSg: "sõna", illSgShort: null });
    expect(partial.find((r) => r.spec.key === "INESSIVE")?.singular).toBeUndefined();
    expect(partial).toHaveLength(14);
  });
});

/*
  THE ONE THAT SHIPPED WRONG.

  The illative is the only case of the eleven with a lexically unpredictable
  form, and the app printed the suffix rule for it on every screen: the landing
  page's demonstration, the dictionary entry, the grammar reference, and the
  answer side of a flashcard. `tuba` was taught as `toasse`.
*/
describe("the short illative beats the suffix rule", () => {
  it("shows tuppa, not toasse", () => {
    const ill = buildCaseTable(tuba).find((r) => r.spec.key === "ILLATIVE");
    expect(ill?.singular).toBe("tuppa");
    expect(ill?.origin).toBe("STORED");
  });

  it("still accepts the long form, so nobody is marked wrong for knowing both", () => {
    expect(caseAnswer(tuba, "ILLATIVE")?.accepted).toEqual(["tuppa", "toasse"]);
  });

  it("leaves the other ten cases alone", () => {
    expect(caseAnswer(tuba, "INESSIVE")?.value).toBe("toas");
    expect(caseAnswer(tuba, "COMITATIVE")?.value).toBe("toaga");
  });

  it("prefers a whole form a lexicographer wrote down over the suffix rule", () => {
    const withRetrieved = { ...raamat, retrieved: { INESSIVE: "raamatuis" } } as const;
    const answer = caseAnswer(withRetrieved, "INESSIVE");
    expect(answer?.value).toBe("raamatuis");
    expect(answer?.origin).toBe("EKILEX");
    // The regular form is still right, so it is still accepted.
    expect(answer?.accepted).toContain("raamatus");
  });
});

describe("caseAnswer", () => {
  it("answers one case", () => {
    expect(caseAnswer(tuba, "INESSIVE")?.value).toBe("toas");
  });
  it("refuses a principal part, which is stored rather than derived", () => {
    expect(caseAnswer(tuba, "PARTITIVE")).toBeNull();
  });
  it("returns null without a stem", () => {
    expect(caseAnswer({ nomSg: "sõna", illSgShort: null }, "INESSIVE")).toBeNull();
  });
});

/*
  The two readers exist because callers hold their forms in two shapes, and
  both had lost the short illative in their own way: one filters a form list,
  the other a `formType`-keyed map that had carried `ILL_SG_SHORT` all along.
*/
describe("reading stems off what a caller happens to hold", () => {
  it("finds the short illative on a formType row", () => {
    const stems = stemsFrom([
      { formType: "GEN_SG", value: "toa" },
      { formType: "ILL_SG_SHORT", value: "tuppa" },
    ]);
    expect(stems.illSgShort).toBe("tuppa");
    expect(caseAnswer(stems, "ILLATIVE")?.value).toBe("tuppa");
  });

  it("finds it on an Ekilex morph code too", () => {
    const stems = stemsFrom([
      { formType: "GEN_SG", value: "toa" },
      { formType: "EKILEX:SgAdt", morphCode: "SgAdt", value: "tuppa" },
    ]);
    expect(stems.illSgShort).toBe("tuppa");
  });

  it("reads a retrieved form off either column", () => {
    expect(stemsFrom([{ formType: "EKILEX:SgIn", value: "toas" }]).retrieved?.INESSIVE).toBe("toas");
    expect(stemsFrom([{ formType: "x", morphCode: "SgIn", value: "toas" }]).retrieved?.INESSIVE).toBe("toas");
  });

  it("says null rather than nothing when a word genuinely has no short illative", () => {
    expect(stemsFrom([{ formType: "GEN_SG", value: "raamatu" }]).illSgShort).toBeNull();
    expect(stemsFromParts({ GEN_SG: "raamatu" }).illSgShort).toBeNull();
  });

  it("reads the parts map the lesson and checkpoint screens hold", () => {
    const stems = stemsFromParts({ NOM_SG: "tuba", GEN_SG: "toa", ILL_SG_SHORT: "tuppa" });
    expect(caseAnswer(stems, "ILLATIVE")?.value).toBe("tuppa");
  });
});

describe("the illative, which is the one case with two answers", () => {
  it("prefers the stored short illative to the one the rule would build", () => {
    const tuba = buildCaseTable({
      nomSg: "tuba", genSg: "toa", partSg: "tuba", partPl: "tube", genPl: "tubade",
      illSgShort: "tuppa",
    });
    const ill = tuba.find((r) => r.spec.key === "ILLATIVE")!;
    expect(ill.singular).toBe("tuppa");
    expect(ill.origin).toBe("STORED");
  });

  it("keeps the plural regular, since only the singular has a short form", () => {
    const tuba = buildCaseTable({
      nomSg: "tuba", genSg: "toa", partSg: "tuba", partPl: "tube", genPl: "tubade",
      illSgShort: "tuppa",
    });
    expect(tuba.find((r) => r.spec.key === "ILLATIVE")!.plural).toBe("tubadesse");
  });

  it("derives it where the dictionary holds no short form", () => {
    const raamat = buildCaseTable({
      nomSg: "raamat", genSg: "raamatu", partSg: "raamatut", illSgShort: null,
    });
    const ill = raamat.find((r) => r.spec.key === "ILLATIVE")!;
    expect(ill.singular).toBe("raamatusse");
    expect(ill.origin).toBe("DERIVED");
  });

  it("ignores a short form that is a word the learner already has", () => {
    // `sõber` records `sõpra`, which is also its partitive. Promoting it would
    // print one word twice under two names and hide the form somebody writing
    // a sentence needs.
    const sober = buildCaseTable({
      nomSg: "sõber", genSg: "sõbra", partSg: "sõpra", partPl: "sõpru", genPl: "sõprade",
      illSgShort: "sõpra",
    });
    const ill = sober.find((r) => r.spec.key === "ILLATIVE")!;
    expect(ill.singular).toBe("sõbrasse");
    expect(ill.origin).toBe("DERIVED");
  });

  /*
    The other half of the line above: not leading with it is a decision about
    the screen, and a marker has no business inheriting it. Ekilex records
    `sõpra` as this word's short illative, so somebody who types it has given
    a right answer to the question that was asked.
  */
  it("still accepts the short form it declined to lead with", () => {
    const sober = {
      nomSg: "sõber", genSg: "sõbra", partSg: "sõpra", partPl: "sõpru",
      genPl: "sõprade", illSgShort: "sõpra",
    };
    const answer = caseAnswer(sober, "ILLATIVE");
    expect(answer?.value).toBe("sõbrasse");
    expect(answer?.accepted).toContain("sõpra");
  });
});
