import { describe, expect, it } from "vitest";
import {
  type Candidate, fold, likeLiteral, matchEstonianForm, oneEntryPerLemma, rankCandidates,
} from "./search";

describe("fold", () => {
  it.each([
    ["sõna", "sona"],
    ["käsi", "kasi"],
    ["õppima", "oppima"],
    ["šokolaad", "sokolaad"],
  ])("strips diacritics from %s", (input, expected) => {
    expect(fold(input)).toBe(expected);
  });

  it("lets an undiacriticked query match the real word", () => {
    expect(fold("SÕNA")).toBe(fold("sona"));
  });
});

// Fixtures rather than a seeded database. These four words carry every shape the
// ranker has a rule for — gradation (tuba : toa), a plural stem that is not
// derivable, a verb with stored principal parts, and an Estonian word whose
// folded form collides with an English one (rõõm / room).
function lexeme(
  lemma: string,
  translation: string,
  pos: string,
  forms: [string, string][],
  provenance = "SEED",
): Candidate {
  return {
    id: lemma, lemma, translation, pos, cefr: "A1", gradationNote: null, provenance,
    forms: forms.map(([formType, value]) => ({
      formType, value, morphCode: null, morphName: null,
    })),
  };
}

const DICT: Candidate[] = [
  lexeme("tuba", "room", "NOUN", [
    ["NOM_SG", "tuba"], ["GEN_SG", "toa"], ["PART_SG", "tuba"],
    ["ILL_SG_SHORT", "tuppa"], ["GEN_PL", "tubade"],
  ]),
  lexeme("raamat", "book", "NOUN", [
    ["NOM_SG", "raamat"], ["GEN_SG", "raamatu"], ["PART_SG", "raamatut"],
    ["GEN_PL", "raamatute"],
  ]),
  lexeme("lugema", "to read", "VERB", [
    ["INF_MA", "lugema"], ["INF_DA", "lugeda"],
    ["PRES_1SG", "loen"], ["PAST_1SG", "lugesin"], ["PART_TUD", "loetud"],
  ]),
  lexeme("rõõm", "joy", "NOUN", [
    ["NOM_SG", "rõõm"], ["GEN_SG", "rõõmu"], ["PART_SG", "rõõmu"],
  ]),
];

function top(query: string) {
  return rankCandidates(DICT, query)[0];
}

describe("rankCandidates — inflected forms", () => {
  it.each([
    ["loen", "lugema", /olevik ma/],
    ["lugesin", "lugema", /lihtminevik ma/],
    ["tuppa", "tuba", /lühike sisseütlev/],
    ["toas", "tuba", /seesütlev/],
    ["raamatuga", "raamat", /kaasaütlev/],
    ["tubadega", "tuba", /mitmuse kaasaütlev/],
    ["raamatud", "raamat", /mitmuse nimetav/],
  ])("finds %s as a form of %s", (query, lemma, why) => {
    expect(top(query)?.lemma).toBe(lemma);
    expect(top(query)?.matchedAs).toMatch(why);
  });

  it("names the form the way a class names it, English in brackets after", () => {
    // A learner who searches `toas` and is told it is "the inessive" has been
    // handed a word their own teacher does not say. Both names, Estonian first.
    const inessive = top("toas")?.matchedAs ?? "";
    expect(inessive.indexOf("seesütlev")).toBeLessThan(inessive.indexOf("inessive"));
    const past = top("lugesin")?.matchedAs ?? "";
    expect(past).toContain("lihtminevik ma");
    const plural = top("tubadega")?.matchedAs ?? "";
    expect(plural).toContain("mitmuse kaasaütlev");
  });

  it("does not label a headword match as an inflected form", () => {
    expect(top("tuba")?.lemma).toBe("tuba");
    expect(top("tuba")?.matchedAs).toBeUndefined();
  });

  it("still prefers an exact English match over a folded Estonian one", () => {
    expect(top("room")?.lemma).toBe("tuba");
  });

  it("finds a word by its undiacriticked spelling", () => {
    expect(top("room")?.lemma).toBe("tuba");
    expect(rankCandidates(DICT, "roomu")[0]?.lemma).toBe("rõõm");
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(rankCandidates(DICT, "zzzzz")).toEqual([]);
  });

  it("returns nothing for a blank query", () => {
    expect(rankCandidates(DICT, "   ")).toEqual([]);
  });

  it("honours the limit", () => {
    expect(rankCandidates(DICT, "a", 2).length).toBeLessThanOrEqual(2);
  });

  it("does not let a regex metacharacter in the query throw", () => {
    expect(() => rankCandidates(DICT, "read (")).not.toThrow();
  });
});

/*
  Two rows, one word.

  `@@unique` is on `(lemma, pos)`, so a lemma can hold more than one entry and
  should: `hall` is grey and also frost. What could not happen and did was the
  app having no rule about which one it leads with. Both score 100, the tiebreak
  compared `lemma` with `lemma` and returned 0, and the entry page renders
  `hits[0]`, so the answer came from whatever order the rows arrived in.

  A fresh seed ships thirteen of these — the Q8 adjectives, ADJECTIVE from the
  course harvest and NOUN from the built expansion — and a learner who confirms
  a scanned word the dictionary already knows makes another, with no forms in
  it at all. That one is the reason these tests are here: a formless stub
  winning takes the whole paradigm off the entry page for a word the app knows.

  Every case below is asserted from a *reversed* array as well, because an
  assertion that only ever sees one input order cannot tell a rule from a
  coincidence, which is exactly how the old comparator passed for a year.
*/
describe("rankCandidates — two entries for one word", () => {
  const seeded = lexeme("vana", "old", "ADJECTIVE", [
    ["NOM_SG", "vana"], ["GEN_SG", "vana"], ["PART_SG", "vana"],
    ["PART_PL", "vanu"], ["GEN_PL", "vanade"],
  ]);
  // What confirming an unvouched word off a photograph leaves behind:
  // `guessPos` files it as OTHER and nothing invents a form for it.
  const scanned: Candidate = {
    ...lexeme("vana", "old", "OTHER", []), id: "scanned-vana",
  };
  const both = [seeded, scanned];

  it("leads with the entry there is something to teach from", () => {
    for (const order of [both, [...both].reverse()]) {
      expect(rankCandidates(order, "vana")[0]?.pos).toBe("ADJECTIVE");
    }
  });

  it("still offers the other one rather than hiding it", () => {
    expect(rankCandidates(both, "vana").filter((h) => h.lemma === "vana")).toHaveLength(2);
  });

  /*
    The pair this whole block was written for, with the numbers it really has.

    `vana` is a hand-checked A1 adjective from the course with five principal
    parts, and a noun from the built expansion with six, glossed "an old
    person; guy, dude, chap". Ranking on how much is stored alone therefore
    handed a learner searching the commonest adjective in the language the
    noun, by rule and every time, which is worse than the arbitrary answer it
    replaced. `prisma/expanded.ts` already says a hand-written entry wins over
    the expansion; that is as true of reads as of writes.
  */
  it("leads with the hand-written entry even when the built one holds more forms", () => {
    const course = lexeme("vana", "old", "ADJECTIVE", [
      ["NOM_SG", "vana"], ["GEN_SG", "vana"], ["PART_SG", "vana"],
      ["PART_PL", "vanu"], ["GEN_PL", "vanade"],
    ], "SEED");
    const built: Candidate = {
      ...lexeme("vana", "an old person; guy, dude, chap", "NOUN", [
        ["NOM_SG", "vana"], ["GEN_SG", "vana"], ["PART_SG", "vana"],
        ["PART_PL", "vanu"], ["GEN_PL", "vanade"], ["ILL_SG_SHORT", "vanna"],
      ], "EKILEX"),
      id: "built-vana",
    };
    expect(built.forms.length).toBeGreaterThan(course.forms.length);
    for (const order of [[course, built], [built, course]]) {
      expect(rankCandidates(order, "vana")[0]?.pos).toBe("ADJECTIVE");
    }
  });

  it("still keeps a formless scan stub behind a built entry", () => {
    // Provenance must not outrank the OTHER test: a word confirmed off a
    // photograph is USER, which a person wrote, and has nothing in it.
    const built = lexeme("kohv", "coffee", "NOUN", [["NOM_SG", "kohv"], ["GEN_SG", "kohvi"]], "EKILEX");
    const stub: Candidate = { ...lexeme("kohv", "coffee", "OTHER", [], "USER"), id: "scanned-kohv" };
    for (const order of [[built, stub], [stub, built]]) {
      expect(rankCandidates(order, "kohv")[0]?.pos).toBe("NOUN");
    }
  });

  it("orders two real entries the same way whichever order they arrive in", () => {
    // `hall` is a genuine pair rather than a mislabel, and neither is a stub,
    // so the rule that decides it is only that there *is* one.
    const grey = { ...lexeme("hall", "grey", "ADJECTIVE", [["NOM_SG", "hall"]]), id: "a-grey" };
    const frost = { ...lexeme("hall", "frost", "NOUN", [["NOM_SG", "hall"]]), id: "b-frost" };
    const forward = rankCandidates([grey, frost], "hall").map((h) => h.translation);
    const back = rankCandidates([frost, grey], "hall").map((h) => h.translation);
    expect(forward).toEqual(back);
  });

  it("keeps different words alphabetical, whatever is in them", () => {
    /*
      `bySubstance` may only ever decide between two rows that are the *same*
      word, which is why it sits after the lemma comparison rather than before
      it. Were it first, these two would come back the other way round and a
      prefix search would list words by how much happens to be stored against
      them. Both score 70 here: `raamat` on its own spelling, `rõõm` because
      folding makes it `room`.
    */
    const bare: Candidate = { ...lexeme("raamat", "book", "OTHER", []), id: "bare" };
    const full = DICT.find((c) => c.lemma === "rõõm")!;
    expect(rankCandidates([full, bare], "r").map((h) => h.lemma)).toEqual(["raamat", "rõõm"]);
  });
});

/*
  The gate a photographed page has to get through.

  `rankCandidates` is built for a search box, where a prefix match is a helpful
  suggestion. `matchEstonianForm` is built for the moment a word read off a
  photo is about to become a flashcard, where a helpful suggestion is a wrong
  answer drilled in for six weeks.
*/
describe("matchEstonianForm", () => {
  it("takes the headword spelled exactly", () => {
    expect(matchEstonianForm(DICT, "raamat")?.lemma).toBe("raamat");
  });

  it("takes a stored principal part and says which one it was", () => {
    const match = matchEstonianForm(DICT, "lugesin");
    expect(match?.lemma).toBe("lugema");
    expect(match?.matchedAs).toContain("lihtminevik ma");
  });

  it("takes a regular case built on the genitive stem, which is most of a homework page", () => {
    const match = matchEstonianForm(DICT, "toas");
    expect(match?.lemma).toBe("tuba");
    expect(match?.matchedAs).toContain("seesütlev");
  });

  it("refuses a prefix, however plausible", () => {
    // "raama" would rank in a search box. Handing somebody a card for `raamat`
    // because a camera dropped the last letter is the failure this exists for.
    expect(matchEstonianForm(DICT, "raama")).toBeNull();
  });

  it("refuses a word the dictionary has never seen", () => {
    expect(matchEstonianForm(DICT, "kirjutuslaud")).toBeNull();
  });

  it("never resolves through the English side", () => {
    // A page printing the English word "book" must not silently become the
    // Estonian entry `raamat`: this function only ever reads Estonian.
    expect(matchEstonianForm(DICT, "book")).toBeNull();
  });

  it("still matches when a diacritic was lost to the light", () => {
    expect(matchEstonianForm(DICT, "room")?.lemma).toBe("rõõm");
  });

  it("has nothing to say about an empty string", () => {
    expect(matchEstonianForm(DICT, "   ")).toBeNull();
  });

  /*
    The tie here is worse than the one in the search box. A learner ticks a word
    off their own homework and the app vouches for it by handing back a
    paradigm; if two rows hold that lemma and the winner is whichever the array
    listed first, the card is built from an arbitrary one. `>` on its own did
    exactly that, so a word already confirmed off an earlier photograph could
    answer for the seeded entry that has the forms in it.
  */
  it("vouches with the entry that has forms, not whichever came first", () => {
    const seeded = lexeme("tuba", "room", "NOUN", [
      ["NOM_SG", "tuba"], ["GEN_SG", "toa"], ["PART_SG", "tuba"],
    ]);
    const stub: Candidate = { ...lexeme("tuba", "room", "OTHER", []), id: "scanned-tuba" };
    for (const order of [[seeded, stub], [stub, seeded]]) {
      expect(matchEstonianForm(order, "tuba")?.pos).toBe("NOUN");
    }
  });

  it("breaks the same tie on a derived form", () => {
    // Both of these can answer for `toas` off the same genitive stem and both
    // score 85 for it, so the ranker cannot separate them and `bySubstance`
    // has to. The word carries the paradigm into the card, so which row
    // answers is the whole question.
    const seeded = lexeme("tuba", "room", "NOUN", [["NOM_SG", "tuba"], ["GEN_SG", "toa"]]);
    const stub: Candidate = {
      ...lexeme("tuba", "room", "OTHER", [["GEN_SG", "toa"]]), id: "scanned-tuba",
    };
    for (const order of [[seeded, stub], [stub, seeded]]) {
      expect(matchEstonianForm(order, "toas")?.pos).toBe("NOUN");
    }
  });
});

describe("likeLiteral", () => {
  /*
    `%` and `_` are LIKE's own wildcards and a search box is where they arrive
    by accident. Parameterisation stops a string being read as SQL; it says
    nothing about what the string means once it is a pattern, and the two were
    being confused.
  */
  it("escapes the wildcards LIKE would otherwise act on", () => {
    expect(likeLiteral("100%")).toBe("100\\%");
    expect(likeLiteral("s_na")).toBe("s\\_na");
  });

  it("escapes the escape character itself", () => {
    // And escapes it first, or the pass would come back over its own work.
    expect(likeLiteral("a\\b")).toBe("a\\\\b");
    expect(likeLiteral("\\%")).toBe("\\\\\\%");
  });

  it("leaves an ordinary Estonian query alone", () => {
    expect(likeLiteral("õues")).toBe("õues");
    expect(likeLiteral("kõrvits")).toBe("kõrvits");
  });
});

/*
  The syllabus names lemmas and the dictionary is keyed on `(lemma, pos)`, so a
  unit's word list can resolve to more rows than it has words. Five screens
  rendered every row: `/learn/kodu` listed `tuba` twice, its worksheet printed
  it six times, `addUnitToDeck` built two sets of cards for the one word, and
  React warned about two children with the same key.
*/
describe("oneEntryPerLemma", () => {
  const withId = (c: Candidate, id: string): Candidate => ({ ...c, id });

  it("keeps the unit's own order rather than the rows'", () => {
    const rows = [
      lexeme("tuba", "room", "NOUN", [["GEN_SG", "toa"]]),
      lexeme("aken", "window", "NOUN", [["GEN_SG", "akna"]]),
      lexeme("uks", "door", "NOUN", [["GEN_SG", "ukse"]]),
    ];
    expect(oneEntryPerLemma(rows, ["uks", "tuba", "aken"]).map((r) => r.lemma))
      .toEqual(["uks", "tuba", "aken"]);
  });

  it("returns one row for a lemma the dictionary holds twice", () => {
    const real = withId(lexeme("tuba", "room", "NOUN", [["GEN_SG", "toa"], ["PART_SG", "tuba"]], "EKILEX"), "real");
    const stub = withId(lexeme("tuba", "room", "OTHER", [], "USER"), "stub");
    expect(oneEntryPerLemma([stub, real], ["tuba"]).map((r) => r.id)).toEqual(["real"]);
    // and the same answer whichever order the rows arrived in
    expect(oneEntryPerLemma([real, stub], ["tuba"]).map((r) => r.id)).toEqual(["real"]);
  });

  it("prefers the hand-written entry, as the search does", () => {
    const built = withId(lexeme("vana", "an old person", "NOUN",
      [["NOM_SG", "vana"], ["GEN_SG", "vana"], ["PART_SG", "vana"], ["PART_PL", "vanu"],
       ["GEN_PL", "vanade"], ["NOM_PL", "vanad"]], "EKILEX"), "built");
    const course = withId(lexeme("vana", "old", "ADJECTIVE",
      [["NOM_SG", "vana"], ["GEN_SG", "vana"], ["PART_SG", "vana"], ["PART_PL", "vanu"],
       ["GEN_PL", "vanade"]], "SEED"), "course");
    expect(oneEntryPerLemma([built, course], ["vana"]).map((r) => r.id)).toEqual(["course"]);
    expect(oneEntryPerLemma([course, built], ["vana"]).map((r) => r.id)).toEqual(["course"]);
  });

  it("leaves out a lemma the dictionary does not have", () => {
    const rows = [lexeme("tuba", "room", "NOUN", [["GEN_SG", "toa"]])];
    expect(oneEntryPerLemma(rows, ["tuba", "eiolemas"]).map((r) => r.lemma)).toEqual(["tuba"]);
  });

  it("returns one row even when the caller names a lemma twice", () => {
    const rows = [lexeme("tuba", "room", "NOUN", [["GEN_SG", "toa"]])];
    expect(oneEntryPerLemma(rows, ["tuba", "tuba"]).map((r) => r.lemma)).toEqual(["tuba"]);
  });

  it("ignores a row for a lemma nobody asked about", () => {
    const rows = [
      lexeme("tuba", "room", "NOUN", [["GEN_SG", "toa"]]),
      lexeme("vanaadium", "vanadium", "NOUN", [["GEN_SG", "vanaadiumi"]]),
    ];
    expect(oneEntryPerLemma(rows, ["tuba"]).map((r) => r.lemma)).toEqual(["tuba"]);
  });
});
