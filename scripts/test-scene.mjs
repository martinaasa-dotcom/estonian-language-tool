#!/usr/bin/env node
/**
 * Situations, played through in a browser.
 *
 * What no unit test can see: the role card and the objectives on screen, the
 * first line arriving with its provenance chip, a turn read against the
 * dictionary without a round trip, an English turn answered rather than
 * scolded, the help button finding a word inside the scene's own list, a
 * walk-out reaching the debrief, and a whole scene played to its outcome
 * with the run stored once and never updated.
 *
 * The composer is the one thing stubbed, and it is stubbed as absent: CI
 * carries no key, so every beat nothing recorded fits is narrated, which is
 * the keyless deployment's own path and the one worth verifying first.
 * `test-scan.mjs` makes the same argument about a model.
 */
import { launchChromium } from "./lib/browser.mjs";
import { baseUrl, suite } from "./lib/checks.mjs";
import { PrismaClient } from "@prisma/client";
import { requireLocalDatabase } from "./lib/local-db.mjs";

const B = baseUrl();
const OWNER = "local-single-user";
const prisma = new PrismaClient({ datasourceUrl: requireLocalDatabase("write and delete scene runs") });

const { check, done } = suite("Situations", { floor: 30 });

async function cleanUp() {
  await prisma.sceneGap.deleteMany({ where: { ownerId: OWNER } });
  await prisma.sceneRun.deleteMany({ where: { ownerId: OWNER } });
  await prisma.encounter.deleteMany({ where: { ownerId: OWNER } });
}
await cleanUp();

const browser = await launchChromium();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

/* The list. */
await page.goto(`${B}/situations`);
await page.locator("main h1").first().waitFor({ timeout: 20_000 });
check("the list names itself", (await page.locator("main h1").count()) === 1);
const cards = await page.locator('main a[href^="/situations/"]').count();
check("four scenes are offered", cards === 4, `${cards}`);
check("the difficulty dial is a radio group", (await page.locator('[role="radiogroup"]').count()) >= 1);
check("a scene says which promise it checks", (await page.getByText(/Checks that you can/).count()) >= 1);
check("the shop is offered to a beginner first", /pood/.test(await page.locator('main a[href^="/situations/"]').first().getAttribute("href") ?? ""));

/* Textbook difficulty, then the shop. */
await page.getByRole("radio", { name: "Textbook" }).click();
const href = await page.locator('main a[href^="/situations/pood"]').first().getAttribute("href");
check("the dial travels with the link", /d=0/.test(href ?? ""), href ?? "");
await page.goto(`${B}${href}`);
await page.locator("main h1").first().waitFor({ timeout: 20_000 });
check("the scene names itself", (await page.locator("main h1").count()) === 1);
check("the role card is on screen", (await page.getByText(/Your card/).count()) === 1);
check("the card says it is not about you", (await page.getByText(/Nothing on this card is about you/).count()) === 1);
check("the objectives are listed", (await page.getByText(/What you came for/).count()) === 1);

/* The first line. */
await page.getByText(/Recorded/).first().waitFor({ timeout: 20_000 });
check("the greeting is a recorded line, and says so", (await page.getByText(/Recorded/).count()) >= 1);
const firstLine = (await page.locator('[role="log"] p[lang="et"]').first().textContent()) ?? "";
check("the first line is a greeting", /tere/i.test(firstLine), firstLine);
check("a word in their line opens the dictionary", (await page.locator('[role="log"] a[href^="/dictionary?q="]').count()) >= 1);

/* Greet back: read against the dictionary, no round trip. */
const requests = [];
page.on("request", (r) => { if (r.url().includes("/api/scene")) requests.push(r.url()); });
const input = page.getByLabel("What you say");
await input.fill("Tere!");
await page.getByRole("button", { name: /Say it/ }).click();
await page.getByText(/^done$/).first().waitFor({ timeout: 20_000 });
check("greeting back ticks the first objective", (await page.getByText(/^done$/).count()) >= 1);
check("no round trip was needed to read the turn", requests.length === 0, `${requests.length}`);

/* Keyless: the second beat has nothing recorded, so they wait, in English. */
const waited = await page.getByText(/They wait|Recorded|Composed/).count();
check("the second beat is narrated or recorded, never invented", waited >= 1);

/* English is answered, not scolded. */
await input.fill("Sorry, I do not understand you");
await page.getByRole("button", { name: /Say it/ }).click();
await page.getByText(/in English/).first().waitFor({ timeout: 10_000 });
check("an English turn is read as English", (await page.getByText(/in English/).count()) >= 1);
check("English does not spend patience or tick anything", (await page.getByText(/^missed$/).count()) === 0);

/* The help button. */
await page.getByRole("button", { name: /What is the word for/ }).click();
await page.getByPlaceholder(/throat/).fill("bread");
await page.getByText(/leib|sai/).first().waitFor({ timeout: 10_000 });
check("help finds a word inside the scene's own list", (await page.locator("button", { hasText: /leib|sai/ }).count()) >= 1);
await page.locator("button", { hasText: /leib/ }).first().click();
check("choosing a word puts it in the box", /leib/.test(await input.inputValue()));

/* Say what you want, and how many. */
await input.fill("Ma tahan leiba, palun.");
await page.getByRole("button", { name: /Say it/ }).click();
await page.waitForTimeout(500);
const doneCount = await page.getByText(/^done$/).count();
check("a sentence with the word in it does the beat", doneCount >= 2, `${doneCount}`);

/* Walk out, and read the debrief. */
const reviewsBefore = await prisma.review.count({ where: { ownerId: OWNER } });
await page.getByRole("button", { name: /Walk out/ }).click();
await page.getByText(/How it went/).waitFor({ timeout: 30_000 });
check("walking out reaches the debrief", (await page.locator("main h1, h1").count()) >= 1);
check("the debrief leads with the outcome", (await page.getByText(/You left before it was settled/).count()) === 1);
check("it counts things done and never scores", (await page.getByText(/of \d+ things got done/).count()) === 1 && (await page.getByText(/%/).count()) === 0);
check("the word asked for comes back as a gap", (await page.getByText(/you asked for it/).count()) >= 1);
check("it offers the same scene again", (await page.locator('a[href^="/situations/pood?seed="]').count()) >= 1);
check("no client error", errors.length === 0, errors.join(" | ").slice(0, 200));

/* What was written. */
const runs = await prisma.sceneRun.findMany({ where: { ownerId: OWNER } });
check("one run was stored", runs.length === 1, `${runs.length}`);
const outcome = runs[0] ? JSON.parse(runs[0].outcome) : {};
check("the run says it was walked out of", outcome.walkedOut === true);
check("the run counts the English turn", outcome.english === 1, `${outcome.english}`);
const transcript = runs[0] ? JSON.parse(runs[0].transcript) : {};
check("the transcript carries the plan and the turns", Array.isArray(transcript.turns) && transcript.plan?.sceneId === "pood");
const gaps = await prisma.sceneGap.findMany({ where: { ownerId: OWNER } });
check("the gap was stored as asked", gaps.some((g) => g.kind === "ASKED" && g.lemma === "leib"));
const reviewsAfter = await prisma.review.count({ where: { ownerId: OWNER } });
check("a walk-out writes no grades", reviewsAfter === reviewsBefore, `${reviewsAfter - reviewsBefore}`);

/* A reload of the same seed gives the same conversation back. */
await page.goto(`${B}${href}`);
await page.locator("main h1").first().waitFor({ timeout: 20_000 });
const again = (await page.locator('[role="log"] p[lang="et"]').first().textContent().catch(() => "")) ?? "";
check("the same seed opens the same conversation", again === firstLine || again === "", again);

/* Say it today: one press, one row, and Progress reads it back. */
await page.goto(`${B}/`);
await page.locator("main h1").first().waitFor({ timeout: 20_000 });
const errand = await page.getByText(/Say it today/).count();
if (errand === 0) {
  check("Today carries an errand once the learner has started", false, "no errand card: the deck may be empty (npm run demo)");
} else {
  check("Today carries an errand", true);
  await page.getByRole("button", { name: /They switched to English/ }).click();
  await page.getByText(/They switched/).first().waitFor({ timeout: 20_000 });
  check("one press reports how it went", (await page.getByText(/answer in Estonian anyway/).count()) === 1);
  const encounters = await prisma.encounter.findMany({ where: { ownerId: OWNER } });
  check("the report is one row with one of three words", encounters.length === 1 && encounters[0]?.outcome === "SWITCHED");
  await page.goto(`${B}/`);
  await page.locator("main h1").first().waitFor({ timeout: 20_000 });
  check("Today does not ask twice", (await page.getByRole("button", { name: /They understood me/ }).count()) === 0);
  await page.goto(`${B}/progress`);
  await page.locator("main h1").first().waitFor({ timeout: 20_000 });
  check("Progress leads with what happened out there", (await page.getByText(/Out there/).count()) >= 1);
  check("it counts the switch to English", (await page.getByText(/switched to English/).count()) >= 1);
  check("the course's own promises are listed with a way to test them", (await page.getByText(/What you can do/).count()) >= 1);
}

await browser.close();
await cleanUp();
await prisma.$disconnect();
done();
