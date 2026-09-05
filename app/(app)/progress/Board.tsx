import { Trophy, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { classRoster } from "@/lib/classroom/roster";
import { ButtonLink } from "@/components/Button";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { Card, SectionTitle, Skeleton } from "@/components/ui";

/**
 * WHO ELSE IS STUDYING, AT THE BOTTOM OF A PAGE OF CHARTS.
 *
 * Split out of the page for one reason: it is three round trips deep and
 * nothing above it needs a single one of them. Find the class this learner is
 * in, then its name and its roster. All of that used to run before the first
 * byte of a page whose first screen is a streak and a heatmap, so a learner
 * waited on a board to see their own numbers.
 *
 * Behind a `Suspense` boundary it is fetched while the rest of the page is
 * already on screen and being read, and a skeleton the size of the panel holds
 * its place so nothing under it jumps when it lands.
 *
 * A CLASS IS THE ONLY BOARD THIS APP DRAWS. It used to sit above an
 * instance-wide leaderboard, everybody on the deployment who had ticked a
 * box, ranked against each other, which is right for one school's copy and
 * was a table of strangers here: past the cap it was the top twenty of the
 * first two thousand opted-in learners by owner id, so who appeared was a
 * fact about a uuid, and it was the one surface where a stranger chose what
 * every other stranger read. A class you have joined is real people you sit
 * next to, and joining was itself the consent (ADR-019); somebody studying
 * alone is offered the way into one rather than a table of usernames.
 */
export async function Board({ ownerId, now }: { ownerId: string; now: Date }) {
  /*
    `select` and not `include`, which is the round trip this panel was carrying.

    `include: { classroom: ... }` reads as part of this query and is a second
    statement: Prisma fetches the membership, then sends the classroom id back
    to ask for its name. That is the same fault `lemmasByCardLexeme` exists to
    remove one layer down, and it is easy to miss here because the two
    statements go out together and look like one call.

    Nothing needed the name *before* the roster, though, only beside it. So the
    membership is read for its id alone, and the name comes back in parallel
    with the roster rather than in front of it: four sequential round trips to
    three. The relation in `where` stays, because a relation *filter* compiles
    into this statement rather than another one.
  */
  const membership = await prisma.classroomMember.findFirst({
    where: { ownerId, classroom: { archived: false } },
    select: { classroomId: true },
    orderBy: { joinedAt: "desc" },
  });

  const [classroom, classBoard] = membership
    ? await Promise.all([
        prisma.classroom.findUnique({
          where: { id: membership.classroomId },
          select: { id: true, name: true },
        }),
        classRoster(membership.classroomId, now),
      ])
    : [null, null];

  return (
    <section>
      {/* The figure in each row is what somebody reviewed this week, so the
          hint says so: it used to read "N XP" in the row itself and a bare
          number under "this week" says nothing. */}
      <SectionTitle hint="reviews this week">
        {classBoard ? classroom?.name : "Class leaderboard"}
      </SectionTitle>
      <Card>
        {classBoard && membership ? (
          <>
            <ol className="flex flex-col gap-1.5">
              {classBoard.entries.slice(0, 8).map((row, i) => (
                <li
                  key={row.ownerId}
                  className="flex items-center gap-3 rounded-md px-3 py-2"
                  style={{
                    background: row.ownerId === ownerId ? "var(--accent-soft)" : "transparent",
                    color: row.ownerId === ownerId ? "var(--accent-deep)" : "var(--ink-2)",
                  }}
                >
                  <span className="tnum w-6 text-xs">{i + 1}</span>
                  {i === 0 && row.reviewsThisWeek > 0
                    ? <Trophy size={15} aria-hidden style={{ color: "var(--hard-ink)" }} />
                    : <Users size={15} aria-hidden style={{ opacity: 0.5 }} />}
                  <span className="min-w-0 flex-1 truncate text-sm">{row.displayName}</span>
                  <span className="tnum text-xs">{row.reviewsThisWeek}</span>
                </li>
              ))}
            </ol>
            <Link
              href={`/class/${membership.classroomId}`}
              className="mt-3 inline-block text-xs"
              style={{ color: "var(--accent-deep)" }}
            >
              Open the class
            </Link>
          </>
        ) : (
          <>
            <p className="text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
              A board is worth reading when you know the people on it. Start a class and share
              the code, or join the one your teacher gave you, and this shows the week for
              everybody in it.
            </p>
            <ButtonLink href="/class" className="mt-4">Start or join a class</ButtonLink>
          </>
        )}
      </Card>
    </section>
  );
}

/**
 * The shape of the panel while it loads.
 *
 * Its own height rather than a spinner, so the page below does not move once
 * the answer lands. Same argument as app/(app)/loading.tsx one level up.
 */
export function BoardSkeleton() {
  return (
    <section aria-busy="true" aria-label="Loading the board">
      <SectionTitle hint="reviews this week">Class leaderboard</SectionTitle>
      <Card>
        <Skeleton height={132} />
      </Card>
    </section>
  );
}
