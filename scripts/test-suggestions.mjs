#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";
import { launchChromium, eventually } from "./lib/browser.mjs";
import { baseUrl, suite } from "./lib/checks.mjs";
import { requireLocalDatabase } from "./lib/local-db.mjs";

/**
 * The loop that starts at a dead end and ends in the dictionary, driven for
 * real.
 *
 * The pieces are tested elsewhere: the grouping and the patch shapes in
 * `lib/suggestions/model.test.ts`, the writes in `apply.itest.ts`, the queue's
 * counts and its "what does the entry say now" column in `queue.itest.ts`.
 * What none of those can see is whether the loop closes. That is the only
 * claim this feature makes and every part of it is in a different process: a
 * button on a failure, a server action, a review queue, a write to shared
 * reference data, and the same learner being told what happened.
 *
 *   NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= npm run dev
 *   node scripts/test-suggestions.mjs
 *
 * It runs against local mode, where the single learner is also the reviewer,
 * for the reason every browser suite here does: driving a Google sign-in from
 * Playwright is not a test of anything this app owns.
 *
 * It writes and deletes rows, so `requireLocalDatabase` guards it, and its
 * cleanup is scoped to the one invented word it touches rather than to
 * everything in the queue: a broad delete would be fine on a scratch database
 * and would quietly throw away somebody's reports on their own.
 */
const B = baseUrl();
const OWNER = "local-single-user";
/** A word no dictionary has, so the missing-word path is exercised honestly. */
const WORD = "kodukeelparandustest";
const MEANING = "a word invented for a test";
const CORRECTED = "a corrected meaning";

const prisma = new PrismaClient({
  datasourceUrl: requireLocalDatabase("send suggestions and accept them into the dictionary"),
});

const { check, done } = suite("The suggestion loop", { floor: 17 });

/** Written into every note this suite sends, so cleanup can find its own. */
const NOTE = "Sent by scripts/test-suggestions.mjs";

async function cleanUp() {
  await prisma.suggestion.deleteMany({ where: { OR: [{ lemma: WORD }, { ownerId: OWNER, note: NOTE }] } });
  const junk = await prisma.lexeme.findMany({ where: { lemma: WORD }, select: { id: true } });
  const ids = junk.map((l) => l.id);
  if (ids.length) {
    await prisma.card.deleteMany({ where: { lexemeId: { in: ids } } });
    await prisma.form.deleteMany({ where: { lexemeId: { in: ids } } });
    await prisma.lexeme.deleteMany({ where: { id: { in: ids } } });
  }
}

await cleanUp();

const browser = await launchChromium();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

// ── A search that finds nothing ────────────────────────────────────────────
await page.goto(`${B}/dictionary?q=${WORD}`, { waitUntil: "networkidle" });
check("a search that found nothing says so", (await page.content()).includes("Nothing found for"));

const report = page.getByRole("button", { name: /This word is missing/i });
check("and offers to tell somebody about it", (await report.count()) > 0);
await report.first().click();

check(
  "the form already knows what it is about",
  (await page.content()).includes("A word that should be in the dictionary"),
);
await page.locator("#suggest-meaning").fill(MEANING);
await page.locator("#suggest-note").fill(NOTE);
await page.getByRole("button", { name: /Send it/i }).click();
check(
  "sending it says where it went, not thank you",
  await eventually(async () => (await page.content()).includes("Sent to the Kodukeel team")),
);

// ── The learner can see it waiting ─────────────────────────────────────────
await page.goto(`${B}/suggestions`, { waitUntil: "networkidle" });
const mine = await page.content();
check("the learner can see what they sent", mine.includes(WORD));
check("and that nobody has looked at it yet", mine.includes("waiting"));

// ── The queue ──────────────────────────────────────────────────────────────
await page.goto(`${B}/admin/suggestions`, { waitUntil: "networkidle" });
const queue = await page.content();
check("the review queue has it", queue.includes(WORD));
check("and says what accepting would do", queue.includes("Add this word to the dictionary"));

const apply = page.getByRole("button", { name: /Accept and apply/i });
check("pushing it through is one button", (await apply.count()) > 0);
await apply.first().click();
check(
  "and accepting says what it changed",
  await eventually(async () => (await page.content()).includes(`Added ${WORD}`)),
);

// ── The dictionary ─────────────────────────────────────────────────────────
await page.goto(`${B}/dictionary?q=${WORD}`, { waitUntil: "networkidle" });
const entry = await page.content();
check("the word is in the shared dictionary now", entry.includes(MEANING));
check("and the entry offers a correction of its own", entry.includes("Suggest a correction"));

// ── Correcting a meaning, which is the other half ──────────────────────────
await page.getByRole("button", { name: /Suggest a correction/i }).first().click();
await page.locator("#suggest-gloss").fill(CORRECTED);
await page.locator("#suggest-note").fill(NOTE);
await page.getByRole("button", { name: /Send it/i }).click();
check(
  "a correction can be sent from the entry itself",
  await eventually(async () => (await page.content()).includes("Sent to the Kodukeel team")),
);

await page.goto(`${B}/admin/suggestions`, { waitUntil: "networkidle" });
const second = await page.content();
check(
  "the queue shows what the entry says now beside what is proposed",
  second.includes(MEANING) && second.includes(CORRECTED),
);
await page.getByRole("button", { name: /Accept and apply/i }).first().click();
await eventually(async () => (await page.content()).includes("now reads"));

await page.goto(`${B}/dictionary?q=${WORD}`, { waitUntil: "networkidle" });
check("the correction reached the entry everybody reads", (await page.content()).includes(CORRECTED));

await page.goto(`${B}/suggestions`, { waitUntil: "networkidle" });
check("and the learner is told it was accepted", (await page.content()).includes("accepted"));

check("no console errors anywhere in that", errors.length === 0, errors.slice(0, 2).join(" | "));

await cleanUp();
await browser.close();
await prisma.$disconnect();
done();
