import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { bucketForOwner, checkRateLimit, rateLimited } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";

/**
 * Full export. Months of review history is the one thing in this app that cannot
 * be reconstructed from anywhere, so getting it out must never be more than a click.
 * The dictionary (lexemes/forms) is shared reference data, exported in full so a
 * restore works standalone; everything else here is this user's own, and it is
 * all of it. That completeness is the point twice over: it is what makes the
 * file a real backup, and it is what Article 20 asks of a copy of your data.
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

  /*
    EVERY CATEGORY, BECAUSE THE PAGE PROMISES EVERY CATEGORY AND THE LAW ASKS
    FOR IT.

    This used to be five reads, and /privacy described the result as "every
    card, review, task, scanned page and setting" and then said "Nothing is
    held back from it." Settings were not in it. Neither were the
    conversations with Anu, the level checks, the starred words or the badges.
    Two of those are the kind of gap that matters rather than the kind that
    tidies up: a level check is a measurement that no log can reconstruct, and
    a tutor conversation is the learner's own writing.

    Article 20 is a right to receive the personal data concerning you, and a
    file that quietly stops at five tables out of ten is not that. The four
    added here complete it. `UsageEvent` is deliberately not among them and
    the reason is on /privacy: it is this deployment's spending record, kept
    to enforce a cap, and its contents are a count and a cost rather than
    anything the learner produced. It is deleted with the account like
    everything else.
  */
  const [
    lexemes, cards, reviews, tasks, scans,
    settings, messages, assessments, stars, achievements,
  ] = await Promise.all([
    prisma.lexeme.findMany({ include: { forms: true } }),
    prisma.card.findMany({ where: { ownerId } }),
    prisma.review.findMany({ where: { ownerId }, orderBy: { reviewedAt: "asc" } }),
    prisma.task.findMany({ where: { ownerId } }),
    // The word lists off photographed pages. The pictures were never kept, so
    // there is nothing here but what the learner confirmed.
    prisma.scan.findMany({ where: { ownerId }, orderBy: { createdAt: "asc" } }),
    prisma.setting.findMany({ where: { ownerId } }),
    // What the learner typed to Anu and what came back. Theirs, and nowhere
    // else: the conversation is not derivable from anything.
    prisma.message.findMany({ where: { ownerId }, orderBy: { createdAt: "asc" } }),
    // A sitting of the level check. Append-only and unrecomputable, which is
    // exactly the property that made leaving it out of a backup a real loss.
    prisma.assessment.findMany({ where: { ownerId }, orderBy: { takenAt: "asc" } }),
    prisma.starredWord.findMany({ where: { ownerId }, orderBy: { createdAt: "asc" } }),
    prisma.achievement.findMany({ where: { ownerId }, orderBy: { earnedAt: "asc" } }),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    format: "kodukeel-v1",
    counts: {
      words: lexemes.length, cards: cards.length,
      reviews: reviews.length, tasks: tasks.length, scans: scans.length,
      settings: settings.length, messages: messages.length,
      assessments: assessments.length, stars: stars.length,
      achievements: achievements.length,
    },
    lexemes, cards, reviews, tasks, scans,
    settings, messages, assessments, stars, achievements,
  };

  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="kodukeel-backup-${date}.json"`,
    },
  });
}
