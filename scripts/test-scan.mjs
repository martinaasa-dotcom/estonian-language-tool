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

const { check, done } = suite("The paper path", { floor: 17 });

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

/*
  THE UNVOUCHED WORD BECAME AN ENTRY, WHICH IS THE HALF THIS DID NOT ASK.

  The forms check below is the point of the whole path: nothing the model read
  off a photograph may become an Estonian form. But counting zero forms passes
  just as happily when the word was never written down at all, so the one
  branch that turns a ticked-but-unmatched word into the learner's own entry
  was covered by a check that could not tell the difference. Assert the entry
  first, then that it carries nothing invented.
*/
const mine = await prisma.lexeme.findFirst({
  where: { lemma: UNKNOWN },
  select: { id: true, provenance: true, editedBy: true },
});
check(
  "a ticked word the dictionary would not vouch for becomes the learner's own entry",
  Boolean(mine) && mine.provenance === "USER" && mine.editedBy === OWNER,
  mine ? `${mine.provenance}, edited by ${mine.editedBy}` : "no entry was written",
);
check(
  "and it gets cards of its own, not just the matched word's",
  mine ? (await prisma.card.count({ where: { ownerId: OWNER, lexemeId: mine.id } })) >= 2 : false,
);

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

/*
  Bring the card to its ratings, whichever of the three shapes it is.

  A page can name a word the learner already studies, and drilling the page
  draws in their existing cards for it on purpose: a page is references rather
  than copies. Such a card has a history, so it is not new, and it opens the
  way any review card does. That is one of three shapes, and this waited for
  the ratings as though it were always the fourth: a card with no answer to
  turn over at all.

  Which shape you get here depends on which seeded word this suite picks, and
  it picks the alphabetically first, which is a question about the database's
  collation rather than about the app. Locally that was a word the demo deck
  had never seen, so the card was new and opened straight on the ratings; in
  CI it is one the deck already holds, so it opened as multiple choice and
  this waited twenty seconds for buttons that were one keypress away.
  Reproduced by giving the local word a reviewed card, at which point it
  failed here every time as well.

  `smoke-offline.mjs` learned this first and its comment says why in full: the
  shapes are chosen per card, so a driver that knows only "Show answer"
  silently stops testing anything the day another shape comes up first, and
  what changed there was the dictionary growing.

  This kept its own copy on the reason that the other one goes on to grade and
  this has to stop at the ratings in order to count them. That reason is gone:
  `scripts/lib/review.mjs` reveals and never grades, which is exactly this, and
  the grade is one line in the caller that wants it. `test-containment.mjs` is
  why it exists, having waived ten checks on the claim that a deck holding
  forty due cards had nothing due.

  What the assertion below wants is that a scanned word reaches the *ordinary*
  review session and can be answered there, rather than some path of its own.
  It used to say that by counting four rating buttons, which stopped being what
  the ordinary session looks like: the app marks what it can mark now, so a
  typed answer and a pick grade themselves, a miss and a first meeting offer one
  way on, and only a flip card asks the learner, in two options rather than
  four. Counting buttons was always a proxy; what it stands for is that the
  session got to the point of taking an answer for this card.
*/
// Unanchored at the end on purpose: these buttons carry their keyboard hint
// inside them, so the accessible name of the one that says "Got it, next" is
// "Got it, next Space" and a `$` matches none of them.
const ratings = page.getByRole("button", { name: /^(got it|not yet)/i });
const reveal = page.getByRole("button", { name: /show answer/i });
const pick = page.getByText(/Pick the meaning/);
const typed = page.locator("main input[type='text'], main input:not([type])").first();

await eventually(async () =>
  (await ratings.count()) > 0 || (await reveal.count()) > 0
  || (await pick.count()) > 0 || (await typed.count()) > 0, { timeoutMs: 20_000 });

if (await reveal.count()) {
  await reveal.first().click();
} else if (await pick.count()) {
  // The keyboard, because it is what the app offers and what test-modes drives.
  await page.keyboard.press("1");
} else if ((await ratings.count()) === 0 && (await typed.count())) {
  await typed.fill("zzz");
  await page.keyboard.press("Enter");
}
// Either the session is waiting on the learner, or it marked the answer and
// moved on by itself. Both are the ordinary session doing its job.
const gradedNow = async () =>
  Number(/(\d+) graded/.exec(await page.locator("main").innerText())?.[1] ?? 0);
const answered = await eventually(
  async () => (await ratings.count()) > 0 || (await gradedNow()) > 0,
  { timeoutMs: 20_000 },
);
check("the page drills through the ordinary review session", answered,
  `${await ratings.count()} ways on offered, ${await gradedNow()} graded`);
const named = await page.getByText("Scan test page", { exact: true }).count();
check("and the session says which page it is drilling", named > 0);

check("no console errors anywhere in that", errors.length === 0, errors.slice(0, 2).join(" | "));

await cleanUp();
await browser.close();
await prisma.$disconnect();
done();
