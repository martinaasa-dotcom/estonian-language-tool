/**
 * The root element declares no overflow, so a menu hung off the chrome opens
 * where the reader is looking.
 *
 * Setting either axis on `html` makes the root a scroll container, and every
 * library that positions a floating element asks exactly that question before
 * it places one: when the root is an overflow element it works in document
 * coordinates instead of viewport ones. For anything laid out in the page the
 * two agree and nothing looks wrong, which is what lets this survive. For the
 * chrome they do not agree at all, because the chrome is the one thing that
 * stays put while the page moves. The desktop rail is `sticky top-0` and the
 * phone bar is `fixed`, so both sit where the screen is while their place in
 * the document stays where the page is, and the gap between those two is the
 * scroll offset. A menu anchored to either would be drawn that far from where
 * it belongs, and on a scrolled phone that means open, focused and entirely
 * off the top of the screen.
 *
 * Asserted against the stylesheet because the fault is one declaration in it,
 * and because the symptom is a coordinate no unit test would ever compute.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CSS = readFileSync("app/globals.css", "utf8");

/** One rule's body, comments stripped, from the base layer. */
function rule(selector: string): string {
  const pattern = new RegExp(`(?:^|\\n)\\s*${selector}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`);
  const match = CSS.match(pattern);
  if (!match?.[1]) throw new Error(`no ${selector} rule in globals.css`);
  return match[1].replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("the root's overflow", () => {
  it("is not declared, on either axis", () => {
    expect(
      CSS,
      "an overflow on the root makes it a scroll container, and every popper anchored to the sticky rail or the fixed phone bar is then drawn one scroll offset away from where it belongs",
    ).not.toMatch(/(?:^|\n)\s*html\s*\{[^}]*overflow(-x|-y)?\s*:/);
  });

  it("still clips sideways, on body", () => {
    // The protection does not go away with the rule above it: with nothing on
    // the root, the viewport takes its overflow from the body instead.
    expect(rule("body")).toMatch(/overflow-x\s*:\s*clip/);
  });
});

describe("the bounce", () => {
  it("is off on both elements, because which one is the root scroller differs by engine", () => {
    const both = CSS.match(/html,\s*body\s*\{([\s\S]*?)\n\s*\}/);
    expect(both?.[1]).toMatch(/overscroll-behavior-y\s*:\s*none/);
  });

  it("is replaced by a gesture of our own, since this is the same switch for both", () => {
    // Losing the browser's pull to refresh is not a side effect to accept
    // quietly: the app is installed to a home screen, so it runs with no
    // address bar and no reload button anywhere in it. This asserts the
    // component exists rather than that a comment mentions it.
    expect(existsSync("components/PullToRefresh.tsx")).toBe(true);
    expect(readFileSync("app/(app)/layout.tsx", "utf8")).toMatch(/<PullToRefresh \/>/);
  });

  it("never pins a backdrop filter over content that moves", () => {
    /*
      A `backdrop-filter` on something fixed over moving content has to
      re-filter its backdrop every frame of every scroll. Upside Lab measured
      the pairing at 42 repainted frames on one pass down a phone screen, the
      worst of them a third of a screen behind where the page actually was.
      A pull is content moving under something pinned to the window by
      definition, so the ring carries no filter, and neither does the phone
      bar it passes under.
    */
    // The React spelling, which is the one that would actually apply a
    // filter. The CSS spelling appears in both files' comments, explaining
    // why they do not carry one.
    for (const file of ["components/PullToRefresh.tsx", "components/Sidebar.tsx"]) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/backdropFilter/);
    }
  });
});

describe("notices pinned to the bottom of the window", () => {
  it("clear the safe area even when there is no dock", () => {
    expect(rule("\\.bottom-notice")).toMatch(/env\(safe-area-inset-bottom\)/);
  });

  it("clear a measured dock rather than a number somebody typed", () => {
    expect(CSS).toMatch(/:root\[data-dock\]\s*\.bottom-notice/);
    expect(CSS).toMatch(/var\(--dock-clearance/);
  });
});
