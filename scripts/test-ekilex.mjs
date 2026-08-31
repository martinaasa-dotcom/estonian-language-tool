import { launchChromium } from "./lib/browser.mjs";
import { baseUrl, suite } from "./lib/checks.mjs";
import { PrismaClient } from "@prisma/client";
import { requireLocalDatabase } from "./lib/local-db.mjs";

const B = baseUrl();
const prisma = new PrismaClient({
  datasourceUrl: requireLocalDatabase("delete a dictionary entry and re-fetch it"),
});
// Floor: ten checks, all unconditional.
const { check, done } = suite("Ekilex lookup", { floor: 10 });
const browser = await launchChromium();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1200 } })).newPage();
const errors = [];
page.on("pageerror", e => errors.push(String(e)));

// A word that cannot be in the 360-word seed. Cleared first so the fetch path is
// genuinely exercised rather than served from a previous run's cache.
const word = "raudteejaam"; // railway station
await prisma.lexeme.deleteMany({ where: { lemma: word } });
await page.goto(`${B}/dictionary?q=${word}`, { waitUntil: "networkidle", timeout: 60000 });
check("a word outside the seed is fetched from Ekilex",
  (await page.getByText(/Fetched from Ekilex/).count()) > 0);
check("it comes back with an English translation",
  (await page.locator("h2[lang=et]").innerText()) === word &&
  !(await page.getByText("— add a translation").count()));
check("the authoritative forms are shown, not derived ones",
  (await page.getByText(/Every form, from Ekilex/i).count()) > 0);
/*
  The retrieved forms are a table now (app/dictionary/Forms.tsx): one row
  per case, naming it in both languages. Asserted on the row's text rather than
  on the element it happens to be built from.

  Matched without regard to case, because the rule is that both names are there
  and the Estonian one leads, not that the Latin one is capitalised. It used to
  ask for "Comitative", and when the Estonian name took the lead the English one
  became a small italic cross-reference set in lower case, so this check had been
  failing on correct markup ever since. Nobody saw it: this suite needs a real
  Ekilex key and the network, so CI never runs it (scripts/lib/suites.mjs), and
  an on-demand suite reports on the code it was written against.
*/
const comitativeRow = await page
  .locator("tr", { hasText: /comitative/i })
  .first()
  .innerText()
  .catch(() => "");
check("case names are given in English as well as Estonian",
  /comitative/i.test(comitativeRow) && comitativeRow.includes("kaasaütlev"),
  comitativeRow.replace(/\s+/g, " ").trim() || "no comitative row");
check("Ekilex is credited, as CC BY requires",
  (await page.getByText(/Institute of the Estonian Language · CC BY 4.0/).count()) > 0);

// Second visit must be local.
const t0 = Date.now();
await page.goto(`${B}/dictionary?q=${word}`, { waitUntil: "networkidle" });
const ms = Date.now() - t0;
check("the second lookup is served locally", ms < 2500, `${ms}ms`);
check("and no longer claims to have just fetched it",
  (await page.getByText(/Fetched from Ekilex/).count()) === 0);

// A seeded word gets upgraded in place.
await page.goto(`${B}/dictionary?q=jalg`, { waitUntil: "networkidle", timeout: 60000 });
check("a seeded word is upgraded to the real forms",
  (await page.getByText(/Every form, from Ekilex/i).count()) > 0);
check("its hand-written English is kept", (await page.getByText(/leg, foot/).count()) > 0);

check("no page errors", errors.length === 0, errors.join("; "));
await browser.close();
await prisma.$disconnect();
done();
