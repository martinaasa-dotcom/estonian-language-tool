import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { starredAmong } from "@/lib/progress/stars";
import { resolveProvider } from "@/lib/tutor/provider";
import { writingTasksFor } from "@/lib/estonian/writing";
import { ButtonLink } from "@/components/Button";
import { Empty, Page } from "@/components/ui";
import { WriteSession, type WritingPrompt } from "./WriteSession";
import { shuffle } from "@/lib/random/shuffle";

export const metadata = { title: "Writing" };

export const dynamic = "force-dynamic";

const ROUND = 6;

/**
 * Free production: the learner writes their own sentence rather than recalling
 * one side of a card.
 *
 * Words are drawn from their own deck, weighted toward the cases they have
 * actually been getting wrong — the point is to practice producing, not to meet
 * new vocabulary, so everything here is a word they have already met.
 */
export default async function WritePage() {
  const ownerId = await requireUserId();

  const cards = await prisma.card.findMany({
    where: { ownerId, suspended: false, lexemeId: { not: null } },
    select: { id: true, lexemeId: true, lapses: true, cardType: true },
    orderBy: { lapses: "desc" },
    take: 200,
  });

  /*
    The card this exercise is really practicing.
    ADR-016: a practice mode is not a side game with a score of its own. Writing
    a sentence with `tuba` in the inessive is evidence about that word, so it
    grades the same card the daily loop would, and the scheduler sees it. A
    case-form card is the closest match; production is the fallback.
  */
  const cardFor = new Map<string, string>();
  for (const c of cards) {
    if (!c.lexemeId) continue;
    const better = c.cardType === "CASE_FORM" || c.cardType === "PRODUCTION";
    if (!cardFor.has(c.lexemeId) || better) cardFor.set(c.lexemeId, c.id);
  }

  const lexemeIds = [...new Set(cards.map((c) => c.lexemeId).filter((id): id is string => !!id))];

  const lexemes = lexemeIds.length
    ? await prisma.lexeme.findMany({
        where: { id: { in: lexemeIds }, pos: { in: ["NOUN", "ADJECTIVE"] } },
        include: { forms: true },
      })
    : [];

  // The cases this learner has slipped on most, so the round targets weakness
  // rather than sampling evenly.
  const weak = await prisma.review.groupBy({
    by: ["targetCase"],
    where: { ownerId, targetCase: { not: null }, rating: 1 },
    _count: { _all: true },
    orderBy: { _count: { targetCase: "desc" } },
    take: 5,
  });
  const weakCases = new Set(weak.map((w) => w.targetCase).filter((c): c is string => !!c));

  const pool: Omit<WritingPrompt, "starred">[] = [];
  for (const lexeme of lexemes) {
    for (const task of writingTasksFor(lexeme)) {
      const cardId = cardFor.get(lexeme.id);
      if (!cardId) continue;
      pool.push({
        cardId,
        lexemeId: lexeme.id,
        lemma: task.lemma,
        translation: task.translation,
        caseKey: task.caseKey,
        caseEn: task.caseEn,
        caseEt: task.caseEt,
        caseQuestion: task.caseQuestion,
        provenance: task.provenance,
        weak: weakCases.has(task.caseKey),
      });
    }
  }

  // Weak cases first, then shuffled, so a round is varied but pointed. Two
  // shuffles rather than one sort keyed on `Math.random() - (weak ? 1 : 0)`:
  // same distribution, and it says what it does instead of leaving the reader
  // to notice that [-1, 0) and [0, 1) cannot interleave.
  const shuffled = [
    ...shuffle(pool.filter((p) => p.weak)),
    ...shuffle(pool.filter((p) => !p.weak)),
  ];

  // At most one prompt per word, so a round is six different words.
  const seen = new Set<string>();
  const round = shuffled.filter((p) => !seen.has(p.lemma) && seen.add(p.lemma)).slice(0, ROUND);

  if (round.length === 0) {
    return (
      <Page title="Writing" lead="Write your own Estonian, and have it marked.">
        <Empty
          title="No words to write about yet"
          body="This draws on nouns and adjectives already in your deck."
          action={<ButtonLink href="/dictionary" variant="primary">Open the dictionary</ButtonLink>}
        />
      </Page>
    );
  }

  /*
    Which of the round's words are already favorites, in one read rather than
    one per prompt. After the round is picked rather than before it, since the
    pool is every word in the deck that can carry a writing task and the round
    is six.
  */
  const starred = await starredAmong(ownerId, round.map((p) => p.lexemeId));

  return (
    <WriteSession
      prompts={round.map((p) => ({ ...p, starred: starred.has(p.lexemeId) }))}
      aiAvailable={resolveProvider() !== null}
    />
  );
}
