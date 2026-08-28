import Link from "next/link";
import { ArrowRight, BookOpen, Sparkles } from "lucide-react";
import { prisma } from "@/lib/db";
import { resolveProvider } from "@/lib/tutor/provider";
import { ButtonLink } from "@/components/Button";
import { Card, Chip, Empty, Page, SectionTitle, Stat } from "@/components/ui";
import { Speak } from "@/components/Speak";
import { TaskRow } from "@/components/TaskRow";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const now = new Date();
  const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);
  const weekAgo = new Date(now.getTime() - 7 * 86400000);

  const [dueCount, newCount, totalCards, tasks, reviewsThisWeek, streakRows, wordOfDay] = await Promise.all([
    prisma.card.count({ where: { suspended: false, due: { lte: now }, state: { not: 0 } } }),
    prisma.card.count({ where: { suspended: false, state: 0 } }),
    prisma.card.count(),
    prisma.task.findMany({
      where: { completed: false },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      take: 5,
    }),
    prisma.review.count({ where: { reviewedAt: { gte: weekAgo } } }),
    prisma.review.findMany({
      where: { reviewedAt: { gte: new Date(now.getTime() - 30 * 86400000) } },
      select: { reviewedAt: true },
    }),
    pickWordOfDay(),
  ]);

  const tutorReady = resolveProvider() !== null;
  const toReview = Math.min(dueCount + Math.min(newCount, 10), 60);
  const streak = computeStreak(streakRows.map((r) => r.reviewedAt));
  const overdue = tasks.filter((t) => t.dueAt && t.dueAt < now).length;

  return (
    <Page
      title={greeting()}
      lead={
        toReview > 0
          ? `${toReview} card${toReview === 1 ? "" : "s"} waiting. That's about ${Math.max(1, Math.round(toReview / 6))} minutes.`
          : "Nothing due right now — a good moment to add new words."
      }
    >
      <div className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-5">
          {/* The one thing the app exists to get her to do. */}
          <Card className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex gap-8">
                <Stat value={dueCount} label="Due" tone={dueCount > 0 ? "var(--accent)" : undefined} />
                <Stat value={Math.min(newCount, 10)} label="New" />
                <Stat value={streak} label="Day streak" />
              </div>
            </div>
            {totalCards === 0 ? (
              <Empty
                title="Your deck is empty"
                body="Search a word in the dictionary and add it — you get the full paradigm, audio, and two cards in one click."
                action={<ButtonLink href="/dictionary" variant="primary">Open the dictionary</ButtonLink>}
              />
            ) : toReview > 0 ? (
              <ButtonLink href="/review" variant="primary" className="w-full py-3 text-[15px]">
                Start reviewing <ArrowRight size={16} aria-hidden />
              </ButtonLink>
            ) : (
              <p className="rounded-md px-4 py-3 text-[14px]" style={{ background: "var(--good-soft)", color: "var(--good)" }}>
                Caught up. Reviewing early doesn&rsquo;t help memory — come back tomorrow.
              </p>
            )}
          </Card>

          <section>
            <SectionTitle hint={overdue > 0 ? `${overdue} overdue` : undefined}>Tasks</SectionTitle>
            {tasks.length === 0 ? (
              <Card>
                <p className="text-[14px]" style={{ color: "var(--ink-2)" }}>
                  Nothing outstanding.{" "}
                  <Link href="/tasks" className="underline" style={{ color: "var(--accent)" }}>Add homework</Link>{" "}
                  to keep class work in one place.
                </p>
              </Card>
            ) : (
              <ul className="flex flex-col gap-2">
                {tasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={{
                      id: t.id, title: t.title, tag: t.tag, completed: t.completed,
                      classWeek: t.classWeek,
                      dueAt: t.dueAt ? t.dueAt.toISOString() : null,
                    }}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-5">
          {wordOfDay && (
            <Card>
              <SectionTitle hint="from your weakest cards">Word to revisit</SectionTitle>
              <div className="flex items-center gap-2">
                <p lang="et" className="est text-[26px] font-semibold" style={{ color: "var(--ink)" }}>{wordOfDay.lemma}</p>
                <Speak text={wordOfDay.lemma} />
              </div>
              <p className="mt-1 text-[14px]" style={{ color: "var(--ink-2)" }}>{wordOfDay.translation}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {wordOfDay.cefr && <Chip>{wordOfDay.cefr}</Chip>}
                {wordOfDay.gradationNote && <Chip tone="hard" caseSensitive>{wordOfDay.gradationNote}</Chip>}
              </div>
              <Link
                href={`/dictionary?q=${encodeURIComponent(wordOfDay.lemma)}`}
                className="mt-4 inline-flex items-center gap-1.5 text-[13.5px]"
                style={{ color: "var(--accent)" }}
              >
                <BookOpen size={14} aria-hidden /> See the full paradigm
              </Link>
            </Card>
          )}

          <Card>
            <SectionTitle>This week</SectionTitle>
            <div className="flex gap-8">
              <Stat value={reviewsThisWeek} label="Reviews" />
              <Stat value={totalCards} label="Cards total" />
            </div>
          </Card>

          <Card>
            <SectionTitle hint={tutorReady ? undefined : "needs a key"}>Stuck on something?</SectionTitle>
            <p className="text-[14px]" style={{ color: "var(--ink-2)" }}>
              {tutorReady
                ? "Anu explains Estonian grammar — which case to use, why a stem changed, whether your sentence is right."
                : "Anu can explain which case to use and why a stem changed. She needs a free API key first — it takes about two minutes."}
            </p>
            <ButtonLink href={tutorReady ? "/tutor" : "/settings"} className="mt-4 w-full">
              <Sparkles size={15} aria-hidden /> {tutorReady ? "Ask Anu" : "Set Anu up"}
            </ButtonLink>
          </Card>
        </div>
      </div>
    </Page>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Still up";
  if (h < 11) return "Tere hommikust";
  if (h < 18) return "Tere päevast";
  return "Tere õhtust";
}

/** Prefers a word the learner has actually struggled with over a random one. */
async function pickWordOfDay() {
  const lapsed = await prisma.card.findFirst({
    where: { lapses: { gt: 0 }, lexemeId: { not: null } },
    orderBy: { lapses: "desc" },
    include: { lexeme: true },
  });
  if (lapsed?.lexeme) return lapsed.lexeme;

  const count = await prisma.lexeme.count();
  if (count === 0) return null;
  // Stable through the day: the same word until midnight.
  const seed = Math.floor(Date.now() / 86400000) % count;
  const [word] = await prisma.lexeme.findMany({ skip: seed, take: 1, orderBy: { lemma: "asc" } });
  return word ?? null;
}

function computeStreak(dates: Date[]): number {
  if (dates.length === 0) return 0;
  const days = new Set(dates.map((d) => d.toISOString().slice(0, 10)));
  let streak = 0;
  const cursor = new Date();
  // Today not yet reviewed does not break a streak that is alive from yesterday.
  if (!days.has(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
