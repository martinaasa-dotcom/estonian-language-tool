import { describe, expect, it } from "vitest";
import { borrowSentences, claimIndex, type BorrowEntry } from "./borrow";

/*
  The rule a word borrows by, exercised on the words that produced it. `aeg`
  and `ajama` are the pair that showed the trap: `Tolm ajas aevastama` carries
  `ajas`, which a suffix on `aja` spells as the inessive of `aeg` and which the
  sentence uses as the past of `ajama`.
*/
const entry = (over: Partial<BorrowEntry> & { lemma: string; pos: string }): BorrowEntry => ({
  key: over.lemma, forms: [], examples: [], ...over,
});

const aeg = entry({
  lemma: "aeg", pos: "NOUN",
  forms: [
    { formType: "NOM_SG", value: "aeg" },
    { formType: "GEN_SG", value: "aja" },
    { formType: "PART_SG", value: "aega" },
  ],
});
const ajama = entry({
  lemma: "ajama", pos: "VERB",
  forms: [
    { formType: "INF_MA", value: "ajama" },
    { formType: "PRES_1SG", value: "ajan" },
    { formType: "PAST_1SG", value: "ajasin" },
  ],
});
const aevastama = entry({
  lemma: "aevastama", pos: "VERB",
  forms: [{ formType: "INF_MA", value: "aevastama" }, { formType: "PRES_1SG", value: "aevastan" }],
  examples: [{ et: "Tolm ajas aevastama.", en: null, source: "EKILEX" }],
});
const ravim = entry({
  lemma: "ravim", pos: "NOUN",
  forms: [
    { formType: "NOM_SG", value: "ravim" },
    { formType: "GEN_SG", value: "ravimi" },
    { formType: "PART_SG", value: "ravimit" },
  ],
  examples: [{ et: "See ravim on väga efektiivne.", en: null, source: "EKILEX" }],
});
const haigus = entry({
  lemma: "haigus", pos: "NOUN",
  forms: [{ formType: "NOM_SG", value: "haigus" }, { formType: "GEN_SG", value: "haiguse" }],
  examples: [
    { et: "Arst kirjutas haiguse vastu ravimit.", en: "The doctor prescribed medicine for the illness.", source: "EKILEX" },
    { et: "Ta võttis ravimit kolm korda päevas kogu pika haiguse ajal.", en: null, source: "EKILEX" },
    { et: "Kas ravimit on veel?", en: null, source: "EKILEX" },
  ],
});

describe("claimIndex", () => {
  it("claims a verb's past third person off its stored first person, over-reaching on purpose", () => {
    const claims = claimIndex([aeg, ajama]);
    expect(claims.get("ajas")).toEqual(new Set(["aeg", "ajama"]));
  });
});

describe("borrowSentences", () => {
  it("lends a sentence to every word whose form it carries, and never to its owner", () => {
    const out = borrowSentences([ravim, haigus]);
    expect(out.get("ravim")?.map((e) => e.et)).toContain("Arst kirjutas haiguse vastu ravimit.");
    // `haigus` owns those sentences and `ravim`'s own sentence carries no form of it.
    expect(out.get("haigus")).toBeUndefined();
  });

  it("refuses a spelling more than one entry claims", () => {
    const out = borrowSentences([aeg, ajama, aevastama]);
    expect(out.get("aeg")).toBeUndefined();
    expect(out.get("ajama")).toBeUndefined();
  });

  it("ranks a translated sentence first and a shorter one before a longer one", () => {
    const out = borrowSentences([ravim, haigus]);
    expect(out.get("ravim")?.map((e) => e.et)).toEqual([
      "Arst kirjutas haiguse vastu ravimit.",
      "Kas ravimit on veel?",
      "Ta võttis ravimit kolm korda päevas kogu pika haiguse ajal.",
    ]);
  });

  it("lends nothing a learner typed, and nothing that is not a sentence", () => {
    const owner = entry({
      lemma: "arst", pos: "NOUN",
      forms: [{ formType: "NOM_SG", value: "arst" }, { formType: "GEN_SG", value: "arsti" }],
      examples: [
        { et: "Ma ostsin ravimit.", en: null, source: "USER" },
        { et: "Ravimit ..", en: null, source: "EKILEX" },
        { et: "Ravimit / rohtu.", en: null, source: "EKILEX" },
      ],
    });
    expect(borrowSentences([ravim, owner]).get("ravim")).toBeUndefined();
  });
});
