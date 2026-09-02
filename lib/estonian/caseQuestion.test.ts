import { describe, expect, it } from "vitest";

import { CASES, caseByKey } from "./cases";
import { caseFits, caseLabelFor, caseQuestionFor, localCasesFor } from "./caseQuestion";
import { INSIDE_CASES, OUTSIDE_CASES } from "./place";

const horse = { lemma: "hobune", semanticTypes: "loom" };
const teacher = { lemma: "õpetaja", semanticTypes: "in_elukutse" };
const room = { lemma: "tuba", semanticTypes: "koht_hoone" };
const germany = { lemma: "Saksamaa", semanticTypes: "koht_ala" };
const police = { lemma: "politsei", semanticTypes: "in_elukutse koht_asutus" };
const scanned = { lemma: "uudishimulik", semanticTypes: null };

describe("which local cases a word takes", () => {
  it("gives a person and an animal the outside trio", () => {
    expect(localCasesFor(horse)).toEqual(OUTSIDE_CASES);
    expect(localCasesFor(teacher)).toEqual(OUTSIDE_CASES);
  });

  it("gives a room the inside one", () => {
    expect(localCasesFor(room)).toEqual(INSIDE_CASES);
  });

  it("keeps the -maa rule, which is about the ending rather than the meaning", () => {
    expect(localCasesFor(germany)).toEqual(OUTSIDE_CASES);
  });

  it("gives neither to a word that is a being and a place at once", () => {
    expect(localCasesFor(police)).toEqual([]);
  });

  it("leaves an unclassified word where it was", () => {
    // No regression on a word somebody added by hand or scanned off a page:
    // "we do not know" may not be read as "it is a person".
    expect(localCasesFor(scanned)).toEqual(INSIDE_CASES);
  });
});

describe("caseFits", () => {
  it("refuses the inside trio for an animal and allows the outside one", () => {
    expect(caseFits("INESSIVE", horse)).toBe(false);
    expect(caseFits("ILLATIVE", horse)).toBe(false);
    expect(caseFits("ELATIVE", horse)).toBe(false);
    expect(caseFits("ADESSIVE", horse)).toBe(true);
    expect(caseFits("ALLATIVE", horse)).toBe(true);
  });

  it("narrows nothing outside the six local cases", () => {
    // `hobusega`, `hobuseta` and `hobusena` are all ordinary Estonian, and so
    // is `õpetajaks`. This rule is about the two sets and nothing else.
    for (const spec of CASES) {
      if ([...INSIDE_CASES, ...OUTSIDE_CASES].includes(spec.key)) continue;
      expect(caseFits(spec.key, horse), spec.key).toBe(true);
      expect(caseFits(spec.key, room), spec.key).toBe(true);
    }
  });
});

describe("how the question is worded", () => {
  it("asks a person or an animal with the kes-series", () => {
    expect(caseQuestionFor(caseByKey("COMITATIVE")!, horse)).toBe("kellega?");
    expect(caseQuestionFor(caseByKey("ALLATIVE")!, teacher)).toBe("kellele?");
  });

  it("asks a thing with the mis-series", () => {
    expect(caseQuestionFor(caseByKey("INESSIVE")!, room)).toBe("milles?");
  });

  it("asks both where the dictionary has no classification", () => {
    expect(caseQuestionFor(caseByKey("INESSIVE")!, scanned)).toBe("kelles? milles?");
  });

  /*
    THE PLACE ADVERB IS NOT A QUESTION ABOUT ONE CASE. `kus?` is answered by
    the seesütlev and by the alalütlev, `kuhu?` by the sisseütlev and by the
    alaleütlev, `kust?` by the seestütlev and by the alaltütlev. A card wanting
    one of a pair that prints the adverb can be answered correctly and marked
    wrong. It stays in the case's own name, where the pair is the point.
  */
  it("never puts a place adverb on a card", () => {
    const adverbs = new Set(CASES.map((c) => c.asksWhere).filter(Boolean));
    for (const spec of CASES) {
      for (const subject of [horse, room, scanned]) {
        for (const word of caseQuestionFor(spec, subject).split(/\s+/)) {
          expect(adverbs.has(word), `${spec.key} ${subject.lemma}`).toBe(false);
        }
      }
    }
  });

  it("keeps the adverb in the case's own name", () => {
    expect(caseByKey("INESSIVE")!.question).toBe("kelles? milles? kus?");
    expect(caseByKey("NOMINATIVE")!.question).toBe("kes? mis?");
  });

  it("labels a case for a word with its Estonian name and that word's question", () => {
    expect(caseLabelFor(caseByKey("ADESSIVE")!, horse)).toBe("alalütlev · kellel?");
  });
});
