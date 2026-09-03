import { describe, expect, it } from "vitest";
import {
  askableSlots, flashTask, formIndex, markFlash, shapeFor, shapesFor, type FlashWord,
} from "./flash";

/** `tuba`, as the seed holds it: five principal parts and two sentences. */
const TUBA: FlashWord = {
  lexemeId: "lex-tuba",
  lemma: "tuba",
  translation: "room",
  pos: "NOUN",
  semanticTypes: null,
  forms: [
    { formType: "NOM_SG", value: "tuba" },
    { formType: "GEN_SG", value: "toa" },
    { formType: "PART_SG", value: "tuba" },
    { formType: "ILL_SG_SHORT", value: "tuppa" },
    { formType: "NOM_PL", value: "toad" },
  ],
  examples: [
    { et: "Ma olen toas.", source: "EKILEX" },
    { et: "Tuba on suur ja valge.", source: "EKILEX" },
  ],
};

/** `lugema`, seeded: the principal parts and nothing retrieved. */
const LUGEMA: FlashWord = {
  lexemeId: "lex-lugema",
  lemma: "lugema",
  translation: "to read",
  pos: "VERB",
  semanticTypes: null,
  forms: [
    { formType: "INF_MA", value: "lugema" },
    { formType: "INF_DA", value: "lugeda" },
    { formType: "PRES_1SG", value: "loen" },
    { formType: "PAST_1SG", value: "lugesin" },
  ],
  examples: [{ et: "Ta loeb raamatut.", source: "EKILEX" }],
};

/** A phrase: no forms to inflect, and still a thing you can or cannot say. */
const TERE: FlashWord = {
  lexemeId: "lex-tere",
  lemma: "Tere hommikust!",
  translation: "Good morning!",
  pos: "PHRASE",
  semanticTypes: null,
  forms: [],
  examples: [],
};

const slotKeys = (word: FlashWord) => askableSlots(word).map((s) => s.slot);

describe("askableSlots", () => {
  it("asks a noun for the eleven cases built on its genitive stem", () => {
    const keys = slotKeys(TUBA);
    expect(keys).toContain("INESSIVE");
    expect(keys).toContain("COMITATIVE");
    // The three principal parts are stored rather than derived, and the
    // nominative is the lemma, so asking for it is asking nothing.
    expect(keys).not.toContain("NOMINATIVE");
    expect(keys).not.toContain("GENITIVE");
  });

  it("leads the illative with the short form, which is the one anybody says", () => {
    const ill = askableSlots(TUBA).find((s) => s.slot === "ILLATIVE")!;
    expect(ill.value).toBe("tuppa");
    // And takes the long one, because both are the illative.
    expect(ill.accepted).toContain("toasse");
  });

  it("asks a verb for the named parts a course keeps apart", () => {
    const keys = slotKeys(LUGEMA);
    /*
      The whole reason this round exists in the shape it does. A verb has no
      case cards at all, so before `Review.slot` every one of these answers
      landed in one shared slot and no verb could ever be mastered.
    */
    expect(keys).toContain("IndPrSg3");
    expect(keys).toContain("IndPrPs_");
    expect(keys.length).toBeGreaterThan(3);
  });

  it("says the negative the way anybody says it, and takes it either way", () => {
    const neg = askableSlots(LUGEMA).find((s) => s.slot === "IndPrPs_")!;
    expect(neg.value).toBe("ei loe");
    expect(neg.accepted).toContain("loe");
  });

  it("takes the contraction on the one verb that has one", () => {
    /*
      Estonian contracts `ei ole` and the contraction is what people say and
      write, so a learner typing it was being marked wrong on the commonest
      verb in the language. The card builder learned this on main; a round
      asking the same slot has to take the same answers.
    */
    const olema: FlashWord = {
      lexemeId: "lex-olema", lemma: "olema", translation: "to be", pos: "VERB", examples: [], semanticTypes: null,
      forms: [
        { formType: "INF_MA", value: "olema" },
        { formType: "PRES_1SG", value: "olen" },
        { formType: "EKILEX:IndPrPs_", value: "ole", morphCode: "IndPrPs_" },
        { formType: "EKILEX:IndPrPsN", value: "pole", morphCode: "IndPrPsN" },
      ],
    };
    const neg = askableSlots(olema).find((s) => s.slot === "IndPrPs_")!;
    expect(neg.accepted).toContain("ei ole");
    expect(neg.accepted).toContain("pole");
  });

  it("asks the polite imperative, which is the one a learner is addressed with", () => {
    const polite: FlashWord = {
      ...LUGEMA,
      forms: [
        ...LUGEMA.forms,
        { formType: "EKILEX:ImpPrPl2", value: "lugege", morphCode: "ImpPrPl2" },
      ],
    };
    expect(slotKeys(polite)).toContain("ImpPrPl2");
  });

  it("leaves a phrase with the one slot a phrase has", () => {
    expect(slotKeys(TERE)).toEqual(["PRODUCTION"]);
  });

  it("never asks a form the English gloss beside it already prints", () => {
    /*
      Found by `npm run audit:questions` over the shipped dictionary, thirteen
      times and never twice on one word: the illative of `salv` is `salve` and
      its gloss is "salve", so the question printed its answer one line up.
      `sameSpelling` is an exact comparison and catches only the case where the
      whole gloss is the word.
    */
    const salv: FlashWord = {
      ...TUBA, lexemeId: "lex-salv", lemma: "salv", translation: "salve", examples: [],
      forms: [
        { formType: "NOM_SG", value: "salv" },
        { formType: "GEN_SG", value: "salve" },
        { formType: "PART_SG", value: "salve" },
        { formType: "ILL_SG_SHORT", value: "salve" },
      ],
    };
    expect(slotKeys(salv)).not.toContain("ILLATIVE");
    expect(slotKeys(salv)).toContain("COMITATIVE");

    // And the multi-sense shape, which is what `sameSpelling` cannot see:
    // `pagan` is glossed "pagan, heathen", so the word is a word in its gloss.
    const pagan: FlashWord = {
      ...TUBA, lexemeId: "lex-pagan", lemma: "pagan", translation: "pagan, heathen",
      examples: [],
      forms: [
        { formType: "NOM_SG", value: "pagan" },
        { formType: "GEN_SG", value: "pagana" },
        { formType: "PART_SG", value: "paganat" },
      ],
    };
    expect(slotKeys(pagan)).not.toContain("PRODUCTION");
  });

  it("does not ask somebody to type the word that is printed above the box", () => {
    // Thirty entries are spelled the same in both languages. A flip card can
    // turn over and say so; a typed box under the English `film` is a question
    // whose answer is above it, and answering it would grade the card.
    const film: FlashWord = {
      ...TUBA, lexemeId: "lex-film", lemma: "film", translation: "film", examples: [],
      forms: [
        { formType: "NOM_SG", value: "film" },
        { formType: "GEN_SG", value: "filmi" },
        { formType: "PART_SG", value: "filmi" },
      ],
    };
    expect(slotKeys(film)).not.toContain("PRODUCTION");
    expect(slotKeys(film)).toContain("COMITATIVE");
  });

  it("never asks a case whose form is spelled like the word in the question", () => {
    // `kallis` has the genitive `kalli`, so its seesütlev is `kallis` again:
    // the question would print its own answer and nobody could get it wrong.
    const kallis: FlashWord = {
      ...TUBA, lexemeId: "lex-kallis", lemma: "kallis", pos: "ADJECTIVE", examples: [], semanticTypes: null,
      forms: [
        { formType: "NOM_SG", value: "kallis" },
        { formType: "GEN_SG", value: "kalli" },
        { formType: "PART_SG", value: "kallist" },
      ],
    };
    expect(slotKeys(kallis)).not.toContain("INESSIVE");
    expect(slotKeys(kallis)).toContain("COMITATIVE");
  });
});

describe("shapesFor", () => {
  const inessive = () => askableSlots(TUBA).find((s) => s.slot === "INESSIVE")!;

  it("offers the sentence shapes only where a sentence carries that very form", () => {
    // `Ma olen toas.` is recorded, so the inessive can be heard and gapped.
    expect(shapesFor(TUBA, inessive())).toEqual(["inflect", "gap", "heard", "build"]);
    // Nothing recorded carries `toaga`, so those two shapes are simply absent
    // rather than invented.
    const comitative = askableSlots(TUBA).find((s) => s.slot === "COMITATIVE")!;
    expect(shapesFor(TUBA, comitative)).toEqual(["inflect", "build"]);
  });

  it("drops the heard shape where the deployment has no speech", () => {
    expect(shapesFor(TUBA, inessive(), { canSpeak: false })).not.toContain("heard");
  });

  it("asks a word with no forms the one question it has", () => {
    expect(shapesFor(TERE, askableSlots(TERE)[0]!)).toEqual(["recall"]);
  });
});

describe("shapeFor", () => {
  it("opens one shape at a time as the word gets right", () => {
    const pool = ["inflect", "gap", "heard", "build"] as const;
    expect(shapeFor(pool, 0)).toBe("inflect");
    expect(shapeFor(pool, 1)).toBe("gap");
    expect(shapeFor(pool, 2)).toBe("heard");
    expect(shapeFor(pool, 3)).toBe("build");
  });

  it("keeps rotating once every shape is open, so one word is not one question", () => {
    const pool = ["inflect", "gap", "heard", "build"] as const;
    expect(shapeFor(pool, 4)).toBe("inflect");
    expect(shapeFor(pool, 5)).toBe("gap");
  });

  it("never runs off the end of a short pool", () => {
    expect(shapeFor(["inflect", "build"], 8)).toBe("inflect");
    expect(shapeFor(["inflect", "build"], 9)).toBe("build");
    expect(shapeFor([], 3)).toBe("recall");
  });
});

describe("flashTask", () => {
  const taskFor = (word: FlashWord, slot: string, step: number) =>
    flashTask({
      word,
      slot: askableSlots(word).find((s) => s.slot === slot)!,
      cardId: "card-1",
      step,
    });

  it("builds a gap out of the sentence, never out of thin air", () => {
    const task = taskFor(TUBA, "INESSIVE", 1)!;
    expect(task.shape).toBe("gap");
    expect(task.gapped).toBe("Ma olen ____.");
    expect(task.sentence).toBe("Ma olen toas.");
  });

  it("refuses a gap that leaves another of its own answers standing", () => {
    /*
      Ekilex records `Auto jäi porisse/porri kinni.`, which is a lexicographer
      writing both illatives of one word, so gapping the short one printed the
      long one two characters away and the marker took it. `buildCloze` refuses
      a sentence that repeats the word and looks for the same string; a slot's
      answers are not one string.
    */
    const pori: FlashWord = {
      lexemeId: "lex-pori", lemma: "pori", translation: "mud", pos: "NOUN",
      semanticTypes: null,
      forms: [
        { formType: "NOM_SG", value: "pori" },
        { formType: "GEN_SG", value: "pori" },
        { formType: "PART_SG", value: "pori" },
        { formType: "ILL_SG_SHORT", value: "porri" },
      ],
      examples: [{ et: "Auto jäi porisse/porri kinni.", source: "EKILEX" }],
    };
    const illative = askableSlots(pori).find((s) => s.slot === "ILLATIVE")!;
    // The sentence shapes are simply not offered, so the word falls back to
    // being asked the plain way rather than dropping out of the round.
    expect(shapesFor(pori, illative)).toEqual(["inflect", "build"]);
  });

  it("hides the sentence on the heard shape and keeps it for the reveal", () => {
    const task = taskFor(TUBA, "INESSIVE", 2)!;
    expect(task.shape).toBe("heard");
    expect(task.gapped).toBeNull();
    expect(task.sentence).toBe("Ma olen toas.");
  });

  it("keeps the spelling the sentence carries, which is not always the one asked", () => {
    // Both illatives are right and a lexicographer writes whichever the
    // sentence wanted, so a screen marking the form inside it has to look for
    // the one that is in it.
    const task = taskFor(TUBA, "INESSIVE", 1)!;
    expect(task.sentenceForm).toBe("toas");
    expect(taskFor(TUBA, "COMITATIVE", 0)!.sentenceForm).toBeNull();

    // And a shape that is not about a sentence carries none, even where the
    // dictionary has one: an `inflect` task shows the pair the slot leads
    // with, not whichever spelling a lexicographer reached for.
    const plain = taskFor(TUBA, "INESSIVE", 0)!;
    expect(plain.shape).toBe("inflect");
    expect(plain.sentence).toBeNull();
    expect(plain.shown).toEqual(["toas"]);
  });

  it("says whether the form was retrieved or worked out", () => {
    expect(taskFor(TUBA, "COMITATIVE", 0)!.provenance).toBe("derived");
    expect(taskFor(TUBA, "ILLATIVE", 0)!.provenance).toBe("ekilex");
  });
});

describe("markFlash", () => {
  const inflect = flashTask({
    word: TUBA,
    slot: askableSlots(TUBA).find((s) => s.slot === "INESSIVE")!,
    cardId: "card-1",
    step: 0,
  })!;

  it("takes the form the dictionary vouches for", () => {
    expect(markFlash(inflect, "toas").right).toBe(true);
    expect(markFlash(inflect, "toas").rating).toBe(3);
  });

  it("names the ending the learner reached for instead", () => {
    const mark = markFlash(inflect, "toast");
    expect(mark.right).toBe(false);
    expect(mark.rating).toBe(2);
    expect(mark.wroteSlot).toBe("ELATIVE");
    expect(mark.note).toContain("seestütlev");
  });

  it("counts a dropped diacritic as produced, and says which letter", () => {
    const illative = flashTask({
      word: TUBA,
      slot: askableSlots(TUBA).find((s) => s.slot === "ILLATIVE")!,
      cardId: "card-1",
      step: 0,
    })!;
    // Both illatives are right, which is the fault this app shipped twice.
    expect(markFlash(illative, "toasse").right).toBe(true);
    expect(markFlash(illative, "tuppa").right).toBe(true);
  });

  it("marks a sentence on the form in it, not on the sentence", () => {
    const build = flashTask({
      word: TUBA,
      slot: askableSlots(TUBA).find((s) => s.slot === "COMITATIVE")!,
      cardId: "card-1",
      step: 1,
    })!;
    expect(build.shape).toBe("build");
    expect(markFlash(build, "Ma olen toaga rahul.").right).toBe(true);
    const near = markFlash(build, "Ma olen toas praegu.");
    expect(near.right).toBe(false);
    expect(near.wroteSlot).toBe("INESSIVE");
    const miss = markFlash(build, "Ma olen kodus praegu.");
    expect(miss.rating).toBe(1);
  });

  it("asks for a sentence rather than taking the word on its own", () => {
    const build = flashTask({
      word: TUBA,
      slot: askableSlots(TUBA).find((s) => s.slot === "COMITATIVE")!,
      cardId: "card-1",
      step: 1,
    })!;
    const mark = markFlash(build, "toaga");
    expect(mark.right).toBe(false);
    expect(mark.rating).toBe(2);
  });
});

describe("formIndex", () => {
  it("names a spelling only where one slot claims it", () => {
    const index = formIndex(TUBA);
    expect(index["toas"]).toEqual(["INESSIVE"]);
    // `tuba` is its own nimetav and its own osastav, so neither may be named.
    expect(index["tuba"]!.length).toBeGreaterThan(1);
  });

  it("reads a verb's own forms back off the rule that builds them", () => {
    const index = formIndex(LUGEMA);
    expect(index["loeb"]).toEqual(["IndPrSg3"]);
    expect(index["loen"]).toEqual(["IndPrSg1"]);
  });
});

describe("the local cases", () => {
  /*
    The fault this round walked back into. `Venemaal` is how you say "in
    Russia"; `Venemaas` is not a way of saying it. The A1 unit of countries
    shipped a card asking for the wrong trio once already, which is what
    `lib/estonian/place.ts` was written for, and the first real round this
    module drew asked exactly the same question.
  */
  const VENEMAA: FlashWord = {
    lexemeId: "lex-venemaa", lemma: "Venemaa", translation: "Russia", pos: "NOUN", examples: [], semanticTypes: null,
    forms: [
      { formType: "NOM_SG", value: "Venemaa" },
      { formType: "GEN_SG", value: "Venemaa" },
      { formType: "PART_SG", value: "Venemaad" },
    ],
  };

  it("asks a place in -maa for the trio it takes, never the other one", () => {
    const keys = slotKeys(VENEMAA);
    expect(keys).toContain("ADESSIVE");
    expect(keys).toContain("ABLATIVE");
    expect(keys).not.toContain("INESSIVE");
    expect(keys).not.toContain("ILLATIVE");
  });

  it("still asks a place for the cases that have nothing to do with place", () => {
    expect(slotKeys(VENEMAA)).toContain("COMITATIVE");
  });

  it("asks an animal the trio it takes, and asks it with kes", () => {
    /*
      The half of this rule no spelling can see, and the fault it shipped with:
      nothing about the letters in `hobune` says it is an animal, so the round
      asked for `hobusesse` and would have marked `hobusele` wrong. The
      Institute records `loom` against the meaning, in the same response the
      forms come from.
    */
    const hobune: FlashWord = {
      lexemeId: "lex-hobune", lemma: "hobune", translation: "horse", pos: "NOUN",
      examples: [], semanticTypes: "loom",
      forms: [
        { formType: "NOM_SG", value: "hobune" },
        { formType: "GEN_SG", value: "hobuse" },
        { formType: "PART_SG", value: "hobust" },
      ],
    };
    const keys = slotKeys(hobune);
    expect(keys).toContain("ALLATIVE");
    expect(keys).not.toContain("ILLATIVE");
    expect(keys).not.toContain("INESSIVE");

    // And the question is the one a horse answers, without the place adverb:
    // `kus?` is answered by two cases, so a card wanting one of them cannot
    // print it.
    const task = flashTask({
      word: hobune,
      slot: askableSlots(hobune).find((s) => s.slot === "ADESSIVE")!,
      cardId: "card-1",
      step: 0,
    })!;
    expect(task.label).toContain("kellel?");
    expect(task.label).not.toContain("kus?");
    expect(task.accepted).toContain("hobusel");
  });

  it("asks an ordinary noun the inside trio", () => {
    const keys = slotKeys(TUBA);
    expect(keys).toContain("INESSIVE");
    expect(keys).not.toContain("ADESSIVE");
  });
});
