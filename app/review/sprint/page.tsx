import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { ButtonLink } from "@/components/Button";
import { Empty, Page } from "@/components/ui";
import { SprintSession, type SprintCard } from "./SprintSession";

export const dynamic = "force-dynamic";

const POOL_SIZE = 40;

/**
 * A 60-second speed round — the Duolingo/Speakly "timed practice" idea, adapted to
 * cards already in the deck rather than inventing new content. Weak (high-lapse)
 * and overdue cards are favoured, since fast repetition on exactly those is where
 * a timer earns its keep.
 */
export default async function SprintPage() {
  const ownerId = await requireUserId();
  const now = new Date();

  const due = await prisma.card.findMany({
    where: { ownerId, suspended: false, due: { lte: now }, state: { not: 0 } },
    orderBy: { due: "asc" },
    take: POOL_SIZE,
    include: { lexeme: { select: { lemma: true, translation: true } } },
  });

  let cards = due;
  if (cards.length < POOL_SIZE) {
    const seenIds = new Set(cards.map((c) => c.id));
    const weak = await prisma.card.findMany({
      where: { ownerId, suspended: false, lapses: { gt: 0 }, id: { notIn: [...seenIds] } },
      orderBy: { lapses: "desc" },
      take: POOL_SIZE - cards.length,
      include: { lexeme: { select: { lemma: true, translation: true } } },
    });
    cards = [...cards, ...weak];
  }

  if (cards.length === 0) {
    return (
      <Page title="Case Sprint" lead="A 60-second speed round through your deck.">
        <Empty
          title="Nothing to sprint through yet"
          body="Case Sprint draws from cards that are due or that you've slipped on before. Review a little first, or add some words."
          action={<ButtonLink href="/dictionary" variant="primary">Open the dictionary</ButtonLink>}
        />
      </Page>
    );
  }

  // Shuffled so the same session doesn't always open on the same word.
  const shuffled = [...cards].sort(() => Math.random() - 0.5);
  const sprintCards: SprintCard[] = shuffled.map((c) => ({
    id: c.id,
    front: c.front,
    back: c.back,
    lemma: c.lexeme?.lemma ?? null,
    cardType: c.cardType,
  }));

  const bestSetting = await prisma.setting.findUnique({ where: { ownerId_key: { ownerId, key: "sprintBest" } } });
  const best = bestSetting ? Number(bestSetting.value) || 0 : 0;

  return <SprintSession cards={sprintCards} best={best} />;
}
