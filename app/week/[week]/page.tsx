import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CalendarCheck, ChevronLeft, ChevronRight, GraduationCap } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { getCurrentWeek } from "@/app/actions";
import { ButtonLink } from "@/components/Button";
import { Card, Chip, Empty, Page, SectionTitle, Stat } from "@/components/ui";
import { Speak } from "@/components/Speak";
import { TaskRow } from "@/components/TaskRow";
import { WeekPicker } from "../WeekPicker";

export const dynamic = "force-dynamic";

/**
 * One course week, as a lens over everything.
 *
 * `classWeek` has been in the schema since the MVP, stored on tasks and used for
 * nothing. It is the one field that ties the app to the class the learner is
 * actually sitting in, and that is the whole reason a personal tool beats a
 * generic one: this is not "500 common Estonian words", it is *what we did on
 * Tuesday*.
 */
export default async function WeekPage({ params }: { params: Promise<{ week: string }> }) {
  const ownerId = await requireUserId();
  const { week: raw } = await params;
  const week = Number(raw);
  if (!Number.isInteger(week) || week < 1 || week > 60) notFound();

  const [cards, tasks, current] = await Promise.all([
    prisma.card.findMany({
      where: { ownerId, classWeek: week },
      include: { lexeme: { select: { lemma: true, translation: true, cefr: true, pos: true } } },
      orderBy: { createdAt: "asc" },
      take: 300,
    }),
    prisma.task.findMany({
      where: { ownerId, classWeek: week },
      orderBy: [{ completed: "asc" }, { dueAt: "asc" }],
    }),
    getCurrentWeek(),
  ]);

  // Distinct words, since a word makes several cards.
  const words = new Map<string, { lemma: string; translation: string; cefr: string | null }>();
  for (const card of cards) {
    if (!card.lexemeId || !card.lexeme) continue;
    if (!words.has(card.lexemeId)) {
      words.set(card.lexemeId, {
        lemma: card.lexeme.lemma,
        translation: card.lexeme.translation,
        cefr: card.lexeme.cefr,
      });
    }
  }

  const due = cards.filter((c) => !c.suspended && c.due <= new Date()).length;
  const known = cards.filter((c) => c.state === 2).length;
  const doneTasks = tasks.filter((t) => t.completed).length;

  const empty = cards.length === 0 && tasks.length === 0;

  return (
    <Page
      title={`Week ${week}`}
      lead={
        week === current
          ? "Your current week. Everything you add is filed here."
          : "What this week of the course covered."
      }
      actions={<WeekPicker current={current} viewing={week} />}
    >
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link
          href={`/week/${week - 1}`}
          aria-disabled={week <= 1}
          className="flex items-center gap-1 text-[13.5px]"
          style={{ color: week <= 1 ? "var(--ink-3)" : "var(--accent)", pointerEvents: week <= 1 ? "none" : undefined }}
        >
          <ChevronLeft size={14} aria-hidden /> Week {week - 1}
        </Link>
        {week === current && <Chip tone="accent">current week</Chip>}
        <Link
          href={`/week/${week + 1}`}
          className="flex items-center gap-1 text-[13.5px]"
          style={{ color: "var(--accent)" }}
        >
          Week {week + 1} <ChevronRight size={14} aria-hidden />
        </Link>
      </div>

      {empty ? (
        <Empty
          title={`Nothing filed under week ${week} yet`}
          body={
            week === current
              ? "Words you add to your deck from now on land here automatically, and tasks can be tagged with a week when you create them."
              : "Set this as your current week in the picker above, then add the vocabulary and homework it covered."
          }
          action={<ButtonLink href="/dictionary" variant="primary">Add words</ButtonLink>}
        />
      ) : (
        <div className="flex flex-col gap-8">
          <Card>
            <div className="flex flex-wrap gap-8">
              <Stat value={words.size} label="Words" />
              <Stat value={cards.length} label="Cards" />
              <Stat value={known} label="Known" tone="var(--good)" />
              <Stat value={`${doneTasks}/${tasks.length}`} label="Tasks done" />
            </div>
            {cards.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-3 border-t pt-5" style={{ borderColor: "var(--rule-soft)" }}>
                <ButtonLink href={`/review?week=${week}`} variant="primary">
                  <GraduationCap size={15} aria-hidden />
                  {due > 0 ? `Review week ${week} (${due} due)` : `Drill week ${week}`}
                </ButtonLink>
                <ButtonLink href={`/words?week=${week}`}>See the cards</ButtonLink>
              </div>
            )}
          </Card>

          {words.size > 0 && (
            <section>
              <SectionTitle hint={`${words.size} words`}>Vocabulary</SectionTitle>
              <Card>
                <ul className="flex flex-col divide-y" style={{ borderColor: "var(--rule-soft)" }}>
                  {[...words.entries()].map(([id, word]) => (
                    <li key={id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                      <Link
                        href={`/dictionary?q=${encodeURIComponent(word.lemma)}`}
                        className="min-w-0 flex-1"
                      >
                        <span lang="et" className="est text-[16px] font-medium" style={{ color: "var(--ink)" }}>
                          {word.lemma}
                        </span>
                        <span className="ml-2 text-[13.5px]" style={{ color: "var(--ink-3)" }}>
                          {word.translation}
                        </span>
                      </Link>
                      {word.cefr && <Chip>{word.cefr}</Chip>}
                      <Speak text={word.lemma} />
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}

          {tasks.length > 0 && (
            <section>
              <SectionTitle hint={`${doneTasks} of ${tasks.length} done`}>Homework</SectionTitle>
              <Card>
                <ul className="flex flex-col gap-1">
                  {tasks.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={{
                        id: t.id, title: t.title, tag: t.tag,
                        classWeek: t.classWeek,
                        dueAt: t.dueAt ? t.dueAt.toISOString() : null,
                        completed: t.completed,
                      }}
                    />
                  ))}
                </ul>
              </Card>
            </section>
          )}

          <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>
            <Link href="/tasks" className="inline-flex items-center gap-1.5" style={{ color: "var(--accent)" }}>
              <CalendarCheck size={13} aria-hidden /> All tasks <ArrowRight size={12} aria-hidden />
            </Link>
          </p>
        </div>
      )}
    </Page>
  );
}
