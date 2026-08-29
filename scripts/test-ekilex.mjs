import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import { requireLocalDatabase } from "./lib/local-db.mjs";

const B = "http://localhost:3000";
const prisma = new PrismaClient({
  datasourceUrl: requireLocalDatabase("delete a dictionary entry and re-fetch it"),
});
let failures = 0;
const check = (l, ok, extra = "") => { if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${extra ? "  (" + extra + ")" : ""}`); };
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
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
check("the authoritative paradigm is shown, not a derived one",
  (await page.getByText(/The full paradigm, from Ekilex/i).count()) > 0);
// The retrieved paradigm is a table now (app/dictionary/Paradigm.tsx): one row
// per case, naming it in both languages. Asserted on the row's text rather than
// on the element it happens to be built from.
const comitativeRow = await page
  .locator("tr", { hasText: "Comitative" })
  .first()
  .innerText()
  .catch(() => "");
check("case names are given in English as well as Estonian",
  comitativeRow.includes("Comitative") && comitativeRow.includes("kaasaütlev"),
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
check("a seeded word is upgraded to the real paradigm",
  (await page.getByText(/The full paradigm, from Ekilex/i).count()) > 0);
check("its hand-written English is kept", (await page.getByText(/leg, foot/).count()) > 0);

check("no page errors", errors.length === 0, errors.join("; "));
await browser.close();
await prisma.$disconnect();
console.log(failures === 0 ? "\nEkilex integration verified." : `\n${failures} failed.`);
process.exit(failures ? 1 : 0);
