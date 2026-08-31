import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { resolveProvider } from "@/lib/tutor/provider";
import { LEECH_LAPSES, findConfusable, rankLeeches, type LeechCandidate } from "@/lib/analysis/leeches";
import { ButtonLink } from "@/components/Button";
import { Empty, Page } from "@/components/ui";
import { ClinicList, type ClinicItem } from "./ClinicList";

export const metadata = { title: "Leech clinic" };

export const dynamic = "force-dynamic";

/**
 * The leech clinic.
 *
 * The standard SRS answer to a card failed six times is to bury it, which
 * removes the symptom and teaches nothing. This reads the failure history
 * instead — the data that has been accumulating in the append-only review log
 * all along — works out *how* the card is failing, and hands that to Anu as a
 * specific question rather than "explain this word".
 */
export default async function ClinicPage() {
  const ownerId = await requireUserId();

  const cards = await prisma.card.findMany({
    where: { ownerId, lapses: { gte: LEECH_LAPSES } },
    orderBy: { lapses: "desc" },
    take: 30,
    include: { lexeme: { select: { lemma: true, translation: true } } },
  });

  if (cards.length === 0) {
    return (
      <Page title="Leech clinic" lead="The cards you keep failing, taken apart.">
        <Empty
          title="No leeches, which is the good outcome"
          body={`A card lands here after ${LEECH_LAPSES} lapses. Nothing in your deck has failed that often, so there is nothing to fix.`}
          action={<ButtonLink href="/review" variant="primary">Carry on reviewing</ButtonLink>}
        />
      </Page>
    );
  }

  // The history each card is being judged on. Reviews outlive their cards, but
  // here the card is very much alive, so this is a plain lookup by cardId.
  const reviews = await prisma.review.findMany({
    where: { ownerId, cardId: { in: cards.map((c) => c.id) } },
    select: { cardId: true, rating: true, reviewedAt: true },
    orderBy: { reviewedAt: "asc" },
    take: 2000,
  });

  const byCard = new Map<string, { rating: number; at: Date }[]>();
  for (const r of reviews) {
    const list = byCard.get(r.cardId) ?? [];
    list.push({ rating: r.rating, at: r.reviewedAt });
    byCard.set(r.cardId, list);
  }

  const candidates: LeechCandidate[] = cards.map((c) => ({
    cardId: c.id,
    front: c.front,
    back: c.back,
    cardType: c.cardType,
    targetCase: c.targetCase,
    lemma: c.lexeme?.lemma ?? null,
    translation: c.lexeme?.translation ?? null,
    lapses: c.lapses,
    reps: c.reps,
    history: byCard.get(c.id) ?? [],
  }));

  const leeches = rankLeeches(candidates);

  // The rest of the deck, for the interference check. Cheap and orthographic —
  // it only ever claims "these look alike".
  // Ordered, so a deck past the cap compares the same thousand words every
  // time: "these two look alike" is a warning a learner should be able to see
  // twice rather than one that comes and goes with the plan.
  const deck = await prisma.card.findMany({
    where: { ownerId, lexemeId: { not: null } },
    select: { lexeme: { select: { lemma: true } } },
    orderBy: { createdAt: "asc" },
    take: 1000,
  });
  const lemmas = [...new Set(deck.map((d) => d.lexeme?.lemma).filter((l): l is string => !!l))];

  const items: ClinicItem[] = leeches.map((leech) => ({
    ...leech,
    history: leech.history.map((h) => ({ rating: h.rating, at: h.at.toISOString() })),
    confusable: findConfusable(leech.lemma ?? leech.front, lemmas),
  }));

  return <ClinicList items={items} aiAvailable={resolveProvider() !== null} />;
}
