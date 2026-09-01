import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { courseLevelFor } from "@/lib/progress/level";
import { bandsAround } from "@/lib/collections/levels";
import { contrastLetter, findQuantityPairs, longerOf, type FormRef } from "@/lib/estonian/quantity";
import { formLabel } from "@/lib/estonian/morph";
import { ButtonLink } from "@/components/Button";
import { Empty, Page } from "@/components/ui";
import { PairsSession, type PairQuestion } from "./PairsSession";
import { shuffle } from "@/lib/random/shuffle";

export const metadata = { title: "Minimal pairs" };

export const dynamic = "force-dynamic";

const ROUND = 10;

/**
 * The fewest words a level's own band may draw before the whole graded set is
 * asked instead.
 *
 * A quantity contrast is found by collapsing a doubled letter and looking for
 * the other word, so the pairs a pool yields fall away much faster than the
 * pool does. Four hundred words is where this deployment's dictionary still
 * finds a round's worth; below it the band is a fact about how much of the
 * dictionary carries a CEFR tag rather than about the learner.
 */
const MIN_POOL = 400;

/**
 * Minimal-pair listening.
 *
 * The pairs are found in the dictionary rather than written by hand — see
 * `lib/estonian/quantity` for why that matters — so this works on whatever
 * vocabulary the installation actually has, and grows when an Ekilex key
 * arrives.
 */
export default async function PairsPage() {
  const ownerId = await requireUserId();

  /*
    Around the learner's level, and ordered at all.

    This cap binds: the dictionary is around six thousand words and the pairs
    are discovered by collapsing doubled letters across all of them, so which
    two thousand were looked at decided which contrasts existed. Unordered,
    that was the plan's choice, and a drill could offer a pair one day and not
    the next.

    `ORDER BY cefr ASC` fixed the order and pinned the pool to the bottom of
    the dictionary at the same time, which nothing said out loud: two thousand
    rows starting at A1 is A1, A2 and most of B1, so a C1 speaker opening this
    got beginner contrasts on their first visit and on their four hundredth.
    The band is the learner's own now, one either side of where they are
    (`lib/collections/levels.ts`), and the cefr key stays in the order because
    within a window the easier contrast is still the better one to open on.

    It widens rather than empties. A window too thin to find pairs in is a
    fact about the deployment's dictionary rather than about the learner, so
    the whole graded set answers instead, which is what this drill did for
    everybody before.
  */
  const level = await courseLevelFor(ownerId);
  const select = {
    id: true, lemma: true, translation: true,
    forms: { select: { value: true, formType: true, morphName: true } },
  } as const;
  const order = [{ cefr: "asc" as const }, { lemma: "asc" as const }];

  const banded = await prisma.lexeme.findMany({
    where: { cefr: { in: [...bandsAround(level)] } },
    select, orderBy: order, take: 2000,
  });
  const lexemes = banded.length >= MIN_POOL
    ? banded
    : await prisma.lexeme.findMany({ select, orderBy: order, take: 2000 });

  const refs: FormRef[] = [];
  for (const lexeme of lexemes) {
    for (const form of lexeme.forms) {
      refs.push({
        value: form.value,
        lemma: lexeme.lemma,
        translation: lexeme.translation,
        formLabel: formLabel(form),
        lexemeId: lexeme.id,
      });
    }
  }

  // ADR-016: hearing a length contrast correctly is evidence about the word, so
  // when it is already in the deck this grades the same card the daily loop
  // would. A contrast between two words the learner has never added scores
  // nothing, which is honest rather than inventing a card behind them.
  const deck = await prisma.card.findMany({
    where: { ownerId, suspended: false, lexemeId: { not: null } },
    select: { id: true, lexemeId: true, cardType: true },
    // Ordered because it is cut: which words count as in the deck decides which
    // answers grade a card, and a slice with no order leaves that to the plan.
    orderBy: { id: "asc" },
    take: 2000,
  });
  const cardFor = new Map<string, string>();
  for (const c of deck) {
    if (!c.lexemeId) continue;
    const better = c.cardType === "RECOGNITION";
    if (!cardFor.has(c.lexemeId) || better) cardFor.set(c.lexemeId, c.id);
  }

  const pairs = findQuantityPairs(refs, 200);

  if (pairs.length === 0) {
    return (
      <Page title="Minimal pairs" lead="Length differences that spelling can't always show.">
        <Empty
          title="No length pairs in the dictionary yet"
          body="A pair is two forms where only the length of one sound changes, such as maja and majja."
          action={<ButtonLink href="/dictionary" variant="primary">Open the dictionary</ButtonLink>}
        />
      </Page>
    );
  }

  const round: PairQuestion[] = shuffle(pairs)
    .slice(0, ROUND)
    .map((p) => {
      // Which one the learner will hear, chosen here so the server decides and
      // the answer is not sitting in the client before the question is asked.
      const askA = Math.random() < 0.5;
      const heardRef = askA ? p.a : p.b;
      return {
        heard: heardRef.value,
        cardId: cardFor.get(heardRef.lexemeId) ?? null,
        options: [
          { value: p.a.value, lemma: p.a.lemma, translation: p.a.translation, formLabel: p.a.formLabel },
          { value: p.b.value, lemma: p.b.lemma, translation: p.b.translation, formLabel: p.b.formLabel },
        ],
        sameWord: p.sameWord,
        longer: longerOf(p).value,
        letter: contrastLetter(p),
      };
    });

  return <PairsSession questions={round} />;
}
