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
