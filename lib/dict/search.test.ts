import { describe, expect, it } from "vitest";
import { type Candidate, fold, likeLiteral, matchEstonianForm, rankCandidates } from "./search";

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
): Candidate {
  return {
    id: lemma, lemma, translation, pos, cefr: "A1", gradationNote: null,
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
  TWO ENTRIES CAN SHARE A LEMMA, AND SOMETHING HAS TO DECIDE WHICH ONE OPENS.

  `Lexeme` is unique on `[lemma, pos]` deliberately: `hall` is a noun meaning
  frost and an adjective meaning grey. The same shape arrives by accident every
  time somebody adds a word by hand or off a photograph that the dictionary
  already holds under another part of speech, which is how a learner's bare
  `tuba` came to sit beside the seeded noun.

  Both score 100 and `localeCompare` of a word with itself is 0, so the
  comparator used to return 0 for the pair. `sort` is stable, so that meant
  "keep the order the database returned", and the query that loads candidates
  has no `orderBy`. The entry a learner was shown for their own search was
  decided by the query planner, and it could differ between two identical
  requests.
*/
describe("rankCandidates — two entries under one lemma", () => {
  const withParadigm = lexeme("tuba", "room", "NOUN", [
    ["NOM_SG", "tuba"], ["GEN_SG", "toa"], ["PART_SG", "tuba"],
  ]);
  // Sorts first by id, so it wins on any tie-break that reaches for one early.
  const bare = { ...lexeme("tuba", "room", "OTHER", []), id: "0000-typed-by-hand" };

  it("opens the same entry whichever order the database returned them in", () => {
    expect(rankCandidates([withParadigm, bare], "tuba")[0]!.pos).toBe("NOUN");
    expect(rankCandidates([bare, withParadigm], "tuba")[0]!.pos).toBe("NOUN");
  });

  it("leads with the entry that has a paradigm to open", () => {
    const hits = rankCandidates([bare, withParadigm], "tuba");
    expect(hits.map((h) => h.pos)).toEqual(["NOUN", "OTHER"]);
  });

  it("still lists both, because neither is wrong", () => {
    expect(rankCandidates([bare, withParadigm], "tuba")).toHaveLength(2);
  });

  /*
    The general property, and the one that matters beyond this pair: no two
    candidates may ever compare equal, or `sort` falls back to the order it was
    handed and the database is deciding again. Checked over every pairing of
    the whole fixture rather than over the case that prompted it.
  */
  it("never leaves two candidates comparing equal", () => {
    const both = [...DICT, withParadigm, bare];
    const seen = rankCandidates(both, "tuba");
    const shuffled = rankCandidates([...both].reverse(), "tuba");
    expect(shuffled.map((h) => h.id)).toEqual(seen.map((h) => h.id));
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
