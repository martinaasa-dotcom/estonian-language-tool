import { describe, expect, it } from "vitest";
import {
  availableCardTypes, generateCards, inTeachingOrder, teachingRank, type LexemeForCards,
} from "./cards";

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

  it("gives the lemma as the hint where the gap wants an inflected form", () => {
    const inflected = generateCards(drinking, ["CLOZE"]).find(
      (c) => c.back.toLowerCase() !== "kohv",
    );
    expect(inflected?.back.toLowerCase()).toBe("kohvi");
    expect(inflected?.hint).toContain("kohv");
    expect(inflected?.hint).toContain("coffee");
  });

  /*
    AND WITHHOLDS IT WHERE THE GAP WANTS THE LEMMA, which is 2,468 of these
    cards across the shipped dictionary and 302 of the ones the course builds.
    The hint was the answer, printed a line under the gap, so the exercise the
    comment above describes was not the exercise on screen. The meaning stays,
    because "which word goes in this gap" is worth asking.
  */
  /*
    AND WITHHOLDS THE HINT ALTOGETHER WHERE THE MEANING IS THE ANSWER TOO. A
    word can be spelled the same in both languages: `film`, `lamp`, `monument`,
    `trend` and `kama` all had their answer sitting in the English, so falling
    back to the meaning alone was still handing it over.
  */
  it("withholds the hint entirely where the English is the answer as well", () => {
    const cognate = {
      ...drinking, id: "film", lemma: "film", translation: "film",
      examples: JSON.stringify([{ et: "Film oli igav.", source: "EKILEX" }]),
      forms: [
        { formType: "NOM_SG", value: "film", morphCode: "SgN" },
        { formType: "GEN_SG", value: "filmi", morphCode: "SgG" },
      ],
    };
    const [card] = generateCards(cognate, ["CLOZE"]);
    expect(card?.back.toLowerCase()).toBe("film");
    expect(card?.hint).toBeNull();
  });

  it("withholds the lemma where the gap wants the lemma itself", () => {
    const asLemma = generateCards(drinking, ["CLOZE"]).find(
      (c) => c.back.toLowerCase() === "kohv",
    );
    expect(asLemma).toBeDefined();
    expect(asLemma?.hint).toBe("coffee");
    expect(asLemma?.hint?.toLowerCase()).not.toContain("kohv");
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

describe("generateCards — CASE_FORM", () => {
  /*
    A CASE WHOSE FORM IS THE NOMINATIVE ASKS NOTHING, and Estonian has plenty:
    `kallis` has the genitive `kalli`, so the inessive is `kalli` plus `s`,
    which is `kallis` again. The card read `kallis → milles? kus?` with
    `kallis` on the back, so the question printed its own answer on 115 cards
    across the shipped dictionary. Nobody can get one wrong, the scheduler
    reads every pass as a recall and pushes the interval out, and the deck slot
    is spent for ever.
  */
  const dear = {
    id: "kallis", lemma: "kallis", translation: "dear, expensive", pos: "ADJECTIVE",
    gradation: "NONE", gradationNote: null, government: null, examples: null,
    forms: [
      { formType: "NOM_SG", value: "kallis", morphCode: "SgN" },
      { formType: "GEN_SG", value: "kalli", morphCode: "SgG" },
      { formType: "PART_SG", value: "kallist", morphCode: "SgP" },
    ],
  };

  it("builds no card for a case whose only answer is the word in the question", () => {
    const cards = generateCards(dear, ["CASE_FORM"]);
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.back.toLowerCase().split(" / ")).not.toContain("kallis");
    }
    expect(cards.some((c) => c.targetCase === "INESSIVE")).toBe(false);
    // And the cases that do inflect are still there.
    expect(cards.some((c) => c.targetCase === "COMITATIVE")).toBe(true);
  });

  /*
    ANY ANSWER, NOT EVERY ONE, and the first version of this test asserted the
    opposite. `voodi` has the short illative `voodi` and the long `voodisse`,
    and the marker has to take both, because refusing the short one is the
    `tuppa` fault pointed the other way. So the card asked
    `voodi → millesse? kuhu?` and a learner who copied the word out of the
    question was right. `npm run audit:questions` found all seven of these
    after the rule had been written and shipped the other way round.

    The pair is still the right thing to show, and the dictionary and grammar
    pages still show it: `shownForms` is that reader and is untouched.
  */
  it("builds no card where the word is one of two answers either", () => {
    const bed = {
      ...dear, id: "voodi", lemma: "voodi", translation: "bed", pos: "NOUN",
      forms: [
        { formType: "NOM_SG", value: "voodi", morphCode: "SgN" },
        { formType: "GEN_SG", value: "voodi", morphCode: "SgG" },
        { formType: "PART_SG", value: "voodit", morphCode: "SgP" },
        { formType: "ILL_SG_SHORT", value: "voodi", morphCode: "SgAdt" },
      ],
    };
    const cards = generateCards(bed, ["CASE_FORM"]);
    expect(cards.some((c) => c.targetCase === "ILLATIVE")).toBe(false);
    expect(cards.some((c) => c.targetCase === "COMITATIVE")).toBe(true);
  });

  it("keeps the illative where neither answer is the word", () => {
    const room = {
      ...dear, id: "tuba", lemma: "tuba", translation: "room", pos: "NOUN",
      forms: [
        { formType: "NOM_SG", value: "tuba", morphCode: "SgN" },
        { formType: "GEN_SG", value: "toa", morphCode: "SgG" },
        { formType: "PART_SG", value: "tuba", morphCode: "SgP" },
        { formType: "ILL_SG_SHORT", value: "tuppa", morphCode: "SgAdt" },
      ],
    };
    const illative = generateCards(room, ["CASE_FORM"]).find((c) => c.targetCase === "ILLATIVE");
    expect(illative?.back).toBe("tuppa / toasse");
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

  it("asks by the name a class uses, and answers with the stored form where there is one", () => {
    const cards = generateCards(lugema, ["CONJUGATION"]);
    const third = cards.find((c) => c.front.includes("olevik · ta"));
    expect(third?.back).toBe("loeb");
    const conditional = cards.find((c) => c.front.includes("tingiv kõneviis · ma"));
    expect(conditional?.back).toBe("loeksin");
  });

  it("derives the present, the negative, the conditional and the imperative for a seeded verb", () => {
    // Every seeded verb holds five principal parts and nothing else. The
    // simple past third person has no rule and is left out; the rest come
    // from lib/estonian/conjugate.ts, checked against Ekilex for every verb.
    const seeded: LexemeForCards = {
      ...lugema,
      forms: [
        { formType: "PRES_1SG", value: "loen" },
        { formType: "PAST_1SG", value: "lugesin" },
      ],
    };
    const cards = generateCards(seeded, ["CONJUGATION"]);
    expect(cards.map((c) => c.back)).toEqual([
      "loen", "loeb", "loeme", "ei loe", "lugesin", "loeksin", "loe",
    ]);
    expect(cards.find((c) => c.back === "ei loe")?.front).toBe("lugema → eitus · ma ei");
  });

  it("prefers an attested form over the rule, and leaves olema's present to Ekilex", () => {
    const olema: LexemeForCards = {
      ...lugema,
      lemma: "olema",
      translation: "to be",
      forms: [
        { formType: "PRES_1SG", value: "olen" },
        { formType: "PAST_1SG", value: "olin" },
        { formType: "EKILEX:IndPrSg3", value: "on", morphCode: "IndPrSg3" },
      ],
    };
    const cards = generateCards(olema, ["CONJUGATION"]);
    expect(cards.find((c) => c.front.includes("olevik · ta"))?.back).toBe("on");
    expect(cards.find((c) => c.front.includes("olevik · me"))).toBeUndefined();
    expect(cards.find((c) => c.front.includes("tingiv"))?.back).toBe("oleksin");
  });

  it("makes nothing for a noun", () => {
    expect(generateCards({ ...lugema, pos: "NOUN" }, ["CONJUGATION"])).toEqual([]);
  });

  it("is offered only for a verb whose forms are actually held", () => {
    expect(availableCardTypes(lugema)).toContain("CONJUGATION");
    expect(availableCardTypes({ ...lugema, forms: [] })).not.toContain("CONJUGATION");
  });
});

describe("inTeachingOrder", () => {
  const card = (lexemeId: string | null, cardType: string) => ({ lexemeId, cardType });

  it("puts a word's own cards in the order a lesson teaches them", () => {
    // The fault this exists for: every card of a word is written in one
    // createMany with one createdAt, so ordering the queue by that column
    // leaves them tied and the database returns them in whatever order it
    // likes. A learner's first sight of `juhtuma` was a conjugation card.
    const ordered = inTeachingOrder([
      card("a", "CONJUGATION"), card("a", "PRODUCTION"), card("a", "RECOGNITION"), card("a", "CLOZE"),
    ]);
    expect(ordered.map((c) => c.cardType)).toEqual([
      "RECOGNITION", "PRODUCTION", "CLOZE", "CONJUGATION",
    ]);
  });

  it("keeps the order the queue chose between words", () => {
    // It settles ties inside one word and never reorders across words: which
    // words come first was decided by the query, and this has no opinion.
    const ordered = inTeachingOrder([
      card("b", "CONJUGATION"), card("a", "CONJUGATION"), card("b", "RECOGNITION"),
    ]);
    expect(ordered.map((c) => c.lexemeId)).toEqual(["b", "b", "a"]);
    expect(ordered.map((c) => c.cardType)).toEqual(["RECOGNITION", "CONJUGATION", "CONJUGATION"]);
  });

  it("is stable for two cards of one word and one type", () => {
    const first = card("a", "CASE_FORM");
    const second = card("a", "CASE_FORM");
    expect(inTeachingOrder([first, second])).toEqual([first, second]);
  });

  it("treats a card with no word behind it as its own group", () => {
    const ordered = inTeachingOrder([card(null, "CONJUGATION"), card(null, "RECOGNITION")]);
    expect(ordered.map((c) => c.cardType)).toEqual(["CONJUGATION", "RECOGNITION"]);
  });

  it("sorts a type nobody has thought about to the end rather than the front", () => {
    expect(teachingRank("SOMETHING_NEW")).toBeGreaterThan(teachingRank("GOVERNMENT"));
  });
});
