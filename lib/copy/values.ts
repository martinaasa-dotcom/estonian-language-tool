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
