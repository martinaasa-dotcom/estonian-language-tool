import { describe, expect, it } from "vitest";
import {
  availableCardTypes, generateCards, inTeachingOrder, teachingRank, type LexemeForCards,
} from "./cards";
import { BLANK } from "@/lib/estonian/cloze";
import { checkAnswer } from "@/lib/estonian/answer";

const tuba: LexemeForCards = {
  lemma: "tuba", translation: "room", pos: "NOUN",
  gradation: "QUALITATIVE", gradationNote: "b : ∅", government: null,
  semanticTypes: "koht_hoone",
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
  semanticTypes: null,
  forms: [{ formType: "INF_MA", value: "aitama" }],
};

/*
  THE PRODUCTION CARD THAT USED TO MARK A RIGHT ANSWER WRONG.

  Front is the gloss, hint is the part of speech, back is the lemma, and
  `checkAnswer` marks against the back. So two entries with one gloss and one
  part of speech were one question with two right answers, each card marking
  the other's answer wrong: the dictionary ships 372 such prompts, `ja` and
  `ning` both glossed "and" among them.

  These assert the whole path rather than the join, because the join is only
  right if `acceptedAnswers` splits it back out: that is what makes what the
  screen shows and what the marker takes the same string, and it is the reason
  the separator is the one it is.
*/
describe("a prompt more than one word answers", () => {
  const ja: LexemeForCards = {
    lemma: "ja", translation: "and", pos: "ADVERB",
    gradation: "NONE", gradationNote: null, government: null, semanticTypes: null, forms: [],
    alsoAccepted: ["ning"],
  };

  it("puts every answer on the back, its own word first", () => {
    const [card] = generateCards(ja, ["PRODUCTION"]);
    expect(card).toMatchObject({ front: "and", back: "ja / ning", hint: "adverb" });
  });

  it("marks both of them right, which is the whole point", () => {
    const [card] = generateCards(ja, ["PRODUCTION"]);
    expect(checkAnswer("ja", card!.back, "et").verdict).toBe("correct");
    expect(checkAnswer("ning", card!.back, "et").verdict).toBe("correct");
    expect(checkAnswer("aga", card!.back, "et").verdict).toBe("wrong");
  });

  it("leaves a word nothing shares a prompt with exactly as it was", () => {
    const [card] = generateCards(tuba, ["PRODUCTION"]);
    expect(card).toMatchObject({ front: "room", back: "tuba" });
    expect(generateCards({ ...tuba, alsoAccepted: [] }, ["PRODUCTION"])[0]!.back).toBe("tuba");
  });

  /*
    A caller that has not looked builds the card that was built before. The
    field is optional so that every existing caller keeps working, and this is
    what stops that default quietly claiming a word has no synonym.
  */
  it("never lists its own lemma twice", () => {
    const [card] = generateCards({ ...ja, alsoAccepted: ["ja", "ning"] }, ["PRODUCTION"]);
    expect(card!.back).toBe("ja / ning");
  });
});

describe("generateCards", () => {
  it("makes both directions for a plain word", () => {
    const cards = generateCards(tuba, ["RECOGNITION", "PRODUCTION"]);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({ front: "tuba", back: "room" });
    expect(cards[1]).toMatchObject({ front: "room", back: "tuba" });
  });

  /*
    A GENITIVE STEM IS NO LONGER A REASON TO ASK FOR A CASE.

    It used to be the whole of it: `tuba` has `toa`, so eleven suffixes could
    be attached and five cards existed. That is what produced
    `ravim → millesse? kuhu?`, which a learner reported as pointless, and they
    were right — no lexicographer has ever recorded a medicine being gone into,
    so the card was asking somebody to attach `sse` to a stem. The stem is
    still what builds the *answer*; what decides whether to ask is a sentence
    that uses it. See the CASE_FORM block below.
  */
  it("no longer builds a case card from the stem alone", () => {
    expect(generateCards(tuba, ["CASE_FORM"])).toEqual([]);
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
    // No CASE_FORM: this fixture carries no sentence, and a case with no
    // sentence behind it is a card the builder will not make.
    expect(availableCardTypes(tuba)).toEqual(["RECOGNITION", "PRODUCTION", "GRADATION"]);
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
    semanticTypes: null,
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
    A CASE IS DRILLED IN A SENTENCE THAT USES IT, OR IT IS NOT DRILLED.

    These fixtures carry the sentences the shipped dictionary actually holds
    for these words, because that is now the thing under test. The card used to
    be generated from the morphology alone: if the word was not a person and a
    form could be built, a card existed, which is 23,106 of them over 4,664
    words with a sentence behind 1,494. `ravim → millesse? kuhu?` was one, and
    nobody has ever recorded a medicine being gone into.
  */
  const bed = {
    id: "voodi", lemma: "voodi", translation: "bed", pos: "NOUN",
    gradation: "NONE", gradationNote: null, government: null,
    semanticTypes: "ese_instru",
    examples: JSON.stringify([
      { et: "Tast pole voodis asjagi!", source: "EKILEX" },
      { et: "Õhtul kukkusin voodisse nagu niidetud.", source: "EKILEX" },
    ]),
    forms: [
      { formType: "NOM_SG", value: "voodi", morphCode: "SgN" },
      { formType: "GEN_SG", value: "voodi", morphCode: "SgG" },
      { formType: "PART_SG", value: "voodit", morphCode: "SgP" },
      { formType: "ILL_SG_SHORT", value: "voodi", morphCode: "SgAdt" },
    ],
  };

  it("builds the card out of the sentence that uses the case", () => {
    const inessive = generateCards(bed, ["CASE_FORM"]).find((c) => c.targetCase === "INESSIVE");
    expect(inessive?.back).toBe("voodis");
    // The front is the sentence with the form taken out, not a bare lemma and
    // a case name: the learner produces the form because the sentence needs it.
    expect(inessive?.front).toContain(BLANK);
    expect(inessive?.front).toContain("asjagi");
    expect(inessive?.front?.toLowerCase()).not.toContain("voodis");
  });

  /*
    THE CUE MAY NOT NAME THE CASE. It is shown before the answer, so
    `seesütlev` beside `voodi` is `voodis` written out in two pieces, exactly
    as `astmevaheldus mm : mb` hands `hamba` over on a gradation card. The case
    travels on `targetCase`, which is where the reveal and the weakest-case
    panel read it, and that is the order `explainGap` takes too: the sentence
    first, its label after.
  */
  it("cues with the word and its meaning, never with the case", () => {
    const inessive = generateCards(bed, ["CASE_FORM"]).find((c) => c.targetCase === "INESSIVE");
    expect(inessive?.hint).toBe("voodi, bed");
    expect(inessive?.hint).not.toMatch(/seesütlev|inessive/i);
  });

  /*
    ANY ANSWER, NOT EVERY ONE. `voodi` has the short illative `voodi` and the
    long `voodisse`, and the marker has to take both, because refusing the
    short one is the `tuppa` fault pointed the other way. So a learner who
    copies the word out of the cue is right, and the card cannot be asked.
    The pair is still the right thing to show, and `shownForms` still shows it.
  */
  it("builds no card where the word itself is one of the answers", () => {
    expect(generateCards(bed, ["CASE_FORM"]).some((c) => c.targetCase === "ILLATIVE")).toBe(false);
  });

  /*
    AND THE SENTENCE HAS TO NAME THE CASE ON ITS OWN. `kohvi` is the omastav,
    the osastav and the short sisseütlev all at once, so gapping it out of
    `Ostsin paki kohvi.`, where it is a genitive, and labelling the card
    `sisseütlev` would teach the wrong case and write the wrong one into
    `Review.slot`, which every case figure in the app is derived from.
    `readCase` is the strict rule that already existed for this.
  */
  it("refuses a form that more than one case spells that way", () => {
    const coffee = {
      ...bed, id: "kohv", lemma: "kohv", translation: "coffee",
      semanticTypes: "materjal/aine",
      examples: JSON.stringify([{ et: "Ostsin paki kohvi.", source: "EKILEX" }]),
      forms: [
        { formType: "NOM_SG", value: "kohv", morphCode: "SgN" },
        { formType: "GEN_SG", value: "kohvi", morphCode: "SgG" },
        { formType: "PART_SG", value: "kohvi", morphCode: "SgP" },
        { formType: "ILL_SG_SHORT", value: "kohvi", morphCode: "SgAdt" },
      ],
    };
    expect(generateCards(coffee, ["CASE_FORM"])).toEqual([]);
  });

  it("produces nothing for a word with no sentences at all", () => {
    expect(generateCards({ ...bed, examples: null }, ["CASE_FORM"])).toEqual([]);
  });

  /*
    AND THE CHECKLIST ASKS THE BUILDER RATHER THAN THE MORPHOLOGY. Left as
    "does it have a genitive stem" this advertised a case card on 4,664 words
    and built one on 914: the unit page lists the type, no card appears, and
    nothing says why. That is the `objekt` fault, which `syllabus.test.ts`
    catches for a unit and this catches for a word.
  */
  it("is only offered when it can produce something", () => {
    expect(availableCardTypes(bed)).toContain("CASE_FORM");
    expect(availableCardTypes({ ...bed, examples: null })).not.toContain("CASE_FORM");
  });
});

describe("generateCards — CONJUGATION", () => {
  /*
    A PERSON OF A VERB IS DRILLED IN A SENTENCE THAT USES IT, OR IT IS NOT
    DRILLED. These fixtures carry the sentences the shipped dictionary holds
    for these verbs, because that is now the thing under test: the card used
    to be `lugema → olevik · ta` over a stem, 4,747 of them, with a sentence
    behind 421.
  */
  const drinking: LexemeForCards = {
    lemma: "jooma", translation: "to drink", pos: "VERB",
    gradation: "NONE", gradationNote: null, government: null, semanticTypes: null,
    examples: JSON.stringify([
      { et: "Jõin tassi kohvi.", source: "EKILEX" },
      { et: "Ta ei joo ega suitseta.", source: "EKILEX" },
    ]),
    forms: [
      { formType: "INF_MA", value: "jooma" },
      { formType: "PRES_1SG", value: "joon" },
      { formType: "PAST_1SG", value: "jõin" },
    ],
  };

  it("builds the card out of the sentence that uses the form, and names its slot", () => {
    const cards = generateCards(drinking, ["CONJUGATION"]);
    const past = cards.find((c) => c.slot === "IndIpfSg1");
    // Spelled as the lexicographer spelled it, capital and all: the marker
    // folds case, and rewriting the form would be this app editing Estonian.
    expect(past?.back).toBe("Jõin");
    expect(past?.front).toBe(`${BLANK} tassi kohvi.`);
    // No label on the front: `lihtminevik · ma` beside `jooma` is `jõin`
    // written out in two pieces. The slot travels on the card instead.
    expect(past?.front).not.toMatch(/lihtminevik|→/);
    expect(past?.hint).toBe("jooma, to drink");
    expect(past?.targetCase).toBeNull();
  });

  /*
    THE `ei` IS IN THE SENTENCE, SO THE SENTENCE SETTLES THE PAIR. `joo` is
    the negative and the imperative in one spelling; `Ta ei joo` has the `ei`
    a lexicographer wrote, so it is the negative, gapped whole, and it is not
    an imperative card as well.
  */
  it("gaps the negative with its ei, and never reads it as an imperative", () => {
    const cards = generateCards(drinking, ["CONJUGATION"]);
    const negative = cards.find((c) => c.slot === "IndPrPs_");
    expect(negative?.back).toBe("ei joo");
    expect(negative?.front).toBe(`Ta ${BLANK} ega suitseta.`);
    expect(cards.some((c) => c.slot === "ImpPrSg2")).toBe(false);
  });

  it("reads a bare form with no ei as the imperative, and never as the negative", () => {
    const sitting: LexemeForCards = {
      ...drinking, lemma: "istuma", translation: "to sit",
      examples: JSON.stringify([{ et: "Istu minu kõrvale.", source: "EKILEX" }]),
      forms: [{ formType: "INF_MA", value: "istuma" }, { formType: "PRES_1SG", value: "istun" }],
    };
    const cards = generateCards(sitting, ["CONJUGATION"]);
    expect(cards.find((c) => c.slot === "ImpPrSg2")?.back).toBe("Istu");
    expect(cards.some((c) => c.slot === "IndPrPs_")).toBe(false);
  });

  /*
    `pole`. Estonian contracts `ei ole`, the contraction is what people say
    and write, and the card carries both the way the illative carries two, so
    a sentence written with either builds the card and the marker takes both.
  */
  it("accepts pole beside ei ole where the dictionary holds one", () => {
    const olema: LexemeForCards = {
      ...drinking, lemma: "olema", translation: "to be",
      examples: JSON.stringify([{ et: "Mul pole aega.", source: "EKILEX" }]),
      forms: [
        { formType: "INF_MA", value: "olema" },
        { formType: "PRES_1SG", value: "olen" },
        { formType: "EKILEX:IndPrPs_", value: "ole", morphCode: "IndPrPs_" },
        { formType: "EKILEX:IndPrPsN", value: "pole", morphCode: "IndPrPsN" },
      ],
    };
    const negative = generateCards(olema, ["CONJUGATION"]).find((c) => c.slot === "IndPrPs_");
    expect(negative?.back).toBe("pole / ei ole");
    expect(negative?.front).toBe(`Mul ${BLANK} aega.`);
  });

  it("builds nothing from a stem alone, however regular the verb", () => {
    expect(generateCards({ ...drinking, examples: null }, ["CONJUGATION"])).toEqual([]);
  });

  it("is only offered when it can produce something", () => {
    expect(availableCardTypes(drinking)).toContain("CONJUGATION");
    expect(availableCardTypes({ ...drinking, examples: null })).not.toContain("CONJUGATION");
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
