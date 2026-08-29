#!/usr/bin/env node
import { launchChromium, eventually } from "./lib/browser.mjs";
import { baseUrl, suite } from "./lib/checks.mjs";
import { PrismaClient } from "@prisma/client";
import { requireLocalDatabase } from "./lib/local-db.mjs";

/**
 * The paper-to-deck path, driven for real.
 *
 * Everything about reading a photograph that can be tested without a provider
 * is tested elsewhere: the parsing of a hostile reply in `lib/scan/*.test.ts`,
 * the confidence floor on a match in `lib/dict/search.test.ts`, and the
 * inflected-form resolution against a real dictionary in
 * `lib/dict/resolveScan.itest.ts`. What none of those can see is the half a
 * learner actually touches: the picture leaving the device, the confirmation
 * list, and a ticked word turning into a card the review session then asks
 * about.
 *
 * So the model is the one thing stubbed here. `/api/scan` is intercepted and
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
 *
 * It writes two rows and deletes them again, scoped to the two words it
 * touches, so `requireLocalDatabase` guards it like every other script here
 * that deletes anything.
 */
const B = baseUrl();
const OWNER = "local-single-user";
/** A word no dictionary has, so the unverified path is exercised honestly. */
const UNKNOWN = "kodukeeltestsona";

const prisma = new PrismaClient({
  datasourceUrl: requireLocalDatabase("write and delete a scanned page and its cards"),
});

const { check, done } = suite("The paper path", { floor: 15 });

/** A word the seed definitely holds, with its real id, for the matched row. */
const known = await prisma.lexeme.findFirst({
  where: { provenance: "SEED" },
  orderBy: { lemma: "asc" },
  select: { id: true, lemma: true, translation: true, cefr: true },
});
if (!known) {
  check("the dictionary has something to match against", false, "no seeded words: npm run db:seed");
  done();
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

const browser = await launchChromium();
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

await page.goto(`${B}/scan`, { waitUntil: "networkidle" });

// A label wrapping its own file input, not a button that clicks a hidden one:
// see PickFile in app/(app)/scan/ScanCapture.tsx for why.
const hasCapture = await page.getByLabel(/take a photo/i).count();
check(
  "the page offers a camera",
  hasCapture > 0,
  hasCapture ? "" : "no provider key on the server, so the capture UI is correctly hidden",
);
if (!hasCapture) {
  await browser.close();
  await prisma.$disconnect();
  done();
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
const knownChip = await page.getByText("In the dictionary", { exact: true }).count();
const unknownChip = await page.getByText("Read from the photo", { exact: true }).count();
check("a matched word says the dictionary vouched for it", knownChip === 1, `${knownChip}`);
check("an unmatched word says where it really came from", unknownChip === 1, `${unknownChip}`);

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

const invented = await prisma.form.count({ where: { lexeme: { lemma: UNKNOWN } } });
check(
  "a word the dictionary never vouched for gets no forms invented for it",
  invented === 0,
  `${invented} forms`,
);

await page.getByRole("button", { name: /open the page/i }).click();
const opened = await eventually(async () => /\/scan\/[0-9a-f-]{36}/.test(page.url()));
check("the saved page opens as a set", opened, page.url());

/*
  Wait for the page itself, not just for the address bar.

  "Open the page" is a document load rather than a router push, deliberately:
  see the comment on the button in ScanCapture. That moves when the URL
  changes. A client-side push swaps the address only once the new tree has been
  applied, so reading the DOM straight after was safe; a document load commits
  the address first and the body arrives after it, so the same two lines were
  counting chips on a page that had not rendered yet. Measured at two failures
  in fifteen runs, always on the chip count and never on the navigation above.

  This is not a retry around the assertion, and the assertion is unchanged: if
  the page renders and marks nothing as unverified, the check below still
  fails. It only stops the count being taken before there is anything to count.
*/
await page.getByRole("heading", { name: "Scan test page" }).waitFor({ timeout: 20_000 });

const unverifiedChip = await page.getByText("Unverified", { exact: false }).count();
check("the set still marks the word nobody checked", unverifiedChip > 0);

await page.getByRole("link", { name: /drill the page/i }).click();
await page.waitForURL(/\/review\?scan=/, { timeout: 20_000 });
// The ordinary session, not a private quiz: the same four ratings, which is
// what writes to the same append-only log as everything else (ADR-016).
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
done();
