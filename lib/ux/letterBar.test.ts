import { describe, expect, it } from "vitest";
import {
  DEFAULT_LETTER_BAR, ESTONIAN_LETTERS, LETTER_BAR_CHOICES, letterBarFrom,
} from "./letterBar";

describe("letterBarFrom", () => {
  it("is on when nobody has answered", () => {
    /*
      The one that matters. Everybody who signed up before this question existed
      has no row in the settings table, and the bar is the only way they have of
      writing õ on a UK or US keyboard. Reading a missing answer as "off" would
      take that away from every existing learner in one deploy, silently.
    */
    expect(letterBarFrom(undefined)).toBe("on");
    expect(letterBarFrom(null)).toBe("on");
    expect(letterBarFrom("")).toBe("on");
    expect(DEFAULT_LETTER_BAR).toBe("on");
  });

  it("is off only when that is what was stored", () => {
    expect(letterBarFrom("off")).toBe("off");
    expect(letterBarFrom("on")).toBe("on");
  });

  it("reads anything it does not recognise as the default", () => {
    // A settings value is a string column, so a typo or a value from an older
    // shape of this setting has to land somewhere. It lands on the side that
    // leaves somebody able to type.
    for (const junk of ["OFF", "false", "0", "hidden", "no"]) {
      expect(letterBarFrom(junk)).toBe("on");
    }
  });
});

describe("the letters", () => {
  it("are the six Estonian has and a UK or US keyboard does not", () => {
    expect([...ESTONIAN_LETTERS]).toEqual(["õ", "ä", "ö", "ü", "š", "ž"]);
  });

  it("offers both answers, each with a reason", () => {
    expect(LETTER_BAR_CHOICES.map((c) => c.value)).toEqual(["on", "off"]);
    for (const choice of LETTER_BAR_CHOICES) {
      expect(choice.label.length).toBeGreaterThan(0);
      expect(choice.detail.length).toBeGreaterThan(20);
    }
  });
});
