import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { bucketForOwner, checkRateLimit, rateLimited } from "@/lib/security/rateLimit";

export const dynamic = "force-dynamic";

/**
 * Full export. Months of review history is the one thing in this app that cannot
 * be reconstructed from anywhere, so getting it out must never be more than a click.
 * Everything here is this user's own, and it is all of it. That completeness is
 * the point twice over: it is what makes the file a real backup, and it is what
 * Article 20 asks of a copy of your data.
 *
 * THE DICTIONARY THAT TRAVELS IS THE PART THE LEARNER'S ROWS POINT AT.
 *
 * It used to be `prisma.lexeme.findMany({ include: { forms: true } })`, the
 * whole shared dictionary, under a comment saying a restore then works
 * standalone. Two things were wrong with that. It is the one table in the file
 * that grows without the learner doing anything, so a personal backup got
 * bigger every time somebody else's word was added: 15.9 MB in August and 16.5
 * MB after one correction pass, which crossed `bodySizeLimit` and
 * `middlewareClientMaxBodySize` in `next.config.ts` and left the restore
 * refusing a learner's own file. Both limits are 16 MB and both were within a
 * few hundred kilobytes of a file nobody had looked at.
 *
 * And "standalone" was not the property it sounded like. The dictionary is a
 * build artefact of this repository: `npm run db:seed` loads it, every
 * installation has it, and `restoreBackup` merges with `ON CONFLICT DO
 * NOTHING`, so on any real deployment those 6,050 words were bytes that
 * travelled and then did nothing. What a backup is for is the half that cannot
 * be rebuilt, which is exactly the argument `Review` is append-only for.
 *
 * So the file carries the lexemes this learner's own rows reference, with their
 * forms: every word their cards, their review log, their starred list and their
 * reports are about. Measured on a demo deck, 15.19 MB became 0.08 MB, and the
 * size now scales with the deck rather than with the dictionary, which is the
 * property that stops this coming back.
 */
export async function GET() {
  const ownerId = await requireUserId();

  /*
    An export reads every review this learner has ever made and every word
    those reviews are about, so it is among the most expensive queries in the
    app. Six an hour is more than anybody backing up their own work needs and
    far less than a loop would ask for.
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
  /*
    Which words to carry, asked before the rest so the answer can be used.

    Four tables reference a lexeme and every one of them is the learner's own.
    `Review` keeps `lexemeId` as a plain column with no relation, deliberately,
    so it outlives the card it was about: a word they have not had a card for
    in a year is still a word their history is about, and leaving it out would
    restore a log pointing at nothing.
  */
  const [cardWords, reviewWords, starWords, reportWords] = await Promise.all([
    prisma.card.findMany({ where: { ownerId }, select: { lexemeId: true } }),
    prisma.review.findMany({ where: { ownerId }, select: { lexemeId: true } }),
    prisma.starredWord.findMany({ where: { ownerId }, select: { lexemeId: true } }),
    prisma.suggestion.findMany({ where: { ownerId }, select: { lexemeId: true } }),
  ]);
  const mine = new Set<string>();
  for (const row of [...cardWords, ...reviewWords, ...starWords, ...reportWords]) {
    if (row.lexemeId) mine.add(row.lexemeId);
  }

  const [
    lexemes, cards, reviews, tasks, studyEvents, scans,
    settings, messages, assessments, stars, achievements,
    examAttempts, classrooms, classroomMembers, suggestions, sceneRuns, sceneGaps, encounters,
  ] = await Promise.all([
    prisma.lexeme.findMany({ where: { id: { in: [...mine] } }, include: { forms: true } }),
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
    // Every conversation played through, with its transcript, and every word
    // one needed. Fiction about a role card, and still theirs.
    prisma.sceneRun.findMany({ where: { ownerId }, orderBy: { startedAt: "asc" } }),
    prisma.sceneGap.findMany({ where: { ownerId }, orderBy: { createdAt: "asc" } }),
    // Every real conversation they reported having, in one of three words.
    prisma.encounter.findMany({ where: { ownerId }, orderBy: { createdAt: "asc" } }),
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
      sceneRuns: sceneRuns.length, sceneGaps: sceneGaps.length, encounters: encounters.length,
    },
    lexemes, cards, reviews, tasks, studyEvents, scans,
    settings, messages, assessments, stars, achievements,
    examAttempts, classrooms, classroomMembers, suggestions, sceneRuns, sceneGaps, encounters,
  };

  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="kodukeel-backup-${date}.json"`,
      /*
        Every review, every conversation with Anu and every exam composition
        this learner has written, in one response at one URL. It carried no
        freshness directive at all, so a shared cache in front of the app with
        a default TTL for a 200 would have been free to hand it to the next
        request. `private, no-store` and a `Cookie` vary say who it belongs to.
      */
      "cache-control": "private, no-store",
      vary: "Cookie",
    },
  });
}
