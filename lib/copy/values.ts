/**
 * What a cell says when there is no value to put in it.
 *
 * This was an em dash, typed into a dozen call sites. That is the convention
 * every dictionary and every annual report uses for nil, and it is also a
 * character a reader may not see: it is the loudest tell that a sentence was
 * generated, so the app now strips it out of Anu's prose and forbids it in
 * hand-written copy. A nil marker that is the one banned character is a
 * marker nobody can reason about.
 *
 * A BARE HYPHEN WAS THE OBVIOUS SWAP AND IS WRONG. These sit in a paradigm
 * table, in a column of forms, beside percentages: a lone `-` in a grid of
 * Estonian forms reads as a form that is one character long, and beside
 * `62%` it reads as a minus sign whose digits failed to load. `n/a` cannot
 * be misread as either, and it is what a person would actually write in a
 * table by hand.
 *
 * ONE CONSTANT, so it is one edit if that call ever changes, and so a test
 * can assert on the constant rather than on a string somebody retyped.
 */
export const NO_VALUE = "n/a";

/**
 * What a word's English says when nothing has supplied one yet.
 *
 * An instruction rather than a marker, because the person reading it is the
 * person who can fix it. It lives here rather than beside the lookup that
 * writes it, since a scanned page now writes it too, and two spellings of the
 * same gap is how `isPlaceholder` starts missing one of them.
 */
export const NEEDS_TRANSLATION = `${NO_VALUE} · add a translation`;

/**
 * How anything a model wrote is marked, wherever a learner meets it.
 *
 * `/terms` promises this in as many words: what the AI suggests "is marked
 * *AI · verify* and needs your confirmation". That is a statement about the
 * app on a page a person can hold it to, so the app has to actually say it.
 *
 * IT HAD ALREADY DRIFTED. Six places said `AI · verify`; the grammar case
 * page and the dictation round said a bare `AI` and put the rest in a `title`,
 * which is a hover. This app is measured at 360px and its README leads with
 * "works on a phone", where there is no hover at all, so on the two screens
 * that most needed it the useful half of the tag did not exist. The same
 * argument `wordNote` makes about dictation: a tooltip is not text.
 *
 * The word that matters is `verify`. `AI` alone says where a sentence came
 * from; `verify` says what to do about it, which is the whole point of
 * marking it, and it is the half that was missing.
 *
 * One constant, for the reason `NO_VALUE` gives above and `PROVIDER_KEY_ENV`
 * gives about itself: a phrase retyped in eight places is a phrase that drifts
 * in one of them, and this one already had.
 */
export const AI_TAG = "AI · verify";
