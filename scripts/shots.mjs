import { chromium } from "playwright";

const OUT = process.argv[2];
const PAGES = [
  ["today", "/"],
  ["dictionary", "/dictionary?q=tuba"],
  ["review", "/review"],
  ["words", "/words"],
  ["tasks", "/tasks"],
  ["settings", "/settings"],
  ["tutor", "/tutor"],
];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const theme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: theme });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));

  for (const [name, path] of PAGES) {
    await page.goto("http://localhost:3000" + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${name}-${theme}.png`, fullPage: true });
  }
  if (errors.length) console.log(`[${theme}] console errors:\n  ` + errors.join("\n  "));
  else console.log(`[${theme}] no console errors`);
  await ctx.close();
}
await browser.close();
