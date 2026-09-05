import { describe, expect, it } from "vitest";
import { drillable, exceptionRound, pickWords, tasksFor, type ExceptionWord } from "./exceptions";
import type { WordException } from "@/lib/estonian/exceptions";

const illative: WordException = {
  kind: "SHORT_ILLATIVE", slot: "ILLATIVE", forms: ["tuppa"],
  ruleForm: "toasse", ruleFormIsAlsoRight: true, note: null,
};

const stem: WordException = {
  kind: "STEM", slot: "GENITIVE", forms: ["toa"],
  ruleForm: null, ruleFormIsAlsoRight: false, note: "b : ∅",
};

/**
 * The forms the dictionary holds, because `gapForms` decides what a gap may
 * hide and this round only narrows that. A word with no forms can be met and
 * produced and never gapped, which is the honest answer rather than a special
 * case.
 */
const tubaForms = [
  { formType: "NOM_SG", value: "tuba" }, { formType: "GEN_SG", value: "toa" },
  { formType: "PART_SG", value: "tuba" }, { formType: "ILL_SG_SHORT", value: "tuppa" },
  { formType: "NOM_PL", value: "toad" }, { formType: "GEN_PL", value: "tubade" },
  { formType: "PART_PL", value: "tube" },
];

/**
 * The word's own spellings to the slots that claim them, which is what says a
 * gap can be read on its own. `tuppa` is only ever the illative; `arsti` is the
 * illative, the genitive and the partitive at once, which is why the rung
 * refuses it.
 */
const tubaIndex = { tuppa: ["ILLATIVE"], toa: ["GENITIVE"], tuba: ["NOMINATIVE", "PARTITIVE"] };

const word = (over: Partial<ExceptionWord> = {}): ExceptionWord => ({
  lexemeId: "lex-1", lemma: "tuba", translation: "room", pos: "NOUN",
  exception: illative, cardId: "card-1", index: tubaIndex, forms: tubaForms, sentences: [],
  starred: false,
  ...over,
});

describe("tasksFor", () => {
  it("meets and produces a form with no sentence behind it", () => {
    expect(tasksFor(word()).map((t) => t.rung)).toEqual(["meet", "produce"]);
  });

  it("adds the sentence rung where a lexicographer wrote one with the form in it", () => {
    const tasks = tasksFor(word({ sentences: ["Ma lähen tuppa ja panen ukse kinni."] }));
    expect(tasks.map((t) => t.rung)).toEqual(["meet", "produce", "use"]);
    const use = tasks[2]!;
    expect(use.gapped).toContain("____");
    expect(use.gapped).not.toContain("tuppa");
    expect(use.gapForm).toBe("tuppa");
  });

  /*
    A gap wants the spelling that is in the sentence. Both illatives are right
    and a lexicographer wrote one of them, so accepting the other would mark a
    learner right for a sentence they did not reconstruct.
  */
  it("asks the sentence for the spelling the sentence carries", () => {
    const tasks = tasksFor(word({ sentences: ["Ma lähen tuppa ja panen ukse kinni."] }));
    expect(tasks[2]!.accepted).toEqual(["tuppa"]);
    expect(tasks[1]!.accepted).toEqual(["tuppa"]);
  });

  /*
    A sentence holding another form of the same word is not this exception's
    sentence. A round about the short illative may not gap the inessive out and
    then file the answer under the illative.
  */
  it("refuses a sentence that does not hold the form", () => {
    const tasks = tasksFor(word({ sentences: ["Ma olen toas."] }));
    expect(tasks.map((t) => t.rung)).toEqual(["meet", "produce"]);
  });

  /*
    `gapForms` is what a gap may hide anywhere in this app, and this round only
    narrows it. A word the dictionary holds no forms for has nothing a gap may
    hide, whatever sentence turns up carrying the spelling.
  */
  it("hides only what gapForms allows", () => {
    const tasks = tasksFor(word({
      forms: [], sentences: ["Ma lähen tuppa ja panen ukse kinni."],
    }));
    expect(tasks.map((t) => t.rung)).toEqual(["meet", "produce"]);
  });

  /*
    `Läksin arsti juurde.` is a genitive before a postposition and `arsti` is
    also the short illative, so gapping it for the illative asks for a genitive
    and then names it the sisseütlev. `readCase`'s rule: exactly one slot claims
    the spelling, or no gap.
  */
  it("refuses a gap the sentence cannot name on its own", () => {
    const ambiguous = tasksFor(word({
      exception: { ...illative, forms: ["tuba"] },
      sentences: ["Ma näen seda tuba igal hommikul."],
    }));
    expect(ambiguous.map((t) => t.rung)).not.toContain("use");
  });

  it("refuses a gap when nothing was indexed, rather than guessing", () => {
    const tasks = tasksFor(word({
      index: {}, sentences: ["Ma lähen tuppa ja panen ukse kinni."],
    }));
    expect(tasks.map((t) => t.rung)).toEqual(["meet", "produce"]);
  });

  it("meets a word with no form to produce, and asks nothing", () => {
    const none: WordException = {
      kind: "NO_PLURAL", slot: "NOMINATIVE", forms: [],
      ruleForm: "sularahad", ruleFormIsAlsoRight: false, note: null,
    };
    expect(tasksFor(word({ exception: none })).map((t) => t.rung)).toEqual(["meet"]);
  });

  it("carries the other right form only where there is one", () => {
    expect(tasksFor(word())[0]!.alsoRight).toBe("toasse");
    expect(tasksFor(word({ exception: stem }))[0]!.alsoRight).toBe(null);
  });

  it("keeps the card where the learner holds one and takes null where they do not", () => {
    expect(tasksFor(word({ cardId: null })).every((t) => t.cardId === null)).toBe(true);
  });
});

describe("exceptionRound", () => {
  const words = [
    word({ lexemeId: "a", lemma: "tuba", sentences: ["Ma lähen tuppa ja panen ukse kinni."] }),
    word({ lexemeId: "b", lemma: "aeg", exception: stem }),
  ];

  /*
    A pass at a time is the spacing. Meeting a form and being asked for it four
    seconds later is reading rather than retrieval, which is the argument
    `requeue` makes in `lib/srs/queue.ts`.
  */
  it("meets everything before it asks for anything", () => {
    const round = exceptionRound(words);
    expect(round.map((t) => t.rung)).toEqual(["meet", "meet", "produce", "produce", "use"]);
  });

  it("gives every task its own id", () => {
    const ids = exceptionRound(words).map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("drillable", () => {
  /*
    A card may not print its own answer. The short illative is spelled like a
    principal part for most of the words that have one, so this is the rule
    that keeps `Euroopa → Euroopa` off the round while leaving it on the page,
    where saying so is the whole point.
  */
  it("refuses an exception whose form is the word in the question", () => {
    const same: WordException = {
      kind: "SHORT_ILLATIVE", slot: "ILLATIVE", forms: ["Euroopa"],
      ruleForm: "Euroopasse", ruleFormIsAlsoRight: true, note: null,
    };
    expect(drillable(word({ lemma: "Euroopa", exception: same }))).toBe(false);
    expect(drillable(word())).toBe(true);
  });

  it("refuses an exception with no form to type", () => {
    const none: WordException = {
      kind: "NO_PLURAL", slot: "NOMINATIVE", forms: [],
      ruleForm: null, ruleFormIsAlsoRight: false, note: null,
    };
    expect(drillable(word({ exception: none }))).toBe(false);
  });

  it("keeps it out of a round", () => {
    const same: WordException = {
      kind: "SHORT_ILLATIVE", slot: "ILLATIVE", forms: ["Euroopa"],
      ruleForm: "Euroopasse", ruleFormIsAlsoRight: true, note: null,
    };
    expect(pickWords([word({ lemma: "Euroopa", exception: same })])).toEqual([]);
  });
});

describe("pickWords", () => {
  it("asks one exception of a word, however many it has", () => {
    const picked = pickWords([
      word({ lexemeId: "a", exception: stem }),
      word({ lexemeId: "a", exception: illative }),
      word({ lexemeId: "b" }),
    ]);
    expect(picked).toHaveLength(2);
  });

  /*
    Half the dictionary has a short illative, so taking each word's first
    exception is a round of five illatives. Meeting the kinds is the point.
  */
  it("spreads a round across the kinds it is offered", () => {
    const picked = pickWords([
      word({ lexemeId: "a", exception: illative }),
      word({ lexemeId: "b", exception: illative }),
      word({ lexemeId: "c", exception: stem }),
    ], 2);
    expect(picked.map((w) => w.exception.kind)).toEqual(["SHORT_ILLATIVE", "STEM"]);
  });

  it("keeps the pool's own order where every entry is one kind", () => {
    const picked = pickWords([
      word({ lexemeId: "a", lemma: "üks" }),
      word({ lexemeId: "b", lemma: "kaks" }),
    ], 2);
    expect(picked.map((w) => w.lemma)).toEqual(["üks", "kaks"]);
  });

  it("stops at the round size", () => {
    const many = Array.from({ length: 20 }, (_, i) => word({ lexemeId: `w${i}` }));
    expect(pickWords(many)).toHaveLength(6);
    expect(pickWords(many, 3)).toHaveLength(3);
  });
});
