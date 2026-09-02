import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { launchChromium } from "./lib/browser.mjs";
import { baseUrl, suite } from "./lib/checks.mjs";

/**
 * EVERY SCREEN, IN THE STATE A STRANGER INSTALLS INTO.
 *
 * The dictionary seeded and nothing else: no cards, no reviews, no settings,
 * no placement. That is what every learner has for their first five minutes,
 * and it was the one state no suite ran in. The browser suites all run after
 * `scripts/demo-data.ts` lays down two months of history, which is the app as
 * somebody who has used it sees it, and the two states are not the same
 * screens: half of this app is a figure computed from a review log, and on an
 * empty one every panel takes a branch nothing had ever rendered.
 *
 * It is the argument `test-containment.mjs` makes about walking every route
 * rather than a chosen spread, pointed at a state rather than at a width, and
 * the argument CLAUDE.md already makes about running a suite in the state a
 * keyless deployment is in. Two of the faults that found were only ever
 * reachable there.
 *
 * WHAT IT ASKS is deliberately shallow and wide: does the page answer, does it
 * render without a client error, does `main` have something in it, and is
 * there exactly one `h1`. A blank screen and a thrown component are what a
 * first-day state produces, and neither needs a clever assertion to find.
 * `docs/08-ux-ia-a11y.md` §4 says every view owes a reader an empty state; this
 * is the check that one exists at all, and `test-design.mjs` measures whether
 * it is legible.
 *
 * THE ROUTES COME FROM THE FILESYSTEM, not from a list here, for the reason
 * the containment suite gives: a route left out is a screen where the rule is
 * unenforced, and a list somebody maintains is a list that falls behind. A
 * dynamic segment is filled with a value the app can answer for, and one it
 * cannot is still worth walking, because "no such unit" is a screen too.
 *
 * AND IT STATES ITS PRECONDITION RATHER THAN INHERITING IT. Run after the
 * fixture, every check would pass while testing the wrong state entirely, and
 * nothing would say so. That is exactly the shape of the waiver that left the
 * first-run wizard verified by nothing for months. So it asks the app whether
 * the deck is empty and stops if it is not.
 */

const B = baseUrl();
/* Floor: one per route plus the precondition, measured on the 44 routes the
   app has. It moves when a route is added, which is the point. */
const { check, done } = suite("The first day", { floor: 44 });

/** Every `page.tsx` under `app/`, as the URL that reaches it. */
function routes(dir, prefix = "") {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "api") continue;
      out.push(...routes(full, prefix + (entry.startsWith("(") ? "" : `/${entry}`)));
    } else if (entry === "page.tsx") {
      out.push(prefix || "/");
    }
  }
  return out;
}

/* A value each dynamic segment can be answered for, so the walk meets the
   screen rather than the not-found. `[code]` and `[groupId]` have none that
   exists on a fresh install, and the screen that says so is the one a learner
   would reach by mistyping, which is worth rendering too. */
const FILL = {
  "[unitId]": "tervitused", "[level]": "A1", "[id]": "partitive",
  "[caseKey]": "partitive", "[case]": "partitive",
  "[code]": "AAAAAA", "[groupId]": "none",
};

const all = [...new Set(routes(new URL("../app", import.meta.url).pathname))]
  .map((r) => r.replace(/\[[^\]]+\]/g, (m) => FILL[m] ?? "x"))
  .sort();

const browser = await launchChromium();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

await page.goto(`${B}/words`, { waitUntil: "networkidle" });
await page.waitForSelector("main", { timeout: 30000 });
const deck = await page.locator("main").innerText().catch(() => "");
check("the deck really is empty, so this is the state it says it is",
  /No cards yet/i.test(deck),
  /No cards yet/i.test(deck) ? "" :
    "run this before scripts/demo-data.ts; a deck with cards is a different app");
if (!/No cards yet/i.test(deck)) {
  console.error("\nRefusing to go on: every check below would pass against the wrong state.");
  done();
}

for (const route of all) {
  const errors = [];
  const onError = (e) => errors.push(String(e).slice(0, 140));
  page.on("pageerror", onError);
  let status = 0;
  let text = "";
  let headings = 0;
  try {
    const res = await page.goto(`${B}${route}`, { waitUntil: "networkidle", timeout: 25000 });
    status = res?.status() ?? 0;
    /*
      WAITED FOR, NOT SAMPLED, and this is the whole of what makes the suite
      worth running. Several of these routes redirect, `/` to the wizard and
      `/exam/A1` to a seeded paper, and measuring mid-flight reads an empty
      document and reports the destination's own render as a blank screen. A
      fixed delay is the same bet with a different number: 500ms held against a
      warm server and lost four routes against one that had just started, which
      is exactly the state this suite runs in, first, before anything else has
      touched the app.

      So it waits for the element it is about to measure.
    */
    await page.waitForSelector("main", { timeout: 25000 });
    await page.waitForTimeout(200);
    text = (await page.locator("main").first().innerText()).replace(/\s+/g, " ").trim();
    headings = await page.locator("h1").count();
  } catch (error) {
    check(`${route} answers on a fresh install`, false, String(error).slice(0, 90));
    page.off("pageerror", onError);
    continue;
  }
  page.off("pageerror", onError);

  const ok = status < 400 && text.length >= 40 && headings === 1 && errors.length === 0;
  check(
    `${route} answers on a fresh install`,
    ok,
    ok ? "" :
      status >= 400 ? `HTTP ${status}`
      : errors.length ? errors[0]
      : headings !== 1 ? `${headings} h1 elements`
      : `main holds ${text.length} characters: "${text.slice(0, 60)}"`,
  );
}

await browser.close();
done();
