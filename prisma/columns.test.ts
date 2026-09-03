import { readFileSync } from "node:fs";

import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { LEXEME_COLUMNS, MANAGED_COLUMNS, PRESERVED_COLUMNS } from "./columns";

/**
 * The seed writes the dictionary with hand-written SQL, which names its columns
 * as strings. These check that table of names against the schema Prisma actually
 * generated, so a renamed or added column fails here — in a two-second unit test
 * — rather than at the point in a deploy where the seed is the only thing
 * standing between a new database and an empty dictionary.
 */
const lexeme = Prisma.dmmf.datamodel.models.find((m) => m.name === "Lexeme")!;
const scalars = lexeme.fields.filter((f) => f.kind !== "object").map((f) => f.name);

describe("the seed's Lexeme columns", () => {
  it("names only columns that exist", () => {
    const named = [...LEXEME_COLUMNS.map((c) => c.name), ...PRESERVED_COLUMNS, ...MANAGED_COLUMNS];
    expect(scalars).toEqual(expect.arrayContaining(named));
  });

  it("accounts for every column on the model", () => {
    // A new column is neither seeded nor preserved until someone says which it
    // is. That decision is the point of this test: a column left out of both
    // lists gets the seed's silence by accident rather than on purpose.
    const accounted = new Set<string>([
      ...LEXEME_COLUMNS.map((c) => c.name),
      ...PRESERVED_COLUMNS,
      ...MANAGED_COLUMNS,
    ]);
    expect(scalars.filter((name) => !accounted.has(name))).toEqual([]);
  });

  it("leaves the conflict key out of the update", () => {
    // `ON CONFLICT (lemma, pos)` matched on these, so rewriting them is at best
    // a no-op and at worst a way to lose the row you meant to update.
    const reseeded = LEXEME_COLUMNS.filter((c) => c.reseeded).map((c) => c.name);
    expect(reseeded).not.toContain("lemma");
    expect(reseeded).not.toContain("pos");
  });

  it("keeps the Ekilex cache and the learner's own writing out of the seed's reach", () => {
    const written = LEXEME_COLUMNS.map((c) => c.name);
    for (const preserved of PRESERVED_COLUMNS) expect(written).not.toContain(preserved);
  });

  it("never overwrites example sentences on a reseed", () => {
    // `examples` is the one column the seed fills on insert and must never touch
    // on update. A new database needs the attested sentences the harvest
    // brought back, or gap-fill, dictation and sentence-building all open empty.
    // An existing row's sentences, though, may have come from the live Ekilex
    // cache or from a learner typing one in from class, and a reseed that
    // rewrote them would quietly destroy both.
    const examples = LEXEME_COLUMNS.find((c) => c.name === "examples");
    expect(examples, "the seed should write examples on insert").toBeTruthy();
    expect(examples?.reseeded, "examples must stay out of the DO UPDATE SET").toBe(false);
  });

  it("casts every nullable column", () => {
    // Postgres cannot infer a parameter's type from a column that is null in
    // every row of the VALUES list, so a nullable column without a cast is a
    // seed that fails on whichever batch happens to be all-null.
    for (const column of LEXEME_COLUMNS) {
      const field = lexeme.fields.find((f) => f.name === column.name)!;
      if (!field.isRequired) expect(column.cast, `${column.name} needs a cast`).toBeTruthy();
    }
  });
});

/**
 * THE DICTIONARY HAS TWO WRITERS AND THEY COVER DIFFERENT HALVES OF IT.
 *
 * `LEXEME_COLUMNS` above drives the seed's bulk upsert, which writes the 1,422
 * words the course harvest brought back. `prisma/expanded.ts` is the other one,
 * a raw insert with its own hand-written column list, and it writes the 4,612
 * the Wiktionary expansion adds. A column added to one of them is written for
 * about a fifth of the dictionary.
 *
 * That is not hypothetical and it is invisible without a database in front of
 * you: `semanticTypes` was added to the table above, every check passed, and
 * `politsei` came out of a fresh seed with no classification at all, because it
 * is not a course word. On screen that reads as a word the Institute never
 * typed rather than as a column nobody wrote.
 *
 * So the check is against the data file rather than against either list: every
 * key an entry in `expanded.json` carries that names a `Lexeme` column has to
 * appear in that insert.
 */
describe("the built dictionary's own writer", () => {
  const source = readFileSync("prisma/expanded.ts", "utf8");
  const entry = (JSON.parse(readFileSync("prisma/data/expanded.json", "utf8")) as
    Record<string, unknown>[])[0]!;

  /*
    The insert's own column list, read out of the statement rather than out of
    the file. A comment naming a column is not a column being written, which is
    the trap every check in this repository has fallen into at least once: the
    first version of this passed with the column deleted, because the paragraph
    explaining why it mattered still mentioned it by name.
  */
  const written = new Set(
    (source.match(/INSERT INTO "Lexeme" \(([^)]*)\)/)?.[1] ?? "")
      .split(",")
      .map((name) => name.trim().replace(/^"|"$/g, ""))
      .filter(Boolean),
  );

  it("has a column list at all", () => {
    expect(written.size, "the insert into Lexeme could not be found").toBeGreaterThan(5);
  });

  it("writes every column the built dictionary carries", () => {
    const columns = new Set(scalars);
    const carried = Object.keys(entry).filter((key) => columns.has(key));
    expect(carried.length, "expanded.json stopped carrying any Lexeme column").toBeGreaterThan(5);
    for (const column of carried) {
      expect(
        written.has(column),
        `prisma/expanded.ts does not write ${column}, so the built dictionary ships without it`,
      ).toBe(true);
    }
  });
});
