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
  "/welcome", "/suggestions", "/admin/suggestions",
  "/review", "/review/write", "/review/government", "/review/cloze", "/review/clinic",
  "/review/dictation", "/review/listening", "/review/match", "/review/pairs",
  "/review/sentences", "/review/speaking", "/review/sprint",
];

const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

/*
  Contrast, measured in the browser rather than reasoned about in the palette.

  This suite had no contrast check at all, which is the one accessibility
  question a design system cannot answer from its own tokens: what a colour is
  worth depends on what it is sitting on, and this app puts secondary text on
  five different soft tints as readily as on the page. Measuring found the
  answer was not the same on all of them. In dark mode `--ink-3` came in at
  4.07 on butter, 4.08 on mint, 4.29 on accent and 4.45 on peach, all under
  the 4.5 small text needs and none of them visible from the token list.

  Two things are skipped and both are skipped honestly. An `aria-hidden`
  subtree is not text, which is what the enormous step numerals on the landing
  page are: `docs/14-design-system.md` §3 puts them off the type scale on
  purpose and they are ornament behind a card. And an element sitting on a
  gradient is not measurable this way, because `backgroundColor` is
  transparent there and walking past it compares the text to the page behind
  the button rather than to the button. Reporting those as failures was the
  first version of this and it buried the four real ones under eleven that
  were not.
*/
const CONTRAST = `(${(() => {
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(",").map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const bgOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const st = getComputedStyle(n);
      if (st.backgroundImage && st.backgroundImage !== "none") return "gradient";
      const c = parse(st.backgroundColor);
      if (c && c.a > 0.9) return c;
      n = n.parentElement;
    }
    return parse(getComputedStyle(document.body).backgroundColor);
  };
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll("main *")) {
    if (el.closest("[aria-hidden='true']")) continue;
    const text = [...el.childNodes]
      .filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join("");
    if (!text) continue;
    const st = getComputedStyle(el);
    if (st.visibility === "hidden" || st.display === "none" || Number(st.opacity) < 0.1) continue;
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;
    const fg = parse(st.color);
    const bg = bgOf(el);
    if (!fg || !bg || bg === "gradient") continue;
    const eff = fg.a < 1
      ? { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a),
          b: fg.b * fg.a + bg.b * (1 - fg.a) }
      : fg;
    const l1 = lum(eff);
    const l2 = lum(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const size = parseFloat(st.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(st.fontWeight) >= 700);
    const need = large ? 3 : 4.5;
    if (ratio >= need) continue;
    const key = st.color + "|" + st.fontSize + "|" + st.fontWeight;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(st.color + " at " + Math.round(ratio * 100) / 100 + ", needs " + need +
             ' ("' + text.slice(0, 24) + '")');
  }
  return out;
}).toString()})()`;

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

  const lowContrast = await page.evaluate(CONTRAST);
  check(`${route}: every reading of text clears its contrast ratio`,
    lowContrast.length === 0, lowContrast.slice(0, 2).join("; "));
}

/*
  And the same measurement in the other theme, which is where it actually bit.

  Light and dark are two palettes, not one palette with a filter over it, so a
  colour that clears the bar in one says nothing about the other. Every
  contrast failure this check has found so far was in dark mode: `--ink-3` on
  the soft tints came in at 4.07, 4.08, 4.29 and 4.45 against a bar of 4.5,
  four near misses that no reading of the token list would show, because what a
  colour is worth depends on what it is sitting on.

  Contrast only, rather than the whole battery again: names, focus order, alt
  text, landmarks and titles are the same markup in both themes.
*/
const dark = await browser.newPage({ viewport: { width: 1280, height: 1000 }, colorScheme: "dark" });
for (const route of ROUTES) {
  await dark.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
  await dark.waitForTimeout(200);
  const lowContrast = await dark.evaluate(CONTRAST);
  check(`${route}: clears its contrast ratio in dark mode too`,
    lowContrast.length === 0, lowContrast.slice(0, 2).join("; "));
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
