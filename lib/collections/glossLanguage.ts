/**
 * WHICH LANGUAGE A MEANING IS GIVEN IN.
 *
 * English is the default and stays the default, because a missing row has to
 * read as the behavior everybody already had. It is not the right answer for
 * most people learning Estonian in Estonia, though, which is the reason this
 * exists: a learner who already speaks Russian or Ukrainian and is told that
 * `kohv` is "coffee" has to go through a third language to reach a word their
 * own would have landed instantly, and the third language is the one they are
 * least sure of.
 *
 * WHAT IS SHOWN IS NEVER A TRANSLATION THIS APP MADE. The equivalents come
 * from Ekilex, out of the same response the forms and the sentences come from,
 * written by the same lexicographers at the Institute of the Estonian
 * Language. No model is anywhere near them, which is what makes this safe to
 * put on a flashcard at all (ADR-005), and nothing here is Estonian, so the
 * rule about writing Estonian has nothing to say about it either.
 *
 * THE ENGLISH IS ALWAYS THERE. This chooses what *leads*, not what is shown:
 * the course's own gloss is authored English and is the one column the
 * dictionary can promise for every entry, while Ekilex records a Russian
 * equivalent for most of the course and a Ukrainian one for rather fewer. A
 * card that hid the English would be blank on the words that have no other,
 * and a learner would have no way to tell an absent equivalent from a word
 * with no meaning.
 *
 * Pure, and in `lib/collections/` beside the other tables that decide what a
 * learner is shown.
 */

export const GLOSS_LANGUAGES = [
  { id: "en", label: "English", native: "English" },
  { id: "ru", label: "Russian", native: "русский" },
  { id: "uk", label: "Ukrainian", native: "українська" },
] as const;

/**
 * The id is the BCP 47 tag, which is why a screen writes `lang={glossLanguage}`.
 *
 * There was a `glossLangAttr` here that returned its argument, on the reasoning
 * that a screen should ask rather than assume. Nothing ever called it: all
 * three screens that print an equivalent write the id straight into `lang`,
 * correctly. A helper that returns what it was given is a fact about the ids
 * dressed up as a function, so the fact is written down instead. Keep the ids
 * as tags, or the three of them are wrong at once and nothing will say so.
 */
export type GlossLanguage = (typeof GLOSS_LANGUAGES)[number]["id"];

export const DEFAULT_GLOSS_LANGUAGE: GlossLanguage = "en";

/** A stored value, or the default. Never throws: a stored row can be anything. */
export function glossLanguageFrom(value: string | null | undefined): GlossLanguage {
  return GLOSS_LANGUAGES.some((l) => l.id === value)
    ? (value as GlossLanguage)
    : DEFAULT_GLOSS_LANGUAGE;
}


export interface Glosses {
  /** The authored English, which every entry has. */
  readonly translation: string;
  readonly translationRu?: string | null;
  readonly translationUk?: string | null;
}

/**
 * What to print beside the English, or null.
 *
 * Null for English itself, and null where Ekilex records no equivalent, which
 * is most of the built expansion: the course harvest carries them and the
 * words drawn from Wiktionary do not. A screen with nothing here prints the
 * English alone rather than a blank or a dash, because "we have no Russian for
 * this word" is not a thing worth a line of somebody's card.
 */
export function equivalentIn(entry: Glosses, language: GlossLanguage): string | null {
  if (language === "ru") return entry.translationRu?.trim() || null;
  if (language === "uk") return entry.translationUk?.trim() || null;
  return null;
}
