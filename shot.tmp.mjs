import { chromium } from "playwright";
const B = "http://localhost:3000";
const OUT = "/tmp/claude-0/-home-user-estonian-language-tool/d5d634d8-a3b2-5fdc-b741-5572a6ce2220/scratchpad/shots";
const [,, path, name, action] = process.argv;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
const errs = [];
page.on("pageerror", e => errs.push(String(e)));
page.on("console", m => { if (m.type()==="error") errs.push(m.text().slice(0,200)); });
await page.goto(`${B}${path}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
if (action === "translate") {
  const btn = page.getByRole("button", { name: /Translate this/ }).first();
  if (await btn.count()) { await btn.click(); await page.waitForTimeout(9000); }
}
await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
console.log(errs.length ? "ERRORS: " + errs.slice(0,5).join(" | ") : "no console errors");
await browser.close();
