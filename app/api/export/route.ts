import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { bucketForOwner, checkRateLimit, rateLimited } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";

/**
 * Full export. Months of review history is the one thing in this app that cannot
 * be reconstructed from anywhere, so getting it out must never be more than a click.
 * The dictionary (lexemes/forms) is shared reference data, exported in full so a
 * restore works standalone; cards, reviews, tasks and scanned pages are this
 * user's own only.
 */
export async function GET() {
  const ownerId = await requireUserId();

  /*
    An export reads the whole dictionary and every review this learner has
    ever made, so it is the most expensive query in the app by a wide margin.
    Six an hour is more than anybody backing up their own work needs and far
    less than a loop would ask for.
  */
  const limit = checkRateLimit(`export:${bucketForOwner(ownerId)}`, 6, 60 * 60_000);
  if (!limit.ok) {
    return rateLimited(
      limit,
      // Says which limit was reached. The old wording, "that backup is already
      // on its way", describes a request in flight, so somebody who had taken
      // six today would wait for a download that was never coming.
      "You have taken six backups in the last hour, which is the limit. Your data is safe and nothing has changed; try again a little later.",
    );
  }

  const [lexemes, cards, reviews, tasks, scans] = await Promise.all([
    prisma.lexeme.findMany({ include: { forms: true } }),
    prisma.card.findMany({ where: { ownerId } }),
    prisma.review.findMany({ where: { ownerId }, orderBy: { reviewedAt: "asc" } }),
    prisma.task.findMany({ where: { ownerId } }),
    // The word lists off photographed pages. The pictures were never kept, so
    // there is nothing here but what the learner confirmed.
    prisma.scan.findMany({ where: { ownerId }, orderBy: { createdAt: "asc" } }),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    format: "kodukeel-v1",
    counts: {
      words: lexemes.length, cards: cards.length,
      reviews: reviews.length, tasks: tasks.length, scans: scans.length,
    },
    lexemes, cards, reviews, tasks, scans,
  };

  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="kodukeel-backup-${date}.json"`,
    },
  });
}
