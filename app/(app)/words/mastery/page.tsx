import { requireUserId } from "@/lib/auth/session";
import { ButtonLink } from "@/components/Button";
import { Empty, Page, Stack } from "@/components/ui";
import { MasteryBoard } from "@/components/MasteryBoard";
import { masteryCounts, masteryFor } from "@/lib/progress/mastery";

export const metadata = { title: "Where your words stand" };

export const dynamic = "force-dynamic";

/**
 * The mastered list, and the two lists either side of it.
 *
 * Asked for directly, twice: which words are known, which are nearly there,
 * and which keep going wrong. It was answered the first time by a panel on
 * `/words`, three cards down a page about the deck, which is a list somebody
 * has to find. This is the page it belongs on, and `lib/ux/nav.ts` carries a
 * row for it so the palette goes here too.
 *
 * One query behind this, the round on `/review/flashcards` and the tile on
 * `/practice`, for the reason `lib/progress/cases.ts` gives at length: a
 * shared calculation over an unshared input is not a shared answer, and three
 * screens telling one learner three different things about one word is how a
 * number stops being believed.
 */
export default async function MasteryPage() {
  const ownerId = await requireUserId();
  const words = await masteryFor(ownerId);

  return (
    <Page
      title="Where your words stand"
      lead="Mastered, almost there, and what keeps going wrong."
      actions={<ButtonLink href="/review/flashcards" variant="primary">Flash cards</ButtonLink>}
    >
      {words.length === 0 ? (
        <Empty
          title="Nothing answered yet"
          body="A word turns up here once you have answered it at least once."
          action={<ButtonLink href="/review" variant="primary">Open review</ButtonLink>}
        />
      ) : (
        <Stack>
          <MasteryBoard words={words} counts={masteryCounts(words)} />
        </Stack>
      )}
    </Page>
  );
}
