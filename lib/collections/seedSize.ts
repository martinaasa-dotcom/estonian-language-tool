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
 * It went *down* by twelve once, which is the only interesting thing that has
 * happened to it. The part-of-speech audit corrected 61 labels in the built
 * file, and twelve of those words were ones the course harvest also carries:
 * `kallis`, `valge`, `noor` and nine more were being seeded twice over, once
 * as the harvest's adjective and once as the builder's noun, because the two
 * disagreed and the key they conflict on includes the label. They are one
 * entry each now. Nothing was dropped from the dictionary.
 *
 * The largest single move was 34,554 to 37,723, and no word came or went with
 * it. It is two corrections in opposite directions, both from
 * `npm run audit:cases`.
 *
 * Up by 5,082: the nominative plural was `genSg + d` and the audit put that to
 * Ekilex for every nominal in the dictionary. It is wrong for every pronoun
 * that has a plural and invents one for thirty-three mass nouns that have
 * none, so it is stored now rather than derived.
 *
 * Down by 1,913: a principal part is one form and 2,029 entries carried two of
 * one, nearly all of them a second partitive plural (`aadresse` beside
 * `aadressisid`). Which of the pair the app used was decided by whoever read
 * the rows, since `stemsFrom` takes the first and every caller building a
 * record with `Object.fromEntries` takes the last. Ekilex lists the primary
 * first, and that is now the one kept.
 *
 * The one word after that is `või`, which is butter in the food unit and the
 * conjunction "or" in the connectives unit, and had been left out of the second
 * because Ekilex's first candidate for it is the butter. It is pinned by word
 * id now, like every other homonym the course names.
 *
 * The 854 forms after that are the ones no rule of this app can reach, which
 * the exception lists of `conjugate.ts` and `derive.ts` had been describing
 * without anybody reading them as a list of what a keyless deployment cannot
 * say. `olema` showed `olen` and stopped; no verb at all could answer
 * `lihtminevik · ta`, because the simple past is not derivable; no verb had a
 * polite imperative, which is the form a learner is addressed with at every
 * counter in the country; and a pronoun had none of the short forms anybody
 * uses, so its unit shipped with no case cards rather than teach `minule` and
 * mark `mulle` wrong. See `unreachableSlots` and `unreachableCaseForms`, which
 * are asked rather than listed beside, because a list of exceptions kept next
 * to the exceptions is two copies of one fact.
 *
 * The fifteen after that are the words `npm run eval:scene` watched a model
 * reach for and the course could not vouch for, and they moved the count by
 * eight rather than fifteen because seven of them were already in the built
 * expansion and only needed teaching. They are the verbs a transaction turns
 * on, which is the shape of the gap: the course had `valu` and `haige` and no
 * `valutama`, a unit on housing and no `katki`, and no way at all to ask
 * whether a time suits you. Each went to the unit whose subject it is.
 */
export const SEED_SET_SIZE = { words: 6_110, forms: 39_421 };
