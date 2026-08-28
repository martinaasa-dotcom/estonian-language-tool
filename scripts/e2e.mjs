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

// 3 — Keyboard-only review
await page.goto(`${B}/review`, { waitUntil: "networkidle" });
const before = await page.getByText(/\d+ left/).textContent();
await page.keyboard.press("Space");
await page.waitForTimeout(400);
check("space reveals the answer", (await page.getByRole("button", { name: /^Good/ }).count()) > 0);
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
await page.getByLabel("Paste word list").fill("kirjutuslaud - desk\nkohvik - cafe");
await page.waitForTimeout(500);
check("import preview parses pasted lines", (await page.getByText(/2 words found/).count()) > 0);
await page.getByRole("button", { name: /Add 2 words/ }).click();
await page.waitForTimeout(2500);
check("import writes words and cards", (await page.getByText(/Added 2 words/).count()) > 0);

// 6 — Export
const res = await page.request.get(`${B}/api/export`);
const body = await res.json();
check("export returns the full dataset", res.ok() && body.counts.cards > 0,
  `${body.counts?.words} words, ${body.counts?.cards} cards, ${body.counts?.reviews} reviews`);

// 7 — Tutor degrades gracefully with no key
await page.goto(`${B}/tutor`, { waitUntil: "networkidle" });
check("tutor explains the missing key instead of erroring",
  (await page.getByText("Anu needs an API key").count()) > 0);

// 8 — Audio really plays through the proxy
const tts = await page.request.post(`${B}/api/tts`, { data: { text: "tere" } });
const buf = await tts.body();
check("Estonian audio comes back as a WAV", tts.ok() && buf.subarray(0, 4).toString() === "RIFF",
  `${buf.length} bytes`);

console.log(errors.length ? `\nconsole/page errors:\n  ${errors.join("\n  ")}` : "\nno console errors");
console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
