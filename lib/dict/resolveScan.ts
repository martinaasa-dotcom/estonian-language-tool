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
 * headwords with real paradigms behind them, and the learner is told, per word,
 * what they were actually looking at.
 */

import type { ScannedItem } from "@/lib/scan/extract";
import type { ResolvedItem } from "@/lib/scan/items";
import { matchEstonianForm, vouchableCandidates, type Candidate } from "./search";

/**
 * The whole page is narrowed in one query and matched in memory, rather than
 * one query per word or, as this once did, the whole dictionary read into
 * memory behind an unordered `take`. `vouchableCandidates` returns a superset
 * of what the ranker can vouch for, so nothing that would have matched is
 * filtered out before it gets the chance.
 */
export async function resolveScannedItems(items: ScannedItem[]): Promise<ResolvedItem[]> {
  if (items.length === 0) return [];

  const candidates = await vouchableCandidates(items.map((i) => i.et));

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

  const candidates = await vouchableCandidates([trimmed]);

  return resolveOne(candidates, { et: trimmed, en: "" });
}
