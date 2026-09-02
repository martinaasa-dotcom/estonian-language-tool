/**
 * ONE FOLD, BECAUSE THERE WERE THREE AND A FOURTH SCREEN THAT NEEDED ONE.
 *
 * Estonian has six letters an English keyboard has no key for, and half the
 * app has to answer the same question about them: is `sona` the word `sõna`?
 * The answer is yes wherever somebody is *looking* for a word, and no wherever
 * they are being *marked* on one, which is a decision each caller makes. What
 * none of them should be deciding for themselves is which six letters.
 *
 * Three copies said the same thing three ways: a `replaceAll` chain in
 * `lib/dict/search.ts` and an identical `Record` in `lib/estonian/dictation.ts`
 * and again in `lib/estonian/answer.ts`. They happened to agree, which is the
 * dangerous state rather than the safe one: a marker and a search box that
 * disagree about whether `ž` folds would mark somebody wrong for a spelling the
 * dictionary had just offered them.
 *
 * THE FOURTH CASE IS WHAT FOUND IT. The command palette matched a typed query
 * against a label with `includes`, so typing `sonad` found nothing and `Sõnad`
 * was unreachable from the box that promises to go anywhere — for exactly the
 * learner the letter bar exists for, who has no õ key.
 *
 * `lib/estonian/sounds.ts` keeps a table of its own and says why: it folds
 * *sounds a learner confuses*, `b` against `p` and `k` against `g`, which is a
 * different question with a different answer. And `fold` in
 * `lib/suggestions/model.ts` is a name collision rather than a copy: it
 * collapses whitespace to build a grouping key and touches no diacritic.
 *
 * `FOLD_FROM` and `FOLD_TO` are the same table as two strings, for Postgres's
 * `translate()`, so the SQL that narrows a search and the JavaScript that
 * decides it fold the same six characters.
 *
 * Pure, and here rather than in `lib/dict/` because it is a fact about
 * Estonian. That is load-bearing: `lib/estonian/passage.ts` imported `fold`
 * from `lib/dict/search.ts`, which imports Prisma, so a layer asserted to be
 * free of the database was pulling it in one import away. The invariant reads
 * each file's own imports and could not see it.
 */

/** The six, and the letter each stands in for. */
export const FOLD: Readonly<Record<string, string>> = {
  õ: "o", ä: "a", ö: "o", ü: "u", š: "s", ž: "z",
};

/** Strips Estonian diacritics, so `sona` finds `sõna`. Lowercases on the way. */
export function fold(text: string): string {
  return [...text.toLowerCase()].map((ch) => FOLD[ch] ?? ch).join("");
}

/** The same table for Postgres's `translate()`: the characters to replace. */
export const FOLD_FROM = Object.keys(FOLD).join("");

/** And what to replace them with, in the same order. */
export const FOLD_TO = Object.values(FOLD).join("");
