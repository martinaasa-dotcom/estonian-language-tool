/**
 * WHERE A CARD CAME FROM, AND WHICH OF THOSE ARE THE LEARNER'S OWN.
 *
 * `Card.source` has been written on every deck add since the scheduler was
 * built and read by one thing: `wordOfDay` counting the words kept off the
 * almanac card. It was a label nobody looked at, so nothing noticed that two
 * of its values had come to mean the same thing.
 *
 * `addUnitsToDeck` defaults its source to `DICTIONARY`, and so does the button
 * on a dictionary entry. So a word a learner went and looked up because they
 * were curious, and every word of a course unit they added in one press, were
 * filed identically. That is the column answering "which table did this come
 * out of" when the question worth asking is "whose idea was this word".
 *
 * The distinction matters because of what the review queue does with a new
 * card. Unseen cards are read oldest first, sixty at a time, and ordered by
 * band; a word looked up this afternoon therefore sits behind the whole course
 * backlog and may not be reached for months. That is the right default for a
 * course and the wrong one for the word somebody stopped and looked up on the
 * bus, which is exactly the word they were interested in. `/review/lookups` is
 * where those get asked, and this is the list it reads.
 *
 * THREE KINDS, AND THE THIRD IS THE HONEST ONE.
 *
 * `COURSE`, `FREQUENCY` and `SCENE` are material this app chose: a unit, one of
 * the four commonest-word lists, a situation. `LOOKUP`, `MANUAL`, `TUTOR`,
 * `IMPORT`, `SCAN`, `ALMANAC` and `SENTENCE` are words the learner went and
 * got, one at a time, off an entry, a photograph, a pasted list, Anu, the word
 * of the day, or a word they hit inside the sentence a card was teaching with.
 *
 * `DICTIONARY` is neither and is claimed by nothing. Every card written before
 * this carries it, and a card written before this really could be either, so
 * reading it as a lookup would fill the round with course words for every
 * learner who already has a deck and reading it as course material would hide
 * the lookups they already have. There is no third reading and no repair: the
 * column records what was written down, and what was written down did not tell
 * the two apart. It stops being written today and the round fills from today.
 * Silence is never evidence, and the safe direction is to claim less.
 *
 * Pure, and a closed list, because `addToDeck` is a `"use server"` export and
 * therefore a public endpoint: `source` arrives as JSON off the wire whatever
 * the type says, and one caller filing a card under a value nothing writes
 * would quietly break a count this app presents as derived.
 */

export const CARD_SOURCES = [
  "COURSE",
  "FREQUENCY",
  "SCENE",
  "LOOKUP",
  "MANUAL",
  "TUTOR",
  "IMPORT",
  "SCAN",
  "ALMANAC",
  "SENTENCE",
  "DICTIONARY",
] as const;

export type CardSource = (typeof CARD_SOURCES)[number];

/**
 * What `addToDeck` files a card under when the source it was handed is not one
 * this app writes. `MANUAL` rather than a throw, because a card with an odd
 * label is a card, and the endpoint's job is to add the word.
 */
export const DEFAULT_SOURCE: CardSource = "MANUAL";

/**
 * The sources that mean "the learner went and got this word".
 *
 * `SCENE` is deliberately absent. A scene names unit ids and its words are the
 * course's, so a card that arrived through one is material this app chose, in
 * the same way a unit is. `DICTIONARY` is absent for the reason in the header.
 *
 * `SENTENCE` is present, and the sentence being the app's choice is not the
 * question. A first meeting shows an attested sentence and the dictionary
 * under every word in it; the learner reads the line, hits one word they do
 * not have, and presses a button about that word. That is the same act as
 * keeping the word of the day, which the app also chose and which is on this
 * list: what makes a word theirs is that they stopped and went and got it, one
 * at a time, rather than which screen it was sitting on.
 */
export const YOUR_OWN_SOURCES = [
  "LOOKUP", "MANUAL", "TUTOR", "IMPORT", "SCAN", "ALMANAC", "SENTENCE",
] as const satisfies readonly CardSource[];

const KNOWN = new Set<string>(CARD_SOURCES);
const OWN = new Set<string>(YOUR_OWN_SOURCES);

export function isCardSource(value: unknown): value is CardSource {
  return typeof value === "string" && KNOWN.has(value);
}

/** Whether a card is one of the learner's own, by the reading above. */
export function isYourOwn(source: string): boolean {
  return OWN.has(source);
}
