import { describe, expect, it } from "vitest";
import { CASES } from "./cases";
import {
  allCaseReferences, caseReference, grammarPoint, grammarTopic, CASE_GROUPS, CASE_NOTES,
  TOPIC_GROUPS, TOPIC_NOTES,
} from "./grammar";

describe("case notes", () => {
  it("covers every case exactly once", () => {
    expect(CASE_NOTES).toHaveLength(CASES.length);
    const keys = CASE_NOTES.map((n) => n.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const spec of CASES) expect(keys).toContain(spec.key);
  });

  it("orders the reference the way the cases are taught", () => {
    expect(allCaseReferences().map((r) => r.key)).toEqual(CASES.map((c) => c.key));
  });

  it("pairs each note with its grammatical spec", () => {
    const inessive = caseReference("INESSIVE");
    expect(inessive?.spec.et).toBe("seesütlev");
    // Both interrogatives and the adverb, which is the case's own name and
    // what a class writes on the board. A card about one word asks the half
    // that fits it: see `caseQuestionFor`.
    expect(inessive?.spec.question).toBe("kelles? milles? kus?");
    expect(inessive?.summary).toMatch(/inside/i);
  });

  it("returns nothing for a case that does not exist", () => {
    expect(caseReference("DATIVE")).toBeUndefined();
    expect(caseReference("")).toBeUndefined();
  });

  it("says something useful in every field", () => {
    for (const note of CASE_NOTES) {
      expect(note.summary.length).toBeGreaterThan(20);
      expect(note.watchOut.length).toBeGreaterThan(40);
      expect(note.uses.length).toBeGreaterThanOrEqual(2);
      for (const use of note.uses) expect(use.length).toBeGreaterThan(8);
    }
  });
});

/**
 * A tripwire, not a proof.
 *
 * This is the one module that writes *about* Estonian at length, and the
 * temptation to slip in an example is exactly what ADR-005 forbids: a form
 * written here is unattested, and the page renders it beside real ones from
 * Ekilex where nothing marks it as invented. A regex cannot tell prose from a
 * smuggled form — `majas` is four ordinary letters — but Estonian of any length
 * reaches for its own letters almost immediately, so this catches the realistic
 * case. The actual guarantee is structural: every form and sentence on the
 * grammar page is read out of the dictionary, and this module supplies none.
 */
describe("nothing here is written in Estonian", () => {
  const ESTONIAN_LETTERS = /[õäöüšž]/i;

  const strings = [
    ...CASE_NOTES.flatMap((n) => [n.summary, n.watchOut, ...n.uses, n.englishHook ?? ""]),
    ...CASE_GROUPS.flatMap((g) => [g.title, g.blurb]),
  ];

  it("has no Estonian letters in any note", () => {
    for (const text of strings) {
      expect(text, `"${text}"`).not.toMatch(ESTONIAN_LETTERS);
    }
  });

  it("would catch one if it appeared", () => {
    expect("näiteks: ta läheb tuppa").toMatch(ESTONIAN_LETTERS);
  });
});

describe("case groups", () => {
  it("places every case in exactly one group", () => {
    const grouped = CASE_GROUPS.flatMap((g) => g.keys);
    expect(grouped).toHaveLength(CASES.length);
    expect(new Set(grouped).size).toBe(CASES.length);
    for (const spec of CASES) expect(grouped).toContain(spec.key);
  });

  it("keeps the principal parts together and first", () => {
    expect(CASE_GROUPS[0]?.keys).toEqual(["NOMINATIVE", "GENITIVE", "PARTITIVE"]);
    expect(CASES.filter((c) => c.principal).map((c) => c.key)).toEqual([
      "NOMINATIVE", "GENITIVE", "PARTITIVE",
    ]);
  });
});

describe("topic notes", () => {
  it("has a unique id for every topic", () => {
    const ids = TOPIC_NOTES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("says something useful in every field", () => {
    for (const topic of TOPIC_NOTES) {
      expect(topic.title.length, topic.id).toBeGreaterThan(4);
      expect(topic.summary.length, topic.id).toBeGreaterThan(30);
      expect(topic.watchOut.length, topic.id).toBeGreaterThan(60);
      expect(topic.points.length, topic.id).toBeGreaterThanOrEqual(3);
      for (const point of topic.points) expect(point.length, topic.id).toBeGreaterThan(10);
    }
  });

  it("places every topic in exactly one group, and names no topic that is gone", () => {
    // The reference renders the groups, not the flat list, so a topic missing
    // from every group is a page nobody can reach and an id in a group with no
    // topic behind it is a card that silently does not render.
    const grouped = TOPIC_GROUPS.flatMap((g) => g.ids);
    expect(new Set(grouped).size).toBe(grouped.length);
    expect(grouped.slice().sort()).toEqual(TOPIC_NOTES.map((t) => t.id).sort());
    for (const id of grouped) expect(grammarTopic(id), id).toBeDefined();
  });

  it("resolves a topic and a case through the same door", () => {
    // A unit names its grammar in one flat list, so a mood and a case have to
    // look the same to whatever renders the link.
    expect(grammarPoint("impersonal")?.href).toBe("/grammar/topic/impersonal");
    expect(grammarPoint("inessive")?.href).toBe("/grammar/inessive");
    expect(grammarPoint("nonsense")).toBeUndefined();
  });
});

/**
 * The marker field is the one place an Estonian ending may be written, and this
 * is what stops it becoming a loophole.
 *
 * The quotative cannot be explained in English without naming the ending that
 * makes it, so a blanket ban would have made the reference worse. A marker is
 * terminology rather than an example: it names a morpheme, it is never drilled
 * as an answer, and the page shows real forms from the dictionary beside it. So
 * it is held to that shape rather than trusted.
 */
describe("grammar markers are endings, not examples", () => {
  it("is short and shaped like a suffix", () => {
    for (const topic of TOPIC_NOTES) {
      if (!topic.marker) continue;
      expect(topic.marker, topic.id).toMatch(/^-[a-zõäöüšž]{1,6}-?$/i);
      expect(topic.marker.includes(" "), topic.id).toBe(false);
    }
  });

  it("would reject a smuggled example", () => {
    const looksLikeAnEnding = /^-[a-zõäöüšž]{1,6}-?$/i;
    expect(looksLikeAnEnding.test("-vat")).toBe(true);
    expect(looksLikeAnEnding.test("ta läheb tuppa")).toBe(false);
    expect(looksLikeAnEnding.test("-nud, as in lugenud")).toBe(false);
  });
});

describe("nothing in the topic prose is written in Estonian", () => {
  const ESTONIAN_LETTERS = /[õäöüšž]/i;

  it("has no Estonian letters outside the marker field", () => {
    const prose = TOPIC_NOTES.flatMap((t) => [t.title, t.summary, t.watchOut, ...t.points]);
    for (const text of prose) expect(text, `"${text}"`).not.toMatch(ESTONIAN_LETTERS);
  });
});
