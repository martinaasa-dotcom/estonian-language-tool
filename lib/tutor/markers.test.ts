import { describe, expect, it } from "vitest";
import { TAGGED_LINE, fixFrom, vocabFrom } from "@/lib/tutor/markers";

describe("a tagged line is recognized however a model dresses it", () => {
  const shapes = ["FIX: Ma loen raamatut.", "3. FIX: Ma loen raamatut.", "**FIX:** Ma loen raamatut.", "**FIX**: Ma loen raamatut.", "`FIX:` Ma loen raamatut.", "fix: Ma loen raamatut."];
  for (const line of shapes) {
    it(`sees ${line.slice(0, 12)} as tagged`, () => {
      expect(TAGGED_LINE.test(line)).toBe(true);
      expect(fixFrom(line)).toBe("Ma loen raamatut.");
    });
  }

  it("does not read a mention of the marker inside prose as the marker", () => {
    expect(TAGGED_LINE.test("The FIX: line is below.")).toBe(false);
    expect(fixFrom("The FIX: line is below.")).toBeNull();
  });

  it("strips emphasis wrapped round the whole payload and nothing inside it", () => {
    expect(fixFrom("**FIX:** **Ma loen raamatut.**")).toBe("Ma loen raamatut.");
    expect(fixFrom("FIX: Ma loen *raamatut*.")).toBe("Ma loen *raamatut*.");
  });
});

describe("a VOCAB line parses on its pipe", () => {
  it("reads a plain line", () => {
    expect(vocabFrom("VOCAB: raamat | book")).toEqual({ et: "raamat", en: "book" });
  });

  it("reads a bolded one", () => {
    expect(vocabFrom("**VOCAB:** **raamat** | book")).toEqual({ et: "raamat", en: "book" });
    expect(vocabFrom("- **VOCAB**: raamat | book")).toBeNull();
    expect(vocabFrom("2) VOCAB: raamat | book")).toEqual({ et: "raamat", en: "book" });
  });

  it("refuses a line with no pipe, because half a pair is not a card", () => {
    expect(vocabFrom("VOCAB: raamat")).toBeNull();
    expect(vocabFrom("VOCAB: | book")).toBeNull();
  });
});
