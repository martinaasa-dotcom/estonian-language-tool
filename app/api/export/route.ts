import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Full export. Months of review history is the one thing in this app that cannot
 * be reconstructed from anywhere, so getting it out must never be more than a click.
 */
export async function GET() {
  const [lexemes, cards, reviews, tasks] = await Promise.all([
    prisma.lexeme.findMany({ include: { forms: true } }),
    prisma.card.findMany(),
    prisma.review.findMany({ orderBy: { reviewedAt: "asc" } }),
    prisma.task.findMany(),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    format: "sonasepp-v1",
    counts: {
      words: lexemes.length, cards: cards.length,
      reviews: reviews.length, tasks: tasks.length,
    },
    lexemes, cards, reviews, tasks,
  };

  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="estonian-backup-${date}.json"`,
    },
  });
}
