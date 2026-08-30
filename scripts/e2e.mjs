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

// Floor: 21, measured in the state CI seeds. A thinner database reads as short.
const { check, done } = suite("The core flows", { floor: 21 });

/*
  Two checks below type through the Estonian letter bar, and whether that row is
  drawn is a stored preference rather than a fact about the app. On a machine
  where any earlier suite walked through first run and answered "I have them
  already", it is off, and this suite spent thirty seconds waiting for a button
  that was correctly hidden before failing in Playwright's words rather than in
  ones that name the cause. State the precondition instead of inheriting it.
*/
await ensureLetterBar(browser, B, "on");

// 1 — Dictionary: search, paradigm, add to deck
await page.goto(`${B}/dictionary?q=tuba`, { waitUntil: "networkidle" });
await page.waitForSelector("text=toaga", { timeout: 10000 });
check("search shows the short illative", (await page.getByText("tuppa", { exact: true }).count()) > 0);
check("derived case table renders", (await page.getByText("toaga", { exact: true }).count()) > 0);
check("gradation is flagged", (await page.getByText(/gradation b : ∅/i).count()) > 0);

await page.getByRole("button", { name: /Add to deck|In deck/ }).click();
await page.waitForTimeout(400);
const addBtn = page.getByRole("button", { name: /^Add$/ });
if (await addBtn.count()) await addBtn.click();
check("add to deck completes",
  await eventually(async () => (await page.getByRole("button", { name: /In deck/ }).count()) > 0));

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
// Review asks in several shapes — type it, pick it, flip it, or lead with the
// answer on a card you have never seen (app/(app)/review/ReviewSession.tsx) —
// and which keys carry you through depends on the one in front of you. One
// path deliberately skips the rating buttons: a *correct* multiple-choice pick
// auto-advances after 420ms, because a confirmation keystroke on every right
// answer halves the throughput of the fast mode.
//
// So the claim under test is "the keyboard alone gets from a question to a
// graded card", not "the Good button appears". Asserting the button made this
// fail about one run in four, on nothing worse than guessing the right option.
await page.goto(`${B}/review`, { waitUntil: "networkidle" });
const before = await page.getByText(/\d+ left/).textContent();
const graded = async () => Number(/(\d+) graded/.exec(await page.locator("main").innerText())?.[1] ?? 0);
const gradedBefore = await graded();

const answerBox = page.getByLabel("Type your answer");
if (await answerBox.count()) {
  await answerBox.fill("ükskõik");
  await page.keyboard.press("Enter");
} else if (await page.getByText(/Pick the meaning/).count()) {
  await page.keyboard.press("1");
} else if (await page.getByRole("button", { name: /Show answer/ }).count()) {
  await page.keyboard.press("Space");
}
await page.waitForTimeout(900);

const rateable = (await page.getByRole("button", { name: /^Good/ }).count()) > 0;
const alreadyGraded = (await graded()) > gradedBefore;
check("the answer is reachable from the keyboard", rateable || alreadyGraded,
  rateable ? "rating offered" : alreadyGraded ? "auto-advanced on a correct pick" : "neither");

if (rateable) await page.keyboard.press("3");
const advanced = await eventually(async () =>
  (await page.getByText(/\d+ left/).textContent()) !== before);
const after = await page.getByText(/\d+ left/).textContent();
check("number key grades and advances", advanced, `${before} -> ${after}`);

// 4 — Tasks
await page.goto(`${B}/tasks`, { waitUntil: "networkidle" });
await page.getByLabel("Task title").fill("Revise the comitative");
await page.getByRole("button", { name: /^Add$/ }).click();
/*
  Same reporting as the word above, and for the same reason: this one failed
  twice in CI, fifteen seconds each time, and "false" does not say whether the
  task was never created or created and not shown.

  IT POLLS ACROSS A RELOAD NOW, AND THAT IS WHAT THE CHECK CLAIMS TO TEST.
  Adding a task writes through a Server Action and then asks for the route
  again; the previous version waited fifteen seconds for that client-side
  refresh to land in this DOM and never looked anywhere else, so a refresh that
  raced or was dropped read as a task that was never written. Both are worth
  failing on, but only one of them is "created and persists", and re-reading the
  page from the server is the only way to tell them apart. It failed a third
  time in CI on a tree that already carried the fix for the first two, which is
  the argument for testing the claim rather than the mechanism that usually
  delivers it.
*/
const taskShown = await eventually(async () => {
  if ((await page.getByText("Revise the comitative").count()) > 0) return true;
  await page.reload({ waitUntil: "networkidle" }).catch(() => {});
  return (await page.getByText("Revise the comitative").count()) > 0;
}, { everyMs: 500 });
check("task is created and persists", taskShown,
  taskShown ? "" : `list says: ${(await page.locator("main").innerText()).replace(/\n+/g, " · ").slice(0, 90)}`);

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
await page.getByPlaceholder("toa").fill(`${word}u`);
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
const genField = page.getByPlaceholder("toa");
await genField.click();
await genField.fill("s");
await page.getByLabel("Insert an Estonian character into the field you are typing in").getByLabel("Insert ä").click();
check("shared diacritic bar types into the focused field",
  await eventually(async () => (await genField.inputValue()) === "sä"),
  `got "${await genField.inputValue()}"`);

// 10 — B1+ coverage, with verb government
await page.goto(`${B}/dictionary?q=sõltuma`, { waitUntil: "networkidle" });
check("B1 verb carries its government",
  (await page.getByText(/elative/i).count()) > 0);


console.log(errors.length ? `\nconsole/page errors:\n  ${errors.join("\n  ")}` : "\nno console errors");
await browser.close();
done();
