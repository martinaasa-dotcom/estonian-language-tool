import { describe, expect, it } from "vitest";
import { resolveOperator, SUPERVISORY_AUTHORITY } from "@/lib/legal/operator";

describe("who is answerable for a deployment", () => {
  it("is nobody until somebody says so, and says that rather than guessing", () => {
    const operator = resolveOperator({});
    expect(operator.identified).toBe(false);
    expect(operator.name).toBeNull();
    expect(operator.email).toBeNull();
    expect(operator.address).toBeNull();
  });

  it("reads the three that Article 13 asks for", () => {
    const operator = resolveOperator({
      OPERATOR_NAME: "Kool OU",
      OPERATOR_ADDRESS: "Pikk 1, 10123 Tallinn, Estonia",
      OPERATOR_EMAIL: "privacy@example.ee",
      OPERATOR_REGISTRY_CODE: "12345678",
    });
    expect(operator.identified).toBe(true);
    expect(operator.name).toBe("Kool OU");
    expect(operator.registryCode).toBe("12345678");
  });

  it("does not count a private person as unidentified for having no registry code", () => {
    /*
      A parent running this for one family is a controller with the same
      obligations and no business registry entry at all. Requiring the code
      would make the honest configuration the one that reports itself broken.
    */
    const operator = resolveOperator({
      OPERATOR_NAME: "A Person",
      OPERATOR_ADDRESS: "An address",
      OPERATOR_EMAIL: "a@example.ee",
    });
    expect(operator.identified).toBe(true);
    expect(operator.registryCode).toBeNull();
  });

  it("treats whitespace as absence, because a variable set to a space is unset", () => {
    const operator = resolveOperator({
      OPERATOR_NAME: "  ",
      OPERATOR_ADDRESS: "\t",
      OPERATOR_EMAIL: "",
    });
    expect(operator.identified).toBe(false);
    expect(operator.name).toBeNull();
  });

  it("trims a value somebody pasted with a trailing newline", () => {
    expect(resolveOperator({ OPERATOR_NAME: "Kool OU\n" }).name).toBe("Kool OU");
  });

  it("names an authority a person can actually reach", () => {
    // Article 13(2)(d) is a right to be told, so the telling has to carry
    // enough to act on: not just that a complaint is possible.
    expect(SUPERVISORY_AUTHORITY.email).toMatch(/@/);
    expect(SUPERVISORY_AUTHORITY.web).toMatch(/^https:\/\//);
    expect(SUPERVISORY_AUTHORITY.address).toMatch(/Tallinn/);
  });
});
