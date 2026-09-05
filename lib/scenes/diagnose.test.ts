import { describe, expect, it } from "vitest";
import { diagnose, diagnosePerson } from "./diagnose";

const NONE = { grammCase: null };

describe("why the wrong ending came out", () => {
  it("says nothing where the case they reached for cannot be named", () => {
    // `haigla` is its own nimetav, omastav and osastav, so naming any of them
    // would be a guess, and the review says which case was wanted and no more.
    expect(diagnose("ILLATIVE", undefined, NONE)).toBeNull();
  });

  it("says nothing where they used the case that was asked for", () => {
    expect(diagnose("INESSIVE", "INESSIVE", NONE)).toBeNull();
  });

  /*
    The strongest of the three, because it is a fact about this conversation
    rather than a pattern about learners, and it is the one somebody
    recognises about themselves.
  */
  it("names the case the question before wanted, ahead of everything else", () => {
    const hunch = diagnose("ELATIVE", "INESSIVE", { grammCase: "INESSIVE" });
    expect(hunch?.sure).toBe("likely");
    expect(hunch?.says).toContain("the question before");
  });

  /*
    `kus?` is answered by the seesütlev and the alalütlev, so a class teaches
    them together and they are swapped. Read off `CASES`, so the pair is the
    language's own and a fifteenth case would be covered by arriving.
  */
  it("names the pair that answers one question word, and which is which", () => {
    const hunch = diagnose("INESSIVE", "ADESSIVE", NONE);
    expect(hunch?.sure).toBe("likely");
    expect(hunch?.says).toContain("kus?");
    expect(hunch?.says).toContain("seesütlev");
    expect(hunch?.says).toContain("alalütlev");
    // And what each of the two means, off the same table the grammar page leads with.
    expect(hunch?.says).toMatch(/seesütlev means in/);
    expect(hunch?.says).toMatch(/alalütlev means on, at/);
  });

  it("names the same pair the other way round, with the meanings the same way round", () => {
    const hunch = diagnose("ADESSIVE", "INESSIVE", NONE);
    expect(hunch?.says).toMatch(/alalütlev means on, at/);
    expect(hunch?.says).toMatch(/seesütlev means in/);
  });

  it("covers the other two question words the same way", () => {
    expect(diagnose("ILLATIVE", "ALLATIVE", NONE)?.says).toContain("kuhu?");
    expect(diagnose("ELATIVE", "ABLATIVE", NONE)?.says).toContain("kust?");
  });

  it("reads the plain word as the ending not having arrived", () => {
    const hunch = diagnose("INESSIVE", "NOMINATIVE", NONE);
    expect(hunch?.sure).toBe("likely");
    expect(hunch?.says).toContain("dictionary lists it");
  });

  /*
    The one tier that is not `likely`, because a stem where an ending was due
    fits several stories and the honest thing is to say which one this is.
  */
  it("offers the stem reading as a possibility rather than as a finding", () => {
    for (const reached of ["GENITIVE", "PARTITIVE"] as const) {
      const hunch = diagnose("INESSIVE", reached, NONE);
      expect(hunch?.sure, reached).toBe("possible");
      expect(hunch?.says, reached).toContain("every other ending is built on");
    }
  });

  it("gives one hunch at most, and none where nothing fits", () => {
    expect(diagnose("INESSIVE", "TRANSLATIVE", NONE)).toBeNull();
  });

  it("has one answer about the verb, because there is only one", () => {
    expect(diagnosePerson().sure).toBe("likely");
    expect(diagnosePerson().says).toContain("dictionary lists a verb");
  });

  it("never states a hunch as a fact", () => {
    const all = [
      diagnose("ELATIVE", "INESSIVE", { grammCase: "INESSIVE" }),
      diagnose("INESSIVE", "ADESSIVE", NONE),
      diagnose("INESSIVE", "NOMINATIVE", NONE),
      diagnose("INESSIVE", "GENITIVE", NONE),
      diagnosePerson(),
    ];
    for (const hunch of all) {
      expect(hunch).toBeTruthy();
      expect(hunch!.says, hunch!.says).not.toMatch(/\byou (did|were|forgot|confused)\b/i);
    }
  });
});
