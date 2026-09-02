import { prisma } from "@/lib/db";
import { commonWords, type FrequencyGroup } from "@/lib/collections/frequency";
import { oneEntryPerLemma } from "@/lib/dict/search";

/**
 * The commonest words, with what the learner already has among them.
 *
 * `lib/collections/frequency.ts` is the order and holds nothing but a lemma, a
 * part of speech and a group, because a gloss copied into a generated table
 * goes stale the first time somebody corrects one. So this joins the ranking
 * to the dictionary and to the learner's own deck, which is the whole of the
 * module: two reads and no arithmetic.
 *
 * A word the dictionary does not have is dropped rather than shown greyed out.
 * That is not a hypothetical: a deployment seeded before the course harvest
 * holds a few hundred words, and a page listing four hundred with three
 * hundred crossed through is a page about this app rather than about Estonian.
 * The section says how many it found, so a short list says so out loud.
 */

export interface CommonEntry {
  lexemeId: string;
  lemma: string;
  pos: string;
  translation: string;
  cefr: string | null;
  /** Already in this learner's deck, so the button has nothing to add. */
  inDeck: boolean;
}

export interface CommonSection {
  group: FrequencyGroup;
  entries: CommonEntry[];
  /** How many of the group's words the dictionary could answer for. */
  found: number;
  /** How many of those are already in the deck. */
  kept: number;
}

const GROUPS: readonly FrequencyGroup[] = ["SMALL", "VERB", "NOUN", "ADJECTIVE"];

export async function commonSections(ownerId: string): Promise<CommonSection[]> {
  const wanted = GROUPS.flatMap((group) => commonWords(group).map((w) => w.lemma));

  /*
    One read for all four groups rather than one each. `@@unique` is on
    `(lemma, pos)`, so this can return more rows than there are words and
    `oneEntryPerLemma` settles which: the entry with a stated part of speech,
    a hand-written provenance and the most forms, which is `bySubstance`, the
    rule the search box itself leads with. Ordered because it is a set read
    that feeds a render.
  */
  const rows = await prisma.lexeme.findMany({
    where: { lemma: { in: wanted } },
    select: {
      id: true, lemma: true, pos: true, translation: true, cefr: true,
      provenance: true, gradationNote: true,
      forms: { select: { id: true } },
    },
    orderBy: [{ lemma: "asc" }, { id: "asc" }],
  });
  const byLemma = new Map(oneEntryPerLemma(rows, wanted).map((r) => [r.lemma, r]));

  const held = new Set(
    (await prisma.card.findMany({
      where: { ownerId, lexemeId: { in: [...byLemma.values()].map((r) => r.id) } },
      select: { lexemeId: true },
      distinct: ["lexemeId"],
    })).map((c) => c.lexemeId ?? ""),
  );

  return GROUPS.map((group) => {
    const entries = commonWords(group).flatMap((word) => {
      const row = byLemma.get(word.lemma);
      if (!row) return [];
      return [{
        lexemeId: row.id,
        lemma: row.lemma,
        pos: row.pos,
        translation: row.translation,
        cefr: row.cefr,
        inDeck: held.has(row.id),
      }];
    });
    return {
      group,
      entries,
      found: entries.length,
      kept: entries.filter((e) => e.inDeck).length,
    };
  });
}

/** The lemmas of one group, for the action that adds them. */
export function lemmasIn(group: FrequencyGroup): string[] {
  return commonWords(group).map((w) => w.lemma);
}
