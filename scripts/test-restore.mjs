import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

const B = "http://localhost:3000";
const prisma = new PrismaClient();
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
await page.waitForTimeout(1200);
check("the file is recognised and summarised", (await page.getByText(/holds/).count()) > 0);
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
await page.waitForTimeout(1200);
await page.getByRole("button", { name: /Merge this backup in/ }).click();
await page.waitForTimeout(6000);
check("restoring twice does not duplicate anything",
  (await prisma.review.count()) === before.reviews && (await prisma.card.count()) === before.cards,
  `${await prisma.card.count()} cards, ${await prisma.review.count()} reviews`);

console.log(failures === 0 ? "\nRestore verified end to end." : `\n${failures} failed.`);
await browser.close();
await prisma.$disconnect();
process.exit(failures ? 1 : 0);
