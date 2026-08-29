import { describe, expect, it } from "vitest";
import { buildAllowlist, estonianTokens, verifyComment } from "./verify";

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
