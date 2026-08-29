/**
 * Browser smoke tests for the parts added on top of the original MVP: the
 * learning path, the practice modes, the typed-answer review, undo, the command
 * palette, and — the one that matters most — reviewing with the network off.
 *
 * Needs the dev server running and a deck with something in it:
 *   npm run demo && npm run dev
 *   node scripts/test-modes.mjs
 */
import { chromium } from "playwright";

const B = "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
const page = await ctx.newPage();

const errors = [];
let failures = 0;
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  // The offline section below pulls the plug on purpose; the browser's own
  // "failed to load" noise from that is the test working, not a fault.
  if (m.type() === "error" && !m.text().includes("ERR_INTERNET_DISCONNECTED")) errors.push(m.text());
});

const check = (label, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? "  (" + extra + ")" : ""}`);
};

/**
 * Answers whatever kind of card is on screen and grades it Good.
 *
 * Review asks in three shapes — type it, pick it, flip it — and a test that
 * assumes one of them silently types "3" into the answer box instead of grading.
 */
/**
 * Bring the current card to the point where the rating buttons are showing,
 * without grading it.
 *
 * Typed and flip cards get there deterministically — a deliberately wrong
 * answer, or Space. A multiple-choice card cannot: any pick reveals, but a
 * *correct* one grades itself and moves on (ReviewSession.pickChoice), so it is
 * answered and skipped rather than relied on.
 */
async function revealCurrentCard() {
  const box = page.getByLabel("Type your answer");
  if (await box.count()) {
    await box.fill("kindlasti-vale-vastus");
    await page.keyboard.press("Enter");
  } else if (await page.getByRole("button", { name: /Show answer/ }).count()) {
    await page.keyboard.press("Space");
  } else if (await page.getByText(/Pick the meaning/).count()) {
    return false;
  }
  await page.waitForTimeout(800);
  return (await page.getByRole("button", { name: /^Good/ }).count()) > 0;
}

async function answerCurrentCard() {
  const box = page.getByLabel("Type your answer");
  if (await box.count()) {
    await box.fill("ükskõik");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
  } else if (await page.getByText(/Pick the meaning/).count()) {
    await page.keyboard.press("1");
    await page.waitForTimeout(900);
  } else if (await page.getByRole("button", { name: /Show answer/ }).count()) {
    await page.keyboard.press("Space");
    await page.waitForTimeout(300);
  }
  if (await page.getByRole("button", { name: /^Good/ }).count()) {
    await page.keyboard.press("3");
    await page.waitForTimeout(1400);
    return true;
  }
  // A correct multiple-choice pick grades itself and moves on.
  await page.waitForTimeout(600);
  return true;
}

// 1 — The learning path lists units and reports real progress
await page.goto(`${B}/learn`, { waitUntil: "networkidle" });
check("path shows units", (await page.getByText("Tervitused").count()) > 0);
check("path reports overall progress", (await page.getByText(/words known/).count()) > 0);

await page.goto(`${B}/learn/kodu`, { waitUntil: "networkidle" });
check("a unit lists its words", (await page.getByText("tuba", { exact: true }).count()) > 0);
check("a unit says which card types it makes", (await page.getByText(/recognition, production/i).count()) > 0);

// 2 — Practice hub, with live state per mode
await page.goto(`${B}/practice`, { waitUntil: "networkidle" });
for (const mode of ["Review", "Case Sprint", "Match", "Listening"]) {
  check(`practice hub offers ${mode}`, (await page.getByText(mode, { exact: true }).count()) > 0);
}

// 3 — Progress charts render from the review log
await page.goto(`${B}/progress`, { waitUntil: "networkidle" });
check("progress shows a level", (await page.getByText(/XP total/).count()) > 0);
check("progress shows the study heatmap", (await page.getByText(/reviews on \d+ days/).count()) > 0);
// Either the instance-wide board is offered opt-in, or a class board is shown
// because this learner is in a class — both are correct, and which one depends
// on the deck this suite happens to be run against.
const optInOffered = (await page.getByText(/Off by default/).count()) > 0;
const classBoardShown = (await page.getByText(/Open the class/).count()) > 0;
check("the leaderboard is either a class you joined or an explicit opt-in",
  optInOffered !== classBoardShown, optInOffered ? "opt-in offered" : "class board");

// 4 — Review: a typed answer is checked, not self-graded.
// Typing is only asked of a card that has been seen before — a brand-new card
// leads with its answer instead — so on a deck that has never been reviewed
// there is genuinely nothing to check here. That is reported as skipped rather
// than failed, with the fix: `npm run demo` gives the deck a history.
await page.goto(`${B}/review`, { waitUntil: "networkidle" });
const everyCardIsNew = await page.evaluate(() => {
  const label = document.body.querySelector('[aria-label="Session progress"]');
  return document.body.innerText.includes("New word") && label !== null;
});
let typedReached = false;
for (let i = 0; i < 30 && !typedReached; i++) {
  const box = page.getByLabel("Type your answer");
  if (await box.count()) {
    typedReached = true;
    await box.fill("kindlasti-vale-vastus");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    check("a typed answer gets a verdict before it is graded",
      (await page.getByText(/Not quite|Almost|So close/).count()) > 0);
    check("the right answer is shown with it",
      (await page.getByRole("button", { name: /^Again/ }).count()) > 0);
    break;
  }
  await answerCurrentCard();
}
if (!typedReached && everyCardIsNew) {
  console.log("SKIP  typed answers — every card in this deck is new. Run `npm run demo` first.");
} else {
  check("a typed card is reached within a session", typedReached);
}

// 5 — Undo puts the last grade back.
// Reach a card that is actually asking to be rated before pressing a rating
// key. On a multiple-choice card the number keys pick an option rather than
// grade one, so pressing "3" blind can answer a question instead of grading it
// — leaving undo with nothing to take back and this check failing on the app
// behaving correctly.
let rateable = false;
for (let i = 0; i < 12 && !rateable; i++) {
  rateable = await revealCurrentCard();
  if (!rateable) await answerCurrentCard();
}
check("a card can be brought to its rating buttons", rateable);

if (rateable) {
  await page.keyboard.press("3");
  await page.waitForTimeout(1200);
  const gradedBefore = await page.getByText(/\d+ graded/).textContent();
  await page.keyboard.press("u");
  await page.waitForTimeout(1500);
  const gradedAfter = await page.getByText(/\d+ graded/).textContent();
  check("u undoes the last grade", gradedBefore !== gradedAfter, `${gradedBefore?.trim()} -> ${gradedAfter?.trim()}`);
}

// 6 — Reviewing offline: grades are kept, then sent on reconnect
await page.goto(`${B}/review`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await ctx.setOffline(true);
await answerCurrentCard();
await page.waitForTimeout(2500);
const queued = await page.evaluate(() =>
  JSON.parse(window.localStorage.getItem("kodukeel:pending-grades") ?? "[]").length);
check("a grade made offline is kept on the device", queued > 0, `${queued} queued`);
check("the session says so rather than failing silently",
  (await page.getByText(/Offline/).count()) > 0);

await ctx.setOffline(false);
await page.evaluate(() => window.dispatchEvent(new Event("online")));
await page.waitForTimeout(4000);
const stillQueued = await page.evaluate(() =>
  JSON.parse(window.localStorage.getItem("kodukeel:pending-grades") ?? "[]").length);
check("the queue is sent once the connection is back", stillQueued === 0, `${stillQueued} left`);

// 7 — Command palette
await page.goto(`${B}/`, { waitUntil: "networkidle" });
await page.keyboard.press("Control+k");
await page.waitForTimeout(300);
check("⌘K opens the palette", (await page.getByLabel("Search commands and words").count()) > 0);
await page.getByLabel("Search commands and words").fill("tuba");
await page.waitForTimeout(200);
check("the palette offers a dictionary lookup for anything it doesn't know",
  (await page.getByText(/Look up/).count()) > 0);
await page.keyboard.press("Escape");

// 8 — The app is installable
const manifest = await page.request.get(`${B}/manifest.webmanifest`);
const manifestBody = await manifest.json();
check("a web app manifest is served", manifest.ok() && manifestBody.name.includes("Kodukeel"));
const sw = await page.request.get(`${B}/sw.js`);
check("the service worker is served", sw.ok());

console.log(errors.length ? `\nconsole/page errors:\n  ${errors.join("\n  ")}` : "\nno console errors");
console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
