import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { resolveProvider } from "@/lib/tutor/provider";
import { Page } from "@/components/ui";
import { TutorChat } from "./TutorChat";

export const dynamic = "force-dynamic";

export default async function TutorPage({
  searchParams,
}: {
  searchParams: Promise<{ ask?: string }>;
}) {
  const ownerId = await requireUserId();
  // The leech clinic and other views deep-link a question here. It is *prefilled*
  // rather than sent: the learner sees what is about to be asked, and no metered
  // call happens because they followed a link.
  const { ask } = await searchParams;
  const config = resolveProvider();
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
        configured={config !== null}
        providerLabel={config ? `${config.label} · ${config.model}` : null}
        history={history.reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))}
        prefill={typeof ask === "string" ? ask.slice(0, 2000) : undefined}
      />
    </Page>
  );
}
