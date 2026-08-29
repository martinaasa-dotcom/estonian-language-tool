import Link from "next/link";
import { GraduationCap, School, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { currentLearner, requireUserId } from "@/lib/auth/session";
import { supabaseConfigured } from "@/lib/auth/mode";
import { readSettings, SETTING_KEYS } from "@/lib/settings/store";
import { Card, Chip, Note, Page, SectionTitle } from "@/components/ui";
import { CreateClass, JoinClass } from "./ClassForms";

export const dynamic = "force-dynamic";

/**
 * Classes.
 *
 * The feature a real Estonian course actually asks for: a teacher wants to know
 * who is keeping up, and students want the week's homework somewhere other than
 * a WhatsApp group. It is built on top of what each learner already owns —
 * a class is a view, never a copy — so joining one shares progress and nothing
 * else, and leaving takes the sharing away without touching a single card.
 */
export default async function ClassIndexPage() {
  const ownerId = await requireUserId();

  const [memberships, settings, learner] = await Promise.all([
    prisma.classroomMember.findMany({
      where: { ownerId },
      include: { classroom: { select: { id: true, name: true, code: true, archived: true, ownerId: true } } },
      orderBy: { joinedAt: "desc" },
    }),
    readSettings(ownerId, [SETTING_KEYS.displayName]),
    currentLearner(),
  ]);

  const counts = await prisma.classroomMember.groupBy({
    by: ["classroomId"],
    where: { classroomId: { in: memberships.map((m) => m.classroomId) } },
    _count: true,
  });
  const sizeOf = new Map(counts.map((c) => [c.classroomId, c._count]));
  const suggestedName =
    settings[SETTING_KEYS.displayName]?.trim() || (learner.name === "you" ? "" : learner.name);

  // With no accounts there is exactly one learner, so there is nobody to share a
  // class with. Any class this install already holds is still listed — switching
  // an instance to local mode should not make data vanish — but the create and
  // join forms would be theatre, so they are replaced by the reason why.
  const shareable = supabaseConfigured();

  return (
    <Page
      eyebrow="Learn together"
      title="Classes"
      lead="A class shares progress, not data. Your deck, your searches and your history stay yours."
    >
      <div className="flex flex-col gap-7">
        {memberships.length > 0 && (
          <section>
            <SectionTitle>Your classes</SectionTitle>
            <ul className="flex flex-col gap-2">
              {memberships.map((m) => (
                <li key={m.classroomId}>
                  <Link
                    href={`/class/${m.classroomId}`}
                    className="lift flex flex-wrap items-center gap-3 rounded-[var(--r-lg)] border px-4 py-3.5"
                    style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}
                  >
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-full"
                      style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
                    >
                      {m.role === "TEACHER" ? <GraduationCap size={19} aria-hidden /> : <Users size={19} aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="est block text-md font-semibold" style={{ color: "var(--ink)" }}>
                        {m.classroom.name}
                      </span>
                      <span className="block text-xs" style={{ color: "var(--ink-3)" }}>
                        {m.role === "TEACHER" ? "You teach this class" : "You are a student here"} ·{" "}
                        {sizeOf.get(m.classroomId) ?? 1} member{(sizeOf.get(m.classroomId) ?? 1) === 1 ? "" : "s"}
                      </span>
                    </span>
                    {m.classroom.archived && <Chip>archived</Chip>}
                    {m.role === "TEACHER" && !m.classroom.archived && (
                      <Chip tone="accent" caseSensitive>{m.classroom.code}</Chip>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {shareable ? (
          <div className="grid gap-5 md:grid-cols-2">
            <section>
              <SectionTitle hint="students">Join a class</SectionTitle>
              <Card tone="mint">
                <JoinClass suggestedName={suggestedName} />
              </Card>
            </section>

            <section>
              <SectionTitle hint="teachers">Start a class</SectionTitle>
              <Card tone="accent">
                <p className="mb-4 text-sm" style={{ color: "var(--ink-2)" }}>
                  You get a six-character join code to put on the board, a roster showing who is
                  actually reviewing, and the cases your group keeps missing, which is the useful
                  half of a progress report.
                </p>
                <CreateClass />
              </Card>
            </section>
          </div>
        ) : (
          <Card>
            <div className="flex items-start gap-3">
              <School size={20} aria-hidden className="mt-0.5 shrink-0" style={{ color: "var(--accent-deep)" }} />
              <div>
                <p className="text-base" style={{ color: "var(--ink-2)" }}>
                  This copy is running in local mode, where there is one learner and no accounts, so
                  there is nobody to share a class with. Classes need sign-in configured
                  (<code className="text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and its anon key);
                  the README has the ten-minute version.
                </p>
                <p className="mt-3 text-xs" style={{ color: "var(--ink-3)" }}>
                  Everything else in the app works exactly the same either way.
                </p>
              </div>
            </div>
          </Card>
        )}

        <Note tone="neutral">
          A teacher sees effort and progress: reviews this week, streak, words known, and the
          class&rsquo;s weakest cases in aggregate. Never an individual&rsquo;s searches, deck or
          mistakes. That line is drawn in the code, not in a policy, see{" "}
          <code className="text-xs">lib/classroom/roster.ts</code>.
        </Note>
      </div>
    </Page>
  );
}
