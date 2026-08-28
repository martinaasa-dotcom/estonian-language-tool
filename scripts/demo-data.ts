/** Populates a few cards, reviews and tasks so the UI can be reviewed with real content. */
import { PrismaClient } from "@prisma/client";
import { generateCards, type LexemeForCards } from "../lib/srs/cards";
import { emptyScheduling, grade } from "../lib/srs/scheduler";

const prisma = new PrismaClient();

async function main() {
  // This script wipes cards, reviews and tasks. The review log is the one thing
  // in this app that cannot be reconstructed, so it refuses to run against a deck
  // that looks real unless you say so explicitly.
  const existingReviews = await prisma.review.count();
  if (existingReviews > 20 && !process.argv.includes("--force")) {
    console.error(
      `Refusing to run: this database has ${existingReviews} reviews in it.\n` +
      `That history cannot be recreated. Take a backup from Settings first, then\n` +
      `re-run with --force if you really want to replace it with demo data.`,
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  await prisma.review.deleteMany();
  await prisma.card.deleteMany();
  await prisma.task.deleteMany();

  const lexemes = await prisma.lexeme.findMany({
    where: { pos: { in: ["NOUN", "VERB"] } },
    include: { forms: true },
    take: 18,
    orderBy: { lemma: "asc" },
  });

  for (const [i, lex] of lexemes.entries()) {
    const types = i < 4 ? (["RECOGNITION", "PRODUCTION", "CASE_FORM", "GRADATION", "GOVERNMENT"] as const)
                        : (["RECOGNITION", "PRODUCTION"] as const);
    const cards = generateCards(lex as LexemeForCards, [...types]);
    for (const c of cards) {
      let s = emptyScheduling(new Date(Date.now() - 12 * 86400000));
      const history = i % 3 === 0 ? [3, 3, 2] : i % 3 === 1 ? [3, 1, 3, 3] : [];
      const reviews: { rating: number; at: Date }[] = [];
      history.forEach((r, n) => {
        const at = new Date(Date.now() - (10 - n * 3) * 86400000);
        reviews.push({ rating: r, at });
        s = grade(s, r as 1 | 2 | 3 | 4, at);
      });
      const card = await prisma.card.create({
        data: {
          lexemeId: lex.id, cardType: c.cardType, front: c.front, back: c.back,
          hint: c.hint, targetCase: c.targetCase, source: "DICTIONARY",
          due: history.length ? s.due : new Date(Date.now() - 3600000),
          stability: s.stability, difficulty: s.difficulty, reps: s.reps,
          lapses: s.lapses, state: s.state, learningSteps: s.learningSteps,
          lastReview: s.lastReview, elapsedDays: s.elapsedDays, scheduledDays: s.scheduledDays,
        },
      });
      for (const r of reviews) {
        await prisma.review.create({
          data: { cardId: card.id, rating: r.rating, reviewedAt: r.at, durationMs: 4200, targetCase: c.targetCase },
        });
      }
    }
  }

  await prisma.task.createMany({
    data: [
      { title: "Exercise 4B — partitive plural", tag: "GRAMMAR", classWeek: 6, dueAt: new Date(Date.now() + 2 * 86400000) },
      { title: "Learn week 6 vocabulary (24 words)", tag: "VOCABULARY", classWeek: 6, dueAt: new Date(Date.now() - 86400000) },
      { title: "Listen to Vikerraadio for 20 minutes", tag: "LISTENING", classWeek: 6 },
      { title: "Write 5 sentences using the comitative", tag: "HOMEWORK", classWeek: 5, completed: true, completedAt: new Date() },
    ],
  });

  console.log("cards:", await prisma.card.count(), "reviews:", await prisma.review.count());
  await prisma.$disconnect();
}
main();
