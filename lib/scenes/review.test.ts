import { describe, expect, it } from "vitest";
import { reviewOf } from "./review";
import { startScene, type SceneState, type TurnRecord } from "./state";
import type { Slip } from "./turn";
import type { SceneSpec } from "./types";

const SCENE: SceneSpec = {
  id: "fixture", title: "A fixture", place: "Nowhere", level: "A2",
  tests: "keha-ja-tervis", units: ["tervitused"], register: "teie",
  role: "You are somebody, and it is not you.", props: [], curveballs: [],
  beats: [
    {
      id: "reason", goal: "Say what is wrong.", they: "They ask.", move: "ask", topic: ["valu"],
      needs: [{ kind: "lemma", oneOf: ["valu"] }], required: true, patience: 2, shape: "word",
    },
    {
      id: "where", goal: "Say where it hurts.", they: "They ask.", move: "ask", topic: ["pea"],
      needs: [{ kind: "case", lemma: "pea", grammCase: "INESSIVE" }], required: true, patience: 2, shape: "word",
    },
  ],
  outcomes: [{ id: "done", when: ["reason", "where"], says: "Done." }, { id: "left", when: [], says: "You left." }],
};

function turn(over: Partial<TurnRecord> = {}): TurnRecord {
  return { beatId: "reason", said: "x", reading: "complete", met: [true], helped: false, ...over };
}

function state(turns: TurnRecord[], done: string[] = ["reason", "where"]): SceneState {
  return { ...startScene(SCENE), turns, done };
}

const CASE_SLIP: Slip = { kind: "case", said: "pea", form: "peas", lemma: "pea", grammCase: "INESSIVE" };

describe("the review of a conversation", () => {
  it("leads on what landed, because that is the sentence somebody takes away", () => {
    const review = reviewOf(SCENE, state([turn(), turn(), turn()]));
    expect(review.lead).toMatch(/answered what was asked/);
    expect(review.lead).not.toMatch(/wrong|mistake|error/i);
  });

  /*
    Turns that answered something, not turns whose words were recognised. A
    learner who met no beat was told "19 of your 21 turns were understood"
    over a list of six things left undone: their Estonian was read, which is
    worth saying, and it is not what "understood" means to whoever reads it.
  */
  it("does not tell somebody who answered nothing that they were understood", () => {
    const missed = [turn({ reading: "offtarget", met: [false] }), turn({ reading: "offtarget", met: [false] })];
    const review = reviewOf(SCENE, state(missed, []));
    expect(review.lead).not.toMatch(/[0-9]+ of your/);
    expect(review.lead).toMatch(/Nothing landed/);
    // And it says the way in rather than a figure.
    expect(review.lead).toMatch(/word button/);
  });

  it("still says their Estonian was read, where it was", () => {
    const review = reviewOf(SCENE, state([turn({ reading: "offtarget", met: [false] })], []));
    expect(review.lead).toMatch(/read every time/);
  });

  it("names two unmet goals and counts the rest, rather than running six together", () => {
    const note = reviewOf(SCENE, state([turn()], [])).notes.find((n) => n.id === "missed");
    expect(note?.body).toContain("Say what is wrong.");
    // The fixture has two required beats, so nothing is left over to count.
    expect(note?.body).not.toMatch(/And \d+ more/);
  });

  it("counts turns the other side acted on, and not the ones it waited through", () => {
    const review = reviewOf(SCENE, state([turn(), turn({ reading: "fragment" }), turn({ reading: "echo" })]));
    expect(review.lead).toContain("The one thing you said");
  });

  it("says nothing came out wrong where nothing did", () => {
    expect(reviewOf(SCENE, state([turn(), turn()])).notes).toEqual([]);
  });

  it("names the case that came out as something else, the way a class names it", () => {
    const review = reviewOf(SCENE, state([turn({ slips: [CASE_SLIP] })]));
    const note = review.notes.find((n) => n.id === "case:INESSIVE");
    expect(note?.heading).toContain("seesütlev");
    // And the question it is taught by, which is what a learner will hear.
    expect(note?.heading).toContain("kus?");
    expect(note?.evidence).toEqual([{ said: "pea", form: "peas" }]);
  });

  it("ranks the case somebody got wrong most often first", () => {
    const other: Slip = { kind: "case", said: "pea", form: "peast", lemma: "pea", grammCase: "ELATIVE" };
    const review = reviewOf(SCENE, state([
      turn({ slips: [CASE_SLIP] }), turn({ slips: [CASE_SLIP] }), turn({ slips: [other] }),
    ]));
    expect(review.notes[0]?.id).toBe("case:INESSIVE");
    expect(review.notes[1]?.id).toBe("case:ELATIVE");
  });

  /*
    The thing a teacher standing beside you says, marked as the guess it is.
    Derived from the transcript rather than invented: the case they reached
    for is recorded at marking time and the case the question before wanted
    is in the turn order.
  */
  it("guesses why, off the case they reached for", () => {
    const slip: Slip = { ...CASE_SLIP, said: "peal", reached: "ADESSIVE" };
    const note = reviewOf(SCENE, state([turn({ slips: [slip] })])).notes[0];
    expect(note?.hunch?.sure).toBe("likely");
    expect(note?.hunch?.says).toContain("kus?");
  });

  it("reads the case the question before wanted as the likeliest reason", () => {
    const first: Slip = { kind: "case", said: "peast", form: "peas", lemma: "pea", grammCase: "ELATIVE" };
    const second: Slip = { ...CASE_SLIP, said: "peast", reached: "ELATIVE" };
    const review = reviewOf(SCENE, state([turn({ slips: [first] }), turn({ slips: [second] })]));
    const note = review.notes.find((n) => n.id === "case:INESSIVE");
    expect(note?.hunch?.says).toContain("the question before");
  });

  it("guesses nothing where the spelling names no case", () => {
    const note = reviewOf(SCENE, state([turn({ slips: [CASE_SLIP] })])).notes[0];
    expect(note?.hunch).toBeUndefined();
  });

  it("states the one rule that gets five forms for the price of one", () => {
    const slip: Slip = { kind: "person", said: "tulema", form: "tulen", lemma: "tulema" };
    const note = reviewOf(SCENE, state([turn({ slips: [slip] })])).notes.find((n) => n.id === "person");
    expect(note?.body).toContain("first");
    expect(note?.hunch?.says).toContain("dictionary lists a verb");
    expect(note?.evidence).toEqual([{ said: "tulema", form: "tulen" }]);
  });

  it("names what was left undone, in the beat's own words", () => {
    const note = reviewOf(SCENE, state([turn()], ["reason"])).notes.find((n) => n.id === "missed");
    expect(note?.body).toContain("Say where it hurts.");
  });

  it("counts a turn in English without a word against it", () => {
    const note = reviewOf(SCENE, state([turn({ reading: "english" })])).notes.find((n) => n.id === "english");
    expect(note?.heading).toBe("One turn in English");
    expect(note?.body).not.toMatch(/should|must|avoid/i);
  });

  /*
    Every Estonian character in a review is the learner's own word or the
    dictionary's recast, and the case names are read off `CASES`. The body of
    a note is English about Estonian, which is `lib/estonian/grammar.ts`'s own
    standing.
  */
  it("puts no Estonian in a note's body", () => {
    const slips: Slip[] = [
      CASE_SLIP,
      { kind: "person", said: "tulema", form: "tulen", lemma: "tulema" },
      { kind: "form", said: "valudeks", form: "valusid", lemma: "valu" },
      { kind: "spelling", said: "korvas", form: "kõrvas", lemma: "kõrv" },
    ];
    const review = reviewOf(SCENE, state([turn({ slips })]));
    expect(review.notes.length).toBeGreaterThan(3);
    for (const note of review.notes) {
      expect(note.body, note.id).not.toMatch(/[õäöüšž]/i);
    }
  });

  /*
    A hunch names cases, and the names are Estonian read off `CASES` rather
    than typed. What it may never do is state a guess as a finding.
  */
  it("marks a hunch as a guess and never as a finding", () => {
    const slip: Slip = { ...CASE_SLIP, said: "peal", reached: "ADESSIVE" };
    const note = reviewOf(SCENE, state([turn({ slips: [slip] })])).notes[0];
    expect(["likely", "possible"]).toContain(note?.hunch?.sure);
  });

  it("says something kind and true about a run where nothing was said", () => {
    const review = reviewOf(SCENE, state([], []));
    expect(review.lead).toMatch(/Nothing was said/);
    expect(review.notes.some((n) => n.id === "missed")).toBe(true);
  });
});
