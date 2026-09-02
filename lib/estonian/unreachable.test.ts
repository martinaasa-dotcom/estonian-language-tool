/**
 * What the dictionary has to store because no rule of this app produces it.
 *
 * ADR-005 amendment 1 lets a deterministic rule build a form off a stored one,
 * and the rules are real. What they are not is complete, and a deployment with
 * no Ekilex key has nothing else: `olema` showed `olen` and stopped, no verb
 * at all could answer `lihtminevik · ta`, and every pronoun's short case forms
 * were missing, which is what an Estonian sentence is actually made of.
 *
 * These two functions are how the harvest decides what to keep. They are asked
 * of the rules rather than listed beside them, because a list of exceptions
 * kept next to the exceptions is two copies of one fact and one of them goes
 * stale in silence.
 */
import { describe, expect, it } from "vitest";
import { unreachableSlots } from "./conjugate";
import { unreachableCaseForms } from "./derive";

describe("the verb slots a rule cannot fill", () => {
  /*
    The simple past third person, for every verb in the language. `lugesin`
    goes to `luges` and `tahtsin` to `tahtis` and `võtsin` to `võttis`, with
    the grade changing on the way, so nothing derives it from the first person
    and a seeded verb could answer seven of its eight conjugation cards.
  */
  it("names the simple past third person for an ordinary verb", () => {
    expect(unreachableSlots({ lemma: "lugema", pres1sg: "loen" })).toContain("IndIpfSg3");
  });

  /*
    And the polite imperative, for every verb in the language. It is the form a
    learner is addressed with at every counter in the country and it is not a
    suffix on anything this module holds: `annan` goes to `andke`, `lähen` to
    `minge`, `loen` to `lugege`. The app could not say one until `eval:scene`
    watched a model reach for it in a `teie` scene over and over.
  */
  it("names the polite imperative for every verb, which no rule reaches", () => {
    for (const verb of [
      { lemma: "lugema", pres1sg: "loen" },
      { lemma: "andma", pres1sg: "annan" },
      { lemma: "minema", pres1sg: "lähen" },
    ]) {
      expect(unreachableSlots(verb), `${verb.lemma} needs its teie imperative stored`)
        .toContain("ImpPrPl2");
    }
  });

  it("names the whole present for olema, whose third person is on", () => {
    const slots = unreachableSlots({ lemma: "olema", pres1sg: "olen" });
    for (const code of ["IndPrSg1", "IndPrSg2", "IndPrSg3", "IndPrPl1", "IndPrPl2", "IndPrPl3"]) {
      expect(slots, `olema needs ${code} from the dictionary`).toContain(code);
    }
    expect(slots).toContain("IndIpfSg3");
    // The conditional is regular even here: oleksin, oleksid, oleks.
    expect(slots).not.toContain("KndPrSg1");
  });

  it("names the imperative for minema, which says mine off the infinitive", () => {
    expect(unreachableSlots({ lemma: "minema", pres1sg: "lähen" })).toContain("ImpPrSg2");
    expect(unreachableSlots({ lemma: "lugema", pres1sg: "loen" })).not.toContain("ImpPrSg2");
  });

  /*
    A slot the dictionary already holds under its own name is not unreachable,
    it is simply somewhere else. `IndIpfSg1` is `PAST_1SG`, a principal part.
  */
  it("does not ask for the past first person, which is a principal part", () => {
    expect(unreachableSlots({ lemma: "lugema", pres1sg: "loen" })).not.toContain("IndIpfSg1");
  });
});

describe("the case forms a rule cannot build", () => {
  const tuba = { NOM_SG: "tuba", GEN_SG: "toa", PART_SG: "tuba" };
  const mina = { NOM_SG: "mina", GEN_SG: "minu", PART_SG: "mind" };

  it("keeps nothing for a noun the rule already answers", () => {
    const recorded = new Map([["SgIn", ["toas"]], ["SgAll", ["toale"]], ["SgN", ["tuba"]]]);
    expect(unreachableCaseForms("tuba", tuba, recorded)).toEqual({});
  });

  /*
    The pair, both halves. `minule` is the rule's own answer and is kept anyway,
    because the two are a pair and printing `mulle` alone would hide the other
    one, which is the illative's bug pointed the other way.
  */
  it("keeps both halves of a pronoun's parallel case", () => {
    const recorded = new Map([["SgAll", ["minule", "mulle"]]]);
    expect(unreachableCaseForms("mina", mina, recorded)).toEqual({ SgAll: ["minule", "mulle"] });
  });

  it("keeps a principal case whose second spelling the entry does not hold", () => {
    // üks : üht, and ühte is also its partitive. The entry stores ühte as its
    // short illative, which says nothing about the partitive having two forms.
    const üks = { NOM_SG: "üks", GEN_SG: "ühe", PART_SG: "üht", ILL_SG_SHORT: "ühte" };
    const recorded = new Map([["SgP", ["üht", "ühte"]]]);
    expect(unreachableCaseForms("üks", üks, recorded)).toEqual({ SgP: ["üht", "ühte"] });
  });

  /*
    An indeclinable word's only recorded form is itself, and a table printing
    the headword as its own inessive reads as a rendering fault.
  */
  it("keeps nothing that is the headword over again", () => {
    const kodu = { NOM_SG: "kodu", GEN_SG: "kodu", PART_SG: "kodu" };
    const recorded = new Map([["SgIn", ["kodus", "kodu"]], ["SgIll", ["kodusse", "kodu"]]]);
    expect(unreachableCaseForms("kodu", kodu, recorded)).toEqual({});
  });

  it("keeps a form no ending on the genitive stem produces", () => {
    const kodu = { NOM_SG: "kodu", GEN_SG: "kodu", PART_SG: "kodu" };
    const recorded = new Map([["SgEl", ["kodust", "kodunt", "kottu"]]]);
    expect(unreachableCaseForms("kodu", kodu, recorded)).toEqual({ SgEl: ["kodust", "kodunt", "kottu"] });
  });
});
