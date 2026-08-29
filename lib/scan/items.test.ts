import { describe, expect, it } from "vitest";
import { parseItems, sanitiseItems, serialiseItems, summarise, type ResolvedItem } from "./items";

function item(overrides: Partial<ResolvedItem> = {}): ResolvedItem {
  return {
    et: "tuba", en: "room", lexemeId: "lex-1", lemma: "tuba",
    translation: "room", matchedAs: null, cefr: "A1", ...overrides,
  };
}

describe("summarise", () => {
  it("counts what the dictionary vouched for", () => {
    const summary = summarise([
      item(),
      item({ et: "toas", matchedAs: "inessive (seesütlev) of tuba" }),
      item({ et: "kirjutuslaud", lexemeId: null, lemma: null, translation: null }),
    ]);
    expect(summary).toEqual({ total: 3, known: 2, unknown: 1, inflected: 1 });
  });

  it("has an answer for an empty page", () => {
    expect(summarise([])).toEqual({ total: 0, known: 0, unknown: 0, inflected: 0 });
  });
});

/*
  Everything here comes back through a server action after the learner has
  edited it, and a server action is a public endpoint. So the list is re-checked
  on the way in rather than trusted because it looked right on the way out.
*/
describe("sanitiseItems", () => {
  it("keeps a well-formed row", () => {
    expect(sanitiseItems([item()], 10)).toEqual([item()]);
  });

  it("is empty for anything that is not a list", () => {
    expect(sanitiseItems(null, 10)).toEqual([]);
    expect(sanitiseItems({ et: "tuba" }, 10)).toEqual([]);
    expect(sanitiseItems("tuba", 10)).toEqual([]);
  });

  it("drops a row whose Estonian would never have been transcribed", () => {
    expect(sanitiseItems([{ et: "<script>alert(1)</script>", en: "x" }], 10)).toEqual([]);
  });

  it("drops a lexeme id that is not a string", () => {
    const [row] = sanitiseItems([{ et: "tuba", en: "room", lexemeId: { id: 1 } }], 10);
    expect(row?.lexemeId).toBeNull();
  });

  it("drops a CEFR level that is not one", () => {
    const [row] = sanitiseItems([{ et: "tuba", en: "room", cefr: "Z9" }], 10);
    expect(row?.cefr).toBeNull();
  });

  it("keeps one row per word", () => {
    expect(sanitiseItems([{ et: "tuba" }, { et: "TUBA" }], 10)).toHaveLength(1);
  });

  it("honours the ceiling it is given", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ et: `sona${i}` }));
    expect(sanitiseItems(many, 5)).toHaveLength(5);
  });
});

describe("parseItems", () => {
  it("round-trips what was stored", () => {
    const items = [item(), item({ et: "raamat", lexemeId: "lex-2", lemma: "raamat" })];
    expect(parseItems(serialiseItems(items), 10)).toEqual(items);
  });

  it("never throws on a column that is not JSON", () => {
    expect(parseItems("not json", 10)).toEqual([]);
    expect(parseItems(null, 10)).toEqual([]);
    expect(parseItems(undefined, 10)).toEqual([]);
  });
});
