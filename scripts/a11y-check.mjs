#!/usr/bin/env node
/**
 * Accessibility checks against the rules this project actually set itself:
 * every interactive element keyboard-reachable with a visible focus ring, and
 * Estonian text marked `lang="et"` so a screen reader does not read it with
 * English phonics.
 *
 * AND AXE ITSELF, WHICH THIS SUITE SPENT ITS WHOLE LIFE SAYING IT WAS NOT.
 *
 * "Not a substitute for axe" was true and was also the reason five real
 * failures sat in the app unseen. The hand-rolled contrast pass this replaces
 * was wrong in two ways that are obvious once named and were invisible while
 * it was the only thing looking: it scoped to `main`, so the navigation rail
 * on every signed-in screen was outside it, and it read a colour's own alpha
 * but not an `opacity` inherited from a parent, so a locked badge faded to
 * three quarters reported as passing while its description sat at 3.27.
 *
 * axe found both in one run, plus a broken list on the landing page that
 * nothing here would ever have thought to look for. So axe runs the general
 * rules and the checks below stay for what axe has no opinion about: exactly
 * one `main` and one `h1` per screen, a title that is not the landing page's,
 * and Estonian marked `lang="et"` so a screen reader does not read it with
 * English phonics.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { launchChromium } from "./lib/browser.mjs";
import { baseUrl, suite } from "./lib/checks.mjs";

/*
  Read off disk and injected, rather than imported and called in Node: axe
  runs against a live DOM, and the only live DOM here is the browser's. This
  app's Content Security Policy has no bearing on it because Playwright's
  `addScriptTag` goes through the DevTools protocol rather than the page.
*/
const AXE = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

/**
 * Every axe violation on the page, as one line each.
 *
 * `best-practice` is included on purpose. It is where the landing page's
 * `<ol>` full of `<div>`s turned up, and a list that announces itself as empty
 * is not a matter of taste.
 */
async function axeViolations(page) {
  await page.addScriptTag({ content: AXE });
  const result = await page.evaluate(async () => await window.axe.run(document, {
    resultTypes: ["violations"],
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] },
  }));
  return result.violations.map((v) =>
    `${v.id} (${v.impact}, ${v.nodes.length}): ${v.nodes[0]?.target.join(" ") ?? ""}`);
}

const BASE = baseUrl();

/*
  Every route, rather than the ones a branch happened to add.

  This list was fifteen of the app's forty-five, and it grew a line at a time
  as each new feature landed. What that misses is not hypothetical: a sweep
  over the whole tree found the five review modes rendering a whole session
  with no heading in it at all, a progress bar and a card and four buttons,
  and first run with no landmark on the page, which is the first screen
  anybody meets. Both sit on routes nobody had thought to add here. The cost
  of checking a route that has never broken is a second of wall clock.
*/
const ROUTES = [
  "/", "/learn", "/practice", "/progress", "/tasks", "/words", "/week", "/dictionary",
  "/grammar", "/grammar/inessive", "/guide", "/settings", "/scan", "/class", "/tutor",
  "/placement", "/assess", "/assess?take=1", "/exam", "/privacy", "/terms", "/offline",
  "/welcome", "/suggestions", "/admin/suggestions",
  "/review", "/review/write", "/review/government", "/review/cloze", "/review/clinic",
  "/review/dictation", "/review/listening", "/review/match", "/review/pairs",
  "/review/sentences", "/review/speaking", "/review/sprint",
];

const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });


/*
  Floor: 335, which is what this list reaches: thirty-seven routes at eight
  checks each, a contrast pass over the same thirty-seven in dark mode, and the
  two that run once at the end.

  It was 42 for ten routes, and stayed 42 when the level check added three and
  the exam hub added a fourth, which left it slack by twelve. A floor that never
  complains is a floor low enough to miss the thing it exists for, so it is set
  to the count rather than to a number that happens to pass.
*/
const { check, done } = suite("Accessibility", { floor: 335 });

for (const route of ROUTES) {
  await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);

  const report = await page.evaluate(() => {
    const bad = {
      unnamed: [], noFocusRing: [], imgNoAlt: 0, headings: [],
      h1s: document.querySelectorAll("main h1").length,
      landmarks: document.querySelectorAll("main").length,
      title: document.title,
    };

    const interactive = [...document.querySelectorAll(
      "main button, main a[href], main input, main textarea, main select, main [role='button']",
    )];

    for (const el of interactive) {
      const name = (
        el.getAttribute("aria-label") ||
        el.getAttribute("title") ||
        el.textContent?.trim() ||
        (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim()) ||
        // A wrapping label names its control too, and is the only way to name a
        // file input that has to be visually hidden behind the thing a person
        // actually clicks. See PickFile in app/(app)/scan/ScanCapture.tsx.
        el.closest("label")?.textContent?.trim() ||
        ""
      ).trim();
      if (!name) bad.unnamed.push(el.tagName + (el.className ? `.${String(el.className).slice(0, 30)}` : ""));

      /*
        A tabindex of -1 on something clickable means keyboard users cannot
        reach it, with one standard exception: a member of a radio group.
        ARIA's roving tabindex gives the whole group a single tab stop and
        moves between its options with the arrow keys, so every option but one
        carries -1 on purpose (components/Choice.tsx). The exemption is
        conditional on the group actually having that one stop, so a group
        that loses it still fails here rather than being waved through.
      */
      const group = el.closest("[role='radiogroup']");
      const roving =
        el.getAttribute("role") === "radio" &&
        group !== null &&
        group.querySelectorAll("[role='radio'][tabindex='0']").length === 1;
      if (el.getAttribute("tabindex") === "-1" && !roving) bad.noFocusRing.push(el.tagName);
    }

    for (const img of document.querySelectorAll("main img")) {
      if (!img.hasAttribute("alt")) bad.imgNoAlt++;
    }

    bad.headings = [...document.querySelectorAll("main h1, main h2, main h3")]
      .map((h) => Number(h.tagName[1]));

    return bad;
  });

  check(`${route}: every control has an accessible name`,
    report.unnamed.length === 0, report.unnamed.slice(0, 3).join(", "));
  check(`${route}: nothing interactive is removed from the tab order`,
    report.noFocusRing.length === 0, report.noFocusRing.join(", "));
  check(`${route}: every image has alt text`, report.imgNoAlt === 0);

  // Heading order should not skip a level.
  let skips = 0;
  for (let i = 1; i < report.headings.length; i++) {
    if (report.headings[i] - report.headings[i - 1] > 1) skips++;
  }
  check(`${route}: heading levels do not skip`, skips === 0, `${skips} skip(s)`);

  /*
    One `main`, and one `h1` inside it.

    Both were being broken on routes this list did not cover. The five review
    modes drew a whole session with no heading, and their `Empty` and finished
    states each carried one, which is exactly why nobody noticed. First run had
    no `main` at all, so the skip link had nothing to skip to and a reader had
    no landmark to jump into on the first screen of the app.
  */
  check(`${route}: has exactly one main landmark`, report.landmarks === 1, `${report.landmarks} found`);
  check(`${route}: has exactly one h1`, report.h1s === 1, `${report.h1s} found`);

  /*
    And a title that says which screen this is. Thirty-four routes shared the
    landing page's line, so two tabs side by side were indistinguishable and a
    history entry said nothing about what it linked to. The landing page is the
    one route whose title is that line.
  */
  check(
    `${route}: names itself in the tab`,
    route === "/welcome" || !report.title.startsWith("Kodukeel."),
    report.title,
  );

  const violations = await axeViolations(page);
  check(`${route}: axe finds nothing`, violations.length === 0, violations.slice(0, 2).join("; "));
}

/*
  And the same sweep in the other theme, which is where it kept biting.

  Light and dark are two palettes, not one palette with a filter over it, so a
  colour that clears the bar in one says nothing about the other. The first
  batch of contrast failures this suite found was entirely in dark mode:
  `--ink-3` on the four soft tints, between 4.07 and 4.45 against a bar of 4.5,
  four near misses that no reading of the token list would show. The second
  batch was entirely in light, on a wash the rail is drawn over. Neither theme
  is the one to check.

  The structural checks above are not repeated: a landmark, a heading and a
  title are the same markup whichever palette is painted over them.
*/
const dark = await browser.newPage({ viewport: { width: 1280, height: 1000 }, colorScheme: "dark" });
for (const route of ROUTES) {
  await dark.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
  await dark.waitForTimeout(200);
  const violations = await axeViolations(dark);
  check(`${route}: axe finds nothing in dark mode either`,
    violations.length === 0, violations.slice(0, 2).join("; "));
}
await dark.close();

// A visible focus ring on the primary action of the review path.
await page.goto(`${BASE}/review/write`, { waitUntil: "networkidle" });
await page.keyboard.press("Tab");
const ring = await page.evaluate(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const s = getComputedStyle(el);
  return { outline: s.outlineStyle, width: s.outlineWidth, shadow: s.boxShadow };
});
check("tabbing reaches a control with a visible focus indicator",
  ring !== null && (ring.outline !== "none" || (ring.shadow && ring.shadow !== "none")),
  JSON.stringify(ring));

// Estonian is marked so it is not read with English phonics.
await page.goto(`${BASE}/review/government`, { waitUntil: "networkidle" });
const langMarked = await page.evaluate(() =>
  document.querySelectorAll("main [lang='et']").length);
check("Estonian text is marked lang=et", langMarked > 0, `${langMarked} elements`);

await browser.close();
done();
