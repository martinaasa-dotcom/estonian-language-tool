/** Populates a few cards, reviews and tasks so the UI can be reviewed with real content. */
import { PrismaClient } from "@prisma/client";
// @ts-expect-error - plain JS helper, shared with the .mjs end-to-end scripts.
import { requireLocalDatabase } from "./lib/local-db.mjs";
import { generateCards, type LexemeForCards } from "../lib/srs/cards";
import { emptyScheduling, grade } from "../lib/srs/scheduler";
import { LOCAL_USER_ID, supabaseConfigured } from "../lib/auth/mode";

const prisma = new PrismaClient({
  datasourceUrl: requireLocalDatabase("replace this learner's cards, tasks and review history with invented data"),
});

/** A spread of plausible review histories — some clean, some with a lapse. */
/**
 * The shapes a real deck contains, so every screen has something to show.
 *
 * The last one is the point of the list: a word learned, forgotten, relearned
 * and forgotten again — four lapses by the end, which is what the
 * sticking-points section on /progress exists to name. It has to graduate back
 * to Review between failures, because FSRS only counts a lapse against a card
 * it believed was learned. Without one, that section renders as nothing and
 * looks broken rather than empty.
 */
const HISTORIES: number[][] = [
  [3, 3, 2, 3, 4, 3],
  [3, 1, 3, 3, 2],
  [],
  [4, 4, 3],
  [2, 3, 1, 3, 3, 3],
  [3],
  [3, 3, 1, 3, 3, 1, 3, 3, 1, 3, 3, 1],
];

/** Fixed, so re-running the fixture reuses the one class rather than adding another. */
const DEMO_CLASS_CODE = "DEMOAA";

async function main() {
  // Cards/tasks are per-user now (docs/03-architecture.md ADR-012), so this script
  // only ever touches one account's data — find your user id in the Supabase
  // dashboard (Authentication → Users) and pass it explicitly.
  // Running locally there is only one learner (lib/auth/mode.ts), so the id is
  // known; with Supabase configured it has to be named explicitly, because
  // guessing which account to wipe is not a decision a script should make.
  const ownerId = process.env.DEMO_OWNER_ID ?? (supabaseConfigured() ? undefined : LOCAL_USER_ID);
  if (!ownerId) {
    console.error("Set DEMO_OWNER_ID to your Supabase user id before running this script.");
    await prisma.$disconnect();
    process.exit(1);
  }

  // This script wipes that user's cards, reviews and tasks. The review log is the
  // one thing in this app that cannot be reconstructed, so it refuses to run
  // against a deck that looks real unless you say so explicitly.
  const existingReviews = await prisma.review.count({ where: { ownerId } });
  if (existingReviews > 20 && !process.argv.includes("--force")) {
    console.error(
      `Refusing to run: this account has ${existingReviews} reviews in it.\n` +
      `That history cannot be recreated. Take a backup from Settings first, then\n` +
      `re-run with --force if you really want to replace it with demo data.`,
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  await prisma.review.deleteMany({ where: { ownerId } });
  await prisma.card.deleteMany({ where: { ownerId } });
  await prisma.task.deleteMany({ where: { ownerId } });

  const lexemes = await prisma.lexeme.findMany({
    where: { pos: { in: ["NOUN", "VERB"] } },
    include: { forms: true },
    take: 30,
    orderBy: { lemma: "asc" },
  });

  for (const [i, lex] of lexemes.entries()) {
    const types = i < 4 ? (["RECOGNITION", "PRODUCTION", "CASE_FORM", "GRADATION", "GOVERNMENT"] as const)
                        : (["RECOGNITION", "PRODUCTION"] as const);
    const cards = generateCards(lex as LexemeForCards, [...types]);
    for (const c of cards) {
      // Eight weeks of history rather than two, so the heatmap, the forecast and
      // the accuracy trend on /progress all have something real to draw.
      let s = emptyScheduling(new Date(Date.now() - 56 * 86400000));
      const history = HISTORIES[i % HISTORIES.length]!;
      const reviews: { rating: number; at: Date; stateBefore: number }[] = [];
      history.forEach((r, n) => {
        const daysAgo = Math.max(0, 54 - n * 6 - (i % 5));
        const at = new Date(Date.now() - daysAgo * 86400000 + n * 3600000);
        // The FSRS state the card was in when the question was asked, exactly as
        // gradeCard records it. Without it the demo's retention reading has
        // nothing mature to measure and the chart it feeds looks broken.
        reviews.push({ rating: r, at, stateBefore: s.state });
        s = grade(s, r as 1 | 2 | 3 | 4, at);
      });
      const card = await prisma.card.create({
        data: {
          ownerId, lexemeId: lex.id, cardType: c.cardType, front: c.front, back: c.back,
          hint: c.hint, targetCase: c.targetCase, source: "DICTIONARY",
          due: history.length ? s.due : new Date(Date.now() - 3600000),
          stability: s.stability, difficulty: s.difficulty, reps: s.reps,
          lapses: s.lapses, state: s.state, learningSteps: s.learningSteps,
          lastReview: s.lastReview, elapsedDays: s.elapsedDays, scheduledDays: s.scheduledDays,
        },
      });
      for (const r of reviews) {
        await prisma.review.create({
          data: {
            ownerId, cardId: card.id, lexemeId: card.lexemeId,
            rating: r.rating, reviewedAt: r.at, durationMs: 4200,
            stateBefore: r.stateBefore, targetCase: c.targetCase,
          },
        });
      }
    }
  }

  await prisma.task.createMany({
    data: [
      { ownerId, title: "Exercise 4B — partitive plural", tag: "GRAMMAR", classWeek: 6, dueAt: new Date(Date.now() + 2 * 86400000) },
      { ownerId, title: "Learn week 6 vocabulary (24 words)", tag: "VOCABULARY", classWeek: 6, dueAt: new Date(Date.now() - 86400000) },
      { ownerId, title: "Listen to Vikerraadio for 20 minutes", tag: "LISTENING", classWeek: 6 },
      { ownerId, title: "Write 5 sentences using the comitative", tag: "HOMEWORK", classWeek: 5, completed: true, completedAt: new Date() },
    ],
  });

  /*
    A class, with this learner in it as its teacher.

    Not decoration. In local mode `/class` deliberately replaces the create and
    join forms with the reason there is nobody to share with, so
    `/class/[classroomId]` is a screen no browser suite can reach by driving
    the app: it needs a row to exist first. Without one,
    `scripts/test-containment.mjs` waives twenty checks on a real screen for
    want of a fixture, which is the sort of hole a waiver is supposed to
    report rather than create.
  */
  const classroom = await prisma.classroom.upsert({
    where: { code: DEMO_CLASS_CODE },
    update: {},
    create: { name: "Eesti keel A2, teisipäev", code: DEMO_CLASS_CODE, ownerId },
  });
  await prisma.classroomMember.upsert({
    where: { classroomId_ownerId: { classroomId: classroom.id, ownerId } },
    update: {},
    create: { classroomId: classroom.id, ownerId, role: "TEACHER", displayName: "You" },
  });

  console.log("cards:", await prisma.card.count({ where: { ownerId } }), "reviews:", await prisma.review.count({ where: { ownerId } }));
  await prisma.$disconnect();
}
main();
