import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { courseLevelFor } from "@/lib/progress/level";
import { isAround } from "@/lib/collections/levels";
import { exceptionIndex } from "@/lib/dict/facts";
import { starredAmong } from "@/lib/progress/stars";
import { EXCEPTION_KINDS } from "@/lib/estonian/exceptions";
import { exceptionRound, pickWords, type ExceptionWord } from "@/lib/games/exceptions";
import { formIndex } from "@/lib/games/flash";
import { naturalSentencesFor } from "@/lib/srs/cards";
import { shuffle } from "@/lib/random/shuffle";
import { ButtonLink } from "@/components/Button";
import { Empty, Page } from "@/components/ui";
import { ExceptionsSession } from "./ExceptionsSession";

export const metadata = { title: "Exceptions" };

export const dynamic = "force-dynamic";

/**
 * THE DRILL FOR THE WORDS THE ENDING RULE DOES NOT REACH.
 *
 * `/grammar/exceptions` is the list and this is what to do with it, which is
 * the split `/dictionary/common` and `/review/common` already make: reading a
 * list of unpredictable forms teaches nobody one.
 *
 * WHICH WORDS. Banded to the learner's level, deck first. Government's drill
 * makes the same argument about the same thing one route over: a word met for
 * the first time in a drill that explains the answer is a reasonable way to
 * learn it, and a word already in the deck is the one where answering is
 * evidence the scheduler should see. `?kind=` narrows it, which is what the
 * button on each kind's own page sends.
 *
 * WHAT IT GRADES. The learner's own card for the word, where they hold one,
 * carrying the slot that was actually asked, so the illative somebody cannot
 * produce here lands in the same weakest-case chart as the illative they cannot
 * produce on a card (ADR-016). A word with no card writes nothing, which is the
 * answer `/review/emoji` gives about the same situation: there is no schedule
 * to move.
 *
 * The sentences are read through `naturalSentencesFor`, the deck's own reader,
 * because what counts as a sentence is one answer for the whole app and a
 * second copy of it is where two screens start disagreeing.
 */
export default async function ExceptionsRoundPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const ownerId = await requireUserId();
  const { kind } = await searchParams;
  const wanted = kind && (EXCEPTION_KINDS as readonly string[]).includes(kind.toUpperCase())
    ? kind.toUpperCase()
    : null;

  const level = await courseLevelFor(ownerId);
  const index = await exceptionIndex();
  const near = index.filter(
    (row) => isAround(row.cefr, level)
      && (!wanted || row.exceptions.some((e) => e.kind === wanted)),
  );

  if (near.length === 0) {
    return (
      <Page title="Exceptions" lead="The forms the endings do not reach.">
        <Empty
          title="Nothing to drill here yet"
          body="The dictionary has no graded words near your level with this kind of exception."
          action={<ButtonLink href="/grammar/exceptions" variant="primary">See the exceptions</ButtonLink>}
        />
      </Page>
    );
  }

  const starred = await starredAmong(ownerId, near.map((row) => row.id));

  const cards = await prisma.card.findMany({
    where: { ownerId, lexemeId: { in: near.map((row) => row.id) } },
    select: { id: true, lexemeId: true, cardType: true, targetCase: true },
    // Ordered because it is what decides which words grade a real card, and an
    // unordered read hands that to the query plan: the same word would score on
    // one visit and not the next.
    orderBy: { id: "asc" },
  });

  const mine = new Set(cards.map((c) => c.lexemeId));
  const ordered = [
    ...shuffle(near.filter((row) => mine.has(row.id))),
    ...shuffle(near.filter((row) => !mine.has(row.id))),
  ];

  /*
    One exception per word, and the asked kind first where the round was opened
    from one of the kind pages. `pickWords` is what stops a word with four
    exceptions being the whole round, where the second rung of the second one
    is the first one's answer sitting on the screen.
  */
  const chosen = pickWords(ordered.flatMap((row) => {
    // Every exception the word has, so `pickWords` can spread the round across
    // kinds rather than taking whichever one happens to be first. Narrowed to
    // one where the round was opened from a kind's own page.
    const wantedOnes = wanted ? row.exceptions.filter((e) => e.kind === wanted) : row.exceptions;
    return wantedOnes.map((exception) => ({ row, exception }));
  }).map(({ row, exception }) => ({
    lexemeId: row.id, lemma: row.lemma, translation: row.translation, pos: row.pos,
    exception,
    cardId: cardFor(cards, row.id, exception.slot),
    starred: starred.has(row.id),
    index: {} as Record<string, readonly string[]>,
    forms: [] as { formType: string; value: string; morphCode?: string | null }[],
    sentences: [] as string[],
  })));

  /*
    The forms and the sentences of the six words the round settled on, rather
    than of the three thousand it chose them from. `exceptionIndex` deliberately
    holds neither: the form index needs the whole paradigm and `examples` is the
    longest column in the schema, and a fact cached for everybody may not carry
    either at that size.
  */
  const full = await prisma.lexeme.findMany({
    where: { id: { in: chosen.map((w) => w.lexemeId) } },
    select: {
      id: true, lemma: true, pos: true, examples: true,
      forms: { select: { formType: true, value: true, morphCode: true }, orderBy: { id: "asc" } },
    },
    orderBy: { id: "asc" },
  });

  const words: ExceptionWord[] = chosen.map((word) => {
    const lex = full.find((l) => l.id === word.lexemeId);
    if (!lex) return word;
    return {
      ...word,
      index: formIndex({ lemma: lex.lemma, pos: lex.pos, forms: lex.forms }),
      forms: lex.forms,
      sentences: naturalSentencesFor({
        lemma: lex.lemma, pos: lex.pos, examples: lex.examples, forms: lex.forms,
      }).map((e) => e.et),
    };
  });

  return <ExceptionsSession tasks={exceptionRound(words)} />;
}

/**
 * The card an answer about this word and this slot should move.
 *
 * The case card for the case being asked where the learner holds one, since
 * that is the card asking the same question, and any card of the word
 * otherwise. `gradeCard` writes the asked slot beside the grade either way, so
 * the review log records what was practiced whichever card carried it.
 */
function cardFor(
  cards: readonly { id: string; lexemeId: string | null; cardType: string; targetCase: string | null }[],
  lexemeId: string,
  slot: string,
): string | null {
  const mine = cards.filter((c) => c.lexemeId === lexemeId);
  const exact = mine.find((c) => c.targetCase === slot);
  if (exact) return exact.id;
  const production = mine.find((c) => c.cardType === "PRODUCTION");
  return (production ?? mine[0])?.id ?? null;
}
