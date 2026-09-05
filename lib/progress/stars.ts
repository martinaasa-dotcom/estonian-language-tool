import { prisma } from "@/lib/db";

/**
 * THE WORDS A LEARNER HAS STARRED.
 *
 * `StarredWord` has existed since the dictionary did and could only be written
 * from one screen and read on that same screen, so a favorite was a thing you
 * could set and then never see again. These are the two reads that put it
 * where it is set from and where it is looked at: `starredAmong` for a session
 * that has to draw the button in the right state, and `favorites` for the
 * list on `/words/mastery`.
 *
 * OWNER-SCOPED, SO IT IS NOT A FACT ABOUT THE DICTIONARY. Nothing here may go
 * near `lib/dict/facts.ts`, which caches its answers across requests and holds
 * only what is true for everybody.
 */

/** How many favorites a list shows before it stops being a list. */
export const FAVOURITE_LIMIT = 120;

/**
 * Which of these words this learner has starred.
 *
 * One query for a whole session rather than one per card, keyed on the
 * composite primary key's leading column, which is why `StarredWord` needs no
 * index of its own.
 */
export async function starredAmong(
  ownerId: string, lexemeIds: readonly string[],
): Promise<Set<string>> {
  const ids = [...new Set(lexemeIds)];
  if (ids.length === 0) return new Set();
  const rows = await prisma.starredWord.findMany({
    where: { ownerId, lexemeId: { in: ids } },
    select: { lexemeId: true },
  });
  return new Set(rows.map((r) => r.lexemeId));
}

export interface Favorite {
  lexemeId: string;
  lemma: string;
  translation: string;
  pos: string;
  cefr: string | null;
  starredAt: Date;
}

/**
 * Every word this learner has starred, most recently starred first.
 *
 * Newest first because that is the order somebody looks for one in: a star is
 * pressed in the middle of a card about a word that has just surprised them,
 * and the thing they come back for is the one they kept last. Ordered on the
 * id as well, since two stars written in one press of "add a unit" share a
 * timestamp and a cut at the limit may not be decided by the query plan.
 */
export async function favorites(ownerId: string): Promise<Favorite[]> {
  const rows = await prisma.starredWord.findMany({
    where: { ownerId },
    select: {
      lexemeId: true,
      createdAt: true,
      lexeme: { select: { lemma: true, translation: true, pos: true, cefr: true } },
    },
    orderBy: [{ createdAt: "desc" }, { lexemeId: "asc" }],
    take: FAVOURITE_LIMIT,
  });

  return rows.map((row) => ({
    lexemeId: row.lexemeId,
    lemma: row.lexeme.lemma,
    translation: row.lexeme.translation,
    pos: row.lexeme.pos,
    cefr: row.lexeme.cefr,
    starredAt: row.createdAt,
  }));
}

/** How many words are starred in total, which the capped list cannot say. */
export function favoriteCount(ownerId: string): Promise<number> {
  return prisma.starredWord.count({ where: { ownerId } });
}
