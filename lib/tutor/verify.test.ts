import { describe, expect, it } from "vitest";
import { buildAllowlist, chatEstonianTokens, estonianTokens, verifyComment } from "./verify";

const FORMS = ["ajalugu", "ajaloo", "ajalugu", "ajaloost", "ajaloos", "tuba", "toa", "toas"];
const SENTENCE = "Ma näen ajalugu praegu siin.";

describe("buildAllowlist", () => {
  it("includes the English gloss, so quoting a translation is not an invention", () => {
    expect(buildAllowlist([], "", ["to help, to assist"]).has("assist")).toBe(true);
  });

  it("includes every supplied form", () => {
    const allowed = buildAllowlist(FORMS, "");
    expect(allowed.has("ajaloost")).toBe(true);
    expect(allowed.has("toas")).toBe(true);
  });

  it("includes what the learner wrote, since quoting them back invents nothing", () => {
    expect(buildAllowlist([], "Ma olen kodus").has("kodus")).toBe(true);
  });

  it("includes the parts of a compound supplied whole", () => {
    expect(buildAllowlist(["e-post"], "").has("post")).toBe(true);
  });

  it("allows Estonian grammatical terms, which are not forms of anything", () => {
    expect(buildAllowlist([], "").has("osastav")).toBe(true);
  });
});

describe("estonianTokens", () => {
  it("finds a quoted word", () => {
    expect(estonianTokens("Use 'ajaloost' here")).toContain("ajaloost");
  });

  it("finds an unquoted word carrying an Estonian letter", () => {
    expect(estonianTokens("The form õppima is wrong")).toContain("õppima");
  });

  it("handles curly quotes", () => {
    expect(estonianTokens("Use ‘toas’ instead")).toContain("toas");
  });

  it("ignores plain English prose", () => {
    expect(estonianTokens("That is the right case for an ongoing action")).toEqual([]);
  });
});

describe("verifyComment", () => {
  it("passes a comment that only quotes forms the model was given", () => {
    const result = verifyComment(
      "Right word, wrong case — you want 'ajaloost' here, the elative.",
      FORMS, SENTENCE,
    );
    expect(result.comment).not.toBeNull();
    expect(result.unverified).toEqual([]);
  });

  it("passes a comment quoting the learner's own words back", () => {
    const result = verifyComment("Your 'praegu' is fine where it is.", FORMS, SENTENCE);
    expect(result.comment).not.toBeNull();
  });

  it("withholds a comment that introduces a form the model was never given", () => {
    // The exact failure ADR-005 exists to prevent: a confidently produced
    // inflected form that nothing authoritative supplied.
    const result = verifyComment(
      "You should have written 'raamatutesse' instead.",
      FORMS, SENTENCE,
    );
    expect(result.comment).toBeNull();
    expect(result.unverified).toContain("raamatutesse");
  });

  it("withholds a comment inventing a form with Estonian letters", () => {
    const result = verifyComment("The correct form is mõtlesime.", FORMS, SENTENCE);
    expect(result.comment).toBeNull();
    expect(result.unverified).toContain("mõtlesime");
  });

  it("does not withhold over a quoted English gloss of the word being discussed", () => {
    const result = verifyComment(
      `The word 'history' is the object here, so it takes the partitive.`,
      FORMS, SENTENCE, ["history"],
    );
    expect(result.comment).not.toBeNull();
  });

  it("does not withhold over ordinary quoted grammar vocabulary", () => {
    const result = verifyComment(
      `The 'ending' is what changes, not the 'stem'.`,
      FORMS, SENTENCE,
    );
    expect(result.comment).not.toBeNull();
  });

  it("still catches an invented form even when glosses are supplied", () => {
    const result = verifyComment(
      "You should have written 'raamatutesse' instead.",
      FORMS, SENTENCE, ["history", "room"],
    );
    expect(result.comment).toBeNull();
  });

  it("does not withhold over a quoted English grammatical term", () => {
    const result = verifyComment(`Use the 'elative' rather than the 'inessive'.`, FORMS, SENTENCE);
    expect(result.comment).not.toBeNull();
  });

  it("treats an empty comment as nothing to show", () => {
    expect(verifyComment("   ", FORMS, SENTENCE).comment).toBeNull();
  });

  it("is case-insensitive about the allowlist", () => {
    expect(verifyComment("Write 'Ajaloost' here.", FORMS, SENTENCE).comment).not.toBeNull();
  });

  it("ignores punctuation attached to a quoted form", () => {
    expect(verifyComment("Try 'toas.' instead", FORMS, SENTENCE).comment).not.toBeNull();
  });
});

/*
  The two withholds are not the same claim, and the screen makes one of them out
  loud. A word carrying an Estonian letter is Estonian and nothing else; a long
  quoted word that nothing supplied is a guess, biased towards withholding, and
  on the composition route (no glosses, no forms, an allowlist of the
  learner's own text) an English word is exactly what it usually catches. Both
  drop the note. Only one of them may be reported as Anu writing Estonian.
*/
describe("verifyComment reports which guard fired", () => {
  it("says nothing was withheld when nothing was", () => {
    expect(verifyComment("Your 'toas' is right.", FORMS, SENTENCE).reason).toBeNull();
  });

  it("calls a word carrying an Estonian letter what it is", () => {
    const result = verifyComment("The correct form is mõtlesime.", FORMS, SENTENCE);
    expect(result.comment).toBeNull();
    expect(result.reason).toBe("estonian-form");
  });

  it("does not claim Estonian over a long English word it merely could not vouch for", () => {
    // The shape `/api/exam/write` hands it: no forms, no glosses, the learner's
    // own text as the whole allowlist.
    const result = verifyComment(`You use "weather" twice.`, [], "Ma olen kodus.", []);
    expect(result.comment).toBeNull();
    expect(result.unverified).toContain("weather");
    expect(result.reason).toBe("unvouched-word");
  });

  it("prefers the certain reason when both kinds are present", () => {
    const result = verifyComment(
      `You use "weather" twice, and mõtlesime is wrong.`,
      [],
      "Ma olen kodus.",
      [],
    );
    expect(result.reason).toBe("estonian-form");
  });
});

describe("chatEstonianTokens", () => {
  it("finds a word carrying an Estonian letter in ordinary prose", () => {
    expect(chatEstonianTokens("The word õppima means to study.")).toContain("õppima");
  });

  it("finds a long quoted word, the same as a grader comment would", () => {
    expect(chatEstonianTokens("Use 'ajaloost' here.")).toContain("ajaloost");
  });

  it("ignores a grammatical term, which names the lesson rather than a form", () => {
    expect(chatEstonianTokens("This is the osastav, the partitive case.")).toEqual([]);
  });

  it("ignores a FIX: line, already boxed and tagged in the UI", () => {
    expect(chatEstonianTokens("Almost.\nFIX: Ma loen raamatut õhtul.")).toEqual([]);
  });

  it("ignores a VOCAB: line, already gated behind an explicit add", () => {
    expect(chatEstonianTokens("Nice work.\nVOCAB: õpik | textbook")).toEqual([]);
  });

  it("still finds a word in ordinary prose alongside a tagged line", () => {
    const tokens = chatEstonianTokens("The form õppima is right here.\nFIX: Ma õpin eesti keelt.");
    expect(tokens).toEqual(["õppima"]);
  });

  it("ignores a numbered FIX: line", () => {
    expect(chatEstonianTokens("1. FIX: Ma loen raamatut.")).toEqual([]);
  });

  it("has nothing to say about plain English", () => {
    expect(chatEstonianTokens("That is the right case for an ongoing action.")).toEqual([]);
  });
});
