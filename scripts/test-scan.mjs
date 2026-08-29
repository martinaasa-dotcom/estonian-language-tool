#!/usr/bin/env node
/**
 * The paper-to-deck path, driven for real.
 *
 * Everything about reading a photograph that can be tested without a provider
 * is tested elsewhere: the parsing of a hostile reply in `lib/scan/*.test.ts`,
 * the confidence floor on a match in `lib/dict/search.test.ts`, and the
 * inflected-form resolution against a real dictionary in
 * `lib/dict/resolveScan.itest.ts`. What none of those can see is the half a
 * learner actually touches: the picture leaving the device, the confirmation
 * list, and a ticked word turning into a card that the review session then
 * asks about.
 *
 * So the model is the one thing stubbed here. `**\/api\/scan` is intercepted and
 * answered with a fixed page: one word the dictionary vouches for, and one it
 * has never seen. Everything after that point is the real app, the real server
 * actions and the real database.
 *
 *   NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= \
 *   OPENROUTER_API_KEY=stubbed-by-the-test npm run dev
 *   node scripts/test-scan.mjs
 *
 * The key may be nonsense: the route it would authenticate is never reached.
 * It has to be *present*, because with no provider configured at all the page
 * correctly offers no camera to point at anything.
 */
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OWNER = "local-single-user";
/** A word no dictionary has, so the unverified path is exercised honestly. */
const UNKNOWN = "kodukeeltestsona";

const prisma = new PrismaClient();

let failures = 0;
const check = (label, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? `  (${extra})` : ""}`);
};

/** A word the seed definitely holds, with its real id, for the matched row. */
const known = await prisma.lexeme.findFirst({
  where: { provenance: "SEED" },
  orderBy: { lemma: "asc" },
  select: { id: true, lemma: true, translation: true, cefr: true },
});
if (!known) {
  console.log("FAIL  the dictionary is empty, so there is nothing to match against");
  process.exit(1);
}

/**
 * Puts the database back.
 *
 * Scoped to the two words this test touches rather than to everything the app
 * has ever filed under SCAN: a broad delete would be fine on a scratch database
 * and quietly destructive on somebody's own. The review log is never touched
 * either way, because nothing here grades anything.
 */
async function cleanUp() {
  await prisma.scan.deleteMany({ where: { ownerId: OWNER, title: { startsWith: "Scan test" } } });
  const junk = await prisma.lexeme.findMany({ where: { lemma: UNKNOWN }, select: { id: true } });
  const ids = [...junk.map((l) => l.id), known.id];
  await prisma.card.deleteMany({ where: { ownerId: OWNER, source: "SCAN", lexemeId: { in: ids } } });
  await prisma.lexeme.deleteMany({ where: { id: { in: junk.map((l) => l.id) } } });
}

await cleanUp();

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

// The only stub in the file. Everything downstream of it is the real thing.
let sentBytes = 0;
let sentPrefix = "";
await page.route("**/api/scan", async (route) => {
  const body = JSON.parse(route.request().postData() ?? "{}");
  sentBytes = (body.image ?? "").length;
  sentPrefix = (body.image ?? "").slice(0, 24);
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "x-model-provider": "Stub", "x-model-id": "test" },
    body: JSON.stringify({
      items: [
        {
          et: known.lemma, en: "from the page", lexemeId: known.id, lemma: known.lemma,
          translation: known.translation, matchedAs: null, cefr: known.cefr,
        },
        {
          et: UNKNOWN, en: "a word off the page", lexemeId: null, lemma: null,
          translation: null, matchedAs: null, cefr: null,
        },
      ],
      summary: { total: 2, known: 1, unknown: 1, inflected: 0 },
    }),
  });
});

await page.goto(`${BASE}/scan`, { waitUntil: "networkidle" });

// A label wrapping its own file input, not a button that clicks a hidden one:
// see PickFile in ScanCapture.tsx for why.
const hasCapture = await page.getByLabel(/take a photo/i).count();
check(
  "the page offers a camera",
  hasCapture > 0,
  hasCapture ? "" : "no provider key on the server, so the capture UI is correctly hidden",
);
if (!hasCapture) {
  await browser.close();
  await prisma.$disconnect();
  process.exit(1);
}

// A real image, so the browser's own decode and downscale run rather than being
// stepped around. A screenshot is a photograph as far as canvas is concerned.
const photo = await page.screenshot();
await page.locator('input[type="file"]').first().setInputFiles({
  name: "page.png", mimeType: "image/png", buffer: photo,
});

await page.getByText(/word.* ticked/i).first().waitFor({ timeout: 20_000 });

check("the photo is shrunk before it is sent", sentBytes > 0 && sentBytes < 4_500_000, `${sentBytes} chars`);
check(
  "a JPEG leaves the device, whatever format went in",
  sentPrefix.startsWith("data:image/jpeg;base64,"),
  sentPrefix,
);

// Exact, because the warning further down the page contains the phrase "not in
// the dictionary" and a substring match would count that as a second chip.
const known_chip = await page.getByText("In the dictionary", { exact: true }).count();
const unknown_chip = await page.getByText("Read from the photo", { exact: true }).count();
check("a matched word says the dictionary vouched for it", known_chip === 1, `${known_chip}`);
check("an unmatched word says where it really came from", unknown_chip === 1, `${unknown_chip}`);

const warning = await page.getByText(/not in the dictionary/i).count();
check("the page says plainly which words nobody has checked", warning > 0);

// Name it, so the clean-up above can find it again.
await page.getByLabel(/what is this page/i).fill("Scan test page");

await page.getByRole("button", { name: /make 2 flashcards/i }).click();
await page.getByText(/is saved/i).waitFor({ timeout: 20_000 });

const stored = await prisma.scan.findFirst({
  where: { ownerId: OWNER, title: "Scan test page" },
  select: { id: true, items: true },
});
check("the page is stored", Boolean(stored));
check(
  "and the picture is not",
  stored ? !/data:image|base64/.test(stored.items) : false,
  "an image reached the database",
);

const madeCards = await prisma.card.count({ where: { ownerId: OWNER, source: "SCAN" } });
check("ticking a word makes cards", madeCards >= 2, `${madeCards} cards`);

const invented = await prisma.form.count({
  where: { lexeme: { lemma: UNKNOWN } },
});
check(
  "a word the dictionary never vouched for gets no forms invented for it",
  invented === 0,
  `${invented} forms`,
);

await page.getByRole("button", { name: /open the page/i }).click();
await page.waitForURL(/\/scan\/[0-9a-f-]{36}/, { timeout: 20_000 });
check("the saved page opens as a set", /\/scan\/[0-9a-f-]{36}/.test(page.url()), page.url());

const unverifiedChip = await page.getByText("Unverified", { exact: false }).count();
check("the set still marks the word nobody checked", unverifiedChip > 0);

await page.getByRole("link", { name: /drill the page/i }).click();
await page.waitForURL(/\/review\?scan=/, { timeout: 20_000 });
// The ordinary session, not a private quiz: the same four ratings, which is
// what writes to the same append-only log as everything else (ADR-016).
// The accessible name carries the interval and the key too ("Again 1m 1"), so
// this matches the start of it rather than the whole string.
const ratings = page.getByRole("button", { name: /^(again|hard|good|easy)\b/i });
await ratings.first().waitFor({ timeout: 20_000 });
const rated = await ratings.count();
check("the page drills through the ordinary review session", rated === 4, `${rated} rating buttons`);
const named = await page.getByText("Scan test page", { exact: true }).count();
check("and the session says which page it is drilling", named > 0);

check("no console errors anywhere in that", errors.length === 0, errors.slice(0, 2).join(" | "));

await cleanUp();
await browser.close();
await prisma.$disconnect();

console.log(failures === 0 ? "\nThe paper path holds." : `\n${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
