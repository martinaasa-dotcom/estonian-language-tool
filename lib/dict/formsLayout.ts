/**
 * WHERE THE FORMS LIST LIVES ON DISK, SHARED BY THE WRITER AND THE READER.
 *
 * `scripts/build-forms.ts` writes it and `lib/dict/forms.ts` reads it, and
 * the one thing that must not drift between them is how a form finds its
 * shard. Pure, so both can import it and a unit test can pin it.
 */

/** Under `prisma/data/forms/`. */
export const SHARD_DIR = "shards";
export const MANIFEST_FILE = "manifest.json";

/** The file holding every spelling of one length, for a game that ships its list. */
export function LENGTH_FILE(length: number): string {
  return `length-${length}.txt.gz`;
}

/**
 * How many letters of a form name its shard.
 *
 * Measured rather than chosen. Two letters is 552 files and a median shard of
 * 322 bytes, and the distribution is what decides it: `ka` is 698 KB, and
 * reading, decompressing and indexing it took 449 ms on a page's own render,
 * which is the miss path on the dictionary and so is exactly where somebody is
 * waiting. Three is 3,857 files, a median of 291 bytes and a worst case of
 * 170 KB, for the same 16 MB in the repository. Four would be smaller still
 * and is where the file count starts costing more than the read.
 */
const SHARD_DEPTH = 3;

/**
 * Which shard a *folded* form belongs to: its first three letters, with a
 * hyphen or anything else outside a to z written as an underscore so the key
 * is a filename. A shorter form gets a shorter key, which is why the reader
 * folds before it asks.
 */
export function shardKey(folded: string): string {
  return folded.slice(0, SHARD_DEPTH).replace(/[^a-z]/g, "_") || "_";
}
