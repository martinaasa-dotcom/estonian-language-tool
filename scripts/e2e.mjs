import { eventually, launchChromium } from "./lib/browser.mjs";
import { baseUrl, suite } from "./lib/checks.mjs";
import { ensureLetterBar, requireLetterBar } from "./lib/prefs.mjs";

const B = baseUrl();
const browser = await launchChromium();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

// Floor: 26, measured in the state CI seeds. A thinner database reads as short.
/*
  25 rather than 26: the homework list was cut as not being learning, and the
  one check that added a task to it went with the screen. Arithmetic on what
  the app has, not a run being waved through.
*/
/*
  Raised by two: the meaning in the learner's own language, and the English
  still beside it. Both run whenever `tuba` has a paradigm behind it, which is
  the same condition the four checks above it already depend on.
*/
const { check, absent, done } = suite("The core flows", { floor: 27 });

/*
  Two checks below type through the Estonian letter bar, and whether that row is
  drawn is a stored preference rather than a fact about the app. On a machine
  where any earlier suite walked through first run and answered "I have them
  already", it is off, and this suite spent thirty seconds waiting for a button
  that was correctly hidden before failing in Playwright's words rather than in
  ones that name the cause. State the precondition instead of inheriting it.
*/
await ensureLetterBar(browser, B, "on");

// 1 — Dictionary: search, the case table, add to deck
/*
  The same rule as the letter bar above, applied to data rather than to a
  preference: state the precondition, do not inherit it.

  These three checks need `tuba` to open the seeded noun, and until recently
  that was not something this suite could count on. `Lexeme` is unique on
  `[lemma, pos]`, so a suite that ticks an unvouched word already in the
  dictionary leaves a second row under the same lemma with no paradigm behind
  it. `test-containment.mjs` did exactly that with `tuba`, and CI runs it two
  steps before this. What that cost was not one failed check: `waitForSelector`
  threw, the suite died before check one, and a whole run reported a Playwright
  timeout instead of a cause.

  So the wait is a question now. A dictionary with no `tuba` at all is a
  database nobody seeded, which is an honest absence and waives its checks. A
  `tuba` that opens without a paradigm is something shadowing it, which is a
  fault and says so in a sentence naming the likely culprit.
*/
await page.goto(`${B}/dictionary?q=tuba`, { waitUntil: "networkidle" });
const paradigm = await page
  .waitForSelector("text=toaga", { timeout: 10000 })
  .then(() => true, () => false);

if (!paradigm) {
  const opened = (await page.locator("main h2").first().innerText().catch(() => "")).trim();
  if (!opened) {
    absent(4, "a seeded dictionary: `tuba` is not in it at all. npm run db:seed");
  } else {
    /*
      Waived and failed, which is not two minds about it. The four checks
      genuinely cannot run, so the floor has to come down or the shortfall
      would report a second time in vaguer words; and the reason is a fault
      rather than a thin database, so it fails as well and says whose.
    */
    absent(4, "a `tuba` with a paradigm behind it, which something has shadowed");
    check(
      "the seeded noun is what `tuba` opens",
      false,
      `it opened "${opened}" with no paradigm. Another suite has probably left a second `
      + `"tuba" in the shared dictionary: see UNVOUCHED in scripts/test-containment.mjs`,
    );
  }
}

/*
  All four, not just the three about the paradigm. Adding to the deck is done
  from this same entry, so on a shadowed `tuba` it clicks a button that is not
  there, and the suite dies four checks later than it needs to with the cause
  already printed above it.
*/
if (paradigm) {
  check("search shows the short illative", (await page.getByText("tuppa", { exact: true }).count()) > 0);
  check("derived case table renders", (await page.getByText("toaga", { exact: true }).count()) > 0);
  check("gradation is flagged", (await page.getByText(/gradation b : ∅/i).count()) > 0);

  await page.getByRole("button", { name: /Add to deck|In deck/ }).click();
  await page.waitForTimeout(400);
  const addBtn = page.getByRole("button", { name: /^Add$/ });
  if (await addBtn.count()) await addBtn.click();
  check("add to deck completes",
    await eventually(async () => (await page.getByRole("button", { name: /In deck/ }).count()) > 0));
}

/*
  1b — A MEANING IN THE LANGUAGE THE LEARNER THINKS IN.

  Most people learning Estonian in Estonia already speak Russian or Ukrainian,
  and the equivalents come from Ekilex rather than from anything this app or a
  model wrote. Driven rather than reasoned about, because three separate things
  have to line up for a word to arrive in Russian: the harvest kept the
  equivalent, the seed wrote it, and the entry reads the learner's setting.

  It puts the setting back afterwards. This runs third in CI's order and
  everything after it reads the same database, so a suite that leaves the app
  in Russian would be handing the next one a screen it was not written for.
*/
if (paradigm) {
  await page.goto(`${B}/settings`, { waitUntil: "networkidle" });
  const russian = page.locator("#meanings [role=radio]", { hasText: "Russian" }).first();
  if (await russian.count()) {
    await russian.click();
    await page.waitForTimeout(1200);

    await page.goto(`${B}/dictionary?q=tuba`, { waitUntil: "networkidle" });
    const entry = (await page.locator("main").innerText()).replace(/\n/g, " · ");
    check("a meaning arrives in the learner's own language", /комната/.test(entry),
      entry.slice(0, 120));
    check("and the English is still there beside it", /\broom\b/.test(entry),
      "the English gloss is the one every entry has, so it may never be replaced");

    await page.goto(`${B}/settings`, { waitUntil: "networkidle" });
    await page.locator("#meanings [role=radio]", { hasText: "English" }).first().click();
    await page.waitForTimeout(1000);
  } else {
    absent(2, "the Meanings setting, which needs a build carrying it");
  }
}

// 2 — Search box drives navigation, and the diacritic bar types Estonian
await page.goto(`${B}/dictionary`, { waitUntil: "networkidle" });
await page.getByLabel("Search the dictionary").fill("room");
await page.getByRole("button", { name: "Search" }).click();
await page.waitForSelector("text=toaga", { timeout: 10000 });
check("English search finds the Estonian word", page.url().includes("q=room"));

await page.goto(`${B}/dictionary`, { waitUntil: "networkidle" });
await requireLetterBar(page);
await page.getByLabel("Search the dictionary").fill("s");
await page.getByLabel("Insert õ").click();
check("diacritic bar inserts õ",
  await eventually(async () => (await page.getByLabel("Search the dictionary").inputValue()) === "sõ"));

// 3 — Keyboard-only review.
// Review asks in four shapes — type it, pick it, flip it, or meet a word you
// have never seen (app/(app)/review/ReviewSession.tsx) — and which keys carry
// you through depends on the one in front of you. Two of them do not wait for a
// grade at all: a correct typed answer and a correct pick are marked against
// the dictionary and move on by themselves, because a confirmation keystroke on
// the most common outcome in the app halves its throughput.
//
// So the claim under test is "the keyboard alone gets from a question to a
// graded card", not "a particular button appears". Asserting the button made
// this fail about one run in four, on nothing worse than guessing the right
// option; asserting `Good` specifically then failed every run once the app
// stopped asking who was right on a card it had already marked.
await page.goto(`${B}/review`, { waitUntil: "networkidle" });
const before = await page.getByText(/\d+ left/).textContent();
const graded = async () => Number(/(\d+) graded/.exec(await page.locator("main").innerText())?.[1] ?? 0);
const gradedBefore = await graded();

/*
  Which of the four shapes is in front of us, named rather than fallen through.

  The chain here used to be three `else if`s, so an `intro` card matched none
  of them and the suite pressed nothing without knowing it had not. That is
  the shape the whole check turns on: a new word leads with its answer, so its
  rating buttons are already drawn and pressing anything first would step past
  the state being tested. Falling into that by accident is how a real bug hid
  behind what looked like deck-state flakiness for as long as it did, and it
  is also why the shape is printed on both checks below: a failure should say
  which of the four it met.
*/
const answerBox = page.getByLabel("Type your answer");
const shape =
  (await answerBox.count()) ? "type"
  : (await page.getByText(/Pick the meaning/).count()) ? "choice"
  : (await page.getByRole("button", { name: /Show answer/ }).count()) ? "flip"
  : "intro";

if (shape === "type") {
  await answerBox.fill("ükskõik");
  await page.keyboard.press("Enter");
} else if (shape === "choice") {
  await page.keyboard.press("1");
} else if (shape === "flip") {
  await page.keyboard.press("Space");
}
// `intro` presses nothing, deliberately: the answer and the ratings are both
// already on screen, and this is the one shape where the rating keys were
// unreachable.
await page.waitForTimeout(900);

// What is on screen now is one of three things: nothing to do because the
// answer was marked correct and the card has gone; one button, on a miss or on
// a word being met for the first time, which Enter takes; or the two self-grade
// buttons of a flip card, where 2 is "Got it".
const carryOn = (await page.getByRole("button", { name: /Got it/ }).count()) > 0;
const selfGrade = (await page.getByRole("button", { name: /^Got it$/ }).count()) > 0;
const alreadyGraded = (await graded()) > gradedBefore;
check("the answer is reachable from the keyboard", carryOn || selfGrade || alreadyGraded,
  carryOn ? "one way on offered"
    : selfGrade ? "self-grade offered"
      : alreadyGraded ? "marked and advanced on its own" : "neither");

if (carryOn) await page.keyboard.press("Enter");
else if (selfGrade) await page.keyboard.press("2");
/*
  Counted on the session's own graded tally rather than on "N left".

  That was only ever a valid proxy because the old driver forced a Good: a
  grade of Again deliberately puts the card back a few places later in the same
  session, so the queue does not shrink and the counter does not move. Now that
  the app marks the answer itself, a deliberately wrong typed answer grades
  Again, and reading "60 left -> 60 left" as a failure would be the test
  demanding that a card you just got wrong be taken away from you.
*/
const gradedAfter = await eventually(async () => (await graded()) > gradedBefore);
check("the keyboard gets from a question to a graded card", gradedAfter,
  `${gradedBefore} graded -> ${await graded()} graded, ${before} -> ${await page.getByText(/\d+ left/).textContent()}`);

// 5 — Import
await page.goto(`${B}/settings`, { waitUntil: "networkidle" });
const stamp = Date.now();
const list = `testsona${stamp} - test word\ntestverb${stamp}ma - to test`;
await page.getByLabel("Paste word list").fill(list);
check("import preview parses pasted lines",
  await eventually(async () => (await page.getByText(/2 words found/).count()) > 0));
await page.getByRole("button", { name: /Add 2 words/ }).click();
check("import writes words and cards",
  await eventually(async () => (await page.getByText(/Added 2 words/).count()) > 0));

// Re-importing the same list must not duplicate anything.
await page.getByLabel("Paste word list").fill(list);
await page.waitForTimeout(400);
await page.getByRole("button", { name: /Add 2 words/ }).click();
check("re-importing the same words does not duplicate them",
  await eventually(async () => (await page.getByText(/already in your deck/).count()) > 0));

/*
  A paste that repeats a line, which is what a list assembled from two handouts
  looks like. The importer used to ask the database about every row on its own,
  so the second copy found what the first had just written; it reads the whole
  paste in one query now and drops the repeats before counting.

  The count is the thing to check, and the first version of this check got that
  wrong. It asserted "Added 1 word", which is 1 whether the repeat is dropped or
  not, because `createMany` is told to skip duplicates and so writes one row
  either way. What actually breaks is `skipped`, which collects a lemma per row
  that was already there: a new word beside a repeated old one then reads
  "Skipped 2 you already had" about one word. So the list below is one new word
  and one old one written twice, and the number in that sentence is the check.
*/
const kaks = `testkaks${stamp} - twice over`;
await page.getByLabel("Paste word list").fill(kaks);
await page.waitForTimeout(400);
await page.getByRole("button", { name: /Add 1 word\b/ }).click();
await eventually(async () => (await page.getByText(/Added 1 word\b/).count()) > 0);

const mixed = `testuus${stamp} - brand new\n${kaks}\n${kaks}`;
await page.getByLabel("Paste word list").fill(mixed);
await page.waitForTimeout(400);
await page.getByRole("button", { name: /Add \d+ words?/ }).click();
const skippedLine = await eventually(async () =>
  (await page.getByText(/Skipped \d+ you already had/).count()) > 0);
const said = (await page.locator("main").innerText()).replace(/\n+/g, " · ");
check("a repeated line is counted once, not twice",
  skippedLine && /Skipped 1 you already had/.test(said),
  said.slice(0, 140));

// 6 — Export
const res = await page.request.get(`${B}/api/export`);
const body = await res.json();
check("export returns the full dataset", res.ok() && body.counts.cards > 0,
  `${body.counts?.words} words, ${body.counts?.cards} cards, ${body.counts?.reviews} reviews`);

// 7 — The tutor tab reflects whether a key is configured, either way
await page.goto(`${B}/tutor`, { waitUntil: "networkidle" });
const needsKey = (await page.getByText("Anu needs an API key").count()) > 0;
/*
  The shape of the line, not a list of provider names.

  This named three providers and the chain has had five since Groq and Gemini
  joined `PROVIDER_KEY_ENV`, so on any machine carrying one of those two keys
  the page was correct, the check was stale, and the failure read as a fault in
  the app. That is the same "a list in the test falls behind the chain" fault
  the provider suite was fixed for. The tutor prints "Will ask <provider> ·
  <model>" before a reply and "Answered by" after one, whoever answers, so
  matching that shape cannot fall behind a new provider.
*/
const connected = (await page.getByText(/(Will ask|Answered by) .+ · .+/).count()) > 0;
check("the tutor tab is honest about its key state", needsKey !== connected,
  needsKey ? "no key — shows setup guidance" : "key set — shows the provider");

// 8 — Audio really plays through the proxy
const tts = await page.request.post(`${B}/api/tts`, { data: { text: "tere" } });
const buf = await tts.body();
check("Estonian audio comes back as a WAV", tts.ok() && buf.subarray(0, 4).toString() === "RIFF",
  `${buf.length} bytes`);

// 9 — Adding a word the built-in dictionary does not carry
const word = `proovisona${Date.now()}`;
await page.goto(`${B}/dictionary?q=${word}`, { waitUntil: "networkidle" });
check("a failed search offers an add form, not a dead end", (await page.getByText("Add a word").count()) > 0);
await page.getByPlaceholder("word").fill("trial word");
/*
  BY THE FIELD'S NAME, NOT BY A PREFIX OF ITS PLACEHOLDER.

  This read `getByPlaceholder("toa")`, which is a substring match, and it broke
  the day the nominative plural became a principal part and the form grew a
  field whose example is `toad`. The label is what a person uses to find the
  box, it is what the form promises, and it cannot be made ambiguous by adding
  a field beside it.
*/
const genitiveField = page.getByRole("textbox", { name: "Genitive sg" });
await genitiveField.fill(`${word}u`);
await page.getByRole("button", { name: "Save word" }).click();
// What the screen actually said, when it did not say this. A check that
// reports only false sends the next person to the app looking for a bug that
// may be in the navigation rather than in the save: this one failed on CI for
// fifteen seconds over a word the database already had, because the page had
// been re-rendered back to the add form.
const opened = await eventually(async () => (await page.getByText("trial word").count()) > 0);
check("the new word opens as a full entry", opened,
  opened ? "" : `still on: ${(await page.locator("main").innerText()).replace(/\n+/g, " · ").slice(0, 90)}`);
check("its case table is derived from the genitive I typed",
  (await page.getByText(`${word}us`, { exact: true }).count()) > 0);
// Waited for, not sampled. Saving a word now leaves the add form by a real
// navigation rather than a router refresh, because the refresh dropped the
// update about a third of the time; the entry's text is in the server HTML
// immediately, while this button belongs to a client component and arrives a
// moment later on hydration.
check("and it can go straight into the deck",
  await eventually(async () => (await page.getByRole("button", { name: /Add to deck/ }).count()) > 0));

// The shared diacritic bar must type into whichever field has focus, and React
// must see the change — a direct .value write would be silently discarded.
await page.goto(`${B}/dictionary?q=zzznotaword`, { waitUntil: "networkidle" });
const genField = page.getByRole("textbox", { name: "Genitive sg" });
await genField.click();
await genField.fill("s");
await page.getByLabel("Insert an Estonian letter into the field you're typing in").getByLabel("Insert ä").click();
check("shared diacritic bar types into the focused field",
  await eventually(async () => (await genField.inputValue()) === "sä"),
  `got "${await genField.inputValue()}"`);

// 10 — The suggestion row, which is the empty state's whole answer
/*
  This row read the first forty rows of an alphabetical list and drew twelve,
  so for the life of the app it offered `aasialane`, `aastatuhat` and
  `aberratsioon` to everybody, every day, and the daily skip made it look as
  though it moved. Three things are worth driving a browser for, and none of
  them is visible to a unit test: that the row says why it chose these words,
  that a chip actually opens the entry it names, and that the row moves.
*/
await page.goto(`${B}/dictionary`, { waitUntil: "networkidle" });
const rowOf = async () =>
  (await page.locator('ul[aria-labelledby="try-these"] button').allInnerTexts()).map((t) => t.trim());

const first = await rowOf();
if (first.length === 0) {
  absent(4, "a seeded dictionary, which is what the suggestion row draws from");
} else {
  const label = (await page.locator("#try-these").innerText()).trim();
  check("the row says why it chose these words", label.length > 3, `label "${label}"`);

  /*
    Not sorted. That is the fault stated exactly: the old row was always the
    alphabetical head, and twelve words landing in order by chance is one in
    twelve factorial.
  */
  const sorted = [...first].sort((a, b) => a.localeCompare(b, "et"));
  check("the row is not the top of an alphabetical list",
    first.join("|") !== sorted.join("|"), first.slice(0, 3).join(", "));

  /*
    Six loads rather than two. One repeat is possible when a source has a
    small pool; six identical rows is the row being frozen, which is the thing
    that was wrong.
  */
  const rows = [first.join("|")];
  for (let i = 0; i < 5; i += 1) {
    await page.goto(`${B}/dictionary`, { waitUntil: "networkidle" });
    rows.push((await rowOf()).join("|"));
  }
  check("the row moves between visits", new Set(rows).size > 1, `${new Set(rows).size} of 6 differ`);

  await page.goto(`${B}/dictionary`, { waitUntil: "networkidle" });
  const word = (await rowOf())[0];
  await page.locator('ul[aria-labelledby="try-these"] button').first().click();
  /*
    Waiting for the URL rather than for the network. A chip navigates through
    the router, so the page is already idle when the click lands and
    `waitForLoadState` returns before anything has happened.
  */
  const arrived = await page
    .waitForURL((url) => decodeURIComponent(url.href).includes(`q=${word}`), { timeout: 10000 })
    .then(() => true, () => false);
  check("a suggested word opens its own entry",
    arrived && (await page.getByRole("heading", { name: word, exact: true }).count()) > 0,
    `chip "${word}" landed on ${decodeURIComponent(page.url())}`);
}

// 11 — B1+ coverage, with verb government
await page.goto(`${B}/dictionary?q=sõltuma`, { waitUntil: "networkidle" });
check("B1 verb carries its government",
  (await page.getByText(/elative/i).count()) > 0);


console.log(errors.length ? `\nconsole/page errors:\n  ${errors.join("\n  ")}` : "\nno console errors");
await browser.close();
done();
