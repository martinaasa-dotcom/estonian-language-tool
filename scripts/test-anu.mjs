import { launchChromium } from "./lib/browser.mjs";
import { baseUrl, suite } from "./lib/checks.mjs";
const B = baseUrl();
// Floor: five checks, all unconditional.
const { check, done } = suite("Anu", { floor: 5 });
const browser = await launchChromium();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();

await page.goto(`${B}/tutor`, { waitUntil: "networkidle" });
check("Anu is connected now that a key is set",
  (await page.getByText(/Anu needs an .{1,6} key/).count()) === 0);
check("the provider in use is shown", (await page.getByText(/OpenRouter ·/).count()) > 0);

await page.getByLabel("Ask Anu a question").fill("Why is it 'Lugesin raamatut' and not 'Lugesin raamatu'?");
await page.getByRole("button", { name: /Ask/ }).click();
await page.waitForTimeout(18000);

const reply = await page.locator("div").filter({ hasText: /^Anu/ }).last().innerText().catch(() => "");
check("she answers, and the finished reply lands on the page", reply.length > 60, `${reply.length} chars`);
check("and no markdown asterisk is left on screen", !/\*\*/.test(reply));
check("the answer names the partitive rule", /partitiv/i.test(reply),
  reply.replace(/\n/g, " ").slice(0, 120));

await browser.close();
done();
