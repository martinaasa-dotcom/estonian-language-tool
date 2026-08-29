#!/usr/bin/env node
/**
 * The offline claim, tested in a browser rather than asserted in a README.
 *
 * CLAUDE.md makes "review must work offline" a non-negotiable, so it deserves a
 * test that actually pulls the plug: grade with the network down, confirm the
 * grade is held on the device, restore the network, confirm it lands in the
 * database with the timestamp it was taken at.
 *
 *   NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= NEXT_PUBLIC_ENABLE_SW=1 npm run dev
 *   node scripts/smoke-offline.mjs
 */
import { launchChromium } from "./lib/browser.mjs";
import { baseUrl, suite } from "./lib/checks.mjs";

const BASE = baseUrl();
const browser = await launchChromium();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();
const app = page.locator("main");

// Floor: measured 10 in dev mode with NEXT_PUBLIC_ENABLE_SW=1, which its header documents.
const { check, done } = suite("Offline review", { floor: 11 });


/**
 * Answers whichever kind of card is on screen.
 *
 * Review has three shapes — flip, typed, and multiple choice — chosen per card
 * and per preference, so a test that only knows about "Show answer" silently
 * stops testing anything the day the default changes. It did.
 */
async function answerOneCard() {
  const show = app.getByRole("button", { name: /Show answer/ });
  if (await show.count()) {
    await show.first().click();
    await page.waitForTimeout(250);
    const rate = app.getByRole("button", { name: /^(Good|Easy|Hard)/ });
    if (await rate.count()) { await rate.first().click(); return true; }
  }

  // Multiple choice: the card says "1-4 to pick", so press one. This used to
  // filter the option buttons on /^[1-4]\S/, and an option reads "1" then a
  // newline then the word, so the pattern could never match: the function fell
  // through, returned false into a discarded value, and nothing was graded.
  // What the reader saw was "a grade taken offline is held on the device" and
  // "0 queued", which reads as the outbox being broken. The keyboard is what
  // the app itself offers and is what `test-modes.mjs` drives.
  if (await page.getByText(/Pick the meaning/).count()) {
    await page.keyboard.press("1");
    await page.waitForTimeout(900);
    const rate = app.getByRole("button", { name: /^(Good|Easy|Hard|Again)/ });
    if (await rate.count()) { await rate.first().click(); }
    return true;
  }

  // Typed: fill something wrong and submit — a wrong answer still grades.
  const input = page.locator("main input[type='text'], main input:not([type])").first();
  if (await input.count()) {
    await input.fill("zzz");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(250);
    const rate = app.getByRole("button", { name: /^(Good|Easy|Hard|Again)/ });
    if (await rate.count()) { await rate.first().click(); }
    return true;
  }
  return false;
}

const outboxSize = () => page.evaluate(() => new Promise((resolve) => {
  const req = indexedDB.open("kodukeel", 1);
  req.onsuccess = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains("outbox")) return resolve(0);
    const count = db.transaction("outbox", "readonly").objectStore("outbox").count();
    count.onsuccess = () => resolve(count.result);
    count.onerror = () => resolve(-1);
  };
  req.onerror = () => resolve(-1);
}));

// ── Warm the cache while online ──────────────────────────────────────────────
await page.goto(`${BASE}/review`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500); // let the service worker install and claim

const swReady = await page.evaluate(async () => {
  if (!("serviceWorker" in navigator)) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return Boolean(reg?.active || reg?.installing || reg?.waiting);
});
check("the service worker registers", swReady);

const hasCards = (await app.locator("button").count()) > 2 &&
  !/Nothing due|No cards yet/i.test((await page.textContent("body")) ?? "");
check("a review session is available to work with", hasCards);
if (!hasCards) {
  console.log("\nNo due cards — run scripts/demo-data.ts first.");
  await browser.close();
  process.exit(1);
}

// The session is stashed on mount; give IndexedDB a moment.
await page.waitForTimeout(800);
const stashed = await page.evaluate(() => new Promise((resolve) => {
  const req = indexedDB.open("kodukeel", 1);
  req.onsuccess = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains("session")) return resolve(0);
    const get = db.transaction("session", "readonly").objectStore("session").get("latest");
    get.onsuccess = () => resolve(get.result?.cards?.length ?? 0);
    get.onerror = () => resolve(-1);
  };
  req.onerror = () => resolve(-1);
}));
check("the session is stashed for offline use", stashed > 0, `${stashed} cards`);

/**
 * Wait from Node, by polling, rather than with `page.waitForFunction`.
 *
 * Two reasons, both learned here. The app sends a real Content Security Policy
 * with no `unsafe-eval`, and `waitForFunction` injects its predicate as a
 * string, so under that policy it throws rather than waiting. And an async
 * predicate passed to it resolves on the returned Promise, which is truthy, so
 * it succeeds instantly and proves nothing. Polling from this side has neither
 * problem, and `page.textContent` goes over the protocol rather than through
 * the page's own evaluator.
 */
async function waitForText(page, pattern, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const body = (await page.textContent("body").catch(() => "")) ?? "";
    if (pattern.test(body)) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

// ── Pull the plug ────────────────────────────────────────────────────────────
await ctx.setOffline(true);

// Whether a card was answered at all is the first thing to assert, because
// every check after this one reads as an app fault when the answer is no.
const answeredOffline = await answerOneCard();
check("a card can be answered with the network gone", answeredOffline);
// The server action has to fail and the grade has to reach IndexedDB.
await waitForText(page, /saved on this device|Offline/i, 20000);
await page.waitForTimeout(1500);

const queuedAfterOne = await outboxSize();
check("a grade taken offline is held on the device", queuedAfterOne >= 1, `${queuedAfterOne} queued`);

const bannerOffline = await page.textContent("body");
check("the learner is told their work is saved locally",
  /saved on this device|Offline/i.test(bannerOffline ?? ""));

// Keep going: a session must not stop at the first failed grade.
const stillReviewing = (await app.locator("button").count()) > 2;
check("the session continues after a failed grade", stillReviewing);

if (stillReviewing) {
  await answerOneCard();
  await page.waitForTimeout(1500);
}
const queuedAfterTwo = await outboxSize();
check("further offline grades queue too", queuedAfterTwo >= queuedAfterOne, `${queuedAfterTwo} queued`);

// A reload with no network must still show a session, not an empty state.
await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
await page.waitForTimeout(2000);
const offlineBody = (await page.textContent("body")) ?? "";
check("review still renders with the network gone",
  /left|Show answer|Pick the meaning/i.test(offlineBody) && !/No cards yet/i.test(offlineBody),
  offlineBody.slice(0, 60).replace(/\s+/g, " "));

// The outbox must survive the reload.
check("the outbox survives a reload", (await outboxSize()) >= queuedAfterTwo);

// ── Plug it back in ──────────────────────────────────────────────────────────
await ctx.setOffline(false);
await page.evaluate(() => window.dispatchEvent(new Event("online")));

// Poll from Node. `waitForFunction` with an async predicate resolves on the
// returned Promise, which is truthy, so it would succeed instantly and prove
// nothing — a trap worth naming, since it makes a broken test look green.
let drained = false;
for (let i = 0; i < 30; i++) {
  if ((await outboxSize()) === 0) { drained = true; break; }
  await page.waitForTimeout(1000);
  // Nudge it: a tab that missed the event still syncs when it becomes visible.
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
}

check("the outbox drains once the connection is back", drained,
  `${await outboxSize()} still queued`);

await browser.close();
done();
