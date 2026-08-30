import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { numberSetting, readSettings, SETTING_KEYS } from "@/lib/settings/store";
import { MatchSession, type MatchPair } from "./MatchSession";

export const metadata = { title: "Match" };

export const dynamic = "force-dynamic";

const PAIRS = 8;
const MIN_PAIRS = 4;

/**
 * Builds one match round.
 *
 * Recognition cards only: a pair has to be a word and its meaning, and a
 * case-form card ("tuba → inessive") has no meaning to pair with. Due and
 * lapsed cards come first, so the round is practice rather than a novelty —
 * then anything else in the deck, so a learner who is caught up can still play.
 *
 * Duplicate translations are dropped: two tiles reading "book" would make a
 * pair unmatchable through no fault of the player.
 */
export default async function MatchPage() {
  const ownerId = await requireUserId();
  const now = new Date();

  const base = {
    ownerId, suspended: false, cardType: "RECOGNITION", lexemeId: { not: null },
  } as const;
  const include = { lexeme: { select: { lemma: true } } } as const;

  const due = await prisma.card.findMany({
    where: { ...base, due: { lte: now }, state: { not: 0 } },
    orderBy: { due: "asc" },
    take: PAIRS * 2,
    include,
  });

  let pool = due;
  if (pool.length < PAIRS) {
    const seen = new Set(pool.map((c) => c.id));
    const rest = await prisma.card.findMany({
      where: { ...base, id: { notIn: [...seen] } },
      orderBy: [{ lapses: "desc" }, { due: "asc" }],
      take: PAIRS * 2 - pool.length,
      include,
    });
    pool = [...pool, ...rest];
  }

  const seenAnswers = new Set<string>();
  const pairs: MatchPair[] = [];
  for (const card of pool) {
    const english = card.back.trim();
    const estonian = card.lexeme?.lemma ?? card.front;
    const key = english.toLowerCase();
    if (seenAnswers.has(key)) continue;
    seenAnswers.add(key);
    pairs.push({ cardId: card.id, estonian, english });
    if (pairs.length === PAIRS) break;
  }

  const settings = await readSettings(ownerId, [SETTING_KEYS.matchBest]);
  const best = numberSetting(settings[SETTING_KEYS.matchBest], 0);

  return <MatchSession pairs={pairs.length >= MIN_PAIRS ? pairs : []} best={best} />;
}
