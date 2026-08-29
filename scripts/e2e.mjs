import { chromium } from "playwright";

const B = "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
let failures = 0;
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

const check = (label, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? "  (" + extra + ")" : ""}`);
};

// 1 — Dictionary: search, paradigm, add to deck
await page.goto(`${B}/dictionary?q=tuba`, { waitUntil: "networkidle" });
await page.waitForSelector("text=toaga", { timeout: 10000 });
check("search shows the short illative", (await page.getByText("tuppa", { exact: true }).count()) > 0);
check("derived case table renders", (await page.getByText("toaga", { exact: true }).count()) > 0);
check("gradation is flagged", (await page.getByText(/gradation b : ∅/i).count()) > 0);

await page.getByRole("button", { name: /Add to deck|In deck/ }).click();
await page.waitForTimeout(400);
const addBtn = page.getByRole("button", { name: /^Add$/ });
if (await addBtn.count()) { await addBtn.click(); await page.waitForTimeout(1500); }
check("add to deck completes", (await page.getByRole("button", { name: /In deck/ }).count()) > 0);

// 2 — Search box drives navigation, and the diacritic bar types Estonian
await page.goto(`${B}/dictionary`, { waitUntil: "networkidle" });
await page.getByLabel("Search the dictionary").fill("room");
await page.getByRole("button", { name: "Search" }).click();
await page.waitForSelector("text=toaga", { timeout: 10000 });
check("English search finds the Estonian word", page.url().includes("q=room"));

await page.goto(`${B}/dictionary`, { waitUntil: "networkidle" });
await page.getByLabel("Search the dictionary").fill("s");
await page.getByLabel("Insert õ").click();
await page.waitForTimeout(300);
check("diacritic bar inserts õ", (await page.getByLabel("Search the dictionary").inputValue()) === "sõ");

// 3 — Keyboard-only review.
// Review asks in three shapes now — type it, pick it, flip it (see
// app/review/ReviewSession.tsx) — so this reaches the rating buttons the way
// the shape in front of it allows, then grades with a number key.
await page.goto(`${B}/review`, { waitUntil: "networkidle" });
const before = await page.getByText(/\d+ left/).textContent();
const answerBox = page.getByLabel("Type your answer");
if (await answerBox.count()) {
  await answerBox.fill("ükskõik");
  await page.keyboard.press("Enter");
} else if (await page.getByText(/Pick the meaning/).count()) {
  await page.keyboard.press("1");
} else {
  await page.keyboard.press("Space");
}
await page.waitForTimeout(700);
check("the answer is reachable from the keyboard", (await page.getByRole("button", { name: /^Good/ }).count()) > 0);
await page.keyboard.press("3");
await page.waitForTimeout(2000);
const after = await page.getByText(/\d+ left/).textContent();
check("number key grades and advances", before !== after, `${before} -> ${after}`);

// 4 — Tasks
await page.goto(`${B}/tasks`, { waitUntil: "networkidle" });
await page.getByLabel("Task title").fill("Revise the comitative");
await page.getByRole("button", { name: /^Add$/ }).click();
await page.waitForTimeout(2000);
check("task is created and persists", (await page.getByText("Revise the comitative").count()) > 0);

// 5 — Import
await page.goto(`${B}/settings`, { waitUntil: "networkidle" });
const stamp = Date.now();
const list = `testsona${stamp} - test word\ntestverb${stamp}ma - to test`;
await page.getByLabel("Paste word list").fill(list);
await page.waitForTimeout(500);
check("import preview parses pasted lines", (await page.getByText(/2 words found/).count()) > 0);
await page.getByRole("button", { name: /Add 2 words/ }).click();
await page.waitForTimeout(2500);
check("import writes words and cards", (await page.getByText(/Added 2 words/).count()) > 0);

// Re-importing the same list must not duplicate anything.
await page.getByLabel("Paste word list").fill(list);
await page.waitForTimeout(400);
await page.getByRole("button", { name: /Add 2 words/ }).click();
await page.waitForTimeout(2500);
check("re-importing the same words does not duplicate them",
  (await page.getByText(/already in your deck/).count()) > 0);

// 6 — Export
const res = await page.request.get(`${B}/api/export`);
const body = await res.json();
check("export returns the full dataset", res.ok() && body.counts.cards > 0,
  `${body.counts?.words} words, ${body.counts?.cards} cards, ${body.counts?.reviews} reviews`);

// 7 — The tutor tab reflects whether a key is configured, either way
await page.goto(`${B}/tutor`, { waitUntil: "networkidle" });
const needsKey = (await page.getByText("Anu needs an API key").count()) > 0;
const connected = (await page.getByText(/OpenRouter ·|Anthropic ·|OpenAI ·/).count()) > 0;
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
await page.waitForTimeout(2500);
check("the new word opens as a full entry", (await page.getByText("trial word").count()) > 0);
check("its case table is derived from the genitive I typed",
  (await page.getByText(`${word}us`, { exact: true }).count()) > 0);
check("and it can go straight into the deck",
  (await page.getByRole("button", { name: /Add to deck/ }).count()) > 0);

// The shared diacritic bar must type into whichever field has focus, and React
// must see the change — a direct .value write would be silently discarded.
await page.goto(`${B}/dictionary?q=zzznotaword`, { waitUntil: "networkidle" });
const genField = page.getByPlaceholder("toa");
await genField.click();
await genField.fill("s");
await page.getByLabel("Insert an Estonian character into the field you are typing in").getByLabel("Insert ä").click();
await page.waitForTimeout(300);
check("shared diacritic bar types into the focused field",
  (await genField.inputValue()) === "sä", `got "${await genField.inputValue()}"`);

// 10 — B1+ coverage, with verb government
await page.goto(`${B}/dictionary?q=sõltuma`, { waitUntil: "networkidle" });
check("B1 verb carries its government",
  (await page.getByText(/elative/i).count()) > 0);


console.log(errors.length ? `\nconsole/page errors:\n  ${errors.join("\n  ")}` : "\nno console errors");
console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
