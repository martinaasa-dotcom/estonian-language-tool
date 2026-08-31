/**
 * A word from a photographed page, once the dictionary has had its say.
 *
 * Shared between the route that produces these, the screen that shows them and
 * the action that turns them into cards, so the three cannot disagree about
 * what a scanned word is. Pure, and free of framework imports, because the
 * browser holds this shape too.
 */

import { MAX_EN_CHARS, MAX_ET_CHARS, looksTranscribed } from "./extract";

export interface ResolvedItem {
  /** The Estonian exactly as it was read off the page. */
  et: string;
  /** The gloss printed on the page, or "" when there was none. */
  en: string;
  /**
   * The dictionary entry that vouches for this word, or null when nothing did.
   *
   * This one field is the whole safety property of the feature. A word with an
   * id behind it becomes a flashcard built from real principal parts and a real
   * forms, and nothing the model wrote survives into it. A word without them
   * is shown as what it is: something a camera read, that only the person
   * holding the paper can confirm.
   */
  lexemeId: string | null;
  /** The headword, when matched. Differs from `et` for an inflected form. */
  lemma: string | null;
  /** The dictionary's English, when matched. Always better than the page's. */
  translation: string | null;
  /** "inessive (seesütlev) of tuba", when the page showed an inflected form. */
  matchedAs: string | null;
  cefr: string | null;
}

/** True when the dictionary recognised the word. */
export function isKnown(item: ResolvedItem): boolean {
  return item.lexemeId !== null;
}

export interface ScanSummary {
  total: number;
  known: number;
  unknown: number;
  /** Words the page showed in an inflected form, which is worth pointing out. */
  inflected: number;
}

export function summarise(items: readonly ResolvedItem[]): ScanSummary {
  const known = items.filter(isKnown).length;
  return {
    total: items.length,
    known,
    unknown: items.length - known,
    inflected: items.filter((i) => i.matchedAs !== null).length,
  };
}

/**
 * What the app is willing to store, whatever the client sent.
 *
 * A server action is a public endpoint and the item list comes back through
 * one after the learner has edited it, so every field is re-checked here
 * rather than trusted because it looked right on the way out. The Estonian is
 * run through the same shape test the transcription was, so an edited row
 * cannot smuggle in something the extractor would have refused.
 */
export function sanitiseItems(input: unknown, max: number): ResolvedItem[] {
  if (!Array.isArray(input)) return [];
  const out: ResolvedItem[] = [];
  const seen = new Set<string>();

  for (const row of input) {
    if (!row || typeof row !== "object") continue;
    const raw = row as Record<string, unknown>;
    const et = typeof raw.et === "string" ? raw.et.replace(/\s+/g, " ").trim() : "";
    if (!looksTranscribed(et)) continue;

    const key = et.toLocaleLowerCase("et");
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      et: et.slice(0, MAX_ET_CHARS),
      en: typeof raw.en === "string" ? raw.en.trim().slice(0, MAX_EN_CHARS) : "",
      lexemeId: typeof raw.lexemeId === "string" && raw.lexemeId ? raw.lexemeId : null,
      lemma: typeof raw.lemma === "string" && raw.lemma ? raw.lemma.slice(0, MAX_ET_CHARS) : null,
      translation:
        typeof raw.translation === "string" && raw.translation
          ? raw.translation.slice(0, MAX_EN_CHARS)
          : null,
      matchedAs:
        typeof raw.matchedAs === "string" && raw.matchedAs ? raw.matchedAs.slice(0, 80) : null,
      cefr: typeof raw.cefr === "string" && /^[ABC][12]$/.test(raw.cefr) ? raw.cefr : null,
    });
    if (out.length >= max) break;
  }

  return out;
}

/** Reads a stored `Scan.items` column back, defensively. Never throws. */
export function parseItems(json: string | null | undefined, max: number): ResolvedItem[] {
  if (!json) return [];
  try {
    return sanitiseItems(JSON.parse(json), max);
  } catch {
    return [];
  }
}

export function serialiseItems(items: readonly ResolvedItem[]): string {
  return JSON.stringify(items);
}
