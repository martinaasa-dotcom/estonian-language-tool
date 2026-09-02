import { describe, expect, it } from "vitest";
import {
  conditional, derivedVerbForms, imperativeSingular, negativePresent, presentTense, pres1sgFrom,
} from "./conjugate";

const values = (forms: readonly { value: string }[] | null) => forms?.map((f) => f.value) ?? null;

describe("the present tense off the first person", () => {
  it("runs the six persons on the stem, and says which one was stored", () => {
    const forms = presentTense({ lemma: "lugema", pres1sg: "loen" })!;
    expect(values(forms)).toEqual(["loen", "loed", "loeb", "loeme", "loete", "loevad"]);
    expect(forms[0]!.origin).toBe("STORED");
    expect(forms.slice(1).every((f) => f.origin === "DERIVED")).toBe(true);
  });

  it("keeps a particle verb's particle behind every form", () => {
    expect(values(presentTense({ lemma: "läbi lugema", pres1sg: "loen läbi" }))).toEqual([
      "loen läbi", "loed läbi", "loeb läbi", "loeme läbi", "loete läbi", "loevad läbi",
    ]);
  });

  it("derives nothing for the one verb whose third person is irregular", () => {
    expect(presentTense({ lemma: "olema", pres1sg: "olen" })).toBeNull();
    expect(negativePresent({ lemma: "olema", pres1sg: "olen" })).toBeNull();
  });

  it("refuses a first person it cannot read", () => {
    expect(presentTense({ lemma: "x", pres1sg: null })).toBeNull();
    expect(presentTense({ lemma: "x", pres1sg: "" })).toBeNull();
    expect(presentTense({ lemma: "x", pres1sg: "loe" })).toBeNull();
    expect(presentTense({ lemma: "x", pres1sg: "n" })).toBeNull();
  });
});

describe("the negative, the conditional and the imperative", () => {
  it("is the bare stem after ei", () => {
    expect(negativePresent({ lemma: "sööma", pres1sg: "söön" })?.value).toBe("söö");
    expect(negativePresent({ lemma: "ära tulema", pres1sg: "tulen ära" })?.value).toBe("tule ära");
  });

  it("builds the conditional on the same stem, olema included", () => {
    expect(values(conditional({ lemma: "olema", pres1sg: "olen" }))).toEqual([
      "oleksin", "oleksid", "oleks", "oleksime", "oleksite", "oleksid",
    ]);
    expect(values(conditional({ lemma: "minema", pres1sg: "lähen" }))).toEqual([
      "läheksin", "läheksid", "läheks", "läheksime", "läheksite", "läheksid",
    ]);
  });

  it("gives the singular imperative as the stem, except for minema", () => {
    expect(imperativeSingular({ lemma: "tulema", pres1sg: "tulen" })?.value).toBe("tule");
    expect(imperativeSingular({ lemma: "minema", pres1sg: "lähen" })).toBeNull();
    expect(imperativeSingular({ lemma: "olema", pres1sg: "olen" })).toBeNull();
  });

  /*
    `pidama` in the sense the course teaches, the one a learner needs for "ma
    pidin minema", has no imperative at all: Ekilex records the slot as absent
    and the rule would offer `pea`, which is the imperative of a different verb
    and also the word for a head. `npm run audit:verbs` found it, as the one
    disagreement in 797 verbs across thirteen slots after the course pinned
    `pidama` to the right homonym.
  */
  it("offers no imperative for a verb Ekilex records none for", () => {
    expect(imperativeSingular({ lemma: "pidama", pres1sg: "pean" })).toBeNull();
  });

  it("lists everything it can derive, and nothing for a verb it cannot", () => {
    expect(derivedVerbForms({ lemma: "lugema", pres1sg: "loen" })).toHaveLength(14);
    // olema keeps its conditional, which is regular, and loses the rest.
    expect(derivedVerbForms({ lemma: "olema", pres1sg: "olen" }).map((f) => f.morphCode))
      .toEqual(["KndPrSg1", "KndPrSg2", "KndPrPs", "KndPrPl1", "KndPrPl2", "KndPrPl3"]);
    expect(derivedVerbForms({ lemma: "x", pres1sg: null })).toEqual([]);
  });
});

describe("reading the first person off a form list", () => {
  it("takes the seeded slot, the morph code, or the seed's Ekilex spelling", () => {
    expect(pres1sgFrom([{ formType: "PRES_1SG", value: "loen" }])).toBe("loen");
    expect(pres1sgFrom([{ formType: "EKILEX:IndPrSg1", value: "loen" }])).toBe("loen");
    expect(pres1sgFrom([{ formType: "X", morphCode: "IndPrSg1", value: "loen" }])).toBe("loen");
    expect(pres1sgFrom([{ formType: "GEN_SG", value: "toa" }])).toBeNull();
  });
});
