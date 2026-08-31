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
 * It went *down* by twelve once, which is the only interesting thing that has
 * happened to it. The part-of-speech audit corrected 61 labels in the built
 * file, and twelve of those words were ones the course harvest also carries:
 * `kallis`, `valge`, `noor` and nine more were being seeded twice over, once
 * as the harvest's adjective and once as the builder's noun, because the two
 * disagreed and the key they conflict on includes the label. They are one
 * entry each now. Nothing was dropped from the dictionary.
 */
export const SEED_SET_SIZE = { words: 5_959, forms: 34_386 };
