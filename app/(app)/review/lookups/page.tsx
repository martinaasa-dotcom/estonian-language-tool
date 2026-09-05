import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { glossLanguageFrom } from "@/lib/collections/glossLanguage";
import { readSetting, SETTING_KEYS } from "@/lib/settings/store";
import { shuffle } from "@/lib/random/shuffle";
import { leastPractisedSlot } from "@/lib/srs/mastery";
import { YOUR_OWN_SOURCES } from "@/lib/srs/sources";
import { ButtonLink } from "@/components/Button";
import { Empty, Page } from "@/components/ui";
import { ReviewSession } from "../ReviewSession";
import { include, withChoices } from "../cards";

/** Cards in one round. The same twenty Flash cards asks, for the same reason. */
const ROUND = 20;

/**
 * How many rows are read before twenty are chosen.
 *
 * A word carries up to thirteen cards, so a round of twenty words is a wide
 * read whichever way it is cut, and `leastPractisedSlot` needs more than one
 * card per word to have anything to choose between. Ordered and capped, because
 * a `take` with no order is the query plan deciding which of somebody's words
 * this round is about.
 */
const POOL = ROUND * 8;

export const metadata = { title: "Words you looked up" };

export const dynamic = "force-dynamic";

/**
 * THE WORDS THE LEARNER WENT AND GOT, ASKED ON THEIR OWN.
 *
 * Reported by somebody using the app, and the report was right about the
 * mechanism as well as the symptom. A word looked up out of curiosity goes into
 * one deck with everything else, and the review queue introduces unseen cards
 * oldest first: sixty read, ordered by band, ten shown. So a word looked up on
 * the bus this afternoon sits behind the whole course backlog, and on a deck
 * built by adding a level in first run that backlog is a year long. The word
 * somebody was interested enough to stop and look up is the last one the app
 * gets round to teaching.
 *
 * Anki has the opposite failure and it is worth saying which of the two this
 * is, because the fixes point in opposite directions. There, everything a
 * learner adds lands at the front and a queue fills with rare words they met
 * once; here nothing a learner adds ever reaches the front at all. Two answers
 * came out of that. `commonFirst` puts the words the corpus counts most ahead
 * of the ones it has never heard of inside each band, so the trickle is not
 * assembly order any more. And this is the other half: a round that asks only
 * about the words that were the learner's own idea, so they are reachable in
 * one press rather than by waiting their turn.
 *
 * NOT A SECOND DECK, AND NOT A SECOND SCHEDULER. `lib/srs/` holds one deck and
 * one queue, and a card in this round is the same row it was, graded through
 * `gradeCard` like every other mode (ADR-016), with its FSRS state carried
 * along. What separates them is `Card.source` and a `where` clause, which is
 * exactly what `/review/common` does with the frequency lists. A second table
 * of cards would be a second answer to when a word is known.
 *
 * `leastPractisedSlot` picks which card of a word to ask, so a word that has
 * been asked for its meaning four times comes back as `millesse? kuhu?`, and
 * `withChoices` opens a word nobody has met yet with its first meeting, both of
 * which are the ordinary behaviour of every round in this directory.
 */
export default async function LookupsRoundPage() {
  const ownerId = await requireUserId();

  /*
    Two answers that do not need each other's: which cards are the learner's
    own is a read of their deck, and which language a meaning is printed in is
    one settings row. On the deployment's own pooler each `await` is a trip.
  */
  const [cards, glossSetting] = await Promise.all([
    prisma.card.findMany({
      where: { ownerId, suspended: false, source: { in: [...YOUR_OWN_SOURCES] } },
      /*
        The most lapsed lead, which is the tie break Flash cards and the
        commonest-words round both take and is the right one for a round about
        what is not sticking. Ending on the id, because `(lapses, due)` is not
        a total order: every card of one word is written in one `createMany`
        with the same `due` and starts at nought lapses, so without it which of
        somebody's words this round asks about could differ between two
        identical requests.
      */
      orderBy: [{ lapses: "desc" }, { due: "asc" }, { id: "asc" }],
      take: POOL,
      include,
    }),
    readSetting(ownerId, SETTING_KEYS.glossLanguage),
  ]);

  /*
    The pool is its own wanted set. `/review/common` hands in the four hundred
    lemmas of a frequency list, because there the list is the subject and the
    deck is what is being filtered; here the `where` clause has already said
    which words the round is about, so asking the same question twice would be
    a second answer waiting to disagree with the first.
  */
  const wanted = new Set(cards.map((c) => c.lexemeId).filter((id): id is string => id !== null));
  const picked = leastPractisedSlot(cards, wanted).slice(0, ROUND);

  if (picked.length === 0) {
    return (
      <Page
        title="Words you looked up"
        lead="The ones that were your idea rather than the course's."
      >
        <Empty
          title="Nothing here yet"
          body="Words you add from an entry, a photograph or Anu are asked here."
          action={<ButtonLink href="/dictionary" variant="primary">Open the dictionary</ButtonLink>}
        />
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
      title="Words you looked up"
    />
  );
}
