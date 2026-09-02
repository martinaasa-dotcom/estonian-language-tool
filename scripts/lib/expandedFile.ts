import { readFileSync, writeFileSync } from "node:fs";

/**
 * THE ONE WRITER OF `prisma/data/expanded.json`.
 *
 * Four scripts write that file: the builder, and the three audits that correct
 * a gloss, a part of speech and a nominative plural in place. Three of them
 * wrote it at `JSON.stringify(entries, null, 0)`, which is one line 3MB long,
 * and the file in the repository is at indent 1, which is one line per key.
 * Both are defensible and only one of them can be true, so what had actually
 * happened is that somebody reformatted the file by hand and the next full run
 * of any generator would have silently collapsed it again.
 *
 * That is worse than a style disagreement. This file is 5,363 dictionary
 * entries and the only way anybody reviews a change to it is by reading the
 * diff: at indent 1 a corrected gloss is one changed line, and at indent 0 it
 * is the whole file. A generator that reformats on the way past hides every
 * real change inside a rewrite of everything.
 *
 * So the format lives here rather than at four call sites, and
 * `scripts/test-invariants.ts` fails on a fifth writer that does not use it.
 */

export const EXPANDED_PATH = "prisma/data/expanded.json";

/**
 * One key per line. The size is the point: 1.2MB of whitespace buys a
 * reviewable diff over the app's whole dictionary, and nothing here is served
 * to a browser.
 */
const INDENT = 1;

export function readExpanded<T>(): T[] {
  return JSON.parse(readFileSync(EXPANDED_PATH, "utf8")) as T[];
}

export function writeExpanded(entries: readonly unknown[]): void {
  writeFileSync(EXPANDED_PATH, `${JSON.stringify(entries, null, INDENT)}\n`);
}
