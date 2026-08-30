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
 */
export const SEED_SET_SIZE = { words: 5_971, forms: 34_455 };
