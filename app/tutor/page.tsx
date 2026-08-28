import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { resolveProvider } from "@/lib/tutor/provider";
import { Page } from "@/components/ui";
import { TutorChat } from "./TutorChat";

export const dynamic = "force-dynamic";

export default async function TutorPage() {
  const ownerId = await requireUserId();
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
      />
    </Page>
  );
}
