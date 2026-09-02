import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { glossLanguageFrom } from "@/lib/collections/glossLanguage";
import { readSetting, SETTING_KEYS } from "@/lib/settings/store";
import { shuffle } from "@/lib/random/shuffle";
import { leastPractisedSlot } from "@/lib/srs/mastery";
import { COMMON_BATCH, groupBySlug } from "@/lib/collections/commonGroups";
import { commonLexemeIds } from "@/lib/progress/common";
import { ButtonLink } from "@/components/Button";
import { Empty, Page } from "@/components/ui";
import { SuggestFix } from "@/components/SuggestFix";
import { ReviewSession } from "../../ReviewSession";
import { include, withChoices } from "../../cards";
import { DeepenButton } from "../DeepenButton";

/** Cards in one round. The same twenty Flash cards asks, for the same reason. */
const ROUND = 20;

export async function generateMetadata({ params }: { params: Promise<{ group: string }> }) {
  const group = groupBySlug((await params).group);
  return { title: group ? `Most common ${group.title.toLowerCase()}` : "Most common words" };
}

export const dynamic = "force-dynamic";

/**
 * FLASH CARDS OVER ONE OF THE FREQUENCY LISTS.
 *
 * `/review/flashcards` is the whole deck; this is the same round pointed at a
 * hundred words the corpus says a learner will meet most. The two share
 * everything that matters: `ReviewSession` renders it, `withChoices` fills it,
 * `leastPractisedSlot` decides which card of a word to ask, and every answer
 * grades through `gradeCard` like any other (ADR-016). A fourth copy of a card
 * runner is how undo, the offline outbox, the rating keys and the letter bar
 * stop being one implementation.
 *
 * WHY IT ASKS DIFFERENT FORMS RATHER THAN MEANINGS. `deepenCommonWords` builds
 * these words out into every card type they support, so a noun on this list
 * carries its cases and a verb its persons, and `leastPractisedSlot` then hands
 * back the slot the learner has been asked in least. So `saama` comes up as a
 * meaning once and after that as `olevik · ta`, and `aeg` as `millesse? kuhu?`
 * rather than as "time" for the fifth time.
 *
 * TWO DIFFERENCES FROM FLASH CARDS, AND BOTH ARE THE POINT.
 *
 * It does not filter to words that have been met. Flash cards is "the words you
 * have met, asked in a way you have not", so a card in state 0 is not its
 * business; this round is somebody deciding to work a named list, and the words
 * on it are new by construction the first time. A new card still opens with its
 * first meeting, which is `withChoices` and `askFor` doing what they already do.
 *
 * And it does not filter to words that are unmastered. A hundred words is a
 * list you come back to, and a mastered word simply sorts to the back of a
 * query ordered by lapses and by when it is due, which is FSRS deciding rather
 * than this file.
 */
export default async function CommonRoundPage({ params }: {
  params: Promise<{ group: string }>;
}) {
  const group = groupBySlug((await params).group);
  if (!group) notFound();

  const ownerId = await requireUserId();

  /*
    Two answers that do not need each other. Which words are on the list is a
    fact about the dictionary; which language the meaning is printed in is one
    settings row. On the deployment's own pooler each `await` is a round trip.
  */
  const [lexemeIds, glossSetting] = await Promise.all([
    commonLexemeIds(group.key),
    readSetting(ownerId, SETTING_KEYS.glossLanguage),
  ]);

  /*
    Ordered, because this is a `take`: without one, which of a word's cards the
    round asks would be the query plan's answer rather than this file's, and
    which card it picks is the whole of what the round is. The most lapsed lead,
    which is the same tie break Flash cards uses and is the right one for a
    round about what is not sticking.
  */
  const cards = lexemeIds.length === 0 ? [] : await prisma.card.findMany({
    where: { ownerId, suspended: false, lexemeId: { in: lexemeIds } },
    orderBy: [{ lapses: "desc" }, { due: "asc" }, { id: "asc" }],
    take: ROUND * 8,
    include,
  });

  const picked = leastPractisedSlot(cards, new Set(lexemeIds)).slice(0, ROUND);

  if (picked.length === 0) {
    return (
      <Page
        title={`Most common ${group.title.toLowerCase()}`}
        lead="Asked in a different form each time, until they stick."
      >
        <div className="flex flex-col gap-4">
          <Empty
            title={
              lexemeIds.length === 0
                ? "The dictionary has not been loaded yet"
                : "None of these are in your deck yet"
            }
            body={
              lexemeIds.length === 0
                ? "This round is drawn from it, so there is nothing to ask until it is seeded."
                : `Add the first ${COMMON_BATCH} and they arrive with every form the dictionary has.`
            }
            action={
              lexemeIds.length === 0
                ? <ButtonLink href="/dictionary" variant="primary">Open the dictionary</ButtonLink>
                : <DeepenButton group={group.key} label={`Add the first ${COMMON_BATCH}`} />
            }
          />
          {/*
            A dead end offers a way out, and the way out is a queue somebody
            works. A learner who reaches this with a seeded dictionary and an
            empty list has met something nobody expected.
          */}
          <SuggestFix
            category="BROKEN"
            trigger={`/review/common/${group.slug} had no cards to ask`}
          />
        </div>
      </Page>
    );
  }

  const gloss = glossLanguageFrom(glossSetting);
  const round = await withChoices(shuffle(picked), gloss);

  return (
    <ReviewSession
      cards={round}
      totalCards={round.length}
      mode="type"
      title={`Most common ${group.title.toLowerCase()}`}
    />
  );
}
