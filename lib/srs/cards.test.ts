import { describe, expect, it } from "vitest";
import { availableCardTypes, generateCards, type LexemeForCards } from "./cards";

const tuba: LexemeForCards = {
  lemma: "tuba", translation: "room", pos: "NOUN",
  gradation: "QUALITATIVE", gradationNote: "b : ∅", government: null,
  forms: [
    { formType: "NOM_SG", value: "tuba" },
    { formType: "GEN_SG", value: "toa" },
    { formType: "PART_SG", value: "tuba" },
  ],
};

const aitama: LexemeForCards = {
  lemma: "aitama", translation: "to help", pos: "VERB",
  gradation: "NONE", gradationNote: null,
  government: "partitive — aitan sind",
  forms: [{ formType: "INF_MA", value: "aitama" }],
};

describe("generateCards", () => {
  it("makes both directions for a plain word", () => {
    const cards = generateCards(tuba, ["RECOGNITION", "PRODUCTION"]);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({ front: "tuba", back: "room" });
    expect(cards[1]).toMatchObject({ front: "room", back: "tuba" });
  });

  it("derives case cards from the genitive stem", () => {
    const cards = generateCards(tuba, ["CASE_FORM"]);
    const inessive = cards.find((c) => c.targetCase === "INESSIVE");
    expect(inessive?.back).toBe("toas");
    expect(inessive?.front).toContain("tuba");
    // Asked by the question, which is how a class is asked for a case. The
    // Latin name is the cross-reference on the hint, not the prompt.
    expect(inessive?.front).toContain("kus?");
    expect(inessive?.front).not.toMatch(/inessive/i);
    expect(inessive?.hint).toContain("seesütlev");
    expect(inessive?.hint).toContain("inessive");
  });

  it("makes a gradation card only when the word actually alternates", () => {
    expect(generateCards(tuba, ["GRADATION"])).toHaveLength(1);
    expect(generateCards(aitama, ["GRADATION"])).toHaveLength(0);
  });

  it("makes a government card only when government is recorded", () => {
    expect(generateCards(aitama, ["GOVERNMENT"])[0]?.back).toContain("partitive");
    expect(generateCards(tuba, ["GOVERNMENT"])).toHaveLength(0);
  });

  it("produces nothing rather than guessing when the stem is missing", () => {
    const bare: LexemeForCards = { ...tuba, forms: [{ formType: "NOM_SG", value: "tuba" }] };
    expect(generateCards(bare, ["CASE_FORM", "GRADATION"])).toHaveLength(0);
  });
});

describe("availableCardTypes", () => {
  it("offers gradation and case drills for a gradating noun", () => {
    expect(availableCardTypes(tuba)).toEqual(["RECOGNITION", "PRODUCTION", "CASE_FORM", "GRADATION"]);
  });
  it("offers government for a verb that records it", () => {
    expect(availableCardTypes(aitama)).toContain("GOVERNMENT");
  });
});

describe("generateCards — CLOZE", () => {
  const drinking: LexemeForCards = {
    lemma: "kohv",
    translation: "coffee",
    pos: "NOUN",
    gradation: "NONE",
    gradationNote: null,
    government: null,
    examples: JSON.stringify([
      { et: "Jõin tassi kohvi.", source: "EKILEX" },
      { et: "Kohv on laual.", source: "EKILEX" },
      { et: "Ma ei taha täna kohvi juua.", source: "EKILEX" },
    ]),
    forms: [
      { formType: "NOM_SG", value: "kohv", morphCode: "SgN" },
      { formType: "GEN_SG", value: "kohvi", morphCode: "SgG" },
      { formType: "PART_SG", value: "kohvi", morphCode: "SgP" },
    ],
  };

  it("hides a real form inside a real sentence", () => {
    const cards = generateCards(drinking, ["CLOZE"]);
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.front).toContain("____");
      // The answer is a form we actually hold, never something invented…
      expect(["kohv", "kohvi"]).toContain(card.back.toLowerCase());
      // …and it is no longer visible in the prompt.
      expect(card.front.toLowerCase()).not.toContain(card.back.toLowerCase());
    }
  });

  it("shows the shortest sentence first — a one-liner beats a subtler example", () => {
    const [first] = generateCards(drinking, ["CLOZE"]);
    expect(first?.front).toBe("____ on laual.");
  });

  it("gives the lemma as the hint — it asks for the form, not the vocabulary", () => {
    const [card] = generateCards(drinking, ["CLOZE"]);
    expect(card?.hint).toContain("kohv");
    expect(card?.hint).toContain("coffee");
  });

  it("tags the case, so a gap-fill counts towards the weak-case breakdown", () => {
    const cards = generateCards(drinking, ["CLOZE"]);
    expect(cards.some((c) => c.targetCase !== null)).toBe(true);
  });

  it("stops at two per word rather than drilling every sentence", () => {
    expect(generateCards(drinking, ["CLOZE"])).toHaveLength(2);
  });

  it("produces nothing when the word has no examples", () => {
    expect(generateCards({ ...drinking, examples: null }, ["CLOZE"])).toEqual([]);
    expect(generateCards({ ...drinking, examples: "[]" }, ["CLOZE"])).toEqual([]);
  });

  it("produces nothing when no example actually contains the word", () => {
    const elsewhere = {
      ...drinking,
      examples: JSON.stringify([{ et: "Ilm on täna väga ilus.", source: "EKILEX" }]),
    };
    expect(generateCards(elsewhere, ["CLOZE"])).toEqual([]);
  });

  it("is only offered when it can produce something", () => {
    expect(availableCardTypes(drinking)).toContain("CLOZE");
    expect(availableCardTypes({ ...drinking, examples: null })).not.toContain("CLOZE");
  });
});

describe("generateCards — CONJUGATION", () => {
  const lugema: LexemeForCards = {
    lemma: "lugema",
    translation: "to read",
    pos: "VERB",
    gradation: "QUALITATIVE",
    gradationNote: "g : ∅",
    government: null,
    forms: [
      { formType: "INF_MA", value: "lugema", morphCode: "Sup" },
      { formType: "PRES_1SG", value: "loen", morphCode: "IndPrSg1" },
      { formType: "EKILEX:IndPrSg3", value: "loeb", morphCode: "IndPrSg3" },
      { formType: "PAST_1SG", value: "lugesin", morphCode: "IndIpfSg1" },
      { formType: "EKILEX:KndPrSg1", value: "loeksin", morphCode: "KndPrSg1" },
    ],
  };

  it("asks by the name a class uses, and answers with the stored form", () => {
    const cards = generateCards(lugema, ["CONJUGATION"]);
    const third = cards.find((c) => c.front.includes("olevik · ta"));
    expect(third?.back).toBe("loeb");
    expect(cards.every((c) => lugema.forms.some((f) => f.value === c.back))).toBe(true);
  });

  it("falls back to the seeded principal parts when there are no Ekilex codes", () => {
    const seeded: LexemeForCards = {
      ...lugema,
      forms: [
        { formType: "PRES_1SG", value: "loen" },
        { formType: "PAST_1SG", value: "lugesin" },
      ],
    };
    const cards = generateCards(seeded, ["CONJUGATION"]);
    expect(cards.map((c) => c.back)).toEqual(["loen", "lugesin"]);
  });

  it("makes nothing for a noun", () => {
    expect(generateCards({ ...lugema, pos: "NOUN" }, ["CONJUGATION"])).toEqual([]);
  });

  it("is offered only for a verb whose forms are actually held", () => {
    expect(availableCardTypes(lugema)).toContain("CONJUGATION");
    expect(availableCardTypes({ ...lugema, forms: [] })).not.toContain("CONJUGATION");
  });
});
