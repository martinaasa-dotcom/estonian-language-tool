import { launchChromium } from "./lib/browser.mjs";
const B = "http://localhost:3000";
let failures = 0;
const check = (l, ok, extra = "") => { if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${extra ? "  (" + extra + ")" : ""}`); };
const browser = await launchChromium();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();

await page.goto(`${B}/tutor`, { waitUntil: "networkidle" });
check("Anu is connected now that a key is set",
  (await page.getByText("Anu needs an API key").count()) === 0);
check("the provider in use is shown", (await page.getByText(/OpenRouter ·/).count()) > 0);

await page.getByLabel("Ask Anu a question").fill("Why is it 'Lugesin raamatut' and not 'Lugesin raamatu'?");
await page.getByRole("button", { name: /Ask/ }).click();
await page.waitForTimeout(18000);

const reply = await page.locator("div").filter({ hasText: /^Anu/ }).last().innerText().catch(() => "");
check("she answers, and streams into the page", reply.length > 60, `${reply.length} chars`);
check("the answer names the partitive rule", /partitiv/i.test(reply),
  reply.replace(/\n/g, " ").slice(0, 120));

await browser.close();
console.log(failures === 0 ? "\nAnu verified in the app." : `\n${failures} failed.`);
process.exit(failures ? 1 : 0);
