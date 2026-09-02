import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { SEED_SET_SIZE } from "./seedSize";
import { NOUNS } from "@/prisma/data/nouns";
import { VERBS } from "@/prisma/data/verbs";
import { ADJECTIVES, PHRASES } from "@/prisma/data/other";
import { ADVANCED_ADJECTIVES, ADVANCED_NOUNS, ADVANCED_VERBS } from "@/prisma/data/advanced";
import { HARVESTED } from "@/prisma/data/harvested";
import { shippedDictionary } from "@/scripts/lib/dictionary";

/**
 * The seed is read here the way `prisma/seed.ts` reads it: the hand-typed
 * lists, then the harvest on top of them, then the built entries with
 * ON CONFLICT DO NOTHING, keyed on lemma and part of speech throughout.
 *
 * The JSON is read with `fs` rather than through `prisma/expanded.ts`, because
 * that module imports the Prisma client and the unit suite is hermetic.
 */
function countSeed(): { words: number; forms: number } {
  const forms = new Map<string, number>();
  const put = (lemma: string, pos: string, parts: readonly (string | null | undefined)[]) => {
    forms.set(`${lemma}|${pos}`, parts.filter(Boolean).length);
  };

  for (const [lemma, , , nomSg, genSg, partSg, partPl, genPl, illShort] of [...NOUNS, ...ADVANCED_NOUNS]) {
    put(lemma, "NOUN", [nomSg, genSg, partSg, illShort, partPl, genPl]);
  }
  for (const [lemma, , , infMa, infDa, pres1sg, past1sg, partTud] of [...VERBS, ...ADVANCED_VERBS]) {
    put(lemma, "VERB", [infMa, infDa, pres1sg, past1sg, partTud]);
  }
  for (const [lemma, , , nomSg, genSg, partSg] of [...ADJECTIVES, ...ADVANCED_ADJECTIVES]) {
    put(lemma, "ADJECTIVE", [nomSg, genSg, partSg]);
  }
  for (const [lemma] of PHRASES) put(lemma, "PHRASE", []);

  for (const word of HARVESTED) put(word.lemma, word.pos, Object.values(word.parts));

  const built: { lemma: string; pos: string; forms: unknown[] }[] =
    JSON.parse(readFileSync("prisma/data/expanded.json", "utf8"));
  for (const entry of built) {
    const key = `${entry.lemma}|${entry.pos}`;
    // ON CONFLICT DO NOTHING: an entry already written keeps the forms it has.
    if (!forms.has(key)) forms.set(key, entry.forms.length);
  }

  let total = 0;
  for (const n of forms.values()) total += n;
  return { words: forms.size, forms: total };
}

describe("the built-in dictionary's stated size", () => {
  it("is the size a fresh seed actually loads", () => {
    expect(countSeed()).toEqual(SEED_SET_SIZE);
  });

  /*
    And the assembly the scripts share agrees with the count above.

    `scripts/lib/dictionary.ts` reads the same six files for `measure-scenes`
    and `audit-senses`, and the first version of that reading did not dedupe on
    `(lemma, pos)` the way the seed does, so a word in two files was counted
    twice: the measurement reported 7,127 entries where the dictionary has
    6,083. Nothing caught it, because nothing compared the two.

    This is the comparison, and it is worth having in both directions: the
    counter above stays independent, so it can catch the assembly being wrong,
    and the assembly is pinned here, so it cannot drift from the number the
    landing page prints.
  */
  it("is the size the assembly the scripts share reports", () => {
    expect(shippedDictionary().length).toBe(SEED_SET_SIZE.words);
  });
});
