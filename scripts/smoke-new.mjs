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
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = "/tmp/shots";
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

let failures = 0;
const check = (label, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? `  (${extra})` : ""}`);
};

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
  (await page.getByText(/Which case does it take/i).count()) > 0);
// Assert the rule, not three case names. The distractors are drawn from the
// cases the learner's own deck actually governs, so a legitimate round can
// offer inessive, illative, adessive and comitative and name none of the three
// that used to be hard-coded here. That failed about one run in four, on an
// app that was working.
const CASE_NAMES =
  /nominative|genitive|partitive|illative|inessive|elative|allative|adessive|ablative|translative|terminative|essive|abessive|comitative/i;
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

console.log(`\nScreenshots in ${SHOTS}`);
console.log(errors.length ? `\nConsole errors:\n${errors.join("\n")}` : "\nNo console errors.");
console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);

await browser.close();
process.exit(failures === 0 ? 0 : 1);
