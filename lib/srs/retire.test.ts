import { describe, expect, it } from "vitest";
import { retirableCaseCards, type DeckCaseCard } from "./retire";

/**
 * The rule the audit removes cards by, exercised on the words that produced
 * it. `isa` is the one a learner reported and `prillid` is the one the builder
 * was fixed for; the third group is the whole point of the test, which is the
 * cards this may never touch.
 */

function card(over: Partial<DeckCaseCard> & { lemma: string }): DeckCaseCard {
  const { lemma, ...rest } = over;
  return {
    id: `card-${lemma}-${rest.targetCase ?? "none"}`,
    ownerId: "learner",
    targetCase: "INESSIVE",
    lexeme: { lemma, semanticTypes: null, forms: [{ formType: "NOM_SG", value: lemma }] },
    ...rest,
  };
}

describe("retirableCaseCards", () => {
  it("takes an inside case off a person", () => {
    const found = retirableCaseCards([
      card({
        lemma: "isa",
        targetCase: "INESSIVE",
        lexeme: {
          lemma: "isa",
          semanticTypes: "in_sugulane",
          forms: [{ formType: "NOM_SG", value: "isa" }],
        },
      }),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ lemma: "isa", grammCase: "INESSIVE", why: "wrong-local-set" });
  });

  it("leaves the outside trio on the same word alone", () => {
    const keep = ["ADESSIVE", "ABLATIVE", "ALLATIVE"].map((targetCase) =>
      card({
        lemma: "isa",
        targetCase,
        lexeme: {
          lemma: "isa",
          semanticTypes: "in_sugulane",
          forms: [{ formType: "NOM_SG", value: "isa" }],
        },
      }));
    expect(retirableCaseCards(keep)).toEqual([]);
  });

  /*
    The eight that are not local are not a choice between two sets, so nothing
    here narrows a person down to a trio: `isata` and `isaks` are ordinary
    Estonian and their cards stay.
  */
  it("never touches a case that is not one of the six local ones", () => {
    const keep = ["COMITATIVE", "ABESSIVE", "TRANSLATIVE", "TERMINATIVE", "GENITIVE"].map(
      (targetCase) => card({
        lemma: "isa",
        targetCase,
        lexeme: {
          lemma: "isa",
          semanticTypes: "in_sugulane",
          forms: [{ formType: "NOM_SG", value: "isa" }],
        },
      }));
    expect(retirableCaseCards(keep)).toEqual([]);
  });

  it("takes every case off a word with no singular", () => {
    const found = retirableCaseCards([
      card({
        lemma: "prillid",
        targetCase: "COMITATIVE",
        lexeme: {
          lemma: "prillid",
          semanticTypes: "ese_instru",
          // Ekilex records the singular of `prill` underneath, which is what
          // made `prillid → milles?` want `prillis`.
          forms: [{ formType: "NOM_SG", value: "prill" }],
        },
      }),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]?.why).toBe("no-singular");
  });

  /*
    THE SAFE END, AND IT IS THE ONE THAT MATTERS. A word somebody confirmed off
    a photograph or typed in has no classification, `localCasesFor` reads that
    as the inside trio, and those cards were built on exactly that reading.
    Removing them would be this rule reading "we do not know" as "it is a
    person", which is the fault pointed the other way.
  */
  it("keeps the inside trio on a word the dictionary cannot classify", () => {
    const keep = ["INESSIVE", "ELATIVE", "ILLATIVE"].map((targetCase) =>
      card({ lemma: "tuba", targetCase }));
    expect(retirableCaseCards(keep)).toEqual([]);
  });

  it("ignores a card whose targetCase is not a case", () => {
    expect(retirableCaseCards([card({ lemma: "isa", targetCase: "indprsg3" })])).toEqual([]);
    expect(retirableCaseCards([card({ lemma: "isa", targetCase: null })])).toEqual([]);
  });

  it("ignores a card that has lost its entry", () => {
    expect(retirableCaseCards([card({ lemma: "isa", lexeme: null })])).toEqual([]);
  });
});
