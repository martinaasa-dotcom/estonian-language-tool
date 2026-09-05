import { describe, expect, it } from "vitest";
import { ADVANCE_KEY_LABEL, isAdvanceKey } from "./advanceKey";

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

describe("ADVANCE_KEY_LABEL", () => {
  it("names a key the reading takes, wherever the learner is", () => {
    expect(isAdvanceKey({ key: ADVANCE_KEY_LABEL, target: null })).toBe(true);
    expect(isAdvanceKey({ key: ADVANCE_KEY_LABEL, target: { tagName: "INPUT" } })).toBe(true);
    expect(isAdvanceKey({ key: ADVANCE_KEY_LABEL, target: { tagName: "TEXTAREA" } })).toBe(true);
  });
  it("is not Space, which a text box swallows", () => {
    expect(ADVANCE_KEY_LABEL).not.toBe(" ");
    expect(ADVANCE_KEY_LABEL).not.toBe("Space");
  });
});
