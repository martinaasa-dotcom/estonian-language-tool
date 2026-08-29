import { launchChromium } from "./lib/browser.mjs";
const OUT = process.argv[2];
const b = await launchChromium();

const shots = [
  ["01-today",      "/",                        "light", 1000],
  ["02-dictionary", "/dictionary?q=tuba",       "light", 1400],
  ["03-review",     "/review",                  "dark",  760],
  ["04-words",      "/words",                   "light", 1000],
  ["05-settings",   "/settings",                "light", 1200],
];
for (const [name, path, theme, height] of shots) {
  const ctx = await b.newContext({ viewport: { width: 1280, height }, colorScheme: theme });
  const p = await ctx.newPage();
  await p.goto("http://localhost:3000" + path, { waitUntil: "networkidle" });
  await p.waitForTimeout(500);
  if (path === "/review") { await p.keyboard.press("Space"); await p.waitForTimeout(400); }
  await p.screenshot({ path: `${OUT}/${name}.png` });
  await ctx.close();
}
await b.close();
console.log("captured", shots.length, "screens");
