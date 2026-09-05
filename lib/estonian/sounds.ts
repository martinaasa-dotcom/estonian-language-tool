/**
 * WHAT AN ENGLISH EAR HEARS, SO A WORD YOU HEARD CAN BE LOOKED UP.
 *
 * The dictionary's search already folds diacritics, walks case suffixes and
 * matches stored forms, and every one of those helps somebody who has *read*
 * the word. Nobody in this app has only read them. A learner in a shop, in a
 * class or on a bus hears a word, tries to write it down, and gets it wrong in
 * one of three ways, which is not a guess: `scripts/measure-asr.mjs` measured
 * a recognizer on clean native audio and its mistakes landed on consonant
 * length (`Poiss` as `Pois`), voicing (`abikaasaga` as `abigaasaga`) and word
 * boundaries. A machine listening to a native speaker makes the learner's
 * mistakes, which is the whole reason that measurement is in the repository.
 *
 * So this folds exactly those, and nothing else:
 *
 *   QUANTITY. Estonian writes three lengths with one or two letters and English
 *   has no contrast to hang them on, so `lina`, `linna` and `linna` are one
 *   sound to somebody who has been here a month. Any doubled letter collapses.
 *
 *   VOICING. Estonian `b d g` are voiceless lenis, nearer English `p t k` than
 *   to `b d g`, and the pair is not distinguished by voice at all. An English
 *   speaker writing what they heard picks either one. They fold together.
 *
 *   THE VOWELS ENGLISH HAS NO KEY FOR. `õ ä ö ü` and `š ž`, which is what the
 *   ordinary diacritic fold already does and is repeated here so this function
 *   is one answer rather than half of one. `õ` folds to `o` rather than to `y`
 *   because that is what somebody who cannot hear it writes.
 *
 * WHAT IT DELIBERATELY DOES NOT FOLD is anything that would make two ordinary
 * words collide. `h` is not dropped, though it is weak, because dropping it
 * merges `hind` with `ind`; vowel qualities other than the four above stay
 * apart; and word boundaries are left alone, because a phrase typed as one
 * word is a different feature and guessing at it here would answer the wrong
 * question quietly.
 *
 * Pure, and in `lib/estonian/` for the reason everything else here is: it is a
 * fact about the language, it needs no database, and a rule about Estonian
 * sounds belongs beside the rules about Estonian endings.
 */

/** The four vowels and two consonants an English keyboard has no key for. */
const FOLD: Record<string, string> = {
  õ: "o", ä: "a", ö: "o", ü: "u", š: "s", ž: "s",
};

/** Estonian's lenis stops, which do not contrast with the fortis ones by voice. */
const DEVOICE: Record<string, string> = { b: "p", d: "t", g: "k" };

/**
 * A word reduced to what somebody who only heard it could write down.
 *
 * Two words share a key when a learner could plausibly have meant either. It
 * is never stored: it is computed over the lemma list the dictionary already
 * keeps in memory (`lib/dict/facts.ts`), so there is no second source of truth
 * and no index to go stale.
 */
export function soundKey(word: string): string {
  const lower = word.normalize("NFC").toLocaleLowerCase("et");
  let out = "";
  for (const ch of lower) {
    if (!/[a-zõäöüšž]/.test(ch)) continue;
    const folded = FOLD[ch] ?? ch;
    const plain = DEVOICE[folded] ?? folded;
    // Quantity: any run of one letter is one letter. Applied after the folds,
    // so `tt` and `td` collapse the same way once both are `t`.
    if (out.endsWith(plain)) continue;
    out += plain;
  }
  return out;
}

/**
 * The words that could be what somebody heard, from a list of lemmas.
 *
 * Ordered by lemma and capped, because the caller prints them: an order that
 * comes out of a `Set`'s insertion is a fact about the query that filled it,
 * and two identical searches showing different suggestions is the fault this
 * repository has a rule about one layer up.
 *
 * The query itself is never offered back: a word that matched exactly did not
 * reach this path, so a lemma equal to the query is a duplicate of a search
 * that already failed.
 */
export function soundAlike(
  query: string,
  lemmas: Iterable<string>,
  limit = 6,
): string[] {
  const key = soundKey(query);
  if (key.length < 2) return [];
  const wanted = query.trim().toLocaleLowerCase("et");

  const hits: string[] = [];
  for (const lemma of lemmas) {
    if (lemma.toLocaleLowerCase("et") === wanted) continue;
    if (soundKey(lemma) === key) hits.push(lemma);
  }
  return hits.sort((a, b) => a.localeCompare(b, "et")).slice(0, limit);
}
