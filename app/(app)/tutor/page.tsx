import { requireUserId } from "@/lib/auth/session";
import { resolveProviders } from "@/lib/tutor/provider";
import { supabaseConfigured } from "@/lib/auth/mode";
import { loadRecentMessages } from "@/lib/tutor/history";
import { Page } from "@/components/ui";
import { TutorChat } from "./TutorChat";

export const metadata = { title: "Anu" };

export const dynamic = "force-dynamic";

/** Anu, optionally opened with a question already written. */
export default async function TutorPage({ searchParams }: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const ownerId = await requireUserId();
  const chain = resolveProviders();
  const history = await loadRecentMessages(ownerId);

  return (
    <Page
      title="Anu"
      lead="Your Estonian teacher. Ask why a case is what it is, check a sentence, or get a stem explained."
    >
      <TutorChat
        configured={chain.length > 0}
        /*
          Whether the person reading this is the person who could fix it, the
          same question the home card asks and for the same reason (ADR-013):
          with no Supabase keys the app is a single local learner, who runs it,
          and hosted they are a visitor who cannot set an environment variable
          and did not ask to be told to. The home card learned this one commit
          ago; the tutor screen delegates its empty state to the chat, so it
          did not.
        */
        readerCanConfigure={!supabaseConfigured()}
        // What is configured, which is not yet what answered. The chat replaces
        // this with the model the reply actually came from as soon as one has.
        plannedLabel={chain[0] ? `${chain[0].label} · ${chain[0].model}` : null}
        history={history}
        // Prefilled, not sent. A review card can hand Anu the question a
        // learner just failed to answer; pressing send is still their call,
        // and the wording is theirs to edit first.
        initialQuestion={typeof q === "string" ? q.slice(0, 300) : undefined}
      />
    </Page>
  );
}
