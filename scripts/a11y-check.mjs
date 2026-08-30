#!/usr/bin/env node
/**
 * Accessibility checks against the rules this project actually set itself:
 * every interactive element keyboard-reachable with a visible focus ring, and
 * Estonian text marked `lang="et"` so a screen reader does not read it with
 * English phonics.
 *
 * Not a substitute for axe — it is the subset the codebase promised, checked on
 * the pages this branch added, where a promise is easiest to forget.
 */
import { launchChromium } from "./lib/browser.mjs";
import { baseUrl, suite } from "./lib/checks.mjs";

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
  "/welcome",
  "/review", "/review/write", "/review/government", "/review/cloze", "/review/clinic",
  "/review/dictation", "/review/listening", "/review/match", "/review/pairs",
  "/review/sentences", "/review/speaking", "/review/sprint",
];

const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

/*
  Floor: 247, which is what this list reaches: thirty-five routes at seven
  checks each, plus the two that run once at the end.

  It was 42 for ten routes, and stayed 42 when the level check added three and
  the exam hub added a fourth, which left it slack by twelve. A floor that never
  complains is a floor low enough to miss the thing it exists for, so it is set
  to the count rather than to a number that happens to pass.
*/
const { check, done } = suite("Accessibility", { floor: 247 });

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

      // A tabindex of -1 on something clickable means keyboard users cannot reach it.
      if (el.getAttribute("tabindex") === "-1") bad.noFocusRing.push(el.tagName);
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
}

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
