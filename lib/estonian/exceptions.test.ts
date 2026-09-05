import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EXCEPTION_KINDS, FAMILY_TITLES, KIND_NOTES, exceptionsFor, hasExceptions,
  type ExceptionInput, type ExceptionKind,
} from "./exceptions";
import { grammarTopic } from "./grammar";
import { HARVESTED } from "../../prisma/data/harvested";

/** The forms as the seed writes them, which is what every caller holds. */
const word = (
  lemma: string, pos: string, parts: Record<string, string>,
): ExceptionInput => ({
  lemma, pos,
  forms: Object.entries(parts).map(([formType, value]) => ({ formType, value })),
});

const kinds = (input: ExceptionInput): ExceptionKind[] =>
  exceptionsFor(input).map((e) => e.kind);

/** The two files `npm run db:seed` loads, which is what the copy check reads. */
const SHIPPED: { forms: { formType: string; value: string }[] }[] =
  JSON.parse(readFileSync("prisma/data/expanded.json", "utf8"));

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
    nobody memorizes it, which is the whole of ADR-005.
  */
  it("only ever calls a rule form right for the illative, where both are", () => {
    for (const w of [tuba, aeg, lugema]) {
      for (const ex of exceptionsFor(w)) {
        if (ex.ruleFormIsAlsoRight) expect(ex.kind).toBe("SHORT_ILLATIVE");
      }
    }
  });

  /*
    A KIND POINTS AT A PAGE THAT EXISTS.

    `topic` is what answers "why am I being shown this", which a learner asked
    about `vihata` and the round had no answer to. A dead id is worse than no
    id: it draws a link on the one screen this area exists to stop being a dead
    end, and it fails silently, because `grammarTopic` returning nothing looks
    exactly like a kind that deliberately has no page.
  */
  it("names a grammar topic that exists, or none at all", () => {
    for (const kind of EXCEPTION_KINDS) {
      const { topic } = KIND_NOTES[kind];
      if (topic === null) continue;
      expect(grammarTopic(topic), `${kind} points at a topic that is not there: ${topic}`)
        .toBeTruthy();
    }
    // And at least one does, or the field has quietly stopped being filled in.
    expect(EXCEPTION_KINDS.filter((k) => KIND_NOTES[k].topic).length).toBeGreaterThan(4);
  });

  /*
    AND THE NOTES NAME NO VERB, WHICH IS THE CHECK THAT WAS MISSING.

    The `da`-infinitive's note read "the form after tahan, saan and pean", and
    the last of those governs the *other* infinitive: three Estonian words typed
    into a copy table, one of them the opposite of the truth, taught to
    everybody who met the kind and re-checked by nothing. The rules in this
    module are a comparison against the dictionary and cannot be wrong this way;
    the copy beside them had no such protection.

    So the notes hold endings and English, and a governing verb is described by
    meaning and named once on the page `topic` points at. This is what says so,
    against the dictionary's own stored first persons rather than against a list
    here, because a list here is the same fault one file further out. Made to
    fail on the sentence that shipped.

    The first person specifically, and at four letters or more: that is the form
    a copy writer reaches for when naming a governing verb ("the form after
    tahan"), it is 678 spellings in the shipped dictionary, and measured against
    the English these notes are written in, none of them collides.
  */
  it("names endings rather than verbs", () => {
    const first = new Set<string>();
    const add = (value: string) => {
      const form = value.toLowerCase();
      if (form.length >= 4) first.add(form);
    };
    for (const entry of SHIPPED) {
      for (const form of entry.forms) if (form.formType === "PRES_1SG") add(form.value);
    }
    for (const entry of HARVESTED) {
      const pres = entry.parts.PRES_1SG;
      if (pres) add(pres);
    }
    expect(first.size).toBeGreaterThan(400);

    const offenders: string[] = [];
    for (const kind of EXCEPTION_KINDS) {
      const note = KIND_NOTES[kind];
      for (const token of `${note.title} ${note.what}`.toLowerCase().match(/[\p{L}]+/gu) ?? []) {
        if (first.has(token)) offenders.push(`${kind}: ${token}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
