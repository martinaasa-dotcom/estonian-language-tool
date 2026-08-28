import { describe, expect, it } from "vitest";
import { CODE_ALPHABET, CODE_LENGTH, generateCode, isValidCode, normaliseCode } from "./code";

describe("generateCode", () => {
  it("is the right length and uses only the safe alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateCode();
      expect(code).toHaveLength(CODE_LENGTH);
      expect([...code].every((ch) => CODE_ALPHABET.includes(ch))).toBe(true);
    }
  });

  it("leaves out the characters people misread", () => {
    for (const ch of ["0", "O", "1", "I", "L", "U", "V"]) {
      expect(CODE_ALPHABET).not.toContain(ch);
    }
  });

  it("is deterministic when the randomness is", () => {
    const fixed = () => 0;
    expect(generateCode(fixed)).toBe("AAAAAA");
  });
});

describe("normaliseCode", () => {
  it("uppercases and drops the separators people add", () => {
    expect(normaliseCode(" abc-234 ")).toBe("ABC234");
  });

  it("never guesses at a mistyped character — a wrong code must not open another class", () => {
    // `0` is not in the alphabet, so this stays invalid rather than becoming `Q`.
    expect(normaliseCode("ABC0234")).toBe("ABC023");
    expect(isValidCode("ABC023")).toBe(false);
  });

  it("does not run past the code length", () => {
    expect(normaliseCode("ABCDEFGHJK")).toHaveLength(CODE_LENGTH);
  });
});

describe("isValidCode", () => {
  it("accepts a generated code", () => {
    expect(isValidCode(generateCode())).toBe(true);
  });

  it("rejects the wrong length or an excluded character", () => {
    expect(isValidCode("ABC23")).toBe(false);
    expect(isValidCode("ABCO23")).toBe(false);
    expect(isValidCode("")).toBe(false);
  });
});
