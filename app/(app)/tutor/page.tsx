import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { resolveProviders } from "@/lib/tutor/provider";
import { Page } from "@/components/ui";
import { TutorChat } from "./TutorChat";

export const dynamic = "force-dynamic";

/** Anu, optionally opened with a question already written. */
export default async function TutorPage({ searchParams }: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const ownerId = await requireUserId();
  const chain = resolveProviders();
  const history = await prisma.message.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { role: true, content: true },
  });

  return (
    <Page
      title="Anu"
      lead="Your Estonian teacher. Ask why a case is what it is, check a sentence, or get a stem explained."
    >
      <TutorChat
        configured={chain.length > 0}
        // What is configured, which is not yet what answered. The chat replaces
        // this with the model the reply actually came from as soon as one has.
        plannedLabel={chain[0] ? `${chain[0].label} · ${chain[0].model}` : null}
        history={history.reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))}
        // Prefilled, not sent. A review card can hand Anu the question a
        // learner just failed to answer; pressing send is still their call,
        // and the wording is theirs to edit first.
        initialQuestion={typeof q === "string" ? q.slice(0, 300) : undefined}
      />
    </Page>
  );
}
