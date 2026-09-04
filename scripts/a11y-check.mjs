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
import { gradeButtons, revealAnswer } from "./lib/review.mjs";

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
 *
 * ONE CHARACTER IS STILL TEXT, AND AXE WILL NOT SAY SO.
 *
 * `test-design.mjs` learned this once already: its contrast pass measured a
 * text node only at `length > 1`, so the tick on Today's week strip sat at
 * 2.52:1 unseen by the suite whose job was finding it. That pass was replaced
 * by axe, which is better at everything except this, and the same hole came
 * back through the front door. axe files a one-character run as `incomplete`
 * with `messageKey: "shortTextContent"` — it has *measured* the ratio and
 * declines only to rule on whether a single glyph counts as text content —
 * and a report that reads `violations` alone throws that measurement away.
 *
 * The four grade buttons under every review card are what it was throwing
 * away: their keyboard hints are one digit each, `opacity-60` over an ink the
 * palette had already walked down to just clear the bar, and they measured
 * 2.45 to 2.61 against 4.5 on the busiest screen in the app. The interval
 * above them, being two characters, was reported and failed; the fainter thing
 * beside it was not.
 *
 * So a short run whose measured ratio is under the ratio axe itself expected
 * is a violation here. Two things are still let through, and neither is a
 * length. A node axe could not put a number on stays incomplete, which covers
 * `elmPartiallyObscured` and anything else arriving with `contrastRatio: 0`
 * and no colours: that is a genuine "cannot tell" rather than an answer being
 * withheld. And `data-ornament` is honoured exactly as `test-design.mjs`
 * honours it, because the two suites have to agree about what counts as text:
 * a 92px step numeral in a hue's own tint, behind a card that says the same
 * thing in words, is decoration and the markup says so out loud. `aria-hidden`
 * is not that exemption and never stands in for it, since the tick on the week
 * strip carries `aria-hidden` and is still the thing a sighted reader looks at.
 */
async function axeViolations(page) {
  await page.addScriptTag({ content: AXE });
  const result = await page.evaluate(async () => {
    const run = await window.axe.run(document, {
      // The element itself, so the ornament exemption can be read off the DOM
      // rather than guessed at from a selector string.
      elementRef: true,
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] },
    });
    const short = [];
    for (const rule of run.incomplete) {
      for (const node of rule.nodes) {
        const data = node.any?.find((c) => c.data?.messageKey === "shortTextContent")?.data;
        if (!data) continue;
        // A measurement, not a shrug: axe reports 0 with no colours where it
        // could not resolve a background at all.
        if (!data.fgColor || !data.bgColor || !(data.contrastRatio > 0)) continue;
        const want = parseFloat(String(data.expectedContrastRatio));
        if (!Number.isFinite(want) || !(data.contrastRatio < want)) continue;
        const el = node.element ?? document.querySelector(node.target.at(-1));
        if (el?.closest("[data-ornament], .sr-only")) continue;
        short.push({
          id: rule.id,
          target: node.target,
          detail: `${data.contrastRatio}:1 against ${want}:1, ${data.fgColor} on ${data.bgColor}`,
        });
      }
    }
    return {
      violations: run.violations.map((v) => ({
        id: v.id, impact: v.impact, count: v.nodes.length, target: v.nodes[0]?.target ?? [],
      })),
      short,
    };
  });

  const lines = result.violations.map((v) =>
    `${v.id} (${v.impact}, ${v.count}): ${v.target.join(" ")}`);
  for (const s of result.short) {
    lines.push(`${s.id} (one-character text): ${s.target.join(" ")} at ${s.detail}`);
  }
  return lines;
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
  "/", "/learn", "/practice", "/progress", "/words", "/dictionary",
  "/grammar", "/grammar/inessive", "/settings", "/scan", "/class", "/tutor",
  "/assess", "/assess?take=1", "/exam", "/privacy", "/terms", "/funding", "/offline",
  "/welcome", "/suggestions", "/admin/suggestions",
  "/review", "/review/write", "/review/government", "/review/conjugation", "/review/cloze", "/review/clinic",
  "/review/dictation", "/review/listening", "/review/match", "/review/pairs",
  "/review/sentences", "/review/speaking", "/review/sprint",
  /*
    The rounds and screens the games pass added, which this list did not get.
    That is the fault its own header names: `/review/emoji` and `/review/target`
    shipped, `/sonad` and `/crossword` shipped, and every one of them is a whole
    session rendered from one component, which is exactly the shape that was
    once found drawing a progress bar, a card and four buttons with no heading
    in it at all. A route left out is a screen where the rule is unenforced,
    and a second of wall clock is what it costs to enforce it.
  */
  "/quest", "/sonad", "/crossword", "/calendar", "/dictionary/common",
  "/review/emoji", "/review/target", "/review/flashcards", "/review/describe",
  "/words/mastery",
  /*
    The frequency rounds. `/review/common` is the index and one of its four
    lists stands for the round, which is a whole `ReviewSession` rendered from
    one component: the shape this list's own header says was once found drawing
    a progress bar, a card and four buttons with no heading in it at all.

    One of the four rather than all four, because the group decides which words
    are asked and not how the screen is built, so the other three would be the
    same eight checks over the same markup.
  */
  "/review/common", "/review/common/noun",
  /*
    And the conversations, which is the third time this list has been caught by
    the fault its own header names. A scene is a whole session rendered from one
    component with a log region, a disclosure and a form in it, which is exactly
    the shape that was once found drawing a card and four buttons with no
    heading at all.
  */
  "/situations", "/situations/arsti-aeg",
];

const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });


/*
  Floor: raised by eleven when `/words/mastery` joined the list, which is the
  arithmetic this block describes: one more route is eight checks in the light
  and a contrast pass in the dark. A floor that stays put while the list grows
  is a floor going slack, which is what happened when the level check added
  three routes and nobody moved it.

  Floor: 335, which is what this list reaches: thirty-seven routes at eight
  checks each, a contrast pass over the same thirty-seven in dark mode, and the
  two that run once at the end.

  It was 42 for ten routes, and stayed 42 when the level check added three and
  the exam hub added a fourth, which left it slack by twelve. A floor that never
  complains is a floor low enough to miss the thing it exists for, so it is set
  to the count rather than to a number that happens to pass.
*/
/*
  330 rather than 339, for the reason the containment suite gives at its own
  floor: `/guide` is gone and it was one of the routes this walks. Nine checks,
  counted off the route list rather than off a run.

  And 303 rather than 330: the placement ladder, the homework list and the
  class week were cut as not being learning, three routes at nine checks
  each. The run before the cut counted 335 and the run after it 308, which
  is the same twenty-seven, and the floor keeps the five it always sat under.
*/
/*
  Raised by exactly four: the two-per-theme checks on a graded review card had
  been waived on every run, because `gradeButtons` named four buttons the
  screen stopped drawing. They run now, so the floor rises by the number that
  stopped being skippable rather than by however many the run happens to
  reach.
*/
/*
  And 316: /funding is one more route at nine checks, counted off the list
  rather than off a run.

  And then ten routes rather than one, from two branches at once. This one
  added nine that had shipped without ever being walked here, which is the
  fault the header names, and the first run over them found a real one: the
  crossword promised `role="grid"` over a flat grid with no row elements in
  it, which is `aria-required-children`. The number is measured on the merged
  tree rather than added from either side, for the reason the containment
  suite gives at its own floor: two branches each adding to a count is exactly
  where arithmetic on a number nobody re-ran goes wrong. Measured at 402 on
  the merged tree, which is the 307 above plus nine for /funding and
  eighty-six for these, and the floor keeps the same five under it.

  And then four routes rather than two, from two branches at once: the frequency
  rounds from one and the conversations from the other. Each side measured 420
  with its own two, which is exactly the arithmetic this file warns about two
  paragraphs up, so the merged number is measured on the merged tree rather than
  added from either side. A scene is a whole session rendered from one component
  with a log region, a disclosure and a form in it, which is the shape this
  header exists for, and `/review/common/noun` is the same claim about a round.
  Measured at 438 against a production build, and the floor keeps the same five
  under it.
*/
/*
  And then three routes at once, from two branches that did not know about each
  other: two for the frequency rounds and one for the word mastery lists.
  Measured on the merged tree at 429 rather than added from either side, which
  is what the paragraph above says to do and what neither branch could have
  done on its own: one had 420 and the other 413, and neither number is right.
  The same five of slack under it.

  And once more with the conversations, which is the same arithmetic a third
  time: the scene branch measured 438 with its two routes and without the
  mastery board, main measured 429 with the board and without the scenes, and
  the merged tree is neither sum. Measured at 447 on the merged tree against a
  production build, and the floor keeps the same five under it.
*/
const { check, absent, done } = suite("Accessibility", { floor: 442 });

/*
  OPENING A ROUTE, INCLUDING THE PART THAT IS NOT THE NETWORK.

  `networkidle` says the requests stopped, not that the page is on screen, and
  on a route that fetches audio as it mounts it can resolve while the document
  is still the one being navigated away from. This suite spent a run reporting
  `/review/listening` as having no h1 and as putting an aria attribute on
  `:root`, in dark mode only, which is what axe says about a document that is
  not there yet. Neither was true a second later.

  So the wait is for the landmark every screen in this app has. A route that
  genuinely renders none still reaches axe and fails on its own terms rather
  than on a timeout.
*/
async function open(page, route, settle) {
  await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
  await page.waitForSelector("main", { state: "attached", timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(settle);
}

for (const route of ROUTES) {
  await open(page, route, 300);

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
  await open(dark, route, 200);
  const violations = await axeViolations(dark);
  check(`${route}: axe finds nothing in dark mode either`,
    violations.length === 0, violations.slice(0, 2).join("; "));
}
await dark.close();

/*
  THE STATE A ROUTE DOES NOT ARRIVE IN, AND WHY ONE IS ENOUGH TO MATTER.

  Everything above sweeps a page as it loads, and WCAG exempts a control that
  is inactive: axe skips a disabled button's text on purpose, because nobody
  is being asked to read it. That exemption was doing work nobody had asked it
  to do here. Review's Undo button is `disabled` until a card has been graded,
  which is exactly how every visit to `/review` begins, so its key hint was
  outside this sweep for the whole of the app's life. Grade one card and the
  same node measures 2.57:1 on the light theme and 3.06:1 on the dark, against
  a bar of 4.5.

  So the rule is that a control which is only ever live after somebody has
  done something has to be swept after they have done it. One state rather
  than a matrix: the point is not to enumerate the app, it is that a suite
  which only ever sees arrival states cannot see this class of fault at all,
  and the review screen is where the class lives.

  It grades, which `lib/review.mjs` deliberately does not do for the suites
  that only reveal, so this costs the shared deck one card. That is the whole
  price of the state and it is stated here rather than discovered by whoever
  runs the next suite.
*/
for (const theme of ["light", "dark"]) {
  const graded = await browser.newPage({ viewport: { width: 1280, height: 1000 }, colorScheme: theme });
  await graded.goto(`${BASE}/review`, { waitUntil: "networkidle" });
  await graded.waitForTimeout(300);
  const shape = await revealAnswer(graded);
  const ratings = gradeButtons(graded);
  if (shape && (await ratings.count())) {
    await ratings.first().click();
    await graded.waitForTimeout(1200);
    const live = await graded.evaluate(() => {
      const btn = [...document.querySelectorAll("main button")].find((b) => /Undo/.test(b.textContent));
      return btn ? !btn.disabled : null;
    });
    check(`/review once a card is graded, in ${theme}: the controls a grade unlocks are live`,
      live === true, `Undo disabled: ${live === null ? "no button" : !live}`);
    const violations = await axeViolations(graded);
    check(`/review once a card is graded, in ${theme}: axe finds nothing`,
      violations.length === 0, violations.slice(0, 2).join("; "));
  } else {
    absent(2, `/review with a card graded, in ${theme}: no card offered a grade button, ` +
      "so the controls a grade unlocks were never drawn. Either the deck has nothing due " +
      "(run `npm run demo`) or every card that came up graded itself, which a clean hit does");
  }
  await graded.close();
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
