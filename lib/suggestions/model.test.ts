import { describe, expect, it } from "vitest";
import {
  CATEGORY_GROUPS, CATEGORY_KEYS, SUGGESTION_CATEGORIES, SUGGESTION_LIMITS,
  acknowledgement, categoriesInGroup, groupKeyFor, isCategory, isStatus,
  parsePatch, parsePatchValue, patchFitsCategory, summarisePatch,
} from "./model";

describe("the category table", () => {
  it("gives every category a group the queue actually shows", () => {
    for (const key of CATEGORY_KEYS) {
      expect(CATEGORY_GROUPS).toContain(SUGGESTION_CATEGORIES[key].group);
    }
  });

  it("puts every category in exactly one group", () => {
    const seen = CATEGORY_GROUPS.flatMap((group) => categoriesInGroup(group));
    expect(seen.sort()).toEqual([...CATEGORY_KEYS].sort());
  });

  /*
    A category's `applies` is what the accept button does, and a value that no
    patch kind answers to would be an accept that silently changes nothing.
  */
  it("names an apply step that a patch can actually satisfy", () => {
    const kinds = ["CREATE_WORD", "SET_TRANSLATION", "SET_FORM", "DROP_EXAMPLE"];
    for (const key of CATEGORY_KEYS) {
      const applies = SUGGESTION_CATEGORIES[key].applies;
      if (applies !== null) expect(kinds).toContain(applies);
    }
  });

  it("recognises its own keys and no others", () => {
    expect(isCategory("MISSING_WORD")).toBe(true);
    expect(isCategory("MISSING_WORDS")).toBe(false);
    expect(isStatus("OPEN")).toBe(true);
    expect(isStatus("PENDING")).toBe(false);
  });
});

describe("parsePatchValue", () => {
  it("reads a proposed new word", () => {
    expect(parsePatchValue({
      kind: "CREATE_WORD", lemma: " kohvik ", pos: "noun", translation: " cafe ", forms: { GEN_SG: "kohviku" },
    })).toEqual({
      kind: "CREATE_WORD", lemma: "kohvik", pos: "NOUN", translation: "cafe", forms: { GEN_SG: "kohviku" },
    });
  });

  it("refuses a word with no meaning, rather than storing half of one", () => {
    expect(parsePatchValue({ kind: "CREATE_WORD", lemma: "kohvik", pos: "NOUN", translation: "  " })).toBeNull();
  });

  it("refuses a part of speech the dictionary does not have", () => {
    expect(parsePatchValue({ kind: "CREATE_WORD", lemma: "x", pos: "PARTICLE", translation: "y" })).toBeNull();
  });

  /*
    A patch is stored whole on a row in the queue a reviewer pages through,
    and signing up is open. Each form value was capped at 80 characters and
    every key was copied, so an object with a hundred thousand keys survived
    into the row: twenty of those a minute is about 300 MB a minute. Eleven
    keys is what a word has, and `applyPatch` will take no other, so a patch
    naming one is refused rather than trimmed.
  */
  it("refuses a patch naming a form that is not a principal part", () => {
    expect(parsePatchValue({
      kind: "CREATE_WORD", lemma: "kohvik", pos: "NOUN", translation: "cafe",
      forms: { GEN_SG: "kohviku", NOT_A_FORM: "x" },
    })).toBeNull();

    const flood: Record<string, string> = {};
    for (let i = 0; i < 5_000; i += 1) flood[`K${i}`] = "x";
    expect(parsePatchValue({
      kind: "CREATE_WORD", lemma: "kohvik", pos: "NOUN", translation: "cafe", forms: flood,
    })).toBeNull();
  });

  it("drops empty forms instead of writing a blank principal part", () => {
    const patch = parsePatchValue({
      kind: "CREATE_WORD", lemma: "tuba", pos: "NOUN", translation: "room",
      forms: { GEN_SG: "toa", PART_SG: "   " },
    });
    expect(patch).toMatchObject({ forms: { GEN_SG: "toa" } });
  });

  it("caps every field at the stored length", () => {
    const patch = parsePatchValue({
      kind: "SET_TRANSLATION", lexemeId: "abc", translation: "x".repeat(5000),
    });
    expect(patch).toMatchObject({ translation: "x".repeat(SUGGESTION_LIMITS.translation) });
  });

  it("uppercases a form type so two spellings of one field are one field", () => {
    expect(parsePatchValue({ kind: "SET_FORM", lexemeId: "a", formType: "gen_sg", value: "toa" }))
      .toEqual({ kind: "SET_FORM", lexemeId: "a", formType: "GEN_SG", value: "toa" });
  });

  it.each<[unknown, string]>([
    [null, "nothing at all"],
    [{ kind: "SET_FORM", lexemeId: "a", formType: "GEN_SG" }, "a form with no value"],
    [{ kind: "DROP_EXAMPLE", lexemeId: "a", sentence: " " }, "an empty sentence"],
    [{ kind: "RUN_MIGRATION" }, "a kind nobody defined"],
    ["a string", "a value that is not an object"],
  ])("returns null for %j, which is %s", (input) => {
    expect(parsePatchValue(input)).toBeNull();
  });

  it("survives a stored column that is not JSON", () => {
    expect(parsePatch("{not json")).toBeNull();
    expect(parsePatch("{}")).toBeNull();
    expect(parsePatch(null)).toBeNull();
  });
});

describe("patchFitsCategory", () => {
  it("accepts a report with no proposal, whatever it is about", () => {
    for (const key of CATEGORY_KEYS) expect(patchFitsCategory(key, null)).toBe(true);
  });

  it("accepts a proposal of the kind its category promised", () => {
    expect(patchFitsCategory("WRONG_MEANING", {
      kind: "SET_TRANSLATION", lexemeId: "a", translation: "room",
    })).toBe(true);
  });

  /*
    The one that matters. A server action is a public endpoint, so a caller
    can file a dictionary write under a category the queue reads as prose.
  */
  it("refuses a word-creating proposal filed as a broken screen", () => {
    expect(patchFitsCategory("BROKEN", {
      kind: "CREATE_WORD", lemma: "x", pos: "NOUN", translation: "y", forms: {},
    })).toBe(false);
  });
});

describe("groupKeyFor", () => {
  it("puts two people disagreeing with one entry on one line", () => {
    const a = groupKeyFor({ category: "WRONG_MEANING", lexemeId: "lex-1", lemma: "kohvik" });
    const b = groupKeyFor({ category: "WRONG_MEANING", lexemeId: "lex-1", lemma: "Kohvik" });
    expect(a).toBe(b);
  });

  it("keeps two different problems with one entry apart", () => {
    const meaning = groupKeyFor({ category: "WRONG_MEANING", lexemeId: "lex-1" });
    const form = groupKeyFor({ category: "WRONG_FORM", lexemeId: "lex-1" });
    expect(meaning).not.toBe(form);
  });

  it("keeps two wrong forms of one word apart when they are different forms", () => {
    const gen = groupKeyFor({
      category: "WRONG_FORM", lexemeId: "lex-1",
      patch: { kind: "SET_FORM", lexemeId: "lex-1", formType: "GEN_SG", value: "toa" },
    });
    const part = groupKeyFor({
      category: "WRONG_FORM", lexemeId: "lex-1",
      patch: { kind: "SET_FORM", lexemeId: "lex-1", formType: "PART_SG", value: "tuba" },
    });
    expect(gen).not.toBe(part);
  });

  it("folds case and spacing on a missing word, so one word is one report", () => {
    expect(groupKeyFor({ category: "MISSING_WORD", lemma: " Vihm " }))
      .toBe(groupKeyFor({ category: "MISSING_WORD", lemma: "vihm" }));
  });

  /*
    And never diacritics. `saar` and `säär` are two words, and merging their
    reports would put a decision about one of them on a line about the other.
  */
  it("never folds a diacritic away", () => {
    expect(groupKeyFor({ category: "MISSING_WORD", lemma: "saar" }))
      .not.toBe(groupKeyFor({ category: "MISSING_WORD", lemma: "säär" }));
  });

  it("collapses one fault reported from one screen with different ids in it", () => {
    const first = groupKeyFor({
      category: "BROKEN", context: "/exam/result/9f1c2d33-77aa-4f11-b0e1-2c3d4e5f6a7b?x=1",
      trigger: "Cannot read attempt 4821",
    });
    const second = groupKeyFor({
      category: "BROKEN", context: "/exam/result/1b2c3d44-88bb-4c22-a9f0-3d4e5f6a7b8c?x=9",
      trigger: "Cannot read attempt 991",
    });
    expect(first).toBe(second);
  });

  it("keeps two screens apart when the segment is a level and not an id", () => {
    expect(groupKeyFor({ category: "BROKEN", context: "/exam/b2", trigger: "x" }))
      .not.toBe(groupKeyFor({ category: "BROKEN", context: "/exam/c1", trigger: "x" }));
  });

  it("keeps two different faults on one screen apart", () => {
    const a = groupKeyFor({ category: "BROKEN", context: "/review", trigger: "Database is unreachable" });
    const b = groupKeyFor({ category: "BROKEN", context: "/review", trigger: "Speech service refused" });
    expect(a).not.toBe(b);
  });
});

describe("summarisePatch", () => {
  it("says what accepting will do, in each shape", () => {
    expect(summarisePatch({ kind: "CREATE_WORD", lemma: "kohvik", pos: "NOUN", translation: "cafe", forms: {} }))
      .toMatchObject({ after: "cafe" });
    expect(summarisePatch({ kind: "SET_FORM", lexemeId: "a", formType: "GEN_SG", value: "toa" }))
      .toMatchObject({ field: "GEN_SG", after: "toa" });
  });
});

describe("acknowledgement", () => {
  it("promises a dictionary change only where accepting is one", () => {
    expect(acknowledgement("MISSING_WORD")).toMatch(/dictionary/);
    expect(acknowledgement("BROKEN")).not.toMatch(/dictionary/);
  });
});
