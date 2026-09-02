import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { SprintSession, type SprintCard } from "./SprintSession";
import { shuffle } from "@/lib/random/shuffle";
import { numberSetting, readSetting, SETTING_KEYS } from "@/lib/settings/store";

export const metadata = { title: "Case Sprint" };

export const dynamic = "force-dynamic";

const POOL_SIZE = 40;

/**
 * A 60-second speed round — the Duolingo/Speakly "timed practice" idea, adapted to
 * cards already in the deck rather than inventing new content. Weak (high-lapse)
 * and overdue cards are favoured, since fast repetition on exactly those is where
 * a timer earns its keep.
 *
 * Always renders SprintSession, even with an empty pool: SprintSession decides
 * for itself, once on mount, whether to show its own empty state. Server
 * Actions like gradeCard() refresh this route's Server Component on every
 * call, so a conditional Empty-vs-Session choice made *here* would keep
 * re-evaluating as the pool is graded away — and swap to Empty right as the
 * final card is graded, right before the session summary would show.
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

  // Shuffled so the same session doesn't always open on the same word.
  const shuffled = shuffle(cards);
  const sprintCards: SprintCard[] = shuffled.map((c) => ({
    id: c.id,
    front: c.front,
    back: c.back,
    lemma: c.lexeme?.lemma ?? null,
    cardType: c.cardType,
  }));

  // Through the store, not straight at the table: the key lives there, and so
  // does the one settings read this request has already made.
  const best = numberSetting(await readSetting(ownerId, SETTING_KEYS.sprintBest), 0);

  return <SprintSession cards={sprintCards} best={best} />;
}
