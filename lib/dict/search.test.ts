import { describe, expect, it } from "vitest";
import { type Candidate, fold, rankCandidates } from "./search";

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
    ["loen", "lugema", /present 1sg/],
    ["lugesin", "lugema", /past 1sg/],
    ["tuppa", "tuba", /short illative/],
    ["toas", "tuba", /inessive/],
    ["raamatuga", "raamat", /comitative/],
    ["tubadega", "tuba", /comitative plural/],
    ["raamatud", "raamat", /nominative plural/],
  ])("finds %s as a form of %s", (query, lemma, why) => {
    expect(top(query)?.lemma).toBe(lemma);
    expect(top(query)?.matchedAs).toMatch(why);
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
