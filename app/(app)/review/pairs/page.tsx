import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
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
    Easiest first, and ordered at all.

    This cap binds: the dictionary is around six thousand words and the pairs
    are discovered by collapsing doubled letters across all of them, so which
    two thousand were looked at decided which contrasts existed. Unordered,
    that was the plan's choice, and a drill could offer a pair one day and not
    the next. By cefr and lemma the pool is the words a learner is likeliest to
    have met, which is also the better third to draw a listening drill from.
  */
  const lexemes = await prisma.lexeme.findMany({
    select: {
      id: true, lemma: true, translation: true,
      forms: { select: { value: true, formType: true, morphName: true } },
    },
    orderBy: [{ cefr: "asc" }, { lemma: "asc" }],
    take: 2000,
  });

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
      <Page title="Minimal pairs" lead="The length distinctions spelling half-records.">
        <Empty
          title="No length contrasts in the dictionary yet"
          body="A pair is two forms that differ only in how long a sound is, as in maja against majja."
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
