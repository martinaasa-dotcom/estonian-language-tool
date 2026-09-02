/**
 * The gate between a photograph and the deck.
 *
 * `lib/scan/extract.ts` produces candidates: strings a model claims are
 * printed on a page. This is where the app decides whether it believes any of
 * them, and the answer is only ever "the dictionary recognises this exact
 * spelling, one of its stored forms, or a regular case built on its stem".
 * Nothing looser, because a fuzzy match would silently hand somebody a
 * flashcard for a word that is not the one on their paper, and the scheduler
 * would then spend six weeks drilling it in.
 *
 * A HOMEWORK PAGE IS FULL OF INFLECTED FORMS, which is exactly what makes this
 * worth doing rather than a plain string equality. A textbook exercise says
 * `toas` and `lugesin`, not `tuba` and `lugema`, and the inflected-form search
 * this app already had (`matchEstonianForm`) resolves both and says which case
 * or person it recognised. So the photograph of an exercise becomes a set of
 * headwords with real forms behind them, and the learner is told, per word,
 * what they were actually looking at.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { ScannedItem } from "@/lib/scan/extract";
import type { ResolvedItem } from "@/lib/scan/items";
import { possibleFirstPersons } from "@/lib/estonian/conjugate";
import {
  FOLD_FROM, FOLD_TO, fold, matchEstonianForm, possibleStems, type Candidate,
} from "./search";

/**
 * Narrowing the dictionary to the rows a page could possibly match.
 *
 * THIS PULLED THE WHOLE TABLE WITH `take: 4000` AND NO ORDERING, WHICH IS THE
 * FAULT `searchLexemes` HAD JUST BEEN FIXED FOR AND ITS COMMENT DESCRIBES IN
 * FULL. It was true that "a few thousand rows is milliseconds" when the
 * dictionary was 370 hand-written words. The expanded dictionary is 5,400, so
 * the cap was below the table: Postgres returns rows in no defined order
 * without an ORDER BY, so roughly a quarter of the dictionary was invisible to
 * the scanner, and *which* quarter changed between requests. A learner
 * photographing homework got words back unvouched that the dictionary holds,
 * differently each time. `resolveScan.itest.ts` caught it as a test that
 * failed three times and then passed, on unchanged code.
 *
 * So the database narrows and `matchEstonianForm` still decides, exactly as
 * `searchLexemes` does. The predicate is a deliberate superset of what that
 * matcher accepts: it scores a lemma, a stored form, or a regular case of the
 * genitive stem at or above `VOUCHED_SCORE`, and rejects the English-only tier
 * outright, so there is no English branch here. `possibleStems` is imported
 * rather than restated, because the suffix list has to stay the one the ranker
 * scores with or the prefilter can drop a form the matcher would have taken.
 *
 * One query for the page, still: a page can carry sixty words and sixty
 * queries was the thing the original was right to avoid.
 */
const CANDIDATE_CEILING = 4000;

export async function resolveScannedItems(items: ScannedItem[]): Promise<ResolvedItem[]> {
  if (items.length === 0) return [];

  const candidates = await candidatesFor(items.map((item) => item.et));
  return items.map((item) => resolveOne(candidates, item));
}

function resolveOne(candidates: Candidate[], item: ScannedItem): ResolvedItem {
  const match = matchEstonianForm(candidates, item.et);
  if (!match) {
    return {
      et: item.et,
      en: item.en,
      lexemeId: null,
      lemma: null,
      translation: null,
      matchedAs: null,
      cefr: null,
    };
  }

  return {
    et: item.et,
    en: item.en,
    lexemeId: match.id,
    lemma: match.lemma,
    // The dictionary's English wins over the page's. Not because a textbook is
    // wrong, but because this one was read by a camera and the other was not.
    translation: match.translation,
    matchedAs: match.matchedAs ?? null,
    cefr: match.cefr,
  };
}

/**
 * Re-resolves a single word after the learner has corrected its spelling.
 *
 * The row on screen is editable precisely because a camera misreads `ö` as `o`
 * in bad light, and a correction that did not re-check the dictionary would
 * leave a now-perfectly-good word still marked as unknown.
 */
export async function resolveOneWord(word: string): Promise<ResolvedItem | null> {
  const trimmed = word.trim();
  if (!trimmed) return null;

  const candidates = await candidatesFor([trimmed]);
  return resolveOne(candidates, { et: trimmed, en: "" });
}

/**
 * The dictionary rows any of these words could resolve to.
 *
 * Three branches, unioned rather than ORed for the reason `searchLexemes`
 * measured: as a union each one can take its own index, and `prisma/indexes.ts`
 * gives all three one.
 *
 * Exported only so the narrowing itself can be asserted. `resolveScan.itest.ts`
 * checks that a word with nothing to do with the query is *not* fetched, which
 * is a thing no test of `resolveScannedItems` can see: "the right word
 * resolves" passes on a small dictionary, and on a large one whenever the row
 * happens to land early, which is exactly why the fault above went unnoticed
 * until it started failing at random.
 */
export async function candidatesFor(words: string[]): Promise<Candidate[]> {
  const folded = [...new Set(
    words.map((w) => fold(w.trim().toLowerCase())).filter(Boolean),
  )];
  if (folded.length === 0) return [];

  const stems = [...new Set(folded.flatMap((f) => possibleStems(f)))].filter(Boolean);
  /*
    And the same for a verb, which a page of homework is mostly made of. The
    narrowing had three branches and the search had four, and now both have
    five: a stem here, a first person there. `ta helistab` on somebody's paper
    fetched no candidate at all, so `matchEstonianForm` was handed nothing and
    the word came back unvouched, on the one path where an unvouched word is a
    word the learner has to type in themselves.
  */
  const firstPersons = [...new Set(folded.flatMap((f) => possibleFirstPersons(f)))].filter(Boolean);

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM (
      SELECT l.id FROM "Lexeme" l
        WHERE translate(lower(l.lemma), ${FOLD_FROM}, ${FOLD_TO}) IN (${Prisma.join(folded)})
      UNION
      SELECT f."lexemeId" FROM "Form" f
        WHERE translate(lower(f.value), ${FOLD_FROM}, ${FOLD_TO}) IN (${Prisma.join(folded)})
      UNION
      SELECT f."lexemeId" FROM "Form" f
        WHERE f."formType" IN ('GEN_SG', 'GEN_PL')
          AND translate(lower(f.value), ${FOLD_FROM}, ${FOLD_TO})
              IN (${Prisma.join(stems.length ? stems : [""])})
      UNION
      SELECT f."lexemeId" FROM "Form" f
        WHERE f."formType" = 'PRES_1SG'
          AND translate(lower(f.value), ${FOLD_FROM}, ${FOLD_TO})
              IN (${Prisma.join(firstPersons.length ? firstPersons : [""])})
    ) AS candidates
    -- Ordered because it is truncated, exactly as the search's own union is.
    -- This function's header already says the fault "went unnoticed until it
    -- started failing at random"; which rows survive a ceiling is the same
    -- question one paragraph on.
    ORDER BY id
    LIMIT ${CANDIDATE_CEILING}
  `;
  if (rows.length === 0) return [];

  return prisma.lexeme.findMany({
    where: { id: { in: rows.map((r) => r.id) } },
    select: {
      id: true, lemma: true, translation: true, pos: true,
      cefr: true, gradationNote: true, provenance: true,
      forms: { select: { formType: true, value: true, morphCode: true, morphName: true } },
    },
  });
}
