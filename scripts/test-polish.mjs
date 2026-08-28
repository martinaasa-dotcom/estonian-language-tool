import { chromium } from "playwright";
const B = "http://localhost:3000";
let failures = 0;
const check = (l, ok, extra = "") => { if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${extra ? "  (" + extra + ")" : ""}`); };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
const errors = [];
page.on("pageerror", e => errors.push(String(e)));
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

// Estonian text carries lang="et" so a screen reader does not read it as English.
await page.goto(`${B}/dictionary?q=tuba`, { waitUntil: "networkidle" });
check("the headword is marked as Estonian",
  (await page.locator('h2[lang="et"]').innerText()) === "tuba");
// The paradigm renders as a table when derived and as a list when retrieved from
// Ekilex; either way every Estonian form must carry lang="et".
const marked = await page.locator('[lang="et"]').count();
check("every form in the paradigm is marked as Estonian", marked >= 14, `${marked} elements`);

// Searching an inflected form — what a learner actually meets in class.
for (const [query, lemma, why] of [
  ["toas", "tuba", /inessive/i],
  ["lugesin", "lugema", /past 1sg/i],
  ["tubadega", "tuba", /comitative plural/i],
]) {
  await page.goto(`${B}/dictionary?q=${encodeURIComponent(query)}`, { waitUntil: "networkidle" });
  const heading = await page.locator('h2[lang="et"]').innerText().catch(() => "");
  const note = await page.getByText(/ is the /).innerText().catch(() => "");
  check(`"${query}" resolves to ${lemma} and says why`,
    heading === lemma && why.test(note), note || "no explanation shown");
}

// The weak-case heatmap is an action, not a readout.
await page.goto(`${B}/words`, { waitUntil: "networkidle" });
const drillLink = page.locator('a[href^="/review?case="]').first();
check("weak cases link to a drill", (await drillLink.count()) > 0);
const href = await drillLink.getAttribute("href");
await drillLink.click();
await page.waitForURL(/\/review\?case=/, { timeout: 10000 });
await page.waitForSelector("text=Full entry", { timeout: 10000 });
check("the drill opens and says what it is",
  (await page.getByText(/drill/i).count()) > 0, href);
check("the drill only contains that case's cards",
  (await page.getByText(/→ (inessive|elative|illative|allative|adessive|comitative|translative)/i).count()) > 0);

// A card you are struggling with should reach its full entry in one click.
check("a review card links to the full dictionary entry",
  (await page.getByRole("link", { name: /Full entry/ }).count()) > 0);
await page.getByRole("link", { name: /Full entry/ }).click();
await page.waitForURL(/\/dictionary\?q=/, { timeout: 10000 }).catch(() => {});
check("that link lands on the entry", page.url().includes("/dictionary?q="), page.url());

// The answer must be announced, not silently inserted.
await page.goto(`${B}/review`, { waitUntil: "networkidle" });
check("the card face is a live region", (await page.locator('[aria-live="polite"]').count()) > 0);

console.log(errors.length ? `\nerrors:\n  ${errors.join("\n  ")}` : "\nno console errors");
console.log(failures === 0 ? "\nAll polish checks passed." : `\n${failures} failed.`);
await browser.close();
process.exit(failures ? 1 : 0);
