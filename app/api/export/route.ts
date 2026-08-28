import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Full export. Months of review history is the one thing in this app that cannot
 * be reconstructed from anywhere, so getting it out must never be more than a click.
 * The dictionary (lexemes/forms) is shared reference data, exported in full so a
 * restore works standalone; cards, reviews and tasks are this user's own only.
 */
export async function GET() {
  const ownerId = await requireUserId();
  const [lexemes, cards, reviews, tasks] = await Promise.all([
    prisma.lexeme.findMany({ include: { forms: true } }),
    prisma.card.findMany({ where: { ownerId } }),
    prisma.review.findMany({ where: { card: { ownerId } }, orderBy: { reviewedAt: "asc" } }),
    prisma.task.findMany({ where: { ownerId } }),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    format: "kodukeel-v1",
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
      "content-disposition": `attachment; filename="kodukeel-backup-${date}.json"`,
    },
  });
}
