#!/usr/bin/env node
/**
 * Drives the new modes the way a learner would.
 *
 * The render smoke test proves the pages load; this proves they *do* something.
 * Every assertion here is about behaviour that only appears after an
 * interaction, which is exactly the code a typecheck cannot reach.
 *
 * The AI half of writing is deliberately not exercised: it needs a key and a
 * network, and the point of the design is that the mechanical half stands on
 * its own. That is what this checks.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

/**
 * The dev overlay injects its own buttons, one of which is literally called
 * "Next". Scoping every query to <main> keeps the tests looking at the app.
 */
const app = page.locator("main");

let failures = 0;
const check = (label, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? `  (${extra})` : ""}`);
};

// ── Writing: the mechanical form check, with no AI in play ───────────────────
await page.goto(`${BASE}/review/write`, { waitUntil: "networkidle" });

// Read the task off the page and look the required form up in the dictionary,
// so the test does not hard-code Estonian morphology of its own.
const lemma = (await page.locator("strong").first().textContent())?.trim() ?? "";
const caseName = (await page.locator("p.est").first().textContent())?.trim() ?? "";
check("writing sets a task", lemma.length > 0 && caseName.length > 0, `${lemma} → ${caseName}`);

// A sentence containing the *headword* rather than the required form: the
// mechanical check must catch that without any model.
await page.locator("#sentence").fill(`Ma näen ${lemma} praegu siin.`);
await app.getByRole("button", { name: /Check it/ }).click();
// Wait for the verdict, not for a guess at how long the route takes to compile.
await page.waitForSelector("[aria-live='polite']", { timeout: 30000 });

const feedback = (await page.textContent("body")) ?? "";
check(
  "a wrong form is caught by the dictionary check, before any model runs",
  /wrong case|not in that sentence/i.test(feedback),
  feedback.match(/(right form|wrong case|not in that sentence)/i)?.[0] ?? "no verdict",
);
// Whether a key is configured varies by environment; what must hold either way
// is that the dictionary's verdict is shown and any model note is labelled.
check("the mechanical verdict is always shown",
  /right form|wrong case|not in that sentence/i.test(feedback));
check("a model note, if any, is labelled as unverified",
  !/almost|reads well|not yet/i.test(feedback) || /AI · verify|withheld/i.test(feedback));

// ── Government: answering reveals the example and the rule ───────────────────
await page.goto(`${BASE}/review/government`, { waitUntil: "networkidle" });
const verb = (await page.locator("p.est").first().textContent())?.trim() ?? "";
await app.getByRole("button", { name: /Partitive|Allative|Elative|Comitative/ }).first().click();
await page.waitForSelector("[aria-live='polite']", { timeout: 15000 });
const govBody = (await page.textContent("body")) ?? "";
check("answering reveals the governed case", /governs the|experiencer construction/i.test(govBody), verb);
check("the example sentence is shown after answering",
  (await app.getByRole("button", { name: /^Next/ }).count()) > 0);

await app.getByRole("button", { name: /^Next/ }).click();
await page.waitForTimeout(400);
check("Next advances to a new question",
  (await app.getByText(/Which case does it take/i).count()) > 0);

// ── Cloze: paste a passage built from the learner's own deck ─────────────────
// Put a word in the deck first, so this exercises the real path rather than
// passing on the "no words of yours in that text" refusal.
await page.goto(`${BASE}/dictionary?q=tuba`, { waitUntil: "networkidle" });
const addButton = app.getByRole("button", { name: /Add to deck|In deck/ });
if (await addButton.count()) {
  await addButton.first().click();
  await page.waitForTimeout(500);
  const confirm = app.getByRole("button", { name: /^Add$/ });
  if (await confirm.count()) {
    await confirm.click();
    await page.waitForTimeout(1500);
  }
}

await page.goto(`${BASE}/review/cloze`, { waitUntil: "networkidle" });

const passage =
  "Ma istun praegu toas ja loen huvitavat raamatut. " +
  "Homme lähen kooli ja räägin sõbraga pikalt. " +
  "Tuba on väga soe ja valge täna hommikul.";
await page.locator("#passage").fill(passage);
await app.getByRole("button", { name: /Make exercises/ }).click();
await page.waitForFunction(
  () => /Fill the gap|No words from your deck|deck is empty/i.test(document.body.textContent ?? ""),
  null, { timeout: 30000 },
);

const clozeBody = (await page.textContent("body")) ?? "";
const madeExercises = /Fill the gap/i.test(clozeBody);
const honestRefusal = /No words from your deck|deck is empty/i.test(clozeBody);
check("cloze either makes exercises or says why not", madeExercises || honestRefusal,
  madeExercises ? "made exercises" : "refused honestly");

if (madeExercises) {
  check("the gap is blanked in the sentence", (await page.locator("#attempt").count()) === 1);
  await page.locator("#attempt").fill("zzzz");
  await app.getByRole("button", { name: /^Check/ }).click();
  await page.waitForTimeout(400);
  const marked = (await page.textContent("body")) ?? "";
  check("a wrong answer reveals the form the writer used",
    /The writer used|right word, missing diacritic/i.test(marked));
}

// ── Week: the spine ties vocabulary and homework together ────────────────────
await page.goto(`${BASE}/week`, { waitUntil: "networkidle" });
const weekBody = (await page.textContent("body")) ?? "";
check("week view shows homework filed under it", /Homework|Nothing filed/i.test(weekBody));
check("week view always offers a next action",
  /Review week|Drill week|Add week \d+ vocabulary|Nothing filed/i.test(weekBody));

// ── Diagnosis: says something, or honestly says it cannot yet ────────────────
await page.goto(`${BASE}/words`, { waitUntil: "networkidle" });
const wordsBody = (await page.textContent("body")) ?? "";
check("diagnosis reports a finding or explains its silence",
  /Not enough case reviews|Nothing stands out|until the stem changes|weakest case|plural stem/i
    .test(wordsBody),
  wordsBody.match(/Not enough case reviews|Nothing stands out|until the stem changes|weakest case|plural stem/i)?.[0] ?? "");

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
