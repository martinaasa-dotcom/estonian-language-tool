import { describe, expect, it } from "vitest";
import {
  EXCEPTION_KINDS, FAMILY_TITLES, KIND_NOTES, exceptionsFor, hasExceptions,
  type ExceptionInput, type ExceptionKind,
} from "./exceptions";

/** The forms as the seed writes them, which is what every caller holds. */
const word = (
  lemma: string, pos: string, parts: Record<string, string>,
): ExceptionInput => ({
  lemma, pos,
  forms: Object.entries(parts).map(([formType, value]) => ({ formType, value })),
});

const kinds = (input: ExceptionInput): ExceptionKind[] =>
  exceptionsFor(input).map((e) => e.kind);

/** The regular noun the whole model is built on. */
const raamat = word("raamat", "NOUN", {
  NOM_SG: "raamat", GEN_SG: "raamatu", PART_SG: "raamatut",
  NOM_PL: "raamatud", GEN_PL: "raamatute", PART_PL: "raamatuid",
});

/** The word that started this. */
const tuba = word("tuba", "NOUN", {
  NOM_SG: "tuba", GEN_SG: "toa", PART_SG: "tuba", ILL_SG_SHORT: "tuppa",
  NOM_PL: "toad", GEN_PL: "tubade", PART_PL: "tube",
});

/** Four exceptions on one word, which is the case the screens have to carry. */
const aeg = word("aeg", "NOUN", {
  NOM_SG: "aeg", GEN_SG: "aja", PART_SG: "aega", ILL_SG_SHORT: "aega",
  NOM_PL: "ajad", GEN_PL: "aegade", PART_PL: "aegu",
});

const elama = word("elama", "VERB", {
  INF_MA: "elama", INF_DA: "elada", PRES_1SG: "elan",
  PAST_1SG: "elasin", PART_TUD: "elatud",
});

const lugema = word("lugema", "VERB", {
  INF_MA: "lugema", INF_DA: "lugeda", PRES_1SG: "loen",
  PAST_1SG: "lugesin", PART_TUD: "loetud",
});

describe("a word that follows the pattern", () => {
  it("has nothing to say about a regular noun", () => {
    expect(exceptionsFor(raamat)).toEqual([]);
    expect(hasExceptions(raamat)).toBe(false);
  });

  it("has nothing to say about a regular verb", () => {
    expect(exceptionsFor(elama)).toEqual([]);
  });

  /*
    The whole promise of the area: a word that is not in it can be guessed at.
    If this ever fires on an ordinary noun the promise is broken, so the two
    plainest words in the course stand for it.
  */
  it("leaves the plain endings alone", () => {
    for (const w of [raamat, elama]) expect(kinds(w)).toHaveLength(0);
  });
});

describe("the stem", () => {
  it("names the genitive when it is not the word plus an ending", () => {
    const stem = exceptionsFor(tuba).find((e) => e.kind === "STEM");
    expect(stem?.forms).toEqual(["toa"]);
    expect(stem?.slot).toBe("GENITIVE");
  });

  it("carries the alternation where one is visible", () => {
    expect(exceptionsFor(aeg).find((e) => e.kind === "STEM")?.note).toBe("g : j");
  });

  /*
    `inimene : inimese` and `kapsas : kapsa` are declension types a course
    teaches as classes rather than as irregularities, and `gradation.ts` draws
    that line for the same reason. Reporting them here would put a third of the
    dictionary in an area whose whole value is being small.
  */
  it("leaves the regular declension types alone", () => {
    expect(kinds(word("inimene", "NOUN", {
      NOM_SG: "inimene", GEN_SG: "inimese", PART_SG: "inimest",
      NOM_PL: "inimesed", GEN_PL: "inimeste", PART_PL: "inimesi",
    }))).toEqual([]);
    expect(kinds(word("kapsas", "NOUN", {
      NOM_SG: "kapsas", GEN_SG: "kapsa", PART_SG: "kapsast",
      NOM_PL: "kapsad", GEN_PL: "kapsaste", PART_PL: "kapsaid",
    }))).toEqual([]);
  });
});

describe("the singular", () => {
  it("names the short illative and offers the long one beside it", () => {
    const ill = exceptionsFor(tuba).find((e) => e.kind === "SHORT_ILLATIVE");
    expect(ill?.forms).toEqual(["tuppa"]);
    expect(ill?.ruleForm).toBe("toasse");
    expect(ill?.ruleFormIsAlsoRight).toBe(true);
  });

  it("says nothing where the short illative is what the ending gives", () => {
    const same = word("kool", "NOUN", {
      NOM_SG: "kool", GEN_SG: "kooli", PART_SG: "kooli", ILL_SG_SHORT: "koolisse",
      NOM_PL: "koolid", GEN_PL: "koolide", PART_PL: "koole",
    });
    expect(kinds(same)).toEqual([]);
  });

  it("names a partitive that goes back to the strong grade", () => {
    expect(exceptionsFor(aeg).find((e) => e.kind === "PART_SG")?.forms).toEqual(["aega"]);
  });
});

describe("the plural", () => {
  it("names a plural stem that is not the singular one", () => {
    expect(exceptionsFor(aeg).find((e) => e.kind === "PLURAL_STEM")?.forms).toEqual(["aegade"]);
  });

  it("leaves the plural alone where it sits on the singular stem", () => {
    expect(kinds(tuba)).not.toContain("PART_PL");
  });

  it("reports a word with no plural at all, and only when all three are missing", () => {
    expect(kinds(word("sularaha", "NOUN", {
      NOM_SG: "sularaha", GEN_SG: "sularaha", PART_SG: "sularaha",
    }))).toContain("NO_PLURAL");
    /*
      A nominative and a genitive and nothing else is an entry somebody
      confirmed off a photograph, not a word without a plural.
    */
    expect(kinds(word("thin", "NOUN", { NOM_SG: "thin", GEN_SG: "thin" })))
      .not.toContain("NO_PLURAL");
  });
});

describe("the verb", () => {
  it("names a present that runs on another stem", () => {
    const pres = exceptionsFor(lugema).find((e) => e.kind === "PRESENT_STEM");
    expect(pres?.forms).toEqual(["loen"]);
    expect(pres?.slot).toBe("IndPrSg1");
  });

  it("names the tud form and the da-infinitive separately", () => {
    expect(kinds(lugema)).toContain("TUD_PARTICIPLE");
    expect(kinds(word("jooma", "VERB", {
      INF_MA: "jooma", INF_DA: "juua", PRES_1SG: "joon", PAST_1SG: "jõin",
    }))).toEqual(expect.arrayContaining(["PAST_STEM", "DA_INFINITIVE"]));
  });

  /*
    The two slots that only exist for a course word, because the harvest stores
    what the rules cannot reach and the Wiktionary expansion holds none.
  */
  it("reads the third person of the past and the polite imperative off the stored forms", () => {
    const andma = word("andma", "VERB", {
      INF_MA: "andma", INF_DA: "anda", PRES_1SG: "annan", PAST_1SG: "andsin",
      PART_TUD: "antud", "EKILEX:IndIpfSg3": "andis", "EKILEX:ImpPrPl2": "andke",
    });
    expect(kinds(andma)).toEqual(expect.arrayContaining(["PAST_3SG", "IMPERATIVE_PL"]));
  });
});

describe("silence is not evidence", () => {
  /*
    The rule `lib/srs/retire.ts` was corrected for. A word the dictionary holds
    nothing for must report nothing rather than reporting that it behaves, or
    the exception area becomes a claim about entries nobody has filled in.
  */
  it("says nothing about a form the dictionary does not hold", () => {
    expect(kinds(word("bare", "NOUN", { NOM_SG: "bare", GEN_SG: "bare" }))).toEqual([]);
    expect(kinds(word("bare", "VERB", { INF_MA: "barema" }))).toEqual([]);
  });

  it("says nothing at all about a word with no forms", () => {
    expect(exceptionsFor({ lemma: "x", pos: "NOUN", forms: [] })).toEqual([]);
  });
});

describe("the notes", () => {
  it("describes every kind exactly once", () => {
    expect(EXCEPTION_KINDS).toHaveLength(Object.keys(KIND_NOTES).length);
    for (const kind of EXCEPTION_KINDS) {
      const note = KIND_NOTES[kind];
      expect(note.title.length).toBeGreaterThan(3);
      expect(note.what.length).toBeGreaterThan(40);
      expect(FAMILY_TITLES[note.family]).toBeTruthy();
    }
  });

  /*
    A screen prints the pattern's own answer only where that answer is a real
    Estonian word. Anywhere else it would be this app writing a form and hoping
    nobody memorises it, which is the whole of ADR-005.
  */
  it("only ever calls a rule form right for the illative, where both are", () => {
    for (const w of [tuba, aeg, lugema]) {
      for (const ex of exceptionsFor(w)) {
        if (ex.ruleFormIsAlsoRight) expect(ex.kind).toBe("SHORT_ILLATIVE");
      }
    }
  });
});
