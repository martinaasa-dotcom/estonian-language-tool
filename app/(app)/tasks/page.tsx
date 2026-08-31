import Link from "next/link";
import { ArrowRight, GraduationCap } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { getCurrentWeek } from "@/app/actions";
import { ButtonLink } from "@/components/Button";
import { Card, Empty, Page, SectionTitle, Stack, Stat } from "@/components/ui";
import { TaskRow } from "@/components/TaskRow";
import { NewTaskForm } from "./NewTaskForm";

export const metadata = { title: "Tasks" };

export const dynamic = "force-dynamic";

/**
 * Homework, and the week it belongs to.
 *
 * These were two destinations in the rail and one thing in the learner's head.
 * `/tasks` listed every task with its week printed on each row; `/week/[week]`
 * listed the same tasks filtered to one week, beside the words added that week.
 * Neither was complete: the task list could not tell you what "week 6" actually
 * covered, and the week page had no way to add a task or see the ones with no
 * week on them at all.
 *
 * So the week you are in leads here, as the strip at the top: what it holds,
 * and the one button worth pressing on it. `/week/[week]` is still the whole
 * week in full and is one click away, which is the ordinary shape of a detail
 * page under its parent rather than something hidden. Everything the two pages
 * did, one place to look.
 */
export default async function TasksPage() {
  const ownerId = await requireUserId();
  const [tasks, week] = await Promise.all([
    prisma.task.findMany({
      where: { ownerId },
      orderBy: [{ completed: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
      take: 200,
    }),
    getCurrentWeek(),
  ]);

  /*
    Only asked for when there is a week to ask about. Somebody not following a
    class has never set one, and two queries to draw an empty strip is two
    queries for nothing.
  */
  const cards = week
    ? await prisma.card.findMany({
      where: { ownerId, classWeek: week },
      select: { lexemeId: true, state: true, suspended: true, due: true },
      // Ordered because it is cut, and the three figures under the strip are
      // counted off these rows: an unordered slice would count a different 300
      // on two loads and move the numbers with nothing having changed.
      orderBy: { id: "asc" },
      take: 300,
    })
    : [];
  const words = new Set(cards.map((c) => c.lexemeId).filter(Boolean));
  const due = cards.filter((c) => !c.suspended && c.due <= new Date()).length;
  const known = cards.filter((c) => c.state === 2).length;

  const open = tasks.filter((t) => !t.completed);
  const done = tasks.filter((t) => t.completed);
  const weekTasks = week ? tasks.filter((t) => t.classWeek === week) : [];
  const weekDone = weekTasks.filter((t) => t.completed).length;
  const view = (t: (typeof tasks)[number]) => ({
    id: t.id, title: t.title, tag: t.tag, completed: t.completed,
    classWeek: t.classWeek, dueAt: t.dueAt ? t.dueAt.toISOString() : null,
  });

  return (
    <Page
      title="Tasks"
      lead="Homework and study goals from class, beside the week they belong to."
    >
      <Stack>
        {week && (
          <section>
            <SectionTitle hint="everything you add is filed here">Week {week}</SectionTitle>
            <Card>
              <div className="flex flex-wrap gap-8">
                <Stat value={words.size} label="Words" />
                <Stat value={known} label="Known" tone="var(--good-ink)" />
                <Stat value={`${weekDone}/${weekTasks.length}`} label="Tasks done" />
              </div>
              <div
                className="mt-5 flex flex-wrap items-center gap-3 border-t pt-5"
                style={{ borderColor: "var(--rule-soft)" }}
              >
                {cards.length > 0 ? (
                  <ButtonLink href={`/review?week=${week}`} variant="primary">
                    <GraduationCap size={15} aria-hidden />
                    {due > 0 ? `Review week ${week} (${due} due)` : `Drill week ${week}`}
                  </ButtonLink>
                ) : (
                  <ButtonLink href="/dictionary" variant="primary">
                    Add week {week} vocabulary
                  </ButtonLink>
                )}
                <Link
                  href={`/week/${week}`}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold"
                  style={{ color: "var(--accent-deep)" }}
                >
                  The whole week, word by word <ArrowRight size={13} aria-hidden />
                </Link>
              </div>
            </Card>
          </section>
        )}

        <NewTaskForm />

        <section>
          <SectionTitle hint={`${open.length} open`}>To do</SectionTitle>
          {open.length === 0 ? (
            <Empty title="Nothing to do" body="Add homework, a grammar point to revise, or a goal for the week." />
          ) : (
            <ul className="flex flex-col gap-2">
              {open.map((t) => <TaskRow key={t.id} task={view(t)} showDelete />)}
            </ul>
          )}
        </section>

        {done.length > 0 && (
          <section>
            <SectionTitle hint={`${done.length}`}>Done</SectionTitle>
            <ul className="flex flex-col gap-2">
              {done.slice(0, 20).map((t) => <TaskRow key={t.id} task={view(t)} showDelete />)}
            </ul>
          </section>
        )}

        {!week && (
          <p className="text-sm" style={{ color: "var(--ink-3)" }}>
            Following a class?{" "}
            <Link href="/week" className="font-semibold underline underline-offset-2" style={{ color: "var(--accent-deep)" }}>
              Set which week you are in
            </Link>{" "}
            and everything you add from then on is filed under it, so you can revise a week at a time.
          </p>
        )}
      </Stack>
    </Page>
  );
}
