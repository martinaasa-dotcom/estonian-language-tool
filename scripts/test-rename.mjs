import { launchChromium } from "./lib/browser.mjs";
import { baseUrl, suite } from "./lib/checks.mjs";
const B = baseUrl();
// Floor: 2, measured in the state CI seeds. A thinner database reads as short.
const { check, done } = suite("Renaming", { floor: 2 });
const browser = await launchChromium();
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
done();
