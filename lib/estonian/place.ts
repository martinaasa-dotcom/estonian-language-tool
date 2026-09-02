import type { CaseKey } from "./types";

/**
 * Where a word takes the outside cases rather than the inside ones.
 *
 * ESTONIAN HAS TWO SETS OF LOCAL CASES AND A PLACE NAME IN -MAA USES THE
 * OUTSIDE ONE. `tuba` goes `toas`, `toast`, `tuppa`; `Saksamaa` goes
 * `Saksamaal`, `Saksamaalt`, `Saksamaale`, and `Saksamaas` is not a way of
 * saying "in Germany" at all: it means "about Germany" at best. The same is
 * true of the islands and counties, which are all `-maa` words (`Saaremaal`,
 * `Hiiumaal`), and of the everyday nouns built the same way: `välismaal` is
 * how you say abroad, `kodumaale` how you say home to your own country.
 *
 * THIS WAS DRILLING THE WRONG FORM. The A1 unit `Riigid ja rahvad` builds a
 * case card per word, and the card for `Venemaa` asked `milles? kus?` and
 * took `Venemaas` as the answer. A learner who wrote `Venemaal`, which is
 * what everybody says and what their teacher would mark right, was told they
 * were wrong and shown the card again until they gave in. It is the illative
 * fault of ADR-005's amendment, arriving through a different door: a rule
 * that is right for a common noun applied to a place name it does not fit.
 *
 * The test is the ending rather than a list, because the ending is the rule:
 * `-maa` is the word for land, and a compound naming a stretch of land takes
 * the cases you use for standing on something rather than being inside it.
 * `maa` alone is the one word where both are ordinary Estonian (`maal` in
 * the countryside, `maas` on the ground), so it keeps both and is drilled on
 * neither trio: a card cannot ask which of two right answers a learner meant.
 */
export function takesOutsideCases(lemma: string): boolean {
  const word = lemma.trim().toLocaleLowerCase("et");
  return word.length > 3 && word.endsWith("maa");
}

/** True where neither set can be drilled without asking an unanswerable question. */
export function bothSetsOrdinary(lemma: string): boolean {
  return lemma.trim().toLocaleLowerCase("et") === "maa";
}

/** Being inside something. `toas`, `toast`, `tuppa`. */
export const INSIDE_CASES: readonly CaseKey[] = ["INESSIVE", "ELATIVE", "ILLATIVE"];

/** Being on something, which is what a country, an island or a county takes. */
export const OUTSIDE_CASES: readonly CaseKey[] = ["ADESSIVE", "ABLATIVE", "ALLATIVE"];

/**
 * The local cases worth drilling for one word: the outside trio for a place
 * in `-maa`, the inside trio for everything else, and neither for `maa`.
 */
export function localCasesFor(lemma: string): readonly CaseKey[] {
  if (bothSetsOrdinary(lemma)) return [];
  return takesOutsideCases(lemma) ? OUTSIDE_CASES : INSIDE_CASES;
}
