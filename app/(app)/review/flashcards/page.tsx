import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { shuffle } from "@/lib/random/shuffle";
import { masteryFor } from "@/lib/progress/mastery";
import { MASTERY_SLOTS } from "@/lib/srs/mastery";
import { ButtonLink } from "@/components/Button";
import { Empty, Page } from "@/components/ui";
import { ReviewSession } from "../ReviewSession";
import { include, withChoices, type CardRow } from "../cards";

export const metadata = { title: "Flash cards" };

export const dynamic = "force-dynamic";

/** Cards in one round. Long enough to be worth opening, short enough to finish. */
const ROUND = 20;

/**
 * FLASH CARDS: THE WORDS YOU HAVE MET, ASKED IN A WAY YOU HAVE NOT.
 *
 * `/practice` used to open with a tile linking back to `/review`, which is the
 * page most people arrive from. The learner asked for that slot to hold
 * something that does work review does not: the words already met, "now used in
 * other ways too", across "a huge variety of case endings and grammar", with a
 * word leaving only once the app can be confident it is known.
 *
 * The rule for known is `lib/srs/mastery.ts` and it is two thresholds: five
 * correct answers across three distinct slots. This round is the other side of
 * the same rule. It draws words that are **not** mastered yet and, for each
 * one, the card in the slot that learner has answered *least* often. So the
 * round is what closes the variety half of mastery rather than piling more
 * answers into a slot already full, and a word answered right five times as a
 * meaning gets asked for its partitive instead of a sixth meaning.
 *
 * WHY THIS IS A SESSION AND NOT A GAME. Every mode grades through `gradeCard`
 * (ADR-016), so the scheduler sees what was actually practised and this is not
 * a side score. Rendering `ReviewSession` rather than a fifth copy of a card
 * runner is the same argument: undo, the offline outbox, the rating keys, the
 * letter bar and the audio prefs are one implementation, and a mode that
 * reimplements them is a mode that loses one of them quietly.
 *
 * `mode="type"` because this is the harder pass over words already met.
 * Producing a form is a different and much stronger memory than picking it out
 * of four, and a word that is nearly mastered is exactly where the weaker shape
 * stops telling you anything. Cards that cannot be typed still fall back to
 * four options, which `withChoices` attaches.
 */
export default async function FlashcardsPage() {
  const ownerId = await requireUserId();

  const words = await masteryFor(ownerId);
  const unfinished = words.filter((w) => w.verdict.mastery !== "mastered");

  if (unfinished.length === 0) {
    return (
      <Page title="Flash cards" lead="The words you have met, asked in a way you have not.">
        <Empty
          title={words.length === 0 ? "No words met yet" : "Every word you have met is mastered"}
          body={
            words.length === 0
              ? "This round works on words review has already introduced."
              : undefined
          }
          action={<ButtonLink href="/review" variant="primary">Open review</ButtonLink>}
        />
      </Page>
    );
  }

  /*
    ONE CARD PER WORD, IN THE SLOT THAT LEARNER HAS PRACTISED LEAST.

    Read for the words that are not mastered rather than for the whole deck, and
    ordered, because this is a `take`: without one, which of a word's cards the
    round asks would be the query plan's answer rather than this one, and the
    whole point of the round is which card it picks.
  */
  const cards = await prisma.card.findMany({
    where: {
      ownerId,
      suspended: false,
      state: { not: 0 },
      lexemeId: { in: unfinished.map((w) => w.lexemeId) },
    },
    orderBy: [{ lapses: "desc" }, { due: "asc" }, { id: "asc" }],
    take: ROUND * 8,
    include,
  });

  const picked = leastPractised(cards, unfinished).slice(0, ROUND);
  const round = await withChoices(shuffle(picked));

  return <ReviewSession cards={round} totalCards={round.length} mode="type" title="Flash cards" />;
}

/**
 * One card per word, choosing the slot with the fewest correct answers behind
 * it.
 *
 * `Verdict.slots` counts how many distinct slots a word has been answered
 * correctly in, so a word short of `MASTERY_SLOTS` has room in some slot it has
 * not filled. This cannot see *which* slot from the verdict alone, so it works
 * the other way round: a card whose `targetCase` the learner has never been
 * right on outranks one they have, and among equals the card with the most
 * lapses leads, which is the query's own order and is already the right tie
 * break for a round about what is not sticking.
 *
 * Untyped `targetCase` (a recognition or production card) is one shared slot,
 * exactly as `masteryOf` counts it, so the two cannot disagree about what
 * variety means.
 */
function leastPractised(
  cards: readonly CardRow[],
  words: readonly { lexemeId: string; verdict: { slots: number } }[],
): CardRow[] {
  const wanted = new Map(words.map((w) => [w.lexemeId, w.verdict.slots]));
  const chosen = new Map<string, CardRow>();
  const slotsSeen = new Map<string, Set<string>>();

  for (const card of cards) {
    const lexemeId = card.lexemeId;
    if (!lexemeId || !wanted.has(lexemeId)) continue;

    const slot = card.targetCase ?? "";
    const seen = slotsSeen.get(lexemeId) ?? new Set<string>();
    const held = chosen.get(lexemeId);

    // The first card of a word wins by default; a later one takes the place
    // only if it opens a slot this word has not been asked in yet. The query's
    // order does the rest, so the card kept is the most lapsed of the equals.
    if (!held || !seen.has(slot)) {
      if (!held) chosen.set(lexemeId, card);
      else if (seen.size < MASTERY_SLOTS) chosen.set(lexemeId, card);
    }
    seen.add(slot);
    slotsSeen.set(lexemeId, seen);
  }
  return [...chosen.values()];
}
