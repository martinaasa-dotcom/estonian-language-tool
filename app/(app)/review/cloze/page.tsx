import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { ButtonLink } from "@/components/Button";
import { Empty, Page } from "@/components/ui";
import { ClozeSession } from "./ClozeSession";

export const metadata = { title: "From your reading" };

export const dynamic = "force-dynamic";

/**
 * Gap-fill from the learner's own reading.
 *
 * The importer has always accepted pasted text and always thrown the sentences
 * away, keeping only word pairs. This keeps the sentences, which are the more
 * valuable half: a real inflected form in a real context, written by someone who
 * speaks the language.
 */
export default async function ClozePage() {
  const ownerId = await requireUserId();
  const deckSize = await prisma.card.count({ where: { ownerId, lexemeId: { not: null } } });

  if (deckSize === 0) {
    return (
      <Page title="From your reading" lead="Paste real Estonian and drill the words you already know.">
        <Empty
          title="Your deck is empty"
          body="This blanks out words you are already learning, so it needs a deck first."
          action={<ButtonLink href="/dictionary" variant="primary">Open the dictionary</ButtonLink>}
        />
      </Page>
    );
  }

  return <ClozeSession />;
}
