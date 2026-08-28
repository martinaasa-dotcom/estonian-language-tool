import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const B = "http://localhost:3000";
let failures = 0;
const check = (l, ok, extra = "") => { if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${extra ? "  (" + extra + ")" : ""}`); };
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await (await browser.newContext()).newPage();

await page.goto(`${B}/`, { waitUntil: "networkidle" });
check("the app is branded Kodukeel", (await page.title()).startsWith("Kodukeel"), await page.title());

const dir = "/tmp/claude-0/-home-user-estonian-language-tool/e6a89ec2-b175-5722-948f-31d2417eb1d4/scratchpad";
await page.goto(`${B}/settings`, { waitUntil: "networkidle" });
await page.getByLabel("Choose a backup file").setInputFiles({
  name: "old.json", mimeType: "application/json",
  buffer: Buffer.from(readFileSync(`${dir}/old-format.json`)),
});
await page.waitForTimeout(1500);
check("a backup written before the rename is still accepted",
  (await page.getByText(/holds/).count()) > 0,
  await page.getByText(/doesn't look like/).innerText().catch(() => "accepted"));

await browser.close();
console.log(failures === 0 ? "\nRename verified." : `\n${failures} failed.`);
process.exit(failures ? 1 : 0);
