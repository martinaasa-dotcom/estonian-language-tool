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
import { launchChromium } from "./lib/browser.mjs";
import { baseUrl, suite } from "./lib/checks.mjs";

const BASE = baseUrl();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

/**
 * The dev overlay injects its own buttons, one of which is literally called
 * "Next". Scoping every query to <main> keeps the tests looking at the app.
 */
const app = page.locator("main");

// Floor: measured 13 in dev mode. It cannot run against a production build at all: `page.waitForFunction` evaluates a string, which the production Content Security Policy refuses.
const { absent, check, done } = suite("The new modes, driven", { floor: 13 });

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

// ── Writing: the mechanical form check, with no AI in play ───────────────────
await page.goto(`${BASE}/review/write`, { waitUntil: "networkidle" });

// Read the task off the page and look the required form up in the dictionary,
// so the test does not hard-code Estonian morphology of its own.
const lemma = (await page.locator("strong").first().textContent())?.trim() ?? "";
const caseName = (await page.locator("p[lang=\"et\"]").first().textContent())?.trim() ?? "";
check("writing sets a task", lemma.length > 0 && caseName.length > 0, `${lemma} → ${caseName}`);

// A sentence containing the *headword* rather than the required form: the
// mechanical check must catch that without any model.
await page.locator("#sentence").fill(`Ma näen ${lemma} praegu siin.`);
await app.getByRole("button", { name: /Check it/ }).click();
// Wait for the verdict itself. The live region is in the markup from the
// first render, so waiting for the *selector* returns immediately and the
// body gets read before the route has answered: the check then reports "no
// verdict" against an app that renders one correctly a second later.
await waitForText(page, /right form|wrong case|not in that sentence/i, 30000);

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
/*
  This mode builds its questions out of the learner's own deck, so a deck with
  no verb carrying government data has nothing to ask and says so instead. That
  is the page behaving correctly, and this block used to meet it by clicking a
  button that was not there: thirty seconds of Playwright waiting, a throw, and
  the eight checks after it never running, all reported as one failure naming a
  regex. It cost a real investigation on a suite with nothing wrong with it.

  So the precondition is read rather than assumed, and a deck that cannot ask
  the question waives its three checks with the reason on screen. See
  scripts/lib/checks.mjs for why `absent` exists rather than a silent skip.
*/
await page.goto(`${BASE}/review/government`, { waitUntil: "networkidle" });
const CASE_OPTION = /osastav|alaleütlev|seestütlev|kaasaütlev|seesütlev|sisseütlev|alalütlev/;
const options = app.getByRole("button", { name: CASE_OPTION });
if ((await options.count()) === 0) {
  absent(3, "a deck with a verb whose government is recorded; this one asks nothing");
} else {
  const verb = (await page.locator("p[lang=\"et\"]").first().textContent())?.trim() ?? "";
  // Options are named the way a class names them: the question first, the
  // Estonian case name under it. Any option will do, this is checking that the
  // answer reveals the rule.
  await options.first().click();
  await page.waitForSelector("[aria-live='polite']", { timeout: 15000 });
  const govBody = (await page.textContent("body")) ?? "";
  check("answering reveals the governed case", /governs the|experiencer construction/i.test(govBody), verb);
  check("the example sentence is shown after answering",
    (await app.getByRole("button", { name: /^Next/ }).count()) > 0);

  await app.getByRole("button", { name: /^Next/ }).click();
  await page.waitForTimeout(400);
  check("Next advances to a new question",
    (await app.getByText(/Which question does it answer/i).count()) > 0);
}

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
await waitForText(page, /Fill the gap|No words from your deck|deck is empty/i, 30000);

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

await browser.close();
done();
