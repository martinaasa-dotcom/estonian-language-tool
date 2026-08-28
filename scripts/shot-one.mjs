import { chromium } from "playwright";
const [url, out, theme = "light"] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await (await b.newContext({ viewport: { width: 1280, height: 1000 }, colorScheme: theme })).newPage();
await p.goto(url, { waitUntil: "networkidle" });
await p.waitForTimeout(500);
await p.screenshot({ path: out, fullPage: true });
await b.close();
