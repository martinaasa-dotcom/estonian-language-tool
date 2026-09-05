import { describe, expect, it } from "vitest";
import { isAdvanceKey } from "./advanceKey";

describe("isAdvanceKey", () => {
  it("takes Enter anywhere", () => {
    expect(isAdvanceKey({ key: "Enter", target: null })).toBe(true);
    expect(isAdvanceKey({ key: "Enter", target: { tagName: "INPUT" } })).toBe(true);
  });
  it("takes Space only outside a text box, where it is a letter", () => {
    expect(isAdvanceKey({ key: " ", target: null })).toBe(true);
    expect(isAdvanceKey({ key: " ", target: { tagName: "BUTTON" } })).toBe(true);
    expect(isAdvanceKey({ key: " ", target: { tagName: "INPUT" } })).toBe(false);
    expect(isAdvanceKey({ key: " ", target: { tagName: "TEXTAREA" } })).toBe(false);
    expect(isAdvanceKey({ key: " ", target: { tagName: "DIV", isContentEditable: true } })).toBe(false);
  });
  it("takes nothing else", () => {
    for (const key of ["a", "1", "Tab", "Escape", "Backspace"]) {
      expect(isAdvanceKey({ key, target: null })).toBe(false);
    }
  });
});
