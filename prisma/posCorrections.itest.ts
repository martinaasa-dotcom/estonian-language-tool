import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

import { applyPosCorrections } from "./expanded";

/**
 * A corrected label has to reach a database that was seeded before the
 * correction existed, and `pos` is half of `Lexeme`'s conflict key.
 *
 * That is the whole reason this file exists. `writeExpanded` inserts with `ON
 * CONFLICT (lemma, pos) DO NOTHING`, so once the built file calls `kallis` an
 * adjective it no longer matches the `kallis` NOUN an older deployment is
 * holding: the insert sees no conflict and puts a second `kallis` in the
 * dictionary, with its own id, its own forms and its own cards. Nothing
 * fails, nothing is logged, and the word is simply in there twice.
 *
 * Written against the database because a unit test cannot see a conflict key.
 */

const LEMMA = "itest-pos-kallis";
const OCCUPIED = "itest-pos-oma";
const EDITED = "itest-pos-hand";
const LEMMAS = [LEMMA, OCCUPIED, EDITED];

/** The corrections file's shape, as `audit-pos.ts --write` records it. */
const CORRECTIONS = [
  { lemma: LEMMA, from: "NOUN", to: "ADJECTIVE" },
  { lemma: OCCUPIED, from: "NOUN", to: "ADJECTIVE" },
  { lemma: EDITED, from: "NOUN", to: "ADJECTIVE" },
];

async function wipe() {
  const rows = await prisma.lexeme.findMany({ where: { lemma: { in: LEMMAS } }, select: { id: true } });
  const ids = rows.map((r) => r.id);
  if (ids.length) {
    await prisma.card.deleteMany({ where: { lexemeId: { in: ids } } });
    await prisma.form.deleteMany({ where: { lexemeId: { in: ids } } });
    await prisma.lexeme.deleteMany({ where: { id: { in: ids } } });
  }
}

/**
 * `applyPosCorrections` reads the real corrections file, so these tests drive
 * the same statement over a list they control. The file itself is covered by
 * the invariant suite, which checks every correction in it against the built
 * dictionary.
 */
async function apply(list: typeof CORRECTIONS): Promise<number> {
  const { Prisma } = await import("@prisma/client");
  const rows = list.map((c) => Prisma.sql`(${c.lemma}, ${c.from}, ${c.to})`);
  return prisma.$executeRaw`
    UPDATE "Lexeme" AS l
    SET pos = c.to_pos, "updatedAt" = NOW()
    FROM (VALUES ${Prisma.join(rows)}) AS c(lemma, from_pos, to_pos)
    WHERE l.lemma = c.lemma
      AND l.pos = c.from_pos
      AND l."editedBy" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "Lexeme" x WHERE x.lemma = c.lemma AND x.pos = c.to_pos
      )
  `;
}

beforeEach(wipe);
afterAll(async () => {
  await wipe();
  await prisma.$disconnect();
});

describe("applyPosCorrections", () => {
  it("moves an existing row onto the corrected label instead of leaving a duplicate", async () => {
    const before = await prisma.lexeme.create({
      data: { lemma: LEMMA, pos: "NOUN", translation: "expensive", provenance: "EKILEX" },
    });

    expect(await apply([CORRECTIONS[0]!])).toBe(1);

    const rows = await prisma.lexeme.findMany({ where: { lemma: LEMMA } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.pos).toBe("ADJECTIVE");
    // The same row, so every card and review already pointing at it still does.
    expect(rows[0]?.id).toBe(before.id);
  });

  it("keeps the entry's own content, having only moved the label", async () => {
    await prisma.lexeme.create({
      data: {
        lemma: LEMMA, pos: "NOUN", translation: "expensive", cefr: "A1",
        provenance: "EKILEX", ekilexWordId: 4242, examples: '[{"et":"kallis raamat","en":null}]',
      },
    });

    await apply([CORRECTIONS[0]!]);

    const row = await prisma.lexeme.findFirstOrThrow({ where: { lemma: LEMMA } });
    expect(row.translation).toBe("expensive");
    expect(row.cefr).toBe("A1");
    expect(row.provenance).toBe("EKILEX");
    expect(row.ekilexWordId).toBe(4242);
    expect(row.examples).toContain("kallis raamat");
  });

  it("never overwrites a label somebody corrected by hand", async () => {
    /*
      The dictionary is shared, so an edit is everybody's — which is exactly why
      a reseed must not walk over one. A learner who moved this word themselves
      keeps their answer and their attribution.
    */
    await prisma.lexeme.create({
      data: {
        lemma: EDITED, pos: "NOUN", translation: "hand-held",
        provenance: "EKILEX", editedBy: "itest-someone", editedAt: new Date(),
      },
    });

    expect(await apply([CORRECTIONS[2]!])).toBe(0);
    const row = await prisma.lexeme.findFirstOrThrow({ where: { lemma: EDITED } });
    expect(row.pos).toBe("NOUN");
    expect(row.editedBy).toBe("itest-someone");
  });

  it("leaves both rows alone where the target label is already taken", async () => {
    /*
      `oma` and `asjatundja` are words a deployment can legitimately hold twice,
      once per part of speech. Moving the noun onto the adjective's key is a
      unique-constraint violation, and it would take the whole reseed with it.
    */
    await prisma.lexeme.create({
      data: { lemma: OCCUPIED, pos: "NOUN", translation: "property", provenance: "EKILEX" },
    });
    await prisma.lexeme.create({
      data: { lemma: OCCUPIED, pos: "ADJECTIVE", translation: "own", provenance: "EKILEX" },
    });

    expect(await apply([CORRECTIONS[1]!])).toBe(0);
    const rows = await prisma.lexeme.findMany({ where: { lemma: OCCUPIED }, orderBy: { pos: "asc" } });
    expect(rows.map((r) => r.pos)).toEqual(["ADJECTIVE", "NOUN"]);
  });

  it("changes nothing the second time", async () => {
    await prisma.lexeme.create({
      data: { lemma: LEMMA, pos: "NOUN", translation: "expensive", provenance: "EKILEX" },
    });

    expect(await apply([CORRECTIONS[0]!])).toBe(1);
    expect(await apply([CORRECTIONS[0]!])).toBe(0);
    expect(await prisma.lexeme.count({ where: { lemma: LEMMA } })).toBe(1);
  });

  it("reads the shipped corrections file without throwing", async () => {
    // The real entry point, over the real file, so a malformed ledger cannot
    // reach a deploy unnoticed.
    await expect(applyPosCorrections(prisma)).resolves.toBeGreaterThanOrEqual(0);
  });
});
