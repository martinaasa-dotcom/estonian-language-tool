import { describe, expect, it } from "vitest";
import { parseInlines, parseReply, plainText } from "@/lib/tutor/markdown";

describe("inline markers become typography", () => {
  it("reads bold, italic and code", () => {
    expect(parseInlines("Use **raamatut** here, not *raamatu*, see `lugema`.")).toEqual([
      { kind: "text", text: "Use " },
      { kind: "strong", text: "raamatut" },
      { kind: "text", text: " here, not " },
      { kind: "em", text: "raamatu" },
      { kind: "text", text: ", see " },
      { kind: "code", text: "lugema" },
      { kind: "text", text: "." },
    ]);
  });

  it("reads underscores the same way", () => {
    expect(parseInlines("__osastav__ and _kus_")).toEqual([
      { kind: "strong", text: "osastav" },
      { kind: "text", text: " and " },
      { kind: "em", text: "kus" },
    ]);
  });

  it("leaves an unpaired marker on screen rather than guessing what it meant", () => {
    expect(parseInlines("keda/mida* (partitive) and 3 * 4")).toEqual([
      { kind: "text", text: "keda/mida* (partitive) and 3 * 4" },
    ]);
    expect(parseInlines("**unfinished")).toEqual([{ kind: "text", text: "**unfinished" }]);
  });

  it("does not read an underscore inside a word as emphasis", () => {
    expect(parseInlines("in_elukutse is a code")).toEqual([{ kind: "text", text: "in_elukutse is a code" }]);
  });

  it("never changes a character between the markers", () => {
    const estonian = "Ma lähen tuppa, mitte toasse.";
    expect(parseInlines(`**${estonian}**`)).toEqual([{ kind: "strong", text: estonian }]);
  });
});

describe("a reply is read into blocks", () => {
  it("splits paragraphs on a blank line and keeps a single newline as a break", () => {
    expect(parseReply("First line\nsecond line\n\nNext paragraph")).toEqual([
      { kind: "paragraph", inlines: [{ kind: "text", text: "First line" }, { kind: "break" }, { kind: "text", text: "second line" }] },
      { kind: "paragraph", inlines: [{ kind: "text", text: "Next paragraph" }] },
    ]);
  });

  it("reads a bulleted list, whichever bullet the model chose", () => {
    expect(parseReply("- one\n* two\n• three")).toEqual([
      { kind: "list", ordered: false, items: [[{ kind: "text", text: "one" }], [{ kind: "text", text: "two" }], [{ kind: "text", text: "three" }]] },
    ]);
  });

  it("reads a numbered list and keeps it apart from a bulleted one", () => {
    expect(parseReply("1. one\n2) two\n- three")).toEqual([
      { kind: "list", ordered: true, items: [[{ kind: "text", text: "one" }], [{ kind: "text", text: "two" }]] },
      { kind: "list", ordered: false, items: [[{ kind: "text", text: "three" }]] },
    ]);
  });

  it("folds an indented line into the item above it", () => {
    expect(parseReply("- one\n  continued")).toEqual([
      { kind: "list", ordered: false, items: [[{ kind: "text", text: "one" }, { kind: "break" }, { kind: "text", text: "continued" }]] },
    ]);
  });

  it("reads a heading and drops a horizontal rule", () => {
    expect(parseReply("### The rule\n---\nText")).toEqual([
      { kind: "heading", inlines: [{ kind: "text", text: "The rule" }] },
      { kind: "paragraph", inlines: [{ kind: "text", text: "Text" }] },
    ]);
  });

  it("gives back nothing for nothing", () => {
    expect(parseReply("")).toEqual([]);
    expect(parseReply("\n\n")).toEqual([]);
  });
});

describe("plain text is the words with the markers lifted off", () => {
  it("strips emphasis and lays a list out one item per line", () => {
    expect(plainText("Use **raamatut**.\n\n1. one\n2. two")).toBe("Use raamatut.\n\n1. one\n2. two");
  });
});
