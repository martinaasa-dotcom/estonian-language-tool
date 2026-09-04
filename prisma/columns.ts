/**
 * Which columns of `Lexeme` the seed writes, and which it must keep its hands
 * off.
 *
 * This lives apart from `seed.ts` because the seed writes the dictionary with a
 * bulk `INSERT ... ON CONFLICT` rather than one Prisma upsert per entry (see the
 * comment on `write()` for why), and hand-written SQL names its columns as
 * strings. One ordered table is therefore the single source of the insert's
 * column list, its `VALUES` tuples and its `DO UPDATE SET` clause, so those
 * three can never drift apart — and `columns.test.ts` checks the table against
 * the real schema, so adding a column to `Lexeme` forces a decision here rather
 * than silently falling through.
 */

export interface SeedEntry {
  lemma: string;
  pos: string;
  translation: string;
  /**
   * The Institute's own Russian and Ukrainian equivalents, comma separated.
   *
   * Null where Ekilex records none, which most of the built expansion is: the
   * course harvest carries them and the Wiktionary-derived words do not, and
   * a screen that has none says so rather than pretending.
   */
  translationRu: string | null;
  translationUk: string | null;
  cefr: string;
  gradation: string;
  gradationNote: string | null;
  government: string | null;
  /**
   * Present only where the seed owns the note. Left off, an existing note
   * survives a reseed — the dictionary editor and the Ekilex lookup both write
   * this column, and reloading the built-in words must not erase their work.
   */
  notes?: string | null;
  /**
   * Ekilex's Estonian explanation, for the harvested words that carry one.
   *
   * Owned the same way and for the same reason: the live lookup writes this
   * column too, and a reseed must not erase a definition fetched for a word the
   * built-in set has none for.
   */
  definition?: string | null;
  /**
   * The Institute's semantic type codes for the word's primary sense.
   *
   * Reseeded like the gloss beside it and for the same reason: it comes from
   * Ekilex, nobody edits it by hand, and a reseed is how a corrected harvest
   * reaches a deployment that was seeded before this column existed. Null
   * where the Institute classifies nothing, which is a real answer and is what
   * `semanticGroup` reads as `UNKNOWN`.
   */
  semanticTypes: string | null;
  /**
   * `Lexeme.examples` JSON, for the harvested words that arrive with attested
   * sentences. Written on insert only — see the column's note below.
   */
  examples?: string;
  forms: { formType: string; value: string }[];
}

export interface SeedColumn {
  name: string;
  /**
   * Postgres cannot infer a parameter's type from a column that is null in
   * every row of a `VALUES` list, so the nullable ones say what they are.
   */
  cast?: string;
  value: (entry: SeedEntry) => string | null;
  /** Rewritten on a reseed. False for the conflict key, which cannot change. */
  reseeded: boolean;
  /**
   * Only written for entries whose payload carries this column's own key.
   *
   * Two columns need it now, so the test is the column's `name` rather than the
   * word `notes`: `prisma/seed.ts` groups the batch by which of these an entry
   * carries and writes each group with its own column list.
   */
  onlyWhenOwned?: boolean;
}

export const LEXEME_COLUMNS: SeedColumn[] = [
  { name: "lemma", value: (e) => e.lemma, reseeded: false },
  { name: "pos", value: (e) => e.pos, reseeded: false },
  { name: "translation", value: (e) => e.translation, reseeded: true },
  // Reseeded, like the English gloss beside them: they come from Ekilex and a
  // reseed is how a corrected harvest reaches an existing deployment. Nobody
  // edits these by hand, so there is no work to walk over.
  { name: "translationRu", cast: "text", value: (e) => e.translationRu, reseeded: true },
  { name: "translationUk", cast: "text", value: (e) => e.translationUk, reseeded: true },
  { name: "cefr", cast: "text", value: (e) => e.cefr, reseeded: true },
  { name: "gradation", value: (e) => e.gradation, reseeded: true },
  { name: "gradationNote", cast: "text", value: (e) => e.gradationNote, reseeded: true },
  { name: "government", cast: "text", value: (e) => e.government, reseeded: true },
  { name: "notes", cast: "text", value: (e) => e.notes ?? null, reseeded: true, onlyWhenOwned: true },
  { name: "definition", cast: "text", value: (e) => e.definition ?? null, reseeded: true, onlyWhenOwned: true },
  { name: "semanticTypes", cast: "text", value: (e) => e.semanticTypes, reseeded: true },
  // Insert-only, and the distinction matters. The built-in dictionary now ships
  // with the attested sentences the harvest brought back, so a brand-new
  // database has gap-fill, dictation and sentence-building on day one instead of
  // four empty modes. But `examples` is also written by the live Ekilex cache and
  // by a learner adding a sentence from class, and a reseed must not walk over
  // either — so this is never in the `DO UPDATE SET`. A new row gets its
  // sentences; an existing row keeps whatever it has grown since.
  { name: "examples", value: (e) => e.examples ?? "[]", reseeded: false },
];

/**
 * Columns the seed deliberately never writes. What is absent from the update
 * matters as much as what is in it: these belong to the Ekilex cache and to the
 * learner, and reloading the built-in words has no business overwriting them.
 *
 * `provenance` is here rather than in the table above because it is set once, on
 * insert, by the column default — a word the cache has since upgraded to
 * `EKILEX` must not be demoted back to `SEED` by a reseed.
 */
export const PRESERVED_COLUMNS = [
  "provenance", "ekilexWordId", "fetchedAt",
  // When Ekilex was last asked about this word and had nothing. Cache state,
  // like the two before it, and reloading the built-in words tells us nothing
  // new about what Ekilex holds. Clearing it here would put every word Ekilex
  // cannot answer for back into the re-ask loop this column exists to stop.
  "lookupMissAt",
  // Who corrected an entry by hand, and when. The dictionary is shared, so an
  // edit is everybody's — which is exactly why a reseed must not quietly erase
  // the record of who made it.
  "editedBy", "editedAt",
] as const;

/** Written by the database or by the statement itself, not from an entry. */
export const MANAGED_COLUMNS = ["id", "createdAt", "updatedAt"] as const;
