import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Flame, GraduationCap, Target, Trophy } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { PATH } from "@/lib/collections/path";
import { classRoster } from "@/lib/classroom/roster";
import { Card, Chip, Empty, Meter, Note, Page, SectionTitle, Stat } from "@/components/ui";
import { ArchiveClass, AssignUnit, CopyCode, LeaveClass } from "../ClassForms";

export const dynamic = "force-dynamic";

/**
 * One class.
 *
 * Teachers get the roster and the assign box; students get the same leaderboard
 * their classmates see and nothing more. The two views share one query because
 * they are the same data seen from different seats — what differs is only what
 * a student has no business acting on.
 */
export default async function ClassroomPage({ params }: { params: Promise<{ classroomId: string }> }) {
  const { classroomId } = await params;
  const ownerId = await requireUserId();

  const membership = await prisma.classroomMember.findUnique({
    where: { classroomId_ownerId: { classroomId, ownerId } },
    include: { classroom: true },
  });
  // Not a member: the class simply does not exist as far as this account is
  // concerned. No "you are not allowed" — that would confirm it is real.
  if (!membership) notFound();

  const classroom = membership.classroom;
  const isTeacher = classroom.ownerId === ownerId;
  const roster = await classRoster(classroomId);

  const leader = roster.entries[0];
  const you = roster.entries.find((e) => e.ownerId === ownerId);
  const units = PATH.map((u) => ({ id: u.id, title: u.title, subtitle: u.subtitle }));

  return (
    <Page
      title={classroom.name}
      lead={isTeacher
        ? "Who is keeping up, and what the class as a whole keeps getting wrong."
        : "How your class is doing this week."}
      actions={
        <Link href="/class" className="flex items-center gap-1.5 text-[13.5px]" style={{ color: "var(--accent)" }}>
          <ArrowLeft size={14} aria-hidden /> All classes
        </Link>
      }
    >
      <div className="flex flex-col gap-6">
        {classroom.archived && (
          <Note tone="hard">
            This class is archived — the join code no longer works. Everything already here stays.
          </Note>
        )}

        {isTeacher && !classroom.archived && (
          <Card>
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <SectionTitle>Join code</SectionTitle>
                <p className="est text-[30px] font-bold tracking-[0.25em]" style={{ color: "var(--ink)" }}>
                  {classroom.code}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <CopyCode code={classroom.code} />
                <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                  Students enter this under Classes → Join.
                </span>
              </div>
            </div>
          </Card>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Card><Stat value={roster.entries.length} label="Members" /></Card>
          <Card><Stat value={roster.activeThisWeek} label="Active this week" tone="var(--good)" /></Card>
          <Card><Stat value={roster.totalReviewsThisWeek} label="Reviews this week" /></Card>
        </div>

        <section>
          <SectionTitle hint="this week">{isTeacher ? "Roster" : "Class leaderboard"}</SectionTitle>
          {roster.entries.length <= 1 ? (
            <Empty
              title={isTeacher ? "Nobody has joined yet" : "You are the first one here"}
              body={isTeacher
                ? "Put the join code on the board. As soon as someone joins and reviews, this fills with who is keeping up and who has gone quiet."
                : "Once your classmates join, this shows how the week is going for everyone."}
            />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {roster.entries.map((entry, i) => {
                const isYou = entry.ownerId === ownerId;
                const quiet = entry.daysSinceLastReview === null || entry.daysSinceLastReview > 6;
                return (
                  <li
                    key={entry.ownerId}
                    className="flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3"
                    style={{
                      borderColor: isYou ? "var(--accent)" : "var(--rule)",
                      background: isYou ? "var(--accent-soft)" : "var(--surface)",
                    }}
                  >
                    <span className="tnum w-6 text-[13px]" style={{ color: "var(--ink-3)" }}>{i + 1}</span>
                    {i === 0 && entry.weeklyXp > 0
                      ? <Trophy size={16} aria-hidden style={{ color: "var(--hard)" }} />
                      : <span className="w-4" aria-hidden />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px]" style={{ color: "var(--ink)" }}>
                        {entry.displayName}
                        {entry.role === "TEACHER" && (
                          <GraduationCap size={13} aria-label="teacher" className="ml-1.5 inline" style={{ color: "var(--ink-3)" }} />
                        )}
                      </span>
                      {isTeacher && (
                        <span className="block text-[12px]" style={{ color: quiet ? "var(--hard)" : "var(--ink-3)" }}>
                          {entry.daysSinceLastReview === null
                            ? "no reviews yet"
                            : entry.daysSinceLastReview === 0
                              ? "reviewed today"
                              : `last review ${entry.daysSinceLastReview} day${entry.daysSinceLastReview === 1 ? "" : "s"} ago`}
                          {" · "}{entry.wordsKnown} words known
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-1 text-[13px]" style={{ color: "var(--ink-2)" }}>
                      {entry.streak}<Flame size={13} aria-hidden style={{ color: entry.streak > 0 ? "var(--hard)" : "var(--ink-3)" }} />
                    </span>
                    <span className="tnum w-20 text-right text-[13.5px]" style={{ color: "var(--ink)" }}>
                      {entry.weeklyXp} XP
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {you && leader && you.ownerId !== leader.ownerId && (
            <p className="mt-2 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
              {leader.weeklyXp - you.weeklyXp} XP behind the top of the class — about{" "}
              {Math.max(1, Math.ceil((leader.weeklyXp - you.weeklyXp) / 10))} more cards.
            </p>
          )}
        </section>

        {roster.weakestCases.length > 0 && (
          <section>
            <SectionTitle hint="the whole class, not one person">What to teach next</SectionTitle>
            <Card>
              <ul className="flex flex-col gap-2">
                {roster.weakestCases.map((c) => (
                  <li key={c.grammCase} className="flex items-center gap-3 text-[13.5px]">
                    <Target size={14} aria-hidden style={{ color: "var(--ink-3)" }} />
                    <span className="w-28" style={{ color: "var(--ink-2)" }}>{c.grammCase.toLowerCase()}</span>
                    <span className="max-w-[240px] flex-1">
                      <Meter
                        pct={c.accuracy}
                        label={`${c.grammCase.toLowerCase()} across the class`}
                        tone={c.accuracy >= 85 ? "var(--good)" : c.accuracy >= 65 ? "var(--hard)" : "var(--again)"}
                        height={5}
                      />
                    </span>
                    <span className="tnum text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                      {c.accuracy}% over {c.total}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                Aggregated across everyone who has answered a case-form card. Individual answers are
                not shown to anyone but the learner who gave them.
              </p>
            </Card>
          </section>
        )}

        {isTeacher && !classroom.archived && (
          <section>
            <SectionTitle>Homework</SectionTitle>
            <Card>
              <AssignUnit classroomId={classroomId} units={units} />
              <p className="mt-3 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                Lands as a task in each student&rsquo;s own list, with a link to the unit. Nobody&rsquo;s
                deck is changed — they choose when to add the words.
              </p>
            </Card>
          </section>
        )}

        <div className="flex flex-wrap items-center gap-4 border-t pt-5" style={{ borderColor: "var(--rule-soft)" }}>
          {isTeacher ? <ArchiveClass classroomId={classroomId} /> : <LeaveClass classroomId={classroomId} />}
          <Chip>joined {membership.joinedAt.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</Chip>
        </div>
      </div>
    </Page>
  );
}
