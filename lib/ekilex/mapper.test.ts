import { describe, expect, it } from "vitest";

import { parseGovernment } from "@/lib/estonian/government";
import { mapEkilexDetails } from "./mapper";
import type { EkilexDetails } from "./client";

/*
  The mapper is where an outside dictionary becomes this app's data, and it had
  no tests. The government half of it was quietly dropping most of what Ekilex
  sends: it looked each pattern up whole, and Ekilex almost never writes a bare
  one. `tänama` arrives as "keda/mida*" and `hoolima` as "millest/kellest",
  neither of which is a key, so the case went unnamed and the drill discarded
  the verb. Verb government therefore stayed at the twenty-five entries somebody
  had typed by hand, next to a source that knows thousands, and nothing failed
  to say so.

  Every pattern below was taken from a real Ekilex response.
*/

const verb = (governments: string[], overrides: Partial<EkilexDetails> = {}): EkilexDetails => ({
  wordId: 1,
  wordValue: "tänama",
  paradigms: [
    {
      inflectionType: null,
      wordClass: "verb",
      forms: [
        { value: "tänama", morphCode: "Sup", morphValue: "ma-tegevusnimi" },
        { value: "tänada", morphCode: "Inf", morphValue: "da-tegevusnimi" },
        { value: "tänan", morphCode: "IndPrSg1", morphValue: "kindel, olevik, ainsus, 1. isik" },
      ],
    },
  ],
  definitions: [],
  governments,
  usages: [],
  cefr: null,
  ...overrides,
});

describe("government, as Ekilex actually writes it", () => {
  it.each([
    ["keda/mida*", "partitive", "tänama: alternatives that agree, and a trailing asterisk"],
    ["millest/kellest", "elative", "hoolima"],
    ["kellest/millest", "elative", "the same pair in the other order"],
    ["mida", "partitive", "a bare question word"],
    ["kellele", "allative", "helistama"],
  ])("names %j as the %s", (pattern, expected) => {
    const mapped = mapEkilexDetails(verb([pattern]));
    expect(mapped?.government).toBe(`${pattern} (${expected})`);
  });

  it.each([
    ["mille eest", "genitive governed by a postposition, not by the verb"],
    ["mida tegemast", "an infinitive complement, not a case"],
    ["kellel + mida teha", "two complements at once"],
    ["kuidas", "not a case question at all"],
  ])("leaves %j unnamed", (pattern) => {
    const mapped = mapEkilexDetails(verb([pattern]));
    // Kept verbatim for display, but claiming nothing: a wrong case in a drill
    // is worse than a missing one, because the learner memorises it.
    expect(mapped?.government).toBe(pattern);
  });

  it("does not name a case when the alternatives disagree", () => {
    expect(mapEkilexDetails(verb(["mida/millele"]))?.government).toBe("mida/millele");
  });

  it("keeps Ekilex's order, so the primary government stays first", () => {
    const mapped = mapEkilexDetails(verb(["kellele", "mida"]));
    expect(mapped?.government).toBe("kellele (allative) · mida (partitive)");
  });

  it("hands the drill a case it can parse, primary government first", () => {
    // The round trip that matters: what the mapper writes, the drill reads.
    const mapped = mapEkilexDetails(verb(["kellele", "mida"]));
    expect(parseGovernment(mapped?.government ?? null)?.caseKey).toBe("ALLATIVE");
  });

  it("round-trips the real tänama entry into a partitive question", () => {
    const mapped = mapEkilexDetails(verb(["keda/mida*", "mille eest", "mida tegemast"]));
    expect(parseGovernment(mapped?.government ?? null)?.caseKey).toBe("PARTITIVE");
  });

  it("is null when Ekilex records no government", () => {
    expect(mapEkilexDetails(verb([]))?.government).toBeNull();
  });
});

describe("what the mapper carries across", () => {
  it("keeps the principal parts a verb is memorised by", () => {
    const forms = mapEkilexDetails(verb(["mida"]))?.forms ?? [];
    const principal = Object.fromEntries(
      forms.filter((f) => f.isPrincipal).map((f) => [f.formType, f.value]),
    );
    expect(principal).toMatchObject({ INF_MA: "tänama", INF_DA: "tänada", PRES_1SG: "tänan" });
  });

  it("keeps attested sentences verbatim, because nothing here may write Estonian", () => {
    const sentence = "Tänan sind abi eest.";
    const mapped = mapEkilexDetails(verb(["keda/mida*"], { usages: [sentence] }));
    expect(mapped?.examples.map((e) => e.et)).toContain(sentence);
  });

  it("returns null for a word with no usable paradigm", () => {
    expect(mapEkilexDetails(verb([], { paradigms: [] }))).toBeNull();
  });
});
