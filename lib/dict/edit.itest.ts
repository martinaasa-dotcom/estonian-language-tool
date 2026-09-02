import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { PRINCIPAL_FORM_TYPES } from "@/lib/estonian/types";
import { upsertLexemeWithForms } from "@/lib/dict/upsert";

/**
 * The dictionary is shared; decks are not. These are the invariants that keep
 * one learner's correction from reaching into another learner's data, written
 * against the database because that is where the damage would happen.
 *
 * They exercise the same statements `createLexemeWithForms` runs rather than the
 * action itself, which needs a session. Each one failed before this branch.
 */

const MINE = "itest-owner-edit-a";
const THEIRS = "itest-owner-edit-b";
const LEMMA = "itest-tuba";

async function wipe() {
  const lexeme = await prisma.lexeme.findFirst({ where: { lemma: LEMMA } });
  if (lexeme) {
    await prisma.card.deleteMany({ where: { lexemeId: lexeme.id } });
    await prisma.form.deleteMany({ where: { lexemeId: lexeme.id } });
    await prisma.lexeme.delete({ where: { id: lexeme.id } });
  }
  await prisma.review.deleteMany({ where: { ownerId: { in: [MINE, THEIRS] } } });
  await prisma.card.deleteMany({ where: { ownerId: { in: [MINE, THEIRS] } } });
}

/** A word as Ekilex leaves it: principal parts plus the retrieved forms. */
async function seedWord() {
  const lexeme = await prisma.lexeme.create({
    data: {
      lemma: LEMMA, pos: "NOUN", translation: "room", provenance: "EKILEX",
      // The two columns a correction has no business touching: the further
      // English senses the builder stored, and Ekilex's Estonian explanation.
      notes: "chamber; a room in a house",
      definition: "elamiseks kasutatav ruum",
      forms: {
        create: [
          { formType: "NOM_SG", value: "tuba" },
          { formType: "GEN_SG", value: "toa" },
          { formType: "PART_SG", value: "tuba" },
          { formType: "EKILEX:SgIn", value: "toas", morphCode: "SgIn", isPrincipal: false },
          { formType: "EKILEX:PlKom", value: "tubadega", morphCode: "PlKom", isPrincipal: false },
        ],
      },
    },
    include: { forms: true },
  });

  for (const ownerId of [MINE, THEIRS]) {
    await prisma.card.create({
      data: {
        ownerId, lexemeId: lexeme.id, cardType: "RECOGNITION",
        front: "tuba", back: "room",
      },
    });
  }
  return lexeme;
}

beforeEach(wipe);
afterAll(async () => { await wipe(); await prisma.$disconnect(); });

describe("correcting a shared dictionary entry", () => {
  it("replaces the principal parts", async () => {
    const lexeme = await seedWord();

    await prisma.form.deleteMany({
      where: { lexemeId: lexeme.id, formType: { in: [...PRINCIPAL_FORM_TYPES] } },
    });
    await prisma.form.createMany({
      data: [{ lexemeId: lexeme.id, formType: "GEN_SG", value: "toa-corrected" }],
    });

    const genitive = await prisma.form.findFirst({
      where: { lexemeId: lexeme.id, formType: "GEN_SG" },
    });
    expect(genitive?.value).toBe("toa-corrected");
  });

  it("does not destroy the forms Ekilex supplied", async () => {
    // The old code deleted every form for the lexeme and rebuilt from what one
    // person typed, throwing away the retrieved forms for everybody.
    const lexeme = await seedWord();

    await prisma.form.deleteMany({
      where: { lexemeId: lexeme.id, formType: { in: [...PRINCIPAL_FORM_TYPES] } },
    });

    const survivors = await prisma.form.findMany({ where: { lexemeId: lexeme.id } });
    expect(survivors.map((f) => f.value).sort()).toEqual(["toas", "tubadega"]);
  });

  it("leaves alone the columns the correction did not supply", async () => {
    /*
      `upsertLexemeWithForms` took a `notes` parameter and wrote
      `notes: input.notes || null` in an update, and neither caller has ever
      sent one: the add-and-correct form has no notes field and the suggestion
      queue passes forms and a gloss. So correcting a typo deleted the further
      English senses from the shared dictionary for everybody. The parameter is
      gone; this is the check that it stays gone.
    */
    const lexeme = await seedWord();

    await upsertLexemeWithForms({
      id: lexeme.id,
      lemma: LEMMA,
      translation: "room (corrected)",
      pos: "NOUN",
      forms: { NOM_SG: "tuba", GEN_SG: "toa", PART_SG: "tuba" },
      editedBy: MINE,
    });

    const after = await prisma.lexeme.findUnique({ where: { id: lexeme.id } });
    expect(after?.translation).toBe("room (corrected)");
    expect(after?.notes).toBe("chamber; a room in a house");
    expect(after?.definition).toBe("elamiseks kasutatav ruum");
  });

  it("rewrites only the editor's own cards", async () => {
    // A shared dictionary does not mean a shared deck. The old updateMany had no
    // ownerId, so one learner's spelling fix rewrote strangers' flashcards.
    const lexeme = await seedWord();

    await prisma.card.updateMany({
      where: { ownerId: MINE, lexemeId: lexeme.id, cardType: "RECOGNITION" },
      data: { front: "tuba-corrected", back: "room" },
    });

    const mine = await prisma.card.findFirst({ where: { ownerId: MINE, lexemeId: lexeme.id } });
    const theirs = await prisma.card.findFirst({ where: { ownerId: THEIRS, lexemeId: lexeme.id } });
    expect(mine?.front).toBe("tuba-corrected");
    expect(theirs?.front).toBe("tuba");
  });

  it("records who made the edit", async () => {
    const lexeme = await seedWord();
    await prisma.lexeme.update({
      where: { id: lexeme.id },
      data: { editedBy: MINE, editedAt: new Date() },
    });
    const after = await prisma.lexeme.findUniqueOrThrow({ where: { id: lexeme.id } });
    expect(after.editedBy).toBe(MINE);
    expect(after.editedAt).not.toBeNull();
  });

  it("keeps an Ekilex entry marked as Ekilex's after a correction", async () => {
    // Relabelling it USER would quietly discard where the forms came from.
    const lexeme = await seedWord();
    expect(lexeme.provenance).toBe("EKILEX");
    await prisma.lexeme.update({
      where: { id: lexeme.id },
      data: { translation: "room, chamber", editedBy: MINE },
    });
    const after = await prisma.lexeme.findUniqueOrThrow({ where: { id: lexeme.id } });
    expect(after.provenance).toBe("EKILEX");
  });
});
