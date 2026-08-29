import { launchChromium } from "./lib/browser.mjs";
const B = "http://localhost:3000";
let failures = 0;
const check = (l, ok, extra = "") => { if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${extra ? "  (" + extra + ")" : ""}`); };
const browser = await launchChromium();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1100 } })).newPage();
const errors = [];
page.on("pageerror", e => errors.push(String(e)));

await page.goto(`${B}/dictionary?q=kohv`, { waitUntil: "networkidle" });
check("an entry offers an Edit button", (await page.getByRole("button", { name: /^Edit$/ }).count()) > 0);
await page.getByRole("button", { name: /^Edit$/ }).click();
await page.waitForTimeout(500);
check("the editor opens pre-filled with the existing forms",
  (await page.getByPlaceholder("toa").inputValue()) === "kohvi",
  `genitive field = "${await page.getByPlaceholder("toa").inputValue()}"`);

// Correct the translation and add a form that was missing.
const en = page.getByPlaceholder("word");
await en.fill("coffee (the drink)");
await page.getByPlaceholder("tubade").fill("kohvide");
await page.getByRole("button", { name: /Save changes/ }).click();
await page.waitForTimeout(2500);

check("the correction is saved", (await page.getByText("coffee (the drink)").count()) > 0);
check("the added form unlocks the plural column",
  (await page.getByText("kohvidega", { exact: true }).count()) > 0);

// Renaming the headword must not create a second entry or orphan its cards.
await page.goto(`${B}/dictionary?q=kohv`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Add to deck|In deck/ }).click();
await page.waitForTimeout(300);
const addBtn = page.getByRole("button", { name: /^Add$/ });
if (await addBtn.count()) { await addBtn.click(); await page.waitForTimeout(1500); }

await page.goto(`${B}/dictionary?q=kohv`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /^Edit$/ }).click();
await page.waitForTimeout(400);
// The editor's own Estonian field, not the search box above it.
await page.getByPlaceholder("sõna").fill("kohvjook");
await page.getByRole("button", { name: /Save changes/ }).click();
await page.waitForTimeout(2500);

const dupes = await page.request.get(`${B}/api/export`);
const data = await dupes.json();
const kohvEntries = data.lexemes.filter(l => l.lemma === "kohv" || l.lemma === "kohvjook");
check("renaming updates the entry instead of duplicating it",
  kohvEntries.length === 1 && kohvEntries[0].lemma === "kohvjook",
  kohvEntries.map(l => l.lemma).join(", ") || "none found");

const renamedCards = data.cards.filter(c => c.lexemeId === kohvEntries[0]?.id);
/*
  A rename rewrites the cards that *show the headword*, and only those.

  This used to assert that every card for the entry mentioned the new lemma,
  which held while a word had two cards, recognition and production, both of
  which are the headword against its translation. It stopped holding when the
  dictionary grew example sentences: a cloze card's front is an attested
  Estonian sentence and its back is an inflected form, and neither names the
  headword. Rewriting one to match a rename would be the app editing Estonian,
  which is the rule the whole project is built on.

  So the rule, stated properly: no card is left showing the old headword, and
  the new one is actually on the cards that carry a headword. Exact equality
  rather than a substring, because "kohvi" contains "kohv".
*/
const headword = (c) => [c.front, c.back];
check("its cards were rewritten to match, not left stale",
  renamedCards.length > 0 &&
    renamedCards.some(c => headword(c).includes("kohvjook")) &&
    !renamedCards.some(c => headword(c).includes("kohv")),
  renamedCards.map(c => `${c.front}→${c.back}`).join(" | ").slice(0, 90));
check("scheduling was not reset by the correction",
  renamedCards.every(c => typeof c.stability === "number"), `${renamedCards.length} cards`);

check("no page errors while editing", errors.length === 0, errors.join("; "));

// Put the seed entry back so the suite can be run repeatedly.
await page.goto(`${B}/dictionary?q=kohvjook`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /^Edit$/ }).click();
await page.waitForTimeout(400);
await page.getByPlaceholder("sõna").fill("kohv");
await page.getByPlaceholder("word").fill("coffee");
await page.getByPlaceholder("tubade").fill("kohvide");
await page.getByRole("button", { name: /Save changes/ }).click();
await page.waitForTimeout(2000);
check("the entry can be corrected back again",
  (await page.locator('h2[lang="et"]').innerText().catch(() => "")) === "kohv");

console.log(failures === 0 ? "\nEditing verified." : `\n${failures} failed.`);
await browser.close();
process.exit(failures ? 1 : 0);
