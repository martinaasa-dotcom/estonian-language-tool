import { describe, expect, it } from "vitest";
import { buildCaseTable, deriveCase } from "./derive";

const raamat = { nomSg: "raamat", genSg: "raamatu", partSg: "raamatut", partPl: "raamatuid", genPl: "raamatute" };

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

  it("derives the eleven regular cases from the genitive stem", () => {
    expect(get("ILLATIVE")?.singular).toBe("raamatusse");
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

  it("forms the nominative plural as genitive + d", () => {
    expect(get("NOMINATIVE")?.plural).toBe("raamatud");
  });

  it("builds plural obliques on the genitive plural when it is stored", () => {
    expect(get("INESSIVE")?.plural).toBe("raamatutes");
    expect(get("COMITATIVE")?.plural).toBe("raamatutega");
  });

  it("leaves plural obliques empty rather than inventing them (tuba : toa → tubade, not toade)", () => {
    const tuba = buildCaseTable({ nomSg: "tuba", genSg: "toa", partSg: "tuba", partPl: "tube" });
    expect(tuba.find((r) => r.spec.key === "INESSIVE")?.singular).toBe("toas");
    expect(tuba.find((r) => r.spec.key === "INESSIVE")?.plural).toBeUndefined();
  });

  it("degrades safely when the genitive is unknown", () => {
    const partial = buildCaseTable({ nomSg: "sõna" });
    expect(partial.find((r) => r.spec.key === "INESSIVE")?.singular).toBeUndefined();
    expect(partial).toHaveLength(14);
  });
});

describe("deriveCase", () => {
  it("derives a single case", () => {
    expect(deriveCase("toa", "INESSIVE")).toBe("toas");
  });
  it("refuses to derive a principal part", () => {
    expect(deriveCase("toa", "PARTITIVE")).toBeUndefined();
  });
  it("returns undefined without a stem", () => {
    expect(deriveCase(undefined, "INESSIVE")).toBeUndefined();
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
      nomSg: "raamat", genSg: "raamatu", partSg: "raamatut",
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
});
