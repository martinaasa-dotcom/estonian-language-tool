import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { starredAmong } from "@/lib/progress/stars";
import { SprintSession, type SprintCard } from "./SprintSession";
import { shuffle } from "@/lib/random/shuffle";
import { numberSetting, readSettings, SETTING_KEYS } from "@/lib/settings/store";
import { roundPaceFrom, secondsFor } from "@/lib/ux/roundClock";

export const metadata = { title: "Case Sprint" };

export const dynamic = "force-dynamic";

const POOL_SIZE = 40;

/** The round as it was written. A learner can stretch it in Settings. */
const BASE_DURATION_S = 60;

/**
 * A sixty second speed round by default, the "timed practice" idea, adapted to
 * cards already in the deck rather than inventing new content. Weak (high-lapse)
 * and overdue cards are favored, since fast repetition on exactly those is where
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
  // Which of the pool are already favorites, in one read rather than one per
  // card, so the star in the corner is drawn in the state it is actually in.
  const starred = await starredAmong(
    ownerId, shuffled.map((c) => c.lexemeId).filter((id): id is string => !!id),
  );
  const sprintCards: SprintCard[] = shuffled.map((c) => ({
    id: c.id,
    front: c.front,
    back: c.back,
    lemma: c.lexeme?.lemma ?? null,
    lexemeId: c.lexemeId,
    starred: !!c.lexemeId && starred.has(c.lexemeId),
    cardType: c.cardType,
  }));

  // Through the store, not straight at the table: the keys live there, and so
  // does the one settings read this request has already made. Both in one
  // call, because two reads of one map is two round trips for nothing.
  const settings = await readSettings(ownerId, [
    SETTING_KEYS.sprintBest, SETTING_KEYS.roundPace,
  ]);
  const best = numberSetting(settings[SETTING_KEYS.sprintBest], 0);
  /*
    How long the clock runs, resolved on the server and handed down as a
    number of seconds. The session is a client component and has no business
    reading a setting for itself; see lib/ux/roundClock.ts for why this is a
    pace over the round's own base rather than a stored number of seconds.
  */
  const seconds = secondsFor(BASE_DURATION_S, roundPaceFrom(settings[SETTING_KEYS.roundPace]));

  return <SprintSession cards={sprintCards} best={best} seconds={seconds} />;
}
