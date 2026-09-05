import { describe, expect, it } from "vitest";
import { drillFor } from "./drills";

describe("the drill a failed beat points at", () => {
  it("sends a missed case to the drill that asks for a case", () => {
    expect(drillFor([{ kind: "case", lemma: "tuba", grammCase: "INESSIVE" }]))
      .toBe("/review/write");
  });

  it("sends a missed word to the round about words", () => {
    expect(drillFor([{ kind: "lemma", oneOf: ["valu"] }])).toBe("/review/flashcards");
  });

  it("prefers the case, because it is the specific one", () => {
    /*
      A beat usually needs both: say what is wrong, using this word, in this
      case. The case is what a drill can rehearse precisely, and the words are
      already listed above the link with a button to keep them.
    */
    expect(drillFor([
      { kind: "lemma", oneOf: ["valu"] },
      { kind: "case", lemma: "valu", grammCase: "INESSIVE" },
    ])).toBe("/review/write");
  });

  it("says nothing where no drill rehearses what was missed", () => {
    /*
      Answering a question, using the negator, keeping to `teie` and reading a
      value off the card are things a learner did or did not do, not words they
      hold a card for. A missing link is honest; a link to the wrong drill is a
      screen saying "go and practice this" about something else.
    */
    expect(drillFor([{ kind: "question" }])).toBeNull();
    expect(drillFor([{ kind: "negation" }])).toBeNull();
    expect(drillFor([{ kind: "register" }])).toBeNull();
    expect(drillFor([{ kind: "datum", slot: "time" }])).toBeNull();
    expect(drillFor([{ kind: "any" }])).toBeNull();
    expect(drillFor([])).toBeNull();
  });
});
