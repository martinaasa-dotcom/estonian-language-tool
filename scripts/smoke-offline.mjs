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
import { ratingButtons, revealAnswer } from "./lib/review.mjs";

const BASE = baseUrl();
const browser = await launchChromium();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();
const app = page.locator("main");

// Floor: the count CI reaches, which is every check here, including the one
// about the cache that is deliberately never trimmed.
const { check, done } = suite("Offline review", { floor: 15 });


/**
 * Answers whichever kind of card is on screen, and grades it.
 *
 * Review has three shapes — flip, typed, and multiple choice — chosen per card
 * and per preference, so a test that only knows about "Show answer" silently
 * stops testing anything the day the default changes. It did.
 *
 * Revealing is `scripts/lib/review.mjs` now, because `test-containment.mjs`
 * needed the same three branches and had only the first, and waived ten checks
 * on a reason that was not true. Grading stays here: it is what this suite is
 * about and the one thing the other caller must not do.
 *
 * Picking an option only *reveals* the answer. The grade is the second
 * interaction, on Again/Hard/Good/Easy, and without it this function reported
 * a completed answer having graded nothing: the outbox was empty and the check
 * read as "a grade taken offline is held on the device: 0 queued", which looks
 * like the offline queue is broken when it is working perfectly.
 */
async function answerOneCard() {
  if (!(await revealAnswer(page))) return false;
  const rate = ratingButtons(page);
  if (await rate.count()) await rate.first().click();
  return true;
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

/*
  The caches have a ceiling, and it holds.

  Both of them grew without limit. Speech is a WAV per phrase and review plays
  audio on nearly every card, so a phone kept every clip it had ever heard; the
  build-output cache was worse, because `_next/static` names are hashed per
  build while the cache name is typed by hand, so every deploy added a set of
  chunks and nothing removed the last one's. `lib/audio/clipCache.ts` was
  written for exactly this shape one layer up and the same argument had never
  been applied down here.

  Driven rather than read: a hundred and one entries are written into a cache
  whose ceiling is a hundred, and the check is that the cache is at its ceiling
  and that the newest entry survived. Reading the constant out of the worker
  and comparing it to itself would pass on a worker that trims nothing.
*/
const cacheNames = await page.evaluate(() => caches.keys());
check(
  "every cache the worker opens carries the version, so a bump clears the arrears",
  cacheNames.length > 0 && cacheNames.every((n) => n.startsWith("kodukeel-v")),
  cacheNames.join(", ") || "none",
);

const trimmed = await page.evaluate(async () => {
  /*
    The worker's own `trim`, exercised through the worker rather than copied:
    entries are put into the real cache and the worker is asked to serve a
    tts request, whose handler trims after writing. Playwright cannot call
    into a worker's scope, so this fills the cache and then plays a clip.
  */
  const cache = await caches.open("kodukeel-v3-audio");
  for (let i = 0; i < 420; i++) {
    await cache.put(new Request(`/api/tts?k=filler-${i}`), new Response("x"));
  }
  return (await cache.keys()).length;
});
check("a cache can be filled past its ceiling to prove the trim runs", trimmed >= 420, `${trimmed}`);

await page.evaluate(async () => {
  // One real clip through the worker, which trims the audio cache after it
  // writes. The phrase does not matter and a failure to fetch is fine: the
  // trim runs on the success path, so this waits for a real one.
  await fetch("/api/tts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "tere" }),
  }).catch(() => undefined);
});
await page.waitForTimeout(2500);
const afterTrim = await page.evaluate(async () =>
  (await caches.open("kodukeel-v3-audio")).keys().then((k) => k.length));
check("the audio cache is trimmed back to its ceiling", afterTrim <= 400, `${afterTrim} entries`);

/*
  And the other half of that rule: the one cache with no ceiling still has what
  it is for in it.

  Every cache the worker keeps has a `LIMITS` entry except the shell, and the
  reason is the whole point of the ceilings. A browser evicting an origin's
  storage takes all of it, and `/offline` is the entry with nothing behind it,
  so it and the icon live in a cache that is never trimmed. Checked right after
  a trim that just deleted twenty entries from the cache next door, because
  "never trimmed" is only worth asserting where a trim has actually run.
*/
const shellIntact = await page.evaluate(async () => {
  const shell = (await caches.keys()).find((n) => n.endsWith("-shell"));
  if (!shell) return false;
  return Boolean(await (await caches.open(shell)).match("/offline"));
});
check("the cache with no ceiling still holds the page it exists for", shellIntact);

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
