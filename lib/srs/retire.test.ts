import { describe, expect, it } from "vitest";
import { retirableCaseCards, type DeckCaseCard } from "./retire";

/**
 * The rule a destructive command deletes by, exercised on the words that
 * produced it. `isa` is the one a learner reported and `prillid` is the one the
 * builder was fixed for; everything after those is a card this may not touch,
 * which is the half that matters, because the cost of the two mistakes is not
 * the same. Leaving a bad card in a deck is one more bad card. Taking a good
 * one out is work somebody did, gone, with nothing to put it back.
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

/** The shape the dictionary is in once it has been asked about a word. */
const person = (lemma: string, targetCase: string) => card({
  lemma,
  targetCase,
  lexeme: {
    lemma,
    semanticTypes: "in_sugulane",
    forms: [{ formType: "NOM_SG", value: lemma }],
  },
});

describe("retirableCaseCards", () => {
  it("takes an inside case off a being", () => {
    const found = retirableCaseCards([person("isa", "INESSIVE")]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ lemma: "isa", grammCase: "INESSIVE", why: "wrong-local-set" });
  });

  it("takes all three of them", () => {
    const gone = retirableCaseCards(
      ["INESSIVE", "ELATIVE", "ILLATIVE"].map((c) => person("isa", c)),
    );
    expect(gone.map((g) => g.grammCase).sort()).toEqual(["ELATIVE", "ILLATIVE", "INESSIVE"]);
  });

  it("leaves the outside trio on the same word alone", () => {
    const keep = ["ADESSIVE", "ABLATIVE", "ALLATIVE"].map((c) => person("isa", c));
    expect(retirableCaseCards(keep)).toEqual([]);
  });

  /*
    The eight that are not local are not a choice between two sets, so nothing
    here narrows a being down to a trio: `isata` and `isaks` are ordinary
    Estonian and their cards stay.
  */
  it("never touches a case that is not one of the six local ones", () => {
    const keep = ["COMITATIVE", "ABESSIVE", "TRANSLATIVE", "TERMINATIVE", "GENITIVE"]
      .map((c) => person("isa", c));
    expect(retirableCaseCards(keep)).toEqual([]);
  });

  it("reads the ending where there is no classification to read", () => {
    // `Saksamaa` takes the outside trio by spelling alone: see place.ts.
    const found = retirableCaseCards([card({ lemma: "Saksamaa", targetCase: "INESSIVE" })]);
    expect(found).toHaveLength(1);
    expect(found[0]?.why).toBe("wrong-local-set");
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
    THE ONE THE PRODUCTION DATABASE FOUND, AND THE REASON THIS FILE EXISTS IN
    THIS SHAPE.

    The first version of the rule was `caseFits` and nothing else, which reads
    "we do not know" as the inside trio and therefore refuses the *outside*
    trio on any word the dictionary cannot classify. On a deployment seeded
    before `semanticTypes` was filled, that is every word: 6,952 entries, none
    classified, and 318 cards condemned, every one of them correct Estonian.
    `isale`, `õpetajale`, `arstile`, `koerale`. A destructive command may not
    read silence as evidence.
  */
  it("touches nothing at all on a word the dictionary cannot classify", () => {
    const keep = ["INESSIVE", "ELATIVE", "ILLATIVE", "ADESSIVE", "ABLATIVE", "ALLATIVE"]
      .map((targetCase) => card({ lemma: "isa", targetCase }));
    expect(retirableCaseCards(keep)).toEqual([]);
  });

  /*
    And only ever one way round. `isas` is a form nobody says; `toale` is
    ordinary Estonian that the builder happens not to choose for a room, and a
    card asking for it teaches nothing false.
  */
  it("keeps an outside case on a place, which is a form people say", () => {
    const keep = ["ADESSIVE", "ABLATIVE", "ALLATIVE"].map((targetCase) => card({
      lemma: "tuba",
      targetCase,
      lexeme: {
        lemma: "tuba",
        semanticTypes: "koht_hoone",
        forms: [{ formType: "NOM_SG", value: "tuba" }],
      },
    }));
    expect(retirableCaseCards(keep)).toEqual([]);
  });

  /*
    `maa` is `maal` in the countryside and `maas` on the ground, so both trios
    are ordinary and the builder declines to ask either. Declining to choose
    between two right answers is not a reason to delete one of them.
  */
  it("keeps both trios on a word where both are ordinary", () => {
    const keep = ["INESSIVE", "ELATIVE", "ADESSIVE", "ALLATIVE"].map((targetCase) => card({
      lemma: "maa",
      targetCase,
      lexeme: {
        lemma: "maa",
        semanticTypes: "koht_ala",
        forms: [{ formType: "NOM_SG", value: "maa" }],
      },
    }));
    expect(retirableCaseCards(keep)).toEqual([]);
  });

  it("ignores a card whose targetCase is not a case", () => {
    expect(retirableCaseCards([person("isa", "indprsg3")])).toEqual([]);
    expect(retirableCaseCards([card({ lemma: "isa", targetCase: null })])).toEqual([]);
  });

  it("ignores a card that has lost its entry", () => {
    expect(retirableCaseCards([card({ lemma: "isa", lexeme: null })])).toEqual([]);
  });

  it("ignores a word whose entry holds no nominative singular to compare", () => {
    expect(retirableCaseCards([
      card({
        lemma: "prillid",
        targetCase: "COMITATIVE",
        lexeme: { lemma: "prillid", semanticTypes: null, forms: [] },
      }),
    ])).toEqual([]);
  });
});
