import { requireUserId } from "@/lib/auth/session";
import { ButtonLink } from "@/components/Button";
import { Empty, Page, Stack } from "@/components/ui";
import { Favorites } from "@/components/Favorites";
import { MasteryBoard } from "@/components/MasteryBoard";
import { masteryCounts, masteryFor } from "@/lib/progress/mastery";
import { favoriteCount, favorites } from "@/lib/progress/stars";

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
 *
 * THE FAVORITES LIVE HERE TOO, AND THEY LEAD.
 *
 * Starring a word has existed since the dictionary did and could be done on
 * one screen and read back on that same screen, which is the screen a learner
 * is least often on: the word worth keeping turns up on a review card. The
 * star is on every card that teaches a word now, and this is where the list
 * of them is, because "which words are mine" and "how are my words going" are
 * the same question asked twice and two pages for them is one page nobody
 * finds. It is the only list here somebody wrote themselves, so it is first.
 */
export default async function MasteryPage() {
  const ownerId = await requireUserId();
  /*
    Three reads that do not need each other, so they go together: on the
    deployment's own pooler each `await` is a round trip. The count is separate
    from the list because the list is capped and a cap cannot say how many
    there are.
  */
  const [words, kept, keptTotal] = await Promise.all([
    masteryFor(ownerId),
    favorites(ownerId),
    favoriteCount(ownerId),
  ]);

  return (
    <Page
      title="Where your words stand"
      lead="Your favorites, and how well every other word is sticking."
      actions={<ButtonLink href="/review/flashcards" variant="primary">Flash cards</ButtonLink>}
    >
      {words.length === 0 && kept.length === 0 ? (
        <Empty
          title="Nothing answered yet"
          body="A word turns up here once you have answered it, or the moment you star one."
          action={<ButtonLink href="/review" variant="primary">Open review</ButtonLink>}
        />
      ) : (
        <Stack>
          <Favorites words={kept} total={keptTotal} />
          {words.length > 0 && <MasteryBoard words={words} counts={masteryCounts(words)} />}
        </Stack>
      )}
    </Page>
  );
}
