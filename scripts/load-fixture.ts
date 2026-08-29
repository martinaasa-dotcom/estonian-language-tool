/**
 * Synthetic learners with real-sized histories, for measuring.
 *
 * Every performance claim this repository could make was measured against a
 * demo deck of 417 reviews, which is a fortnight of one person. The queries
 * that matter here derive progress from the whole review log on every page
 * load (ADR-014), so the interesting question is what they cost after a year,
 * and 417 rows cannot answer it: Postgres will happily sequential-scan a
 * table that small faster than it can use an index.
 *
 * This writes learners whose logs are the size a real one becomes. It is
 * deliberately separate from `demo-data.ts`, which exists to make the screens
 * look right and is tuned for that.
 *
 *   npx tsx scripts/load-fixture.ts --learners 60 --reviews 6000
 *   npx tsx scripts/load-fixture.ts --clean
 *
 * Local databases only, by the same guard as every other destructive script.
 */
import { PrismaClient } from "@prisma/client";
// @ts-expect-error - plain JS helper, shared with the .mjs end-to-end scripts.
import { requireLocalDatabase } from "./lib/local-db.mjs";

const prisma = new PrismaClient({
  datasourceUrl: requireLocalDatabase("write and delete synthetic load-test learners"),
});

/**
 * The owner id prefix every row here carries.
 *
 * It is the whole cleanup story: nothing else in the database starts with it,
 * so `--clean` can remove exactly what this wrote and nothing a person owns.
 */
const PREFIX = "loadtest-";

function arg(name: string, fallback: number): number {
  const at = process.argv.indexOf(`--${name}`);
  if (at < 0) return fallback;
  const value = Number(process.argv[at + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function clean(): Promise<void> {
  // Review first: it has no foreign key to Card on purpose, so nothing
  // cascades and both have to be named.
  const reviews = await prisma.review.deleteMany({ where: { ownerId: { startsWith: PREFIX } } });
  const cards = await prisma.card.deleteMany({ where: { ownerId: { startsWith: PREFIX } } });
  console.log(`Removed ${cards.count} cards and ${reviews.count} reviews.`);
}

async function main() {
  if (process.argv.includes("--clean")) {
    await clean();
    await prisma.$disconnect();
    return;
  }

  const learners = arg("learners", 60);
  const reviewsEach = arg("reviews", 6000);
  const cardsEach = Math.max(20, Math.round(reviewsEach / 40));

  await clean();

  const lexemes = await prisma.lexeme.findMany({ select: { id: true }, take: 400 });
  if (lexemes.length === 0) throw new Error("Seed the dictionary first.");

  const now = Date.now();
  const DAY = 86_400_000;

  console.log(
    `Writing ${learners} learners, ${cardsEach} cards and ${reviewsEach} reviews each ` +
    `(${(learners * reviewsEach).toLocaleString()} reviews in total).`,
  );

  for (let l = 0; l < learners; l++) {
    const ownerId = `${PREFIX}${String(l).padStart(4, "0")}`;
    // Staggered joining dates, so cohort retention has more than one cohort to
    // group and the numbers it produces are not all from the same week.
    const joinedDaysAgo = 30 + (l % 300);

    const cards = Array.from({ length: cardsEach }, (_, c) => ({
      id: `${ownerId}-c${c}`,
      ownerId,
      lexemeId: lexemes[(l + c) % lexemes.length]!.id,
      cardType: c % 3 === 0 ? "PRODUCTION" : "RECOGNITION",
      front: `front ${c}`,
      back: `back ${c}`,
      source: "DICTIONARY",
      due: new Date(now + ((c % 30) - 10) * DAY),
      stability: 5 + (c % 40),
      difficulty: 5,
      reps: 4,
      lapses: c % 7,
      state: 2,
      lastReview: new Date(now - (c % 20) * DAY),
    }));
    await prisma.card.createMany({ data: cards, skipDuplicates: true });

    const reviews = Array.from({ length: reviewsEach }, (_, r) => {
      // Spread back over the days since they joined, so a heatmap, a forecast
      // and a retention curve all have a real distribution to read.
      const daysAgo = Math.floor((r / reviewsEach) * joinedDaysAgo);
      return {
        ownerId,
        cardId: cards[r % cards.length]!.id,
        lexemeId: cards[r % cards.length]!.lexemeId,
        rating: (r % 9 === 0 ? 1 : r % 5 === 0 ? 2 : 3) as number,
        reviewedAt: new Date(now - daysAgo * DAY - (r % 24) * 3_600_000),
        durationMs: 3000 + (r % 4000),
        stateBefore: 2,
        targetCase: r % 4 === 0 ? "PARTITIVE" : null,
      };
    });

    // In batches: one createMany of tens of thousands of rows exceeds the
    // parameter limit long before it exceeds anything else.
    for (let i = 0; i < reviews.length; i += 2000) {
      await prisma.review.createMany({ data: reviews.slice(i, i + 2000) });
    }

    if ((l + 1) % 10 === 0) console.log(`  ${l + 1}/${learners} learners`);
  }

  const [cards, reviews] = await Promise.all([
    prisma.card.count({ where: { ownerId: { startsWith: PREFIX } } }),
    prisma.review.count({ where: { ownerId: { startsWith: PREFIX } } }),
  ]);
  console.log(`\nDone. ${cards.toLocaleString()} cards, ${reviews.toLocaleString()} reviews.`);
  console.log(`The heaviest single learner is ${PREFIX}0000.`);
  await prisma.$disconnect();
}

void main();
