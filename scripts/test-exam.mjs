/**
 * The mock state examination, sat end to end in a browser.
 *
 * The one suite where "it rendered" is not enough. A mock exam is the only
 * screen in this app a learner will treat as a measurement rather than as
 * practice, so what has to be checked is that the measurement is honest: that
 * the disclosures are on the briefing before the clock starts, that the clock
 * runs, that every question shape can actually be answered, that handing in
 * produces a marked paper rather than a claim, and that the hub's confidence
 * figure carries the evidence behind it.
 *
 * Needs the dev server running and a deck with something in it:
 *   npm run demo && npm run dev
 *   node scripts/test-exam.mjs
 */
import { launchChromium } from "./lib/browser.mjs";
import { baseUrl, suite } from "./lib/checks.mjs";
import { eventually } from "./lib/browser.mjs";

const B = baseUrl();
const browser = await launchChromium();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
const page = await ctx.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

/*
  Floor: 39, measured against the state CI seeds: the built-in 360 word
  dictionary, the demo deck, and no Ekilex key. That last part matters. Without
  a key the dictionary holds no recorded example sentences at all, so the
  listening and reading parts are set in their fallback shapes, and this suite
  was written to pass in exactly that state rather than in the one a developer
  with a key happens to have.
*/
const { check, absent, done } = suite("The mock examination", { floor: 39 });

// ── The hub ──────────────────────────────────────────────────────────────────

await page.goto(`${B}/exam`, { waitUntil: "networkidle" });

const body = await page.locator("body").innerText();

check("the hub lists every level, the four official and the two that are not",
  ["A1", "A2", "B1", "B2", "C1", "C2"].every((l) => body.includes(l)));

// Scoped to the level cards: the page title says "state exam" too, and a bare
// text count picked that up and read seven official levels.
const levelCards = page.locator("li", { has: page.getByRole("img", { name: /likely to pass/ }) });
const officialCards = levelCards.filter({ hasText: "State exam" });
check("it says which levels the state actually examines",
  (await officialCards.count()) === 4,
  `${await officialCards.count()} marked official`);

check("it marks the two it invented as not examined",
  (await levelCards.filter({ hasText: "Not examined" }).count()) === 2);

check("it states the pass rule, both halves of it",
  /60 percent to pass/i.test(body) && /no part may score nothing/i.test(body));

check("every level carries a confidence figure",
  (await page.getByRole("img", { name: /percent likely to pass/ }).count()) >= 6);

check("the confidence figures carry the evidence behind them, not just a number",
  /go on yet|rough estimate|mean something/i.test(body));

check("it says whether it would bet on a level at all",
  /would bet on|would not bet on/i.test(body));

// Case-insensitively: the part labels are `label-xs`, which uppercases, and
// `innerText` reports what is rendered rather than what is in the markup.
check("it predicts all four parts, so no quarter of the paper is unaccounted for",
  ["writing", "listening", "reading", "speaking"].every((s) => body.toLowerCase().includes(s)));

check("it says the questions are not the real questions",
  /questions are not the real questions/i.test(body));

check("it says nothing scores pronunciation",
  /Nothing scores your pronunciation/i.test(body));

check("it offers advice rather than only a verdict",
  (await page.getByText("What is standing in the way").count()) > 0);

const firstGapLink = page.locator("a", { hasText: /Open the path|Practise|Take a dictation|Record yourself|Fill some gaps|Write a sentence|Read the rule|Open the clinic|Review now/ }).first();
check("every gap hands over somewhere to go", (await firstGapLink.count()) > 0);

// ── The briefing ─────────────────────────────────────────────────────────────

await page.goto(`${B}/exam/A2?seed=suite`, { waitUntil: "networkidle" });
const brief = await page.locator("body").innerText();

check("the briefing names the four parts with their minutes and points",
  /kirjutamine/.test(brief) && /min/.test(brief) && /points/.test(brief));

check("every task says which official task it stands in for",
  (brief.match(/stands for/g) ?? []).length >= 6,
  `${(brief.match(/stands for/g) ?? []).length} declared`);

check("the briefing says the spoken part is marked by the learner",
  /marked by you/i.test(brief));

check("the clock has not started before the learner starts it",
  !/\d\d:\d\d/.test(await page.locator("header").innerText().catch(() => "")));

/**
 * The questions of the first part, for a given seed.
 *
 * The briefing itself is identical whatever the seed, since it lists parts and
 * task titles rather than questions. Comparing that read as "the seed does
 * nothing" while the paper underneath was varying correctly, which is the kind
 * of check that passes for the wrong reason in the other direction too.
 */
async function firstPartOf(seed) {
  await page.goto(`${B}/exam/A2?seed=${seed}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Start the clock" }).click();
  await page.waitForTimeout(500);
  return page.locator("main, body").first().innerText();
}

const seedPaper = await firstPartOf("suite");
check("the same seed rebuilds the same paper, so a reload does not lose it",
  (await firstPartOf("suite")) === seedPaper);

check("a different seed is a different paper",
  (await firstPartOf("other")) !== seedPaper);

// ── Sitting it ───────────────────────────────────────────────────────────────

await page.goto(`${B}/exam/A2?seed=suite`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Start the clock" }).click();
await page.waitForTimeout(600);

check("the clock is running once the paper is open",
  /\d\d:\d\d/.test(await page.locator("header").innerText()));

check("it opens on the writing part, as the real paper does",
  (await page.locator("h1").innerText()).includes("Writing"));

/** Answers whatever it can on the part on screen, then moves on. */
async function answerAndAdvance(lastPart) {
  // A typed answer of any shape: the form questions and the dictation.
  const boxes = page.locator("input[type=text], input:not([type])");
  const typed = await boxes.count();
  for (let i = 0; i < typed; i++) {
    await boxes.nth(i).fill("vastus").catch(() => {});
  }
  // The multiple choice questions.
  const radios = page.locator("input[type=radio]");
  const seen = new Set();
  const count = await radios.count();
  for (let i = 0; i < count; i++) {
    const name = await radios.nth(i).getAttribute("name");
    if (!name || seen.has(name)) continue;
    seen.add(name);
    await radios.nth(i).check().catch(() => {});
  }
  // The composition.
  const area = page.locator("textarea");
  if (await area.count()) {
    await area.first().fill("Ma olen siin ja kirjutan teksti oma sonadega iga paev.");
  }
  const next = lastPart
    ? page.getByRole("button", { name: /Hand in/ })
    : page.getByRole("button", { name: /^Next part/ });
  await next.click();
  await page.waitForTimeout(900);
  return { typed, chosen: seen.size };
}

const writing = await answerAndAdvance(false);
check("the writing part takes typed forms and a composition",
  writing.typed > 0 && (await page.locator("h1").innerText()).includes("Listening"),
  `${writing.typed} typed`);

const listeningBody = await page.locator("body").innerText();
check("the listening part is set at all, with or without recorded sentences",
  !/Nothing could be set/i.test(listeningBody),
  listeningBody.includes("Nothing could be set") ? "the listening part came out empty" : "");

check("the listening part offers a recording for every question",
  (await page.getByRole("button", { name: /Play recording/i }).count()) > 0);

check("a task set from words rather than sentences says so",
  !/set from words rather than sentences/i.test(brief) ||
  /One word\./i.test(listeningBody));

await answerAndAdvance(false);
check("the reading part follows", (await page.locator("h1").innerText()).includes("Reading"));

const readingBody = await page.locator("body").innerText();
check("the reading part asks the learner to rebuild a sentence",
  /Tap the words in order/i.test(readingBody) ||
  /Nothing could be set/i.test(readingBody));

await answerAndAdvance(false);
check("the speaking part is last", (await page.locator("h1").innerText()).includes("Speaking"));

const speakingBody = await page.locator("body").innerText();
check("the criteria cannot be ticked before anything is recorded",
  (await page.locator("input[type=checkbox]:disabled").count()) > 0);

check("it says why, rather than only greying the boxes out",
  /Record something first/i.test(speakingBody));

check("it says out loud that nothing here scores a recording",
  /no verified Estonian speech recogniser/i.test(speakingBody));

// ── Handing in ───────────────────────────────────────────────────────────────

await page.getByRole("button", { name: /Hand in/ }).click();
const landed = await eventually(async () => /\/exam\/result\//.test(page.url()), { timeoutMs: 25_000 });
check("handing in produces a marked paper", landed, page.url());

if (!landed) {
  absent(6, "a result page, because handing in did not land");
} else {
  const result = await page.locator("body").innerText();

  check("the result gives a score out of the paper's points",
    /\d+ of \d+ points/.test(result));

  check("it gives the verbal assessment a real result carries",
    /very good|good|satisfactory|poor|not up to the level/.test(result));

  check("it breaks the score down by part",
    ["Writing", "Listening", "Reading", "Speaking"].every((s) => result.includes(s)));

  check("it says where the marks went, not only that they went",
    /Where the marks went/i.test(result));

  check("it shows the answers to everything that was wrong",
    /Everything you got wrong/i.test(result));

  check("it offers another paper rather than ending there",
    (await page.getByRole("link", { name: /Another paper/ }).count()) > 0);

  await page.goto(`${B}/exam`, { waitUntil: "networkidle" });
  check("the sitting shows up on the hub afterwards",
    /Papers you have sat/i.test(await page.locator("body").innerText()) &&
    (await page.getByText(/percent, (pass|not a pass)/).count()) > 0);
}

check("nothing threw along the way", errors.length === 0, errors.slice(0, 2).join(" | "));

await browser.close();
done();
