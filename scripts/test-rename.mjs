import { launchChromium } from "./lib/browser.mjs";
import { baseUrl, suite } from "./lib/checks.mjs";
const B = baseUrl();
// Floor: 3, measured in the state CI seeds. A thinner database reads as short.
const { check, done } = suite("Renaming", { floor: 3 });
const browser = await launchChromium();
const page = await (await browser.newContext()).newPage();

/*
  The brand is in the title, and the old name is nowhere.

  This asked whether the title *started* with "Kodukeel", which was only ever
  true because every route in the app shared one title. Now that a screen names
  itself and the root layout's template appends the brand, Today reads "Today ·
  Kodukeel" and the old assertion failed on a correct page. What it is actually
  for is the rename, so that is what it asks: the brand is there, and the name
  this app used to have is not.
*/
await page.goto(`${B}/`, { waitUntil: "networkidle" });
const title = await page.title();
check("the app is branded Kodukeel", title.includes("Kodukeel"), title);
check("and nothing still carries the old name",
  !/sõnasepp|sonasepp/i.test(await page.content()), title);

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
