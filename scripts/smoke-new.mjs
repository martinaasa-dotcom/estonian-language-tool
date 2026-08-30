#!/usr/bin/env node
/**
 * Walks the routes added in this branch and reports what actually renders.
 *
 * Compiling is not working. Every check below is something that would still
 * typecheck while being broken on screen: an empty state where there should be
 * content, a crashed boundary, a console error, a nav that overflows a phone.
 *
 * Run the dev server with no Supabase keys — that is local single-learner mode
 * (ADR-013), which is what makes a browser suite possible without driving a
 * Google sign-in from Playwright.
 *
 *   NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= npm run dev
 *   node scripts/smoke-new.mjs
 */
import { mkdirSync } from "node:fs";
import { launchChromium } from "./lib/browser.mjs";
import { baseUrl, suite } from "./lib/checks.mjs";

const BASE = baseUrl();
const SHOTS = "/tmp/shots";
mkdirSync(SHOTS, { recursive: true });

const browser = await launchChromium();

/*
  Floor: 45 before the navigation checks below, plus the seven they add, plus
  the five the travelling marker adds. This box reaches 59 against a seeded
  database, so the two above the floor are the ones gated on the deck holding
  enough to build a government drill and a minimal pair, which a thin database
  does not.
*/
const { check, done } = suite("The new routes, rendered", { floor: 58 });

const ROUTES = [
  ["/", "today"],
  ["/practice", "practice"],
  ["/learn", "learn"],
  ["/grammar", "grammar"],
  ["/progress", "progress"],
  ["/review/write", "write"],
  ["/review/government", "government"],
  ["/review/pairs", "pairs"],
  ["/review/cloze", "cloze"],
  ["/review/clinic", "clinic"],
  ["/words", "words"],
  ["/scan", "scan"],
  ["/week", "week"],
  ["/settings", "settings"],
  ["/privacy", "privacy"],
  ["/terms", "terms"],
];

const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(`${page.url()} :: ${e}`));
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const text = m.text();
  // Fonts and favicons are fetched from the network, which this box does not have.
  if (/fonts\.g|favicon|Failed to load resource/i.test(text)) return;
  errors.push(`${page.url()} :: ${text}`);
});

for (const [route, name] of ROUTES) {
  const before = errors.length;
  const res = await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(400);

  const status = res?.status() ?? 0;
  const body = await page.textContent("body");
  const crashed = /did not load|could not start|Application error/i.test(body ?? "");
  const redirected = new URL(page.url()).pathname.startsWith("/sign-in");

  check(
    `${route} renders`,
    status < 400 && !crashed && !redirected && (body ?? "").length > 200,
    `status ${status}${crashed ? ", error boundary" : ""}${redirected ? ", bounced to sign-in" : ""}`,
  );
  check(`${route} has no console errors`, errors.length === before,
    errors.slice(before).join(" | ").slice(0, 200));

  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

// ── Content checks: the empty state is the failure mode that still "renders" ──

await page.goto(`${BASE}/review/government`, { waitUntil: "networkidle" });
check("government drill has real questions",
  (await page.getByText(/Which question does it answer/i).count()) > 0);
// Assert the rule, not three case names. The distractors are drawn from the
// cases the learner's own deck actually governs, so a legitimate round can
// offer four cases and name none of the three that used to be hard-coded here.
// That failed about one run in four, on an app that was working. Estonian
// names, because that is what the buttons say now: a case is offered by the
// question it answers and the name a class gives it, never by the Latin one.
const CASE_NAMES =
  /nimetav|omastav|osastav|sisseütlev|seesütlev|seestütlev|alaleütlev|alalütlev|alaltütlev|saav|rajav|olev|ilmaütlev|kaasaütlev/i;
check("government drill offers case options",
  (await page.getByRole("button", { name: CASE_NAMES }).count()) >= 3);

await page.goto(`${BASE}/review/pairs`, { waitUntil: "networkidle" });
const pairsBody = await page.textContent("body");
check("minimal pairs found real contrasts in the dictionary",
  !/No length contrasts/i.test(pairsBody ?? ""));

await page.goto(`${BASE}/review/write`, { waitUntil: "networkidle" });
check("writing exercise names a case to produce",
  (await page.getByText(/Use\s/i).count()) > 0);
check("writing exercise has an input", (await page.locator("#sentence").count()) === 1);

await page.goto(`${BASE}/words`, { waitUntil: "networkidle" });
const wordsBody = await page.textContent("body");
check("diagnosis panel is present", /Diagnosis/i.test(wordsBody ?? ""));

await page.goto(`${BASE}/review/clinic`, { waitUntil: "networkidle" });
const clinicBody = await page.textContent("body");
check("clinic renders leeches or an honest empty state",
  /lapses/i.test(clinicBody ?? "") || /No leeches/i.test(clinicBody ?? ""));

// ── The week spine ───────────────────────────────────────────────────────────
await page.goto(`${BASE}/week`, { waitUntil: "networkidle" });
check("/week redirects to a numbered week", /\/week\/\d+/.test(page.url()), page.url());

// ── PWA wiring ───────────────────────────────────────────────────────────────
const manifest = await page.goto(`${BASE}/manifest.webmanifest`);
check("manifest is served", manifest?.status() === 200);
const sw = await page.goto(`${BASE}/sw.js`);
check("service worker is served", sw?.status() === 200);
const offline = await page.goto(`${BASE}/offline`);
check("offline page is served", offline?.status() === 200);

// ── Mobile: no sideways scroll, which CLAUDE.md makes a rule ────────────────
const phone = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
});
const mobile = await phone.newPage();

for (const [route, name] of [["/", "today"], ["/review/write", "write"], ["/week", "week"]]) {
  await mobile.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
  await mobile.waitForTimeout(300);
  const overflow = await mobile.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${route} does not scroll sideways on a phone`, overflow <= 1, `${overflow}px over`);
  await mobile.screenshot({ path: `${SHOTS}/mobile-${name}.png`, fullPage: true });
}

// The bottom bar carries several items; check the labels still fit their cells.
await mobile.goto(`${BASE}/`, { waitUntil: "networkidle" });
const navOverflow = await mobile.evaluate(() => {
  const bar = document.querySelector("nav.fixed");
  if (!bar) return -1;
  return [...bar.querySelectorAll("a")].filter((a) => a.scrollWidth > a.clientWidth + 1).length;
});
check("mobile nav labels fit their cells", navOverflow === 0, `${navOverflow} clipped`);

/*
  Nothing in the navigation is only reachable by remembering it.

  The rail used to promote four destinations and hide twelve behind a button
  marked "More", whose "Less" did nothing at all on any page inside the group:
  `showRest` was `railOpen || secondaryActive`, the click flipped the first
  half and the second held it open. The answer was sections rather than a
  better toggle, and this is what says so out loud.

  Written without a copy of the table on purpose. It asks the two questions
  that stay true whatever gets added: the rail draws its links with nothing to
  open, and a phone can reach every place a desktop can. A check that listed
  the destinations here would be the fifth copy of the list this branch spent
  its time deleting.
*/
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
const rail = await page.evaluate(() => {
  const nav = [...document.querySelectorAll('nav[aria-label="Main"]')]
    .find((n) => getComputedStyle(n).display !== "none");
  if (!nav) return null;
  return {
    links: [...nav.querySelectorAll("a")]
      .filter((a) => a.getBoundingClientRect().width > 0)
      .map((a) => a.getAttribute("href")),
    headings: [...nav.querySelectorAll("h2")].map((h) => h.textContent.trim()),
    // A control that decides which links exist. The bug was one of these.
    toggles: nav.querySelectorAll("button[aria-expanded]").length,
  };
});
check("the desktop rail is drawn", rail !== null);
if (rail) {
  check("the rail shows its links with nothing to open first",
    rail.toggles === 0, `${rail.toggles} disclosures in the rail`);
  check("the rail groups what it shows under headings",
    rail.headings.length >= 4, `${rail.headings.length} headings`);
  // Sanity on the count: four sections of three or four, plus settings and the
  // guide. Anything near the four the rail used to lead with is a regression.
  check("the rail shows the whole app", rail.links.length >= 14, `${rail.links.length} links`);
}

// The phone cannot show sixteen links at once, so it shows them under the same
// headings behind one button. Same map, less room, and nothing lost.
await mobile.goto(`${BASE}/`, { waitUntil: "networkidle" });
await mobile.getByRole("button", { name: "More" }).click();
const sheet = await mobile.evaluate(() => {
  const dialog = document.querySelector('[role="dialog"]');
  const bar = [...document.querySelectorAll("nav.fixed a")].map((a) => a.getAttribute("href"));
  if (!dialog) return null;
  return {
    reachable: [...bar, ...[...dialog.querySelectorAll("a")].map((a) => a.getAttribute("href"))],
    headings: [...dialog.querySelectorAll("h3")].map((h) => h.textContent.trim()),
  };
});
check("the phone sheet opens", sheet !== null);
if (sheet && rail) {
  const missing = rail.links.filter((href) => !sheet.reachable.includes(href));
  check("a phone reaches every place a desktop does", missing.length === 0, missing.join(", "));
  check("the sheet groups what it holds", sheet.headings.length >= 4, `${sheet.headings.length} headings`);
}

/*
  THE MARKER: ONE PILL THAT TRAVELS, RATHER THAN A ROW LIGHTING UP AS ANOTHER
  GOES OUT.

  Written in a browser because none of it is visible to a source check. The
  pane is placed by measuring, so the questions that matter are whether it
  lands on the row it is meant to be under, whether it leaves on the press
  rather than on the page, and whether the row still carries its own card in
  the window before any of that can have run. The last one is not theoretical:
  a marker cannot be placed on a server, and every hard load paints once
  before it is.
*/
await page.goto(`${BASE}/grammar`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
const marker = await page.evaluate(() => {
  const nav = document.querySelector('nav[aria-label="Main"]');
  const pane = nav?.querySelector(".nav-marker");
  const cell = nav?.querySelector("[data-nav-on]");
  if (!pane || !cell) return null;
  const p = pane.getBoundingClientRect();
  const c = cell.getBoundingClientRect();
  return {
    row: cell.getAttribute("href"),
    off: Math.max(Math.abs(p.top - c.top), Math.abs(p.left - c.left),
                  Math.abs(p.width - c.width), Math.abs(p.height - c.height)),
    painted: getComputedStyle(pane).backgroundColor,
  };
});
check("the marker sits on the row you are on", marker !== null && marker.off <= 1,
  marker ? `${marker.row}, out by ${marker.off.toFixed(1)}px` : "no marker");

const was = page.url();
const aimed = await page.evaluate(async () => {
  const nav = document.querySelector('nav[aria-label="Main"]');
  const pane = nav.querySelector(".nav-marker");
  const to = [...nav.querySelectorAll("[data-nav-goes]")]
    .find((c) => c.getAttribute("href") === "/settings");
  const from = pane.getBoundingClientRect().top;
  const distance = to.getBoundingClientRect().top - from;
  to.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" }));
  /*
    A press and nothing else: no click, so nothing navigates, and the marker
    has only the bet to go on. Halfway through the travel it should be most of
    the way there, since the curve spends nearly all of its distance early.
  */
  await new Promise((r) => setTimeout(r, 130));
  const gone = pane.getBoundingClientRect().top - from;
  return { covered: Math.round((gone / distance) * 100), stretched: Math.round(pane.getBoundingClientRect().height) };
});
check("the marker leaves on the press, not on the page",
  aimed.covered > 40 && page.url() === was,
  `${aimed.covered}% of the way there 130ms after pointerdown, still on ${page.url().replace(BASE, "")}`);
check("and it stretches across the ground it covers", aimed.stretched > 60,
  `${aimed.stretched}px tall mid-travel, against a 40px row`);

const still = await browser.newContext({ viewport: { width: 1280, height: 1000 }, reducedMotion: "reduce" });
const calm = await still.newPage();
await calm.goto(`${BASE}/`, { waitUntil: "networkidle" });
await calm.waitForTimeout(400);
const arrived = await calm.evaluate(async () => {
  const nav = document.querySelector('nav[aria-label="Main"]');
  const pane = nav.querySelector(".nav-marker");
  const to = [...nav.querySelectorAll("[data-nav-goes]")]
    .find((c) => c.getAttribute("href") === "/settings");
  to.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" }));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return {
    onto: Math.round(pane.getBoundingClientRect().top - to.getBoundingClientRect().top),
    running: pane.getAnimations().length,
  };
});
check("under reduced motion it arrives rather than travels",
  arrived.running === 0 && Math.abs(arrived.onto) <= 1,
  `${arrived.running} animations, out by ${arrived.onto}px`);

const flat = await browser.newContext({ viewport: { width: 1280, height: 1000 }, javaScriptEnabled: false });
const unscripted = await flat.newPage();
await unscripted.goto(`${BASE}/grammar`, { waitUntil: "domcontentloaded" });
const fallback = await unscripted.evaluate(() => {
  const cell = document.querySelector('nav[aria-label="Main"] [data-nav-on]');
  if (!cell) return null;
  const seen = getComputedStyle(cell);
  return { background: seen.backgroundColor, shadow: seen.boxShadow };
});
check("the row you are on is marked before any of that has run",
  fallback !== null && !/rgba\(0, 0, 0, 0\)|transparent/.test(fallback.background),
  fallback ? fallback.background : "no row marked");

const barMark = await mobile.evaluate(() => {
  const nav = [...document.querySelectorAll('nav[aria-label="Main"]')]
    .find((n) => getComputedStyle(n).display !== "none");
  const pane = nav?.querySelector(".nav-marker");
  const cell = nav?.querySelector("[data-nav-on]");
  if (!pane || !cell) return null;
  const p = pane.getBoundingClientRect();
  const c = cell.getBoundingClientRect();
  return Math.max(Math.abs(p.left - c.left), Math.abs(p.width - c.width));
});
check("the phone bar marks the cell you are on too", barMark !== null && barMark <= 1,
  barMark === null ? "no marker" : `out by ${barMark.toFixed(1)}px`);

console.log(`\nScreenshots in ${SHOTS}`);
console.log(errors.length ? `\nConsole errors:\n${errors.join("\n")}` : "\nNo console errors.");

await browser.close();
done();
