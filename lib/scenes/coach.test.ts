/**
 * What the app says when somebody is stuck.
 *
 * The rule this is really testing is that the hint is useful without being the
 * answer: a case beat is drilling the ending, so naming the ending would grade
 * the learner for something the screen had just done for them.
 */
import { describe, expect, it } from "vitest";
import { coachFor, NUDGE_AFTER } from "./coach";
import type { RoleCard } from "./props";
import type { BeatSpec } from "./types";

const BEAT: BeatSpec = {
  id: "where", goal: "Say where you are going.", they: "They ask where you are going.",
  move: "ask", topic: ["pood"], needs: [{ kind: "case", lemma: "pood", grammCase: "ILLATIVE" }],
  required: true, patience: 3, shape: "word",
};

const CARD: RoleCard = {
  you: "You are somebody.",
  props: [{ slot: "time", card: "The time you were given: 14:30", literal: ["14:30"], lemmas: [], value: "14:30" }],
};

describe("the hint the app gives", () => {
  it("names the word and the case, and never the form", () => {
    const said = coachFor(BEAT, null);
    expect(said).toContain("pood");
    // The case a class would name it by, not the Latin one.
    expect(said).toContain("sisseütlev");
    /*
      And not `poodi`. The ending is the whole of what this beat is drilling,
      so a hint that spelled it would answer the question and then let the
      scheduler record the learner as having produced the form.
    */
    expect(said).not.toContain("poodi");
  });

  it("names the word where any form of it would do", () => {
    const said = coachFor({ ...BEAT, needs: [{ kind: "lemma", oneOf: ["pilet"] }] }, null);
    expect(said).toContain("pilet");
    expect(said).toContain("Any form");
  });

  /*
    A beat that would take eleven words has no one word to name, and naming
    the first is the fault `offerFor` already had: a learner whose card said
    the door was broken told to say the heating was.
  */
  it("says a choice is a choice rather than handing over the first of eleven", () => {
    const said = coachFor({ ...BEAT, needs: [{ kind: "lemma", oneOf: ["valu", "palavik"] }] }, null);
    expect(said).toContain("another word for the same thing");
  });

  it("quotes the card's own line where the answer is on the card", () => {
    const said = coachFor({ ...BEAT, needs: [{ kind: "datum", slot: "time" }] }, CARD);
    expect(said).toContain("The time you were given: 14:30");
  });

  /*
    Null is a real answer. A beat that cannot be failed has nothing to say
    about, and a sentence of English there would be the app filling the screen
    to look helpful.
  */
  it("says nothing about a beat nobody can fail", () => {
    expect(coachFor({ ...BEAT, needs: [{ kind: "any" }] }, null)).toBeNull();
  });

  it("holds no Estonian of its own, only lemmas the beat already named", () => {
    /*
      The same standing every scene file has: a lemma is a request against the
      dictionary and is checked against the scene's units by the catalog test,
      so nothing here can introduce a word or spell a form.
    */
    const said = coachFor({ ...BEAT, needs: [{ kind: "question" }] }, null);
    expect(said).not.toMatch(/[õäöüšž]/i);
  });

  it("waits until the learner is stuck rather than answering the first miss", () => {
    expect(NUDGE_AFTER).toBeGreaterThan(1);
  });
});
