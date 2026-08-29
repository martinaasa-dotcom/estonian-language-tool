import { chromium } from "playwright";
const B = "http://localhost:3000";
let failures = 0;
const check = (l, ok, extra = "") => { if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${extra ? "  (" + extra + ")" : ""}`); };
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await (await browser.newContext()).newPage();

await page.goto(`${B}/`, { waitUntil: "networkidle" });
check("the app is branded Kodukeel", (await page.title()).startsWith("Kodukeel"), await page.title());

/**
 * A minimal backup in the *pre-rename* format, built here rather than read from
 * a file left behind on one machine — the fixture is the format itself, and a
 * test that depends on a path in someone's temp directory can only ever pass
 * for them.
 */
const oldFormat = JSON.stringify({
  format: "sonasepp-v1",
  exportedAt: new Date().toISOString(),
  counts: { words: 0, cards: 0, reviews: 0, tasks: 0 },
  lexemes: [],
  cards: [],
  reviews: [],
  tasks: [],
});

await page.goto(`${B}/settings`, { waitUntil: "networkidle" });
await page.getByLabel("Choose a backup file").setInputFiles({
  name: "old.json", mimeType: "application/json", buffer: Buffer.from(oldFormat),
});
await page.waitForTimeout(1500);
check("a backup written before the rename is still accepted",
  (await page.getByText(/holds/).count()) > 0,
  await page.getByText(/doesn't look like/).innerText().catch(() => "accepted"));

await browser.close();
console.log(failures === 0 ? "\nRename verified." : `\n${failures} failed.`);
process.exit(failures ? 1 : 0);
