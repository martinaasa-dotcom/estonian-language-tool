/**
 * Text and icons stay inside the boxes they were drawn into.
 *
 * Every other rule this project keeps about the shape of a page is about the
 * page: the root declares no overflow, the body clips sideways, the document
 * cannot be dragged. None of them can see this fault, because it happens
 * inside a card that is itself exactly the right size. A word runs over the
 * border and onto the ground behind it. A label meets an icon in a flex row
 * and squeezes the icon into an oval, or a short label leaves it room and
 * stretches it into one. Neither makes the page any wider, so every check
 * that measures the page reads a clean pass while the screen looks broken.
 *
 * Four declarations carry it and each answers a different way out of a box, so
 * they are asserted separately rather than as one blob of stylesheet:
 *
 *   - a word that will not fit breaks, and says so early enough that the box
 *     it is in is allowed to be narrow (`anywhere`, not `break-word`);
 *   - a table is the exemption, because a paradigm is read by comparing forms
 *     and it already sits in a scroller;
 *   - an icon is never resized by the text beside it;
 *   - anything that arrives with a width of its own is capped at its box.
 *
 * Asserted against the stylesheet for the same reason `rootOverflow.test.ts`
 * is: the fault is one declaration and the symptom is a rectangle no unit test
 * can compute. `scripts/test-containment.mjs` is the half that measures the
 * rectangles, in a browser, on real pages.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CSS = readFileSync("app/globals.css", "utf8");

/** One rule's body, comments stripped. */
function rule(selector: string): string {
  const pattern = new RegExp(`(?:^|\\n)\\s*${selector}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`);
  const match = CSS.match(pattern);
  if (!match?.[1]) throw new Error(`no ${selector} rule in globals.css`);
  return match[1].replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("a word that will not fit", () => {
  it("breaks, from the body, so every screen inherits it", () => {
    expect(rule("body")).toMatch(/overflow-wrap\s*:\s*anywhere/);
  });

  it("is `anywhere` rather than `break-word`, which is the whole point", () => {
    /*
      Both break a word that has already overflowed. Only `anywhere` counts
      towards min-content, which is what a flex or grid item's automatic
      minimum is: with `break-word` a single long word is a floor under the
      whole row and the row pushes out of the card it is in, having broken
      nothing. Estonian is the reason this is not academic. The dictionary
      holds compounds past twenty characters and the row that holds one is
      three or four columns wide on a phone.
    */
    expect(rule("body")).not.toMatch(/overflow-wrap\s*:\s*break-word/);
  });
});

describe("a table", () => {
  it("keeps its words whole, which is the one exemption", () => {
    // A paradigm is read by comparing its forms down a column, so a form split
    // across two lines is a form the reader has to reassemble first.
    expect(rule("table")).toMatch(/overflow-wrap\s*:\s*break-word/);
  });

  it("is the only thing exempted, and the exemption is written on the element", () => {
    /*
      The exemption is bought by the scroller every table in this app sits in,
      so it may not be spent anywhere that has no scroller to give.
      `scripts/test-invariants.ts` is what holds the other half of that bargain
      against the markup; this is what stops the exemption spreading.
    */
    const exempt = [...CSS.matchAll(/(?:^|\n)\s*([^{}\n]+?)\s*\{[^}]*overflow-wrap\s*:\s*break-word/g)]
      .map((m) => m[1]?.trim());
    expect(exempt).toEqual(["table"]);
  });
});

describe("an icon", () => {
  it("is never resized by the text beside it", () => {
    /*
      A lucide icon is a square carrying `width` and `height` attributes, and
      a flex item with no `flex` of its own both shrinks and grows. Measured
      with the rule off: `lucide-eye-off` drawn at 0x15 in a deck row, and
      `lucide-sun` at 28x16 in the rail. `shrink-0` was on about a fifth of
      the icons in the app, which is what a rule kept by remembering looks
      like from the inside.
    */
    expect(rule("svg\\.lucide")).toMatch(/flex\s*:\s*none/);
  });

  it("is left out of the cap below, so it cannot be squeezed by a second route", () => {
    const capped = rule("img, video, canvas, iframe, input, select, textarea");
    expect(capped).toMatch(/max-width\s*:\s*100%/);
    expect(/(?:^|\n)\s*[^{}\n]*\bsvg\b[^{}\n]*\{[^}]*max-width/.test(CSS)).toBe(false);
  });
});

describe("anything with a width of its own", () => {
  it("is capped at the box it is in", () => {
    /*
      The one rule neither wrapping nor shrinking can stand in for: a replaced
      element is laid out from its own content. The backup picker on Settings
      is an `<input type="file">`, which Chromium lays out at 336px from its
      button label and room for a filename, and it was sitting in a 278px card
      on a 360px phone. The body clips sideways, so the page never scrolled and
      nothing looked wrong from the outside while the right-hand end of the
      control was off the screen.
    */
    expect(rule("img, video, canvas, iframe, input, select, textarea"))
      .toMatch(/max-width\s*:\s*100%/);
  });
});
