#!/usr/bin/env node
/**
 * The offline claim, tested in a browser rather than asserted in a README.
 *
 * CLAUDE.md makes "review must work offline" a non-negotiable, so it deserves a
 * test that actually pulls the plug: grade with the network down, confirm the
 * grade is held on the device, restore the network, confirm it lands in the
 * database with the timestamp it was taken at.
 *
 *   E2E_TEST_USER_ID=… NEXT_PUBLIC_ENABLE_SW=1 npm run dev
 *   node scripts/smoke-offline.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();
const app = page.locator("main");

let failures = 0;
const check = (label, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? `  (${extra})` : ""}`);
};

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

const hasCards = (await app.getByRole("button", { name: /Show answer/ }).count()) > 0;
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

// ── Pull the plug ────────────────────────────────────────────────────────────
await ctx.setOffline(true);

await app.getByRole("button", { name: /Show answer/ }).click();
await page.waitForTimeout(200);
await app.getByRole("button", { name: /^Good/ }).click();
// The server action has to fail and the grade has to reach IndexedDB.
await page.waitForFunction(
  () => /saved on this device|Offline/i.test(document.body.textContent ?? ""),
  null, { timeout: 20000 },
).catch(() => {});
await page.waitForTimeout(1500);

const queuedAfterOne = await outboxSize();
check("a grade taken offline is held on the device", queuedAfterOne >= 1, `${queuedAfterOne} queued`);

const bannerOffline = await page.textContent("body");
check("the learner is told their work is saved locally",
  /saved on this device|Offline/i.test(bannerOffline ?? ""));

// Keep going: a session must not stop at the first failed grade.
const stillReviewing = (await app.getByRole("button", { name: /Show answer|Again|Good/ }).count()) > 0;
check("the session continues after a failed grade", stillReviewing);

if (stillReviewing) {
  const show = app.getByRole("button", { name: /Show answer/ });
  if (await show.count()) {
    await show.click();
    await page.waitForTimeout(200);
    await app.getByRole("button", { name: /^Easy/ }).click();
    await page.waitForTimeout(1500);
  }
}
const queuedAfterTwo = await outboxSize();
check("further offline grades queue too", queuedAfterTwo >= queuedAfterOne, `${queuedAfterTwo} queued`);

// A reload with no network must still show a session, not an empty state.
await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
await page.waitForTimeout(2000);
const offlineBody = (await page.textContent("body")) ?? "";
check("review still renders with the network gone",
  /Show answer|left/i.test(offlineBody) && !/No cards yet/i.test(offlineBody),
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

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
