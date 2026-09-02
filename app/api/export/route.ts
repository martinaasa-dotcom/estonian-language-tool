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
      "You have taken six backups in the last hour, which is the limit. Your data is safe and nothing has changed. Try again a little later.",
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

    THEN IT STOPPED AT TEN OUT OF THIRTEEN, AND THE CHECK SAID IT DID NOT.

    The invariant behind the paragraph above reads the owner-scoped models out
    of the schema so that a new table fails until somebody decides about it.
    Three had been added to its skip list instead of to this query: mock exam
    sittings, classes and class memberships. A skip list with one reasoned
    entry is a decision; a skip list anybody can append to is the parking space
    this project's own copy rules warn about, and it had become one. The
    exclusions carry their reason now (`lib/legal/exportCoverage.ts`) and the
    check fails on an unexplained one, so this cannot happen a third time
    quietly.

    A mock sitting is the sharpest of the three: it holds the composition the
    learner wrote, which no log reconstructs and no other table keeps.
  */
  const [
    lexemes, cards, reviews, tasks, studyEvents, scans,
    settings, messages, assessments, stars, achievements,
    examAttempts, classrooms, classroomMembers, suggestions,
  ] = await Promise.all([
    prisma.lexeme.findMany({ include: { forms: true } }),
    prisma.card.findMany({ where: { ownerId } }),
    prisma.review.findMany({ where: { ownerId }, orderBy: { reviewedAt: "asc" } }),
    prisma.task.findMany({ where: { ownerId } }),
    // Their own calendar: class times, study slots, exam dates. Typed by hand
    // and derivable from nothing, which is the test a backup row has to pass.
    prisma.studyEvent.findMany({ where: { ownerId }, orderBy: { createdAt: "asc" } }),
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
    // A sat mock paper, marked. The writing part is in `result` verbatim, so
    // this is the one export row that is the learner's own prose.
    prisma.examAttempt.findMany({ where: { ownerId }, orderBy: { finishedAt: "asc" } }),
    // Classes they run, and classes they are in. The second carries the name
    // they chose to be known by, which is theirs and is nowhere else.
    prisma.classroom.findMany({ where: { ownerId }, orderBy: { createdAt: "asc" } }),
    prisma.classroomMember.findMany({ where: { ownerId }, orderBy: { joinedAt: "asc" } }),
    // What they told us was wrong, and what a reviewer said back. Their own
    // words on one side and a reply about them on the other, so it is theirs
    // twice over.
    prisma.suggestion.findMany({ where: { ownerId }, orderBy: { createdAt: "asc" } }),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    format: "kodukeel-v1",
    counts: {
      words: lexemes.length, cards: cards.length,
      reviews: reviews.length, tasks: tasks.length, scans: scans.length,
      settings: settings.length, messages: messages.length,
      assessments: assessments.length, stars: stars.length,
      achievements: achievements.length, examAttempts: examAttempts.length,
      classrooms: classrooms.length, classroomMembers: classroomMembers.length,
      suggestions: suggestions.length, studyEvents: studyEvents.length,
    },
    lexemes, cards, reviews, tasks, studyEvents, scans,
    settings, messages, assessments, stars, achievements,
    examAttempts, classrooms, classroomMembers, suggestions,
  };

  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="kodukeel-backup-${date}.json"`,
    },
  });
}
