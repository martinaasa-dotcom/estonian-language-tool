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
import { generateCards, isBareCaseFront, type LexemeForCards } from "../lib/srs/cards";
import { borrowSentences } from "../lib/dict/borrow";
import { parseExamples } from "../lib/dict/examples";

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

/**
 * REWRITING A BARE CASE CARD INTO THE SENTENCE THE BUILDER WOULD MAKE TODAY.
 *
 * A case card was `ravim → millele? kuhu?` with `ravimile` on the back, and a
 * learner reported it: the ask has no reason in it, nothing says when anybody
 * would say the form, and so it does not stick. `lib/srs/cards.ts` builds a
 * case card out of a recorded sentence with the form taken out now, and a case
 * no sentence carries builds nothing. That reaches every deck built since and
 * not one built before, because a `Card` row carries its own front, back and
 * hint and nothing in the app rewrites one. Somebody who added their words a
 * month ago keeps the bare ask on every one of them for as long as the cards
 * come back due, which is for ever.
 *
 * So the question is rewritten where the dictionary can rewrite it. For each
 * bare card, the builder is run over the card's own entry and the card it
 * produces for the same case, if any, supplies the new front, hint and back:
 * the sentence with the gap, the cue that never spells the answer, and the
 * form the sentence used ahead of the word's other spelling of it. One rule,
 * the builder's, rather than a copy of it here, which is what keeps a repaired
 * card and a fresh one the same card.
 *
 * WHAT IT MAY TOUCH. The question, and nothing else. `front`, `hint` and
 * `back`; never `targetCase`, which is the case the card was always about,
 * and never `due`, `stability`, `reps`, `lapses` or any other scheduling
 * column, since a repair that reset somebody's progress would cost more than
 * the bug it fixes. The review log is untouched by construction. The back is
 * the same set of accepted spellings in a different order, so no answer that
 * was right stops being right.
 *
 * WHAT IT DOES NOT DO is remove the cards it cannot rewrite. A bare card whose
 * word has no recorded sentence in that case is the ask the builder refuses
 * today and cannot replace; those are `unsentencedCaseCards`, reported and, on
 * request, removed by `scripts/audit-decks.ts`, which is the one path that
 * deletes from a learner's deck and prints its list before it does.
 *
 * The guard is the arrow. A repaired front is a sentence and carries none, so
 * a second run matches nothing, and the `UPDATE` compares the front it read
 * against the front it is replacing so a card rewritten between the read and
 * the write is left as it is.
 */
export async function repairCaseFronts(prisma: PrismaClient): Promise<number> {
  const bare = await prisma.card.findMany({
    where: { cardType: "CASE_FORM", targetCase: { not: null }, front: { contains: " → " } },
    select: {
      id: true, front: true, targetCase: true, lexemeId: true,
      lexeme: {
        select: {
          lemma: true, translation: true, pos: true, semanticTypes: true,
          gradation: true, gradationNote: true, government: true, examples: true,
          forms: {
            select: { formType: true, value: true, morphCode: true },
            orderBy: [{ orderIndex: "asc" }, { id: "asc" }],
          },
        },
      },
    },
    orderBy: { id: "asc" },
  });
  if (bare.length === 0) return 0;

  /*
    And what each word may borrow from the rest of the dictionary, read off
    the same client rather than the cached fact in `lib/dict/facts.ts`, since
    the seed runs on its own connection. The builder is asked with the same
    pool the deck builder asks it with, or a repaired card and a fresh one
    would stop being the same card. See lib/dict/borrow.ts.
  */
  const all = await prisma.lexeme.findMany({
    select: {
      id: true, lemma: true, pos: true, examples: true,
      forms: { select: { formType: true, value: true, morphCode: true } },
    },
  });
  const borrowed = borrowSentences(all.map((r) => ({
    key: r.id, lemma: r.lemma, pos: r.pos, forms: r.forms, examples: parseExamples(r.examples),
  })));

  const rows: { id: string; from: string; front: string; hint: string | null; back: string }[] = [];
  const builtFor = new Map<string, Map<string, { front: string; hint: string | null; back: string }>>();
  for (const card of bare) {
    if (!card.lexeme || !card.lexemeId || !card.targetCase || !isBareCaseFront(card.front)) continue;
    let byCase = builtFor.get(card.lexemeId);
    if (!byCase) {
      const lex: LexemeForCards = { ...card.lexeme, borrowed: borrowed.get(card.lexemeId) ?? [] };
      byCase = new Map(
        generateCards(lex, ["CASE_FORM"])
          .filter((c) => c.targetCase)
          .map((c) => [c.targetCase!, { front: c.front, hint: c.hint, back: c.back }]),
      );
      builtFor.set(card.lexemeId, byCase);
    }
    const built = byCase.get(card.targetCase);
    if (!built) continue;
    rows.push({ id: card.id, from: card.front, ...built });
  }
  if (rows.length === 0) return 0;

  let rewritten = 0;
  for (const batch of chunk(rows, CHUNK)) {
    const values = batch.map((r) => Prisma.sql`(${r.id}, ${r.from}, ${r.front}, ${r.hint}, ${r.back})`);
    rewritten += await prisma.$executeRaw`
      UPDATE "Card" AS c
      SET front = v.to_front, hint = v.to_hint, back = v.to_back
      FROM (VALUES ${Prisma.join(values)}) AS v(id, from_front, to_front, to_hint, to_back)
      WHERE c.id = v.id
        AND c."cardType" = 'CASE_FORM'
        AND c.front = v.from_front
    `;
  }
  return rewritten;
}
