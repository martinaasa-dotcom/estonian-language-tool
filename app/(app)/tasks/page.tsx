import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { Empty, Page, SectionTitle } from "@/components/ui";
import { TaskRow } from "@/components/TaskRow";
import { NewTaskForm } from "./NewTaskForm";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const ownerId = await requireUserId();
  const tasks = await prisma.task.findMany({
    where: { ownerId },
    orderBy: [{ completed: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  const open = tasks.filter((t) => !t.completed);
  const done = tasks.filter((t) => t.completed);
  const view = (t: (typeof tasks)[number]) => ({
    id: t.id, title: t.title, tag: t.tag, completed: t.completed,
    classWeek: t.classWeek, dueAt: t.dueAt ? t.dueAt.toISOString() : null,
  });

  return (
    <Page title="Tasks" lead="Homework and study goals from class, in one place.">
      <div className="flex flex-col gap-8">
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
      </div>
    </Page>
  );
}
