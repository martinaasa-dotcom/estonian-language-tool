/**
 * Widening the back of a production card that was built before the dictionary
 * knew its prompt had more than one answer.
 *
 * A production card is front `translation`, hint `pos`, back `lemma`, and
 * `checkAnswer` marks against the back, so two entries with one gloss and one
 * part of speech are one question with two right answers. `lib/srs/cards.ts`
 * now builds such a card with every answer on the back, joined the way
 * `acceptedAnswers` splits stored alternatives. That fixes the cards it builds
 * and does nothing at all for the ones already in a deck, because a `Card` row
 * carries its own back and nothing rewrote it: a learner who added
 * `defineerima` before the fix keeps a card that marks `määratlema` wrong and
 * drills it every time they get it right.
 *
 * WHERE THIS RUNS AND WHY IT IS THE SAME PLACE AS `applyPosCorrections`. Before
 * the `--only-if-empty` early return, because a card built the old way only
 * exists on a database that was already seeded, which is precisely the case
 * that check skips. On a fresh deployment there are no cards, so it reads the
 * dictionary once and does nothing. It runs after the part-of-speech
 * corrections, because `pos` is half of what a prompt is.
 *
 * WHAT IT MAY TOUCH. The back, and nothing else. Never `due`, `stability`,
 * `reps`, `lapses` or any other scheduling column, because a repair that reset
 * somebody's progress would cost more than the bug it fixes. It only ever
 * *widens* what a card accepts: the answer it already had stays first, and the
 * others join it.
 *
 * The `back = lemma` guard is what makes that true and what makes this
 * idempotent. A card whose back is exactly its own lemma is one built before
 * the fix; a card whose back already carries a separator has been repaired,
 * or was built by the new code, or is a case card's list, and is left alone.
 * Run twice and the second pass matches nothing.
 *
 * The groups are read from the deployment's own `Lexeme` rows rather than from
 * the shipped files, because a deployment holds words the files do not: a word
 * somebody confirmed off a photograph or pasted in shares a prompt exactly as
 * readily as a seeded one.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { alsoAcceptedByLemma, sharedPrompts } from "../lib/collections/senses";

/** Postgres binds at most 65,535 parameters, and each row here spends three. */
const CHUNK = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function repairProductionBacks(prisma: PrismaClient): Promise<number> {
  const lexemes = await prisma.lexeme.findMany({
    select: { id: true, lemma: true, pos: true, translation: true },
  });
  const groups = sharedPrompts(
    lexemes.map((l) => ({ lemma: l.lemma, pos: l.pos, gloss: l.translation })),
  );
  if (groups.length === 0) return 0;

  const alsoAccepted = alsoAcceptedByLemma(groups);
  const rows: { lexemeId: string; from: string; to: string }[] = [];
  for (const lexeme of lexemes) {
    const others = alsoAccepted.get(`${lexeme.lemma}|${lexeme.pos}`);
    if (!others || others.length === 0) continue;
    rows.push({
      lexemeId: lexeme.id,
      from: lexeme.lemma,
      to: [lexeme.lemma, ...others].join(" / "),
    });
  }
  if (rows.length === 0) return 0;

  let widened = 0;
  for (const batch of chunk(rows, CHUNK)) {
    const values = batch.map((r) => Prisma.sql`(${r.lexemeId}, ${r.from}, ${r.to})`);
    widened += await prisma.$executeRaw`
      UPDATE "Card" AS c
      SET back = v.to_back
      FROM (VALUES ${Prisma.join(values)}) AS v(lexeme_id, from_back, to_back)
      WHERE c."lexemeId" = v.lexeme_id
        AND c."cardType" = 'PRODUCTION'
        AND c.back = v.from_back
    `;
  }
  return widened;
}
