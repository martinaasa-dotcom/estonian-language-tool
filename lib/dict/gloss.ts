/**
 * Reading an English gloss back the other way.
 *
 * Nearly everything in this app goes Estonian to English: you have a lemma and
 * you want to know what it means. The word of the day goes the other way. The
 * almanac says the twelfth of the month wants "dozen" and something has to
 * find the entry that carries it.
 *
 * WHY THIS IS NOT A SUBSTRING SEARCH, WHICH IS THE FIRST THING ANYBODY WRITES.
 * A gloss is a comma-separated list of senses and a substring runs straight
 * through the commas. `contains: "dark"` matches an entry four rows down whose
 * gloss is a racial slur with the word "dark" in the middle of it, and that
 * entry would then have gone on the home page under a heading saying it was
 * chosen for you. `contains: "love"` finds "love child, natural child,
 * bastard". The senses are what the lexicographer separated, so the senses are
 * what gets compared, whole.
 *
 * The database still does a `contains` to narrow five thousand rows down to a
 * handful, because Postgres cannot split a string mid-index. That query is a
 * sieve. This module is the decision.
 *
 * Pure: strings in, strings out.
 */

/**
 * A gloss split into the senses a lexicographer separated, each normalized.
 *
 * "moose, European elk" is two senses. "to lie" and "lie" are the same sense
 * written twice, because a verb gloss carries its infinitive marker and a noun
 * gloss carries its article, and neither is part of the meaning.
 */
export function glossSenses(translation: string): string[] {
  return translation
    .split(/[,;/]/)
    .map((sense) =>
      sense
        .trim()
        .toLowerCase()
        // A parenthetical is a note about the sense, not the sense: "(light)
        // meal" is a meal.
        .replace(/\([^)]*\)/g, " ")
        .replace(/^(to|a|an|the)\s+/, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

/** Whether an entry's gloss carries this exact sense. */
export function matchesGloss(translation: string, gloss: string): boolean {
  const wanted = glossSenses(gloss)[0];
  return wanted !== undefined && glossSenses(translation).includes(wanted);
}

/**
 * Where the sense sits in the gloss, or -1 if it is not in there at all.
 *
 * Position is the ranking signal that matters. Wiktionary and Ekilex both put
 * the everyday sense first, so an entry whose *first* sense is "fire" is the
 * word for fire, and one whose fourth sense is "fire" is a word that can mean
 * fire if you push it.
 */
export function senseIndex(translation: string, gloss: string): number {
  const wanted = glossSenses(gloss)[0];
  if (wanted === undefined) return -1;
  return glossSenses(translation).indexOf(wanted);
}
