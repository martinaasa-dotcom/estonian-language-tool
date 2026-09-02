/**
 * How big the built-in dictionary is.
 *
 * The landing page states this number, and it states it in the one situation
 * where the database cannot be asked: a deployment whose Postgres is
 * unreachable, or one that has been built and not yet seeded. That is not a
 * theoretical state, it is the state a fresh install is in for its first few
 * minutes, so the fallback has to describe what `npm run db:seed` actually
 * writes rather than what it wrote once.
 *
 * It said 360 words and 1,568 forms, which was true of the hand-typed seed and
 * stopped being true twice over: `npm run harvest` brought 1,248 course words
 * back from Ekilex, and `scripts/expand-seed.ts` built 5,363 more entries out
 * of Ekilex and Wiktionary. A visitor was being told the dictionary was a
 * quarter of the size it is.
 *
 * `seedSize.test.ts` recounts it from the three sources the seed itself reads,
 * so the next word added to any of them fails here rather than quietly making
 * this a claim about the past again.
 *
 * It moved by two forms when five course words were pinned to the right
 * Ekilex homonym: `kohus` stopped being the moral duty and became the court
 * (kohtu, not kohuse), `kaste` stopped being dew, `pidama` stopped being the
 * verb for keeping a farm, and each of those brought a slightly different set
 * of plural forms with it. The word count did not move, because the words are
 * the same words; what changed is which word each of them is.
 *
 * It went up by fifty-one when three units of connectives, replies and degree
 * words were added, which is the second interesting thing. A frequency count
 * over film and television subtitles found that a hundred and twenty-five of
 * the four hundred commonest words in Estonian were ones the dictionary could
 * not vouch for in any form, and the top of that list is `ja`, `et`, `aga`,
 * `jah` and `ei`. The forms did not move, because an Estonian connective does
 * not inflect and the harvest keeps it attested and formless.
 *
 * The forms moved next, by 577, and that is a different thing again: the same
 * words, with what no rule of this app can work out from them. A seeded verb
 * could not say `oli` for want of a simple past third person, `olema` could
 * not say `on`, and a pronoun had none of the short forms anybody uses. See
 * `unreachableSlots` and `unreachableCaseForms`; the one extra word beside
 * them is `või`, which the connective unit had left out because Ekilex's first
 * candidate for it is the butter the food unit teaches.
 *
 * It went *down* by twelve once, which is the only interesting thing that has
 * happened to it. The part-of-speech audit corrected 61 labels in the built
 * file, and twelve of those words were ones the course harvest also carries:
 * `kallis`, `valge`, `noor` and nine more were being seeded twice over, once
 * as the harvest's adjective and once as the builder's noun, because the two
 * disagreed and the key they conflict on includes the label. They are one
 * entry each now. Nothing was dropped from the dictionary.
 */
export const SEED_SET_SIZE = { words: 6_102, forms: 35_103 };
