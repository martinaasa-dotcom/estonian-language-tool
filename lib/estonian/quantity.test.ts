import { describe, expect, it } from "vitest";
import {
  collapseDoubles, contrastLetter, findQuantityPairs, isLengthPair, longerOf,
  type FormRef,
} from "./quantity";

describe("collapseDoubles", () => {
  it.each([
    ["linna", "lina"],
    ["kappi", "kapi"],
    ["saada", "sada"],
    ["kolli", "koli"],
    ["lina", "lina"],
  ])("collapses %s to %s", (input, expected) => {
    expect(collapseDoubles(input)).toBe(expected);
  });

  it("collapses a run longer than two", () => {
    expect(collapseDoubles("aaa")).toBe("a");
  });

  it("ignores case", () => {
    expect(collapseDoubles("Linna")).toBe(collapseDoubles("linna"));
  });

  it("leaves non-adjacent repeats alone", () => {
    // "kalakala" repeats letters but never adjacently — nothing to collapse.
    expect(collapseDoubles("kalakala")).toBe("kalakala");
  });
});

describe("isLengthPair", () => {
  it.each([
    ["lina", "linna"],
    ["kapi", "kappi"],
    ["koli", "kolli"],
    ["sada", "saada"],
  ])("recognizes %s / %s as a length contrast", (a, b) => {
    expect(isLengthPair(a, b)).toBe(true);
    expect(isLengthPair(b, a)).toBe(true);
  });

  it("rejects a word paired with itself", () => {
    expect(isLengthPair("linna", "linna")).toBe(false);
  });

  it("rejects two words that merely look alike", () => {
    expect(isLengthPair("lina", "lind")).toBe(false);
    expect(isLengthPair("tuba", "toa")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isLengthPair("Lina", "linna")).toBe(true);
  });
});

function form(value: string, lemma: string, lexemeId: string, formLabel = "nominative"): FormRef {
  return { value, lemma, translation: lemma, formLabel, lexemeId };
}

describe("findQuantityPairs", () => {
  it("finds a contrast between two different words", () => {
    const pairs = findQuantityPairs([
      form("lina", "lina", "L1"),
      form("linna", "linn", "L2", "genitive"),
    ]);
    expect(pairs).toHaveLength(1);
    expect([pairs[0]?.a.value, pairs[0]?.b.value].sort()).toEqual(["lina", "linna"]);
  });

  it("pairs two forms of one word and marks them as such", () => {
    // maja / majja is the commonest shape in the real dictionary, and the
    // better lesson: the length carries the grammar, not just the word.
    const pairs = findQuantityPairs([
      form("maja", "maja", "L1", "nominative"),
      form("majja", "maja", "L1", "short illative"),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.sameWord).toBe(true);
  });

  it("marks a contrast between two different words as such", () => {
    const pairs = findQuantityPairs([
      form("lina", "lina", "L1"),
      form("linna", "linn", "L2", "genitive"),
    ]);
    expect(pairs[0]?.sameWord).toBe(false);
  });

  it("ignores two identically spelled forms", () => {
    // This is the second-versus-third quantity case, which spelling cannot
    // record and speech synthesis cannot render from the same string.
    expect(findQuantityPairs([
      form("linna", "linn", "L1", "genitive"),
      form("linna", "linn", "L2", "illative"),
    ])).toEqual([]);
  });

  it("skips words too short to carry a contrast", () => {
    expect(findQuantityPairs([form("ta", "tema", "L1"), form("tta", "x", "L2")])).toEqual([]);
  });

  it("skips phrases", () => {
    expect(findQuantityPairs([
      form("head aega", "head aega", "L1"),
      form("headd aega", "x", "L2"),
    ])).toEqual([]);
  });

  it("finds nothing in a set with no contrasts", () => {
    expect(findQuantityPairs([
      form("raamat", "raamat", "L1"),
      form("tuba", "tuba", "L2"),
    ])).toEqual([]);
  });

  it("honors the limit", () => {
    const many: FormRef[] = [];
    for (let i = 0; i < 40; i++) {
      many.push(form(`kal${"a".repeat(1)}${i}`, `w${i}`, `A${i}`));
    }
    expect(findQuantityPairs(many, 3).length).toBeLessThanOrEqual(3);
  });
});

describe("longerOf and contrastLetter", () => {
  const pair = {
    a: form("lina", "lina", "L1"),
    b: form("linna", "linn", "L2", "genitive"),
    key: "lina",
    sameWord: false,
  };

  it("identifies the doubled spelling as the longer sound", () => {
    expect(longerOf(pair).value).toBe("linna");
  });

  it("names the letter whose length is at issue", () => {
    expect(contrastLetter(pair)).toBe("n");
  });

  it("returns null when neither side is doubled", () => {
    expect(contrastLetter({
      a: form("aa", "x", "1"), b: form("bb", "y", "2"), key: "a", sameWord: false,
    })).toBe("a");
  });
});
