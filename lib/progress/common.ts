import { prisma } from "@/lib/db";
import { commonWords, type FrequencyGroup } from "@/lib/collections/frequency";
import { COMMON_BATCH, COMMON_GROUP_KEYS } from "@/lib/collections/commonGroups";
import { availableCardTypes } from "@/lib/srs/cards";
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

/**
 * The dictionary entries behind one group's list, in the order the corpus put
 * them, for the round that asks about them.
 *
 * `@@unique` is on `(lemma, pos)`, so this can return more rows than the group
 * has words and `oneEntryPerLemma` settles which: the entry with a stated part
 * of speech, a hand-written provenance and the most forms. The same rule the
 * search box leads with, for the reason it is one function rather than two.
 */
export async function commonLexemeIds(group: FrequencyGroup): Promise<string[]> {
  const lemmas = commonWords(group).map((w) => w.lemma);
  const rows = await prisma.lexeme.findMany({
    where: { lemma: { in: lemmas } },
    select: {
      id: true, lemma: true, pos: true, provenance: true, gradationNote: true,
      forms: { select: { id: true } },
    },
    orderBy: [{ lemma: "asc" }, { id: "asc" }],
  });
  return oneEntryPerLemma(rows, lemmas).map((r) => r.id);
}

/** How many of each group the dictionary can answer for, and how many are held. */
export interface CommonCount {
  group: FrequencyGroup;
  /** Words of this group the dictionary has an entry for. */
  found: number;
  /** How many of those the learner already has a card for. */
  inDeck: number;
}

/**
 * The four counts, for the screens that offer the rounds.
 *
 * Two queries whatever the size of the deck, and no `examples` column, which is
 * the longest in the schema: this is a number under a button, not a list.
 */
export async function commonCounts(ownerId: string): Promise<CommonCount[]> {
  const wanted = COMMON_GROUP_KEYS.flatMap((group) => commonWords(group).map((w) => w.lemma));
  const rows = await prisma.lexeme.findMany({
    where: { lemma: { in: wanted } },
    select: {
      id: true, lemma: true, pos: true, provenance: true, gradationNote: true,
      forms: { select: { id: true } },
    },
    orderBy: [{ lemma: "asc" }, { id: "asc" }],
  });
  const byLemma = new Map(oneEntryPerLemma(rows, wanted).map((r) => [r.lemma, r.id]));

  /*
    Owner-scoped, so the `distinct` is bounded by this learner's own deck
    whatever it says: a `take` beside a `distinct` bounds nothing at all,
    because Prisma deduplicates in the client and emits no LIMIT.
  */
  const held = new Set(
    (await prisma.card.findMany({
      where: { ownerId, lexemeId: { in: [...byLemma.values()] } },
      select: { lexemeId: true },
      distinct: ["lexemeId"],
    })).map((c) => c.lexemeId ?? ""),
  );

  return COMMON_GROUP_KEYS.map((group) => {
    const ids = commonWords(group).flatMap((w) => {
      const id = byLemma.get(w.lemma);
      return id ? [id] : [];
    });
    return { group, found: ids.length, inDeck: ids.filter((id) => held.has(id)).length };
  });
}

/**
 * THE NEXT WORDS OF A GROUP THAT ARE NOT FINISHED YET.
 *
 * Finished means every card type the word can actually support has at least one
 * card behind it. That is `availableCardTypes`, which is the same function the
 * add-to-deck checklist asks, so a word is never counted as short of a card the
 * dictionary could not build for it: an adverb has no genitive stem and so no
 * case cards, and `ei` is finished at two.
 *
 * Comparing types rather than counting rows is what makes pressing twice
 * progress. A word added from the dictionary's list holds a recognition card
 * and a production card and is short of the rest; once the round has deepened
 * it, it drops out and the next twenty come forward. Counting rows instead
 * would leave a word that can only ever make two cards at the front of the
 * queue for ever.
 *
 * Returns lemmas rather than ids because `planLemmas` takes lemmas, and because
 * an id crossing an action boundary is a value the caller could choose.
 */
export async function nextCommonBatch(
  ownerId: string, group: FrequencyGroup, size = COMMON_BATCH,
): Promise<string[]> {
  const lemmas = commonWords(group).map((w) => w.lemma);
  const rows = await prisma.lexeme.findMany({
    where: { lemma: { in: lemmas } },
    select: {
      id: true, lemma: true, translation: true, pos: true, provenance: true,
      gradation: true, gradationNote: true, government: true, examples: true,
      // Which case cards the word can carry at all: see
      // lib/estonian/caseQuestion.ts.
      semanticTypes: true,
      forms: { select: { formType: true, value: true, morphCode: true } },
    },
    orderBy: [{ lemma: "asc" }, { id: "asc" }],
  });
  const entries = oneEntryPerLemma(rows, lemmas);
  if (entries.length === 0) return [];

  const heldTypes = new Map<string, Set<string>>();
  for (const card of await prisma.card.findMany({
    where: { ownerId, lexemeId: { in: entries.map((e) => e.id) } },
    select: { lexemeId: true, cardType: true },
  })) {
    const key = card.lexemeId ?? "";
    const seen = heldTypes.get(key) ?? new Set<string>();
    seen.add(card.cardType);
    heldTypes.set(key, seen);
  }

  const byLemma = new Map(entries.map((e) => [e.lemma, e]));
  const batch: string[] = [];
  // Walked in the corpus's own order rather than the query's, so the commonest
  // unfinished word is always the next one offered.
  for (const lemma of lemmas) {
    if (batch.length >= size) break;
    const entry = byLemma.get(lemma);
    if (!entry) continue;
    const held = heldTypes.get(entry.id) ?? new Set<string>();
    if (availableCardTypes(entry).every((type) => held.has(type))) continue;
    batch.push(lemma);
  }
  return batch;
}
