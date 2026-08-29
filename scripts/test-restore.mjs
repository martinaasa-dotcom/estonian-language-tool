import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { requireLocalDatabase } from "./lib/local-db.mjs";

const B = "http://localhost:3000";
const prisma = new PrismaClient({
  datasourceUrl: requireLocalDatabase("delete every word, card, task and review row"),
});
let failures = 0;
const check = (l, ok, extra = "") => { if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"}  ${l}${extra ? "  (" + extra + ")" : ""}`); };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await (await browser.newContext()).newPage();

// Snapshot the live state, then export it.
const before = {
  words: await prisma.lexeme.count(),
  cards: await prisma.card.count(),
  reviews: await prisma.review.count(),
  tasks: await prisma.task.count(),
};
const backup = await (await page.request.get(`${B}/api/export`)).text();
check("export produced a backup", backup.length > 1000, `${Math.round(backup.length / 1024)} KB`);

// Put the backup on disk before deleting anything it is the only copy of.
//
// This script proves a restore works by destroying the database first, which
// means every run has a window where the data exists nowhere but this process's
// memory. A crash in that window — a timeout, a failed assertion, ctrl-C —
// takes the review log with it, and that is the one table the app cannot
// reconstruct. Writing the file first costs a megabyte and turns an unrecoverable
// failure into an inconvenient one.
const safety = join(tmpdir(), `kodukeel-pre-restore-${Date.now()}.json`);
writeFileSync(safety, backup);
console.log(`      (safety copy: ${safety})`);
if (backup.length <= 1000) {
  console.error("\nRefusing to delete anything: the export came back empty, so there is nothing to restore from.\n");
  await prisma.$disconnect();
  await browser.close();
  process.exit(1);
}

// Destroy everything, exactly as a disk failure would.
await prisma.review.deleteMany();
await prisma.card.deleteMany();
await prisma.form.deleteMany();
await prisma.lexeme.deleteMany();
await prisma.task.deleteMany();
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
await page.waitForTimeout(6000);

const after = {
  words: await prisma.lexeme.count(),
  cards: await prisma.card.count(),
  reviews: await prisma.review.count(),
  tasks: await prisma.task.count(),
};
check("every word came back", after.words === before.words, `${after.words}/${before.words}`);
check("every card came back", after.cards === before.cards, `${after.cards}/${before.cards}`);
check("every review came back", after.reviews === before.reviews, `${after.reviews}/${before.reviews}`);
check("every task came back", after.tasks === before.tasks, `${after.tasks}/${before.tasks}`);
check("forms came back with their words", (await prisma.form.count()) > 1000, `${await prisma.form.count()} forms`);

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
await page.waitForTimeout(6000);
check("restoring twice does not duplicate anything",
  (await prisma.review.count()) === before.reviews && (await prisma.card.count()) === before.cards,
  `${await prisma.card.count()} cards, ${await prisma.review.count()} reviews`);

console.log(failures === 0
  ? "\nRestore verified end to end."
  : `\n${failures} failed. If the database is short of data, restore ${safety} via Settings.`);
await browser.close();
await prisma.$disconnect();
process.exit(failures ? 1 : 0);
