import { launchChromium } from "./lib/browser.mjs";
import { baseUrl, suite } from "./lib/checks.mjs";
const B = baseUrl();
// Floor: 11, measured in the state CI seeds. A thinner database reads as short.
const { check, done } = suite("Polish", { floor: 13 });

const browser = await launchChromium();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
const errors = [];
page.on("pageerror", e => errors.push(String(e)));
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

// Estonian text carries lang="et" so a screen reader does not read it as English.
await page.goto(`${B}/dictionary?q=tuba`, { waitUntil: "networkidle" });
check("the headword is marked as Estonian",
  (await page.locator('h2[lang="et"]').innerText()) === "tuba");
// The forms render as a table when derived and as a list when retrieved from
// Ekilex; either way every Estonian form must carry lang="et".
const marked = await page.locator('[lang="et"]').count();
check("every form in the table is marked as Estonian", marked >= 14, `${marked} elements`);

// Searching an inflected form — what a learner actually meets in class.
for (const [query, lemma, why] of [
  // Estonian first, English in brackets after it (ADR-023). Both names, because
  // a learner reads this next to an English grammar and next to their homework.
  ["toas", "tuba", /seesütlev \(inessive\)/i],
  ["lugesin", "lugema", /lihtminevik ma/i],
  ["tubadega", "tuba", /mitmuse kaasaütlev/i],
]) {
  await page.goto(`${B}/dictionary?q=${encodeURIComponent(query)}`, { waitUntil: "networkidle" });
  const heading = await page.locator('h2[lang="et"]').innerText().catch(() => "");
  const note = await page.getByText(/ is the /).innerText().catch(() => "");
  check(`"${query}" resolves to ${lemma} and says why`,
    heading === lemma && why.test(note), note || "no explanation shown");
}

/*
  The weak-case panel is an action, not a readout.

  It used to be drawn three ways on three pages, and My words drew its own with
  a second copy of the arithmetic behind it, so one learner could read two
  different numbers for one case. Progress owns it now and Practice draws the
  same component; My words keeps the deck and points at it. This drives the
  panel where it lives, and then checks that the page it left still says where
  it went, because a consolidation that drops the signpost is just a removal.
*/
await page.goto(`${B}/words`, { waitUntil: "networkidle" });
check("the deck page points at where the case analysis went",
  (await page.locator('a[href="/progress"]').count()) > 0);

await page.goto(`${B}/progress`, { waitUntil: "networkidle" });
const drillLink = page.locator('a[href^="/review?case="]').first();
check("weak cases link to a drill", (await drillLink.count()) > 0);
const href = await drillLink.getAttribute("href");
await drillLink.click();
await page.waitForURL(/\/review\?case=/, { timeout: 10000 });
await page.waitForSelector("text=Full entry", { timeout: 10000 });
check("the drill opens and says what it is",
  (await page.getByText(/drill/i).count()) > 0, href);
// Derived from the link rather than hard-coded: which case is weakest depends
// on the review history, so pinning one name here makes the test fail on data
// rather than on behaviour.
const drilledCase = new URL(href, B).searchParams.get("case")?.toLowerCase() ?? "";
// The card's hint names the case in both languages, so the English name read
// off the link is still the way to check the drill was filtered. What the
// *front* says changed with ADR-023: a case is asked by the question it
// answers, the way a class is asked for one, and never by the Latin name.
const drillBody = (await page.textContent("body")) ?? "";
check("the drill only contains that case's cards",
  new RegExp(`\\b${drilledCase}\\b`, "i").test(drillBody), drilledCase);
check("and asks for it by its question, not by its Latin name",
  /→[^\n]*\?/.test(drillBody) && !new RegExp(`→ ${drilledCase}`, "i").test(drillBody),
  drillBody.match(/→[^\n]{0,24}/)?.[0] ?? "no prompt found");

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
await browser.close();
done();
