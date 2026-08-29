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
  /** Only written for entries whose payload carries a `notes` key. */
  onlyWhenOwned?: boolean;
}

export const LEXEME_COLUMNS: SeedColumn[] = [
  { name: "lemma", value: (e) => e.lemma, reseeded: false },
  { name: "pos", value: (e) => e.pos, reseeded: false },
  { name: "translation", value: (e) => e.translation, reseeded: true },
  { name: "cefr", cast: "text", value: (e) => e.cefr, reseeded: true },
  { name: "gradation", value: (e) => e.gradation, reseeded: true },
  { name: "gradationNote", cast: "text", value: (e) => e.gradationNote, reseeded: true },
  { name: "government", cast: "text", value: (e) => e.government, reseeded: true },
  { name: "notes", cast: "text", value: (e) => e.notes ?? null, reseeded: true, onlyWhenOwned: true },
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
  // Who corrected an entry by hand, and when. The dictionary is shared, so an
  // edit is everybody's — which is exactly why a reseed must not quietly erase
  // the record of who made it.
  "editedBy", "editedAt",
] as const;

/** Written by the database or by the statement itself, not from an entry. */
export const MANAGED_COLUMNS = ["id", "createdAt", "updatedAt"] as const;
