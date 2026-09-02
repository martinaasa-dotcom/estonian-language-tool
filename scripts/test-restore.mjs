import { launchChromium } from "./lib/browser.mjs";
import { baseUrl, suite } from "./lib/checks.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { requireLocalDatabase } from "./lib/local-db.mjs";

/**
 * The backup-and-restore round trip, tested against the real database.
 *
 * This suite deletes everything and puts it back, which is the only honest way
 * to test a restore — and also the most dangerous thing in this repository. Two
 * guards, because the review log is the one table whose loss is unrecoverable:
 *
 * 1. `requireLocalDatabase()` refuses anything but a local database, and hands
 *    back the URL it approved so the connection that was checked is the one
 *    that gets opened (see scripts/lib/local-db.mjs).
 * 2. It writes the export to disk *before* deleting, and stops if that fails.
 *    If the suite then crashes half way — a dev server hiccup is enough, and it
 *    happened twice while this was being written — the data is still on disk
 *    and `Settings → Restore` puts it back.
 */
const B = baseUrl();
const prisma = new PrismaClient({
  datasourceUrl: requireLocalDatabase("delete every word, card, task and review row"),
});
/*
  Floor: twelve checks, all unconditional. It said ten while the suite reached
  eleven, so a check could have stopped running and the tally would still have
  cleared the bar, which is the one failure a floor exists to make visible. The
  twelfth arrived with the export narrowing to the learner's own words. The 429
  branch below exits before any of them and does not count.
*/
const { check, done } = suite("Backup and restore", { floor: 12 });

const browser = await launchChromium();
const page = await (await browser.newContext()).newPage();

// Snapshot the live state, then export it.
const before = {
  words: await prisma.lexeme.count(),
  cards: await prisma.card.count(),
  reviews: await prisma.review.count(),
  tasks: await prisma.task.count(),
  scans: await prisma.scan.count(),
};
const exported = await page.request.get(`${B}/api/export`);
const backup = await exported.text();

/*
  A 429 IS THE APP WORKING, AND THIS USED TO REPORT IT AS AN EMPTY BACKUP.

  `/api/export` allows six backups an hour, which is right: it reads every
  owner-scoped table. Running the suites twice in an hour is an ordinary
  afternoon, and the second run said "export produced a backup (0 KB)" and
  stopped. That sends whoever reads it to look at the export, which is
  working, rather than at the clock. The limiter is per instance and in
  memory, so restarting the server clears it, and that is worth saying too.

  Not waived and not passed: a run that could not take a backup has not
  checked backup and restore, and this is the suite guarding the one failure
  in this app with nothing to recover from.
*/
if (exported.status() === 429) {
  check("export produced a backup", false,
    "the hourly backup allowance is spent, which is /api/export working. " +
    "Wait, or restart the server: the limiter is per instance and in memory.");
  done();
}
check("export produced a backup", backup.length > 1000, `${Math.round(backup.length / 1024)} KB`);

/*
  AND IT IS THE LEARNER'S WORDS, NOT THE WHOLE DICTIONARY.

  The export used to carry every lexeme in the database, so a personal backup
  grew every time somebody else's word was added and had reached 16.5 MB, which
  is over both of `next.config.ts`'s 16 MB body limits. The restore then refused
  a learner's own file and this suite reported that the page "never accepted the
  backup", which is the failure it was written to catch.

  So the new contract is asserted here rather than described: the file carries
  the words this learner's rows point at. It is checked before anything is
  deleted, because a file that has quietly gone back to carrying everything is a
  reason to stop rather than a reason to restore.
*/
const parsed = JSON.parse(backup);
check("the backup carries the learner's own words, not the whole dictionary",
  parsed.counts.words > 0 && parsed.counts.words < before.words,
  `${parsed.counts.words} of ${before.words} in the dictionary, ${Math.round(backup.length / 1024)} KB`);

// On disk before anything is deleted. If the suite dies from here on, this file
// is the way back — Settings → Restore takes it as it stands.
const safety = resolve(".backups", `test-restore-${Date.now()}.json`);
try {
  mkdirSync(resolve(".backups"), { recursive: true });
  writeFileSync(safety, backup);
} catch (error) {
  console.error(`Refusing to delete anything: could not write the safety copy (${error}).`);
  process.exit(1);
}
if (backup.length <= 1000) {
  console.error("Refusing to delete anything: the export came back empty or truncated.");
  process.exit(1);
}
console.log(`      safety copy: ${safety}`);

// Destroy everything, exactly as a disk failure would.
await prisma.review.deleteMany();
await prisma.card.deleteMany();
await prisma.form.deleteMany();
await prisma.lexeme.deleteMany();
await prisma.task.deleteMany();
await prisma.scan.deleteMany();
check("data is genuinely gone before the restore", (await prisma.review.count()) === 0);

// Restore through the real UI, not a direct call.
await page.goto(`${B}/settings`, { waitUntil: "networkidle" });
await page.getByLabel("Choose a backup file").setInputFiles({
  name: "backup.json", mimeType: "application/json", buffer: Buffer.from(backup),
});
// Wait for the summary instead of guessing at a duration. The backup grows with
// the deck, and a fixed delay that is generous today fails on a bigger database
// — which, here, fails *after* the delete and so loses the data it was checking.
const summary = page.getByText(/holds/).first();
const summarised = await summary.waitFor({ timeout: 30000 }).then(() => true, () => false);
check("the file is recognised and summarised", summarised);
if (!summarised) {
  console.error(`\nThe page never accepted the backup, so the database is still empty.` +
    `\nRestore it yourself from ${safety} via Settings -> Restore.\n`);
  await browser.close();
  await prisma.$disconnect();
  process.exit(1);
}
await page.getByRole("button", { name: /Merge this backup in/ }).click();
/*
  Wait for the panel to say it finished, not for a duration.

  This file already makes that argument, four lines above, about the summary
  step — and then guessed at six seconds for the restore, which is the slow
  half by a wide margin: the summary parses a file, the restore writes every
  word, form, card and review in it, one at a time, inside a transaction.

  Measured against a full dictionary, that is 5,971 lexemes and 34,455 forms
  and it takes well over six seconds. So every check below read a database
  that was still being written and reported zero of everything — after the
  delete, which means a "failure" here destroyed the fixture it was checking
  and then told you to restore it by hand. Twice, before it was noticed.

  The panel prints a sentence naming what it merged. That sentence is the
  event to wait for, and the timeout is generous because the only cost of a
  generous timeout is a slow pass.
*/
await page.getByText(/Merged in \d+ words/).waitFor({ timeout: 180_000 });

const after = {
  words: await prisma.lexeme.count(),
  cards: await prisma.card.count(),
  reviews: await prisma.review.count(),
  tasks: await prisma.task.count(),
  scans: await prisma.scan.count(),
};
/*
  Every word the file carried, which is every word the learner's rows are about.
  `before.words` is the whole dictionary and the file no longer holds it: what a
  restore owes is that nothing it took away is missing afterwards, and the seed
  is what puts the rest of the dictionary back on a fresh installation.
*/
check("every word the backup held came back",
  after.words === parsed.counts.words && after.words > 0,
  `${after.words}/${parsed.counts.words}`);
check("every card came back", after.cards === before.cards, `${after.cards}/${before.cards}`);
check("every review came back", after.reviews === before.reviews, `${after.reviews}/${before.reviews}`);
check("every task came back", after.tasks === before.tasks, `${after.tasks}/${before.tasks}`);
// A photographed page is a word list somebody confirmed by hand. Leaving it out
// of the backup would make a restore quietly lossy in a way nobody would notice
// until they went looking for a page they scanned in March.
check("every scanned page came back", after.scans === before.scans, `${after.scans}/${before.scans}`);
/*
  Counted against the file rather than against a round number. `> 1000` was a
  stand-in for "the whole dictionary" and would now pass on a backup carrying
  nothing at all, since a fixture deck of thirty words has a few hundred forms.
*/
const formsBack = await prisma.form.count();
const formsInFile = parsed.lexemes.reduce((n, l) => n + (l.forms?.length ?? 0), 0);
check("forms came back with their words", formsBack === formsInFile && formsBack > 0,
  `${formsBack}/${formsInFile} forms`);

// Scheduling state must survive, or the restore silently resets everyone's progress.
const scheduled = await prisma.card.findFirst({ where: { state: 2 }, orderBy: { due: "desc" } });
check("FSRS scheduling state survived the round trip",
  Boolean(scheduled && scheduled.stability > 0 && scheduled.reps > 0),
  scheduled ? `stability ${scheduled.stability.toFixed(2)}, ${scheduled.reps} reps` : "no reviewed card found");

// Restoring the same file again must be a no-op, not a duplication.
await page.goto(`${B}/settings`, { waitUntil: "networkidle" });
await page.getByLabel("Choose a backup file").setInputFiles({
  name: "backup.json", mimeType: "application/json", buffer: Buffer.from(backup),
});
await page.getByText(/holds/).first().waitFor({ timeout: 30000 });
await page.getByRole("button", { name: /Merge this backup in/ }).click();
// Same again: the second merge is no faster than the first, and this check is
// the one that would catch a restore that duplicates rather than upserts.
await page.getByText(/Merged in \d+ words/).waitFor({ timeout: 180_000 });
check("restoring twice does not duplicate anything",
  (await prisma.review.count()) === before.reviews && (await prisma.card.count()) === before.cards,
  `${await prisma.card.count()} cards, ${await prisma.review.count()} reviews`);

// The one suite that empties the database to prove a backup brings it back,
// so a failure here needs its own sentence: the data is in the file it wrote
// before it deleted anything.
console.log(`\nIf anything above failed, restore ${safety} via Settings.`);
await browser.close();
await prisma.$disconnect();
done();
