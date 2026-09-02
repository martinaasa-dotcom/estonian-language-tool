import { describe, expect, it } from "vitest";
import { CASES } from "./cases";
import { TOPIC_GROUPS, TOPIC_NOTES, grammarPoint } from "./grammar";
import { TERMED_TOPIC_IDS, VERB_AXES, grammarGroupTerm, grammarTerm } from "./terms";

describe("the name a course uses", () => {
  it("answers for every case", () => {
    for (const spec of CASES) {
      const term = grammarTerm(spec.key.toLowerCase());
      expect(term?.et, spec.key).toBe(spec.et);
      expect(term?.question, spec.key).toBe(spec.question);
    }
  });

  it("names every part of the verb, which is where the English names were worst", () => {
    // The complaint this file answers: a learner met "the pluperfect" and
    // "the imperfect" on every screen and never met `enneminevik` or
    // `lihtminevik`, which are the words their teacher and their textbook use.
    // A new verb topic with only an English name fails here.
    const verbs = TOPIC_GROUPS.find((g) => g.id === "verb")!;
    for (const id of verbs.ids) {
      expect(grammarTerm(id)?.et, id).toBeTruthy();
    }
  });

  it("names every group", () => {
    for (const group of TOPIC_GROUPS) expect(grammarGroupTerm(group.id), group.id).toBeTruthy();
  });

  it("has no term for a point that does not exist", () => {
    const ids = new Set(TOPIC_NOTES.map((t) => t.id));
    for (const id of TERMED_TOPIC_IDS) expect(ids.has(id), id).toBe(true);
  });

  it("returns nothing rather than inventing one", () => {
    // Deliberately partial. A point with no settled classroom term keeps its
    // English description, and every caller renders that as the honest answer.
    expect(grammarTerm("irony")).toBeUndefined();
    expect(grammarTerm("nonsense")).toBeUndefined();
  });
});

/**
 * The same tripwire the grammar prose carries, pointed the other way.
 *
 * This file is allowed Estonian, because a term is what the app is naming
 * things with. What it may not become is somewhere to write a *form*: an
 * inflected word here would be unattested Estonian rendered beside real forms
 * from Ekilex with nothing marking it as invented, which is exactly what
 * ADR-005 forbids. A term names a category and is two or three words long.
 */
describe("a term names a category, never a word", () => {
  const terms = [
    ...TERMED_TOPIC_IDS.map((id) => grammarTerm(id)!),
    ...CASES.map((c) => grammarTerm(c.key.toLowerCase())!),
  ];

  it("is short, lower case and has no sentence in it", () => {
    for (const term of terms) {
      expect(term.et.length, term.et).toBeLessThanOrEqual(28);
      expect(term.et.split(" ").length, term.et).toBeLessThanOrEqual(3);
      expect(term.et, term.et).not.toMatch(/[.!]/);
      expect(term.et, term.et).toBe(term.et.toLowerCase());
    }
  });

  it("asks a question with a question mark, or does not ask one", () => {
    for (const term of terms) {
      if (!term.question) continue;
      expect(term.question, term.question).toMatch(/\?$/);
      expect(term.question.length, term.question).toBeLessThanOrEqual(30);
    }
  });

  it("would reject a smuggled example", () => {
    const looksLikeATerm = (text: string) => text.split(" ").length <= 3 && !/[.!]/.test(text);
    expect(looksLikeATerm("tingiv kõneviis")).toBe(true);
    expect(looksLikeATerm("ma läheksin homme koju")).toBe(false);
  });
});

describe("the verb axes", () => {
  it("names the four a course puts on the board", () => {
    expect(VERB_AXES.map((a) => a.et)).toEqual(["aeg", "kõneviis", "tegumood", "pööre"]);
    for (const axis of VERB_AXES) expect(axis.blurb.length, axis.et).toBeGreaterThan(40);
  });
});

describe("a grammar point carries both names", () => {
  it("leads with the Estonian one and keeps the English line under it", () => {
    const inessive = grammarPoint("inessive");
    expect(inessive?.title).toBe("seesütlev");
    expect(inessive?.estonian).toBe(true);
    expect(inessive?.english).toBe("kelles? milles? kus?");

    const pluperfect = grammarPoint("pluperfect");
    expect(pluperfect?.title).toBe("enneminevik");
    expect(pluperfect?.estonian).toBe(true);
    expect(pluperfect?.english).not.toMatch(/pluperfect/i);
  });

  it("says so when there is no Estonian name, rather than pretending", () => {
    const irony = grammarPoint("irony");
    expect(irony?.estonian).toBe(false);
    expect(irony?.title).toBe(irony?.english);
  });
});
