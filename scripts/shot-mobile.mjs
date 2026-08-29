import { launchChromium } from "./lib/browser.mjs";
import { devices } from "playwright";
const OUT = process.argv[2];
const b = await launchChromium();
const ctx = await b.newContext({ ...devices["iPhone 13"] });
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", e => errors.push(String(e)));

for (const [name, path] of [["m-today", "/"], ["m-review", "/review"], ["m-dictionary", "/dictionary?q=tuba"]]) {
  await p.goto("http://localhost:3000" + path, { waitUntil: "networkidle" });
  await p.waitForTimeout(400);
  if (path === "/review") { await p.keyboard.press("Space").catch(() => {}); await p.waitForTimeout(400); }
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });

  // Horizontal overflow is the classic mobile failure: the page body must never scroll sideways.
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  console.log(`${overflow ? "FAIL" : "PASS"}  ${path} does not scroll sideways on a phone`);
}

// The rating buttons must be tappable, not just clickable.
//
// Getting to them depends on what the next due card asks for, which is not
// something this check gets to choose: a flip card has "Show answer", a
// multiple-choice card is answered with a number key, a typed one with Enter.
// Try each rather than assuming the deck, and fail with a sentence rather than
// a 30-second timeout if none of them reveals the row.
await p.goto("http://localhost:3000/review", { waitUntil: "networkidle" });
const ratings = p.getByRole("button", { name: /^(Again|Hard|Good|Easy)/ });
const show = p.getByRole("button", { name: /Show answer/ });
if (await show.count()) await show.click();
else if (await p.getByRole("button", { name: /^Check/ }).count()) await p.keyboard.press("Enter");
else await p.keyboard.press("1");
await p.waitForTimeout(500);
if (await ratings.count() === 0) {
  console.log("FAIL  could not reach the rating buttons — no card type matched");
}
const boxes = await ratings.evaluateAll(
  els => els.map(e => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })
);
console.log("rating button sizes:", JSON.stringify(boxes));
const tappable = boxes.length === 4 && boxes.every(b => b.h >= 40 && b.w >= 40);
console.log(`${tappable ? "PASS" : "FAIL"}  rating buttons meet the 44px-ish tap target`);
console.log(errors.length ? "errors: " + errors.join("; ") : "no page errors");
await b.close();
