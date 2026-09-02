import { describe, expect, it } from "vitest";
import { buildCaseTable, caseAnswer, shownForms, stemsFrom, stemsFromParts } from "./derive";

/** No short illative recorded, so the suffix rule is the whole answer. */
const raamat = {
  nomSg: "raamat", genSg: "raamatu", partSg: "raamatut",
  partPl: "raamatuid", genPl: "raamatute", illSgShort: null, nomPl: "raamatud",
};

/** The word that started this: the illative is `tuppa`, never `toasse`. */
const tuba = {
  nomSg: "tuba", genSg: "toa", partSg: "tuba",
  partPl: "tube", genPl: "tubade", illSgShort: "tuppa", nomPl: "toad",
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

  it("prints the stored nominative plural and never an ending", () => {
    expect(get("NOMINATIVE")?.plural).toBe("raamatud");
  });

  /*
    The rule this replaced was `genSg + d`, and `scripts/audit-cases.ts` put it
    to Ekilex for every nominal in the dictionary. It is right for 5,098 of
    5,143 and wrong for a whole category: a pronoun is suppletive in the
    nominative plural, so `see` goes to `need` where the ending gives `selled`,
    and `too` to `nood` where it gives `tolled`. Both are first-lesson words.
    Thirty-three mass nouns have no plural at all and were being given one.
  */
  it("shows no plural for a word the dictionary holds none for", () => {
    const pronoun = buildCaseTable({
      nomSg: "see", genSg: "selle", partSg: "seda",
      partPl: "neid", genPl: "nende", illSgShort: null, nomPl: null,
    });
    expect(pronoun.find((r) => r.spec.key === "NOMINATIVE")?.plural).toBeUndefined();
  });

  it("takes the plural the dictionary holds, however little the stem predicts it", () => {
    const pronoun = buildCaseTable({
      nomSg: "see", genSg: "selle", partSg: "seda",
      partPl: "neid", genPl: "nende", illSgShort: null, nomPl: "need",
    });
    expect(pronoun.find((r) => r.spec.key === "NOMINATIVE")?.plural).toBe("need");
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
    const partial = buildCaseTable({ nomSg: "sõna", illSgShort: null, nomPl: null });
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
    expect(caseAnswer({ nomSg: "sõna", illSgShort: null, nomPl: null }, "INESSIVE")).toBeNull();
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
      illSgShort: "tuppa", nomPl: null,
    });
    const ill = tuba.find((r) => r.spec.key === "ILLATIVE")!;
    expect(ill.singular).toBe("tuppa");
    expect(ill.origin).toBe("STORED");
  });

  it("keeps the plural regular, since only the singular has a short form", () => {
    const tuba = buildCaseTable({
      nomSg: "tuba", genSg: "toa", partSg: "tuba", partPl: "tube", genPl: "tubade",
      illSgShort: "tuppa", nomPl: null,
    });
    expect(tuba.find((r) => r.spec.key === "ILLATIVE")!.plural).toBe("tubadesse");
  });

  it("derives it where the dictionary holds no short form", () => {
    const raamat = buildCaseTable({
      nomSg: "raamat", genSg: "raamatu", partSg: "raamatut", illSgShort: null, nomPl: null,
    });
    const ill = raamat.find((r) => r.spec.key === "ILLATIVE")!;
    expect(ill.singular).toBe("raamatusse");
    expect(ill.origin).toBe("DERIVED");
  });

  it("names both illatives where the word has two", () => {
    const tuba = buildCaseTable({
      nomSg: "tuba", genSg: "toa", partSg: "tuba", partPl: "tube", genPl: "tubade",
      illSgShort: "tuppa", nomPl: null,
    });
    const ill = tuba.find((r) => r.spec.key === "ILLATIVE")!;
    expect(ill.singular).toBe("tuppa");
    expect(ill.alsoRight).toBe("toasse");
    expect(shownForms(ill)).toEqual(["tuppa", "toasse"]);
  });

  it("names both even where the short one is spelled like a principal part", () => {
    // The case `aadress` makes: its short illative is also its genitive and
    // its partitive, so leading with it alone prints the same word three times
    // down the column and hides `aadressisse`. Printing the pair is what stops
    // the row repeating what the two above it already said.
    const aadress = buildCaseTable({
      nomSg: "aadress", genSg: "aadressi", partSg: "aadressi",
      partPl: "aadresse", genPl: "aadresside", illSgShort: "aadressi", nomPl: null,
    });
    const ill = aadress.find((r) => r.spec.key === "ILLATIVE")!;
    expect(shownForms(ill)).toEqual(["aadressi", "aadressisse"]);
  });

  it("has no second form for a case with one answer", () => {
    const tuba = buildCaseTable({
      nomSg: "tuba", genSg: "toa", partSg: "tuba", partPl: "tube", genPl: "tubade",
      illSgShort: "tuppa", nomPl: null,
    });
    for (const row of tuba.filter((r) => r.spec.key !== "ILLATIVE")) {
      expect(row.alsoRight, row.spec.key).toBeNull();
    }
  });

  it("has no second form where the word records no short illative", () => {
    const raamat = buildCaseTable({
      nomSg: "raamat", genSg: "raamatu", partSg: "raamatut", illSgShort: null, nomPl: null,
    });
    const ill = raamat.find((r) => r.spec.key === "ILLATIVE")!;
    expect(ill.alsoRight).toBeNull();
    expect(shownForms(ill)).toEqual(["raamatusse"]);
  });

  it("prints what a marker accepts, so either half of a pair on screen is right", () => {
    const stems = {
      nomSg: "tuba", genSg: "toa", partSg: "tuba", partPl: "tube", genPl: "tubade",
      illSgShort: "tuppa", nomPl: null,
    } as const;
    const answer = caseAnswer(stems, "ILLATIVE")!;
    for (const form of shownForms({ singular: answer.value, alsoRight: answer.alsoRight })) {
      expect(answer.accepted).toContain(form);
    }
  });

  it("shows a short form spelled like a principal part, because most of them are", () => {
    // 1,937 of the 2,700 short illatives in the shipped dictionary are spelled
    // like the nominative, genitive or partitive, and they are ordinary
    // Estonian: `aeg` goes to `aega`, `arst` to `arsti`. An earlier version of
    // this file suppressed those on the argument that the card should not
    // print one word twice, which is true of the card and false of the
    // language: it printed `ajasse` and marked `aega` wrong, on 1,937 words.
    const aeg = buildCaseTable({
      nomSg: "aeg", genSg: "aja", partSg: "aega", partPl: "aegu", genPl: "aegade",
      illSgShort: "aega", nomPl: null,
    });
    const ill = aeg.find((r) => r.spec.key === "ILLATIVE")!;
    expect(ill.singular).toBe("aega");
    expect(ill.origin).toBe("STORED");
    // And the long one is still right, so knowing both is never marked wrong.
    expect(ill.accepted).toContain("ajasse");
  });
});
