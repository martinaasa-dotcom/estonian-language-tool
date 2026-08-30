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
  Floor: 56, measured against the state CI seeds: the built-in dictionary, the
  demo deck, and no Ekilex key. That last part matters. Without a key the
  dictionary holds no recorded example sentences at all, so the listening and
  reading parts are set in their fallback shapes, and this suite was written to
  pass in exactly that state rather than in the one a developer with a key
  happens to have.

  What the paper cannot check here is the one thing that needs a clock nobody
  will sit through: a part closing when its time runs out. The shortest part on
  the shortest paper is twelve minutes.
*/
const { check, absent, done } = suite("The mock examination", { floor: 58 });

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

/*
  The goal somebody stated on their first run and the paper they are being shown
  were two features that did not speak to each other. The card only appears when
  a target has been set, which the CI seeds do not, so what is checked here is
  the other half of the promise: with no goal set, nothing on the page claims
  one.
*/
const aiming = /The paper you said you were aiming at/i.test(body);
if (aiming) {
  check("the paper aimed at is named with the weeks and the confidence together",
    /weeks left|deadline is here|no deadline set/i.test(body));
} else {
  absent(1, "the goal card, because these seeds set no target level");
}

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

/*
  Four tasks sit under a clock the real paper gives to two. The drills are the
  app's own and they go last, so the pressure falls on them rather than on the
  letter, and the trade is declared before the clock starts rather than
  discovered at task three.
*/
check("the briefing says the writing clock belongs to the two texts",
  /clock is for those two/i.test(brief) && /accuracy questions after them/i.test(brief));

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

/**
 * Opens the recordings on any listening task that is still in its reading pause.
 *
 * The pause is the real paper's: thirty seconds to read the questions before the
 * audio unlocks. A suite that sat through it would add half a minute per task
 * for nothing, so it presses the button a candidate in a hurry would press.
 */
async function unlockRecordings() {
  const unlock = page.getByRole("button", { name: /unlock the recordings/i });
  for (let i = await unlock.count(); i > 0; i--) {
    await unlock.first().click().catch(() => {});
  }
}

/** Answers whatever it can on the part on screen, then moves on. */
async function answerAndAdvance(lastPart) {
  await unlockRecordings();

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
  // Every written answer: the writing part sets two, a short message and a
  // longer text, exactly as the real paper does.
  const areas = page.locator("textarea");
  for (let i = 0; i < (await areas.count()); i++) {
    await areas.nth(i).fill(
      "Ma olen siin ja kirjutan teksti oma sonadega iga paev sest see on minu kodutoo.",
    );
  }

  const next = lastPart
    ? page.getByRole("button", { name: /Hand in/ })
    : page.getByRole("button", { name: /^Next part/ });
  await next.click();
  await page.waitForTimeout(400);

  /*
    Anything still blank is queried before the part closes, which is the point of
    that gate: on the real paper you cannot come back. The suite leaves the
    blanks blank deliberately, because a paper answered in full never exercises
    the marking of an unanswered question.
  */
  const anyway = page.getByRole("button", { name: /Leave them blank and move on|Hand in anyway/ });
  if (await anyway.count()) await anyway.first().click();
  await page.waitForTimeout(900);

  // Between the written half and the spoken part there is a break, as there is
  // on the day. It can be ended early, and here it is.
  const afterBreak = page.getByRole("button", { name: /Start the spoken part/ });
  if (await afterBreak.count()) {
    check("a break sits between the written half and the spoken part",
      /break/i.test(await page.locator("body").innerText()));
    await afterBreak.click();
    await page.waitForTimeout(600);
  }

  return { typed, chosen: seen.size };
}

// ── The writing part, which is two pieces of writing ─────────────────────────

const writingBody = await page.locator("body").innerText();

// Case-insensitively: the task headings are `label-xs`, which uppercases, and
// `innerText` reports what is rendered rather than what is in the markup.
const taskHeadings = (await page.locator("h2, h3").allInnerTexts()).join(" ").toLowerCase();
check("the writing part opens with the short message the real paper opens with",
  /teate koostamine/i.test(brief) &&
  taskHeadings.indexOf("write a short message") < taskHeadings.indexOf("write a text"),
  taskHeadings);

check("the message names the points it has to cover, as the real task does",
  /Write a note|Write an e-mail|Write a message/i.test(writingBody));

check("the second writing task offers the choice the real paper offers",
  (await page.getByRole("radiogroup", { name: /Which to write/i }).count()) > 0 &&
  /personal letter/i.test(writingBody));

check("it declares that the two grammar drills are not tasks the real paper sets",
  (brief.match(/not a task the real paper sets/gi) ?? []).length === 2,
  `${(brief.match(/not a task the real paper sets/gi) ?? []).length} declared`);

// The words a written task names are ticked off as they are used, by the same
// rule that marks them. Before anything is written, none of them can be.
check("a written task counts the words it asked for, and starts at none of them",
  /0 of \d used/.test(writingBody));

/*
  The chips are ticked off by `usesRequiredWord`, the same function that marks
  them, which is the only reason showing them live is honest. So the check is
  that writing one of the words actually moves the count: a screen that promised
  a mark the server was not going to give would be worse than no screen at all.
*/
const wordChips = page.locator("p", { hasText: /Use every one of these/ }).first();
const firstWord = (await wordChips.locator('span[lang="et"]').first().innerText()).trim();
const firstArea = page.locator("textarea").first();
await firstArea.fill(`Tere, ma kirjutan sulle ${firstWord} kohta pikalt ja pohjalikult iga paev.`);
await page.waitForTimeout(250);

const afterTyping = await page.locator("body").innerText();
check("a word the task asked for is ticked off once it is used",
  /1 of \d used/.test(afterTyping),
  firstWord);

check("the length meter counts what was written towards the length that carries the marks",
  /\d+ of \d+ words/.test(afterTyping));

const writing = await answerAndAdvance(false);
check("the writing part takes typed forms and two written texts",
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

// ── The listening conditions, which are the specification's, not ours ────────

check("a listening task opens with the pause the real paper gives to read the questions",
  /Read the questions first/i.test(listeningBody));

const playButtons = page.getByRole("button", { name: /Play recording/i });
const held = await page.locator('button[aria-label*="Play recording"]:disabled').count();
check("the recordings are held shut until that pause is over",
  held > 0 && held === (await playButtons.count()),
  `${held} of ${await playButtons.count()} held`);

await unlockRecordings();
await page.waitForTimeout(300);
const unlocked = await page.locator("body").innerText();

check("the recordings open once the pause is skipped",
  (await page.locator('button[aria-label*="Play recording"]:disabled').count()) === 0);

check("each recording is worth two plays and says how many are left",
  /2 of 2 plays left/.test(unlocked) && /plays 2 times and no more/i.test(brief));

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

await page.getByRole("button", { name: /^Hand in$/ }).click();
await page.waitForTimeout(500);

/*
  The spoken part cannot be answered by a browser with no microphone, so the
  paper always reaches this point with blanks on it, which is the state the
  query exists for: on the real paper you cannot come back, and a blank left by
  accident is the one thing a mock can still save somebody from.
*/
const query = page.getByRole("button", { name: /Hand in anyway/ });
check("a paper with blanks on it says so before it is handed in",
  (await query.count()) > 0 &&
  /still blank/i.test(await page.locator("body").innerText()));
if (await query.count()) await query.click();

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

// ── Not losing three hours of work ───────────────────────────────────────────

/*
  The paper used to say "nothing here is saved until you hand in", and a reload
  an hour into a B2 paper threw the lot away. What is checked is the promise the
  briefing now makes instead: the answers come back, and the clock does not.
*/
await page.goto(`${B}/exam/A2?seed=resume`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Start the clock" }).click();
await page.waitForTimeout(500);
await page.locator("textarea").first().fill("Tere ma kirjutan siia oma teate ja jatan selle pooleli.");
await page.waitForTimeout(400);

await page.reload({ waitUntil: "networkidle" });
const returning = await page.locator("body").innerText();
check("a paper left part way through is offered back rather than lost",
  /left this paper part way through/i.test(returning));

check("it says how much of the part's time is left, because the clock kept running",
  /of that part is left|time has run out/i.test(returning));

const carryOn = page.getByRole("button", { name: /Carry on/ });
check("carrying on is one press away", (await carryOn.count()) > 0);
if (await carryOn.count()) {
  await carryOn.click();
  await page.waitForTimeout(500);
  check("the answers are the ones that were written, not a blank paper",
    (await page.locator("textarea").first().inputValue()).includes("jatan selle pooleli"));
} else {
  absent(1, "the resumed answers, because the paper was not offered back");
}

check("nothing threw along the way", errors.length === 0, errors.slice(0, 2).join(" | "));

await browser.close();
done();
