import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { serialiseExamples } from "@/lib/dict/examples";
import { applyPatch } from "./apply";

/**
 * Accepting a suggestion writes to the dictionary every learner reads, so the
 * guards on that write are worth stating against a real database rather than
 * against a mock of one.
 *
 * Three of these are the shape of a fault this project has already paid for
 * once on the hand-edit path: a correction that deleted a retrieved Ekilex
 * paradigm, a correction that relabelled where an entry came from, and a
 * correction that reached into somebody else's deck. The queue is a second
 * door onto the same room, and a door with different locks on it is a door.
 */

const LEMMA = "itest-suggest-tuba";
const REVIEWER = "itest-reviewer";
const LEARNER = "itest-suggest-learner";

async function wipe() {
  const lexemes = await prisma.lexeme.findMany({
    where: { lemma: { in: [LEMMA, "itest-suggest-uus"] } },
    select: { id: true },
  });
  const ids = lexemes.map((l) => l.id);
  if (ids.length) {
    await prisma.card.deleteMany({ where: { lexemeId: { in: ids } } });
    await prisma.form.deleteMany({ where: { lexemeId: { in: ids } } });
    await prisma.lexeme.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.card.deleteMany({ where: { ownerId: LEARNER } });
  await prisma.suggestion.deleteMany({ where: { ownerId: { in: [LEARNER, REVIEWER] } } });
}

async function seedWord() {
  return prisma.lexeme.create({
    data: {
      lemma: LEMMA, pos: "NOUN", translation: "room", provenance: "EKILEX",
      examples: serialiseExamples([
        { et: "Tuba on suur.", en: "The room is big.", source: "EKILEX" },
        { et: "Toas on soe.", en: "It is warm in the room.", source: "EKILEX" },
      ]),
      forms: {
        create: [
          { formType: "NOM_SG", value: "tuba" },
          { formType: "GEN_SG", value: "toa" },
          { formType: "EKILEX:SgIn", value: "toas", morphCode: "SgIn", isPrincipal: false },
        ],
      },
    },
  });
}

beforeEach(wipe);
afterAll(async () => { await wipe(); await prisma.$disconnect(); });

describe("accepting a correction to a meaning", () => {
  it("rewrites the gloss and attributes it to whoever accepted it", async () => {
    const lexeme = await seedWord();
    const outcome = await applyPatch(
      { kind: "SET_TRANSLATION", lexemeId: lexeme.id, translation: "room, chamber" },
      REVIEWER,
    );
    expect(outcome.ok).toBe(true);

    const after = await prisma.lexeme.findUniqueOrThrow({ where: { id: lexeme.id } });
    expect(after.translation).toBe("room, chamber");
    expect(after.editedBy).toBe(REVIEWER);
  });

  it("does not reach into anybody's deck", async () => {
    const lexeme = await seedWord();
    await prisma.card.create({
      data: { ownerId: LEARNER, lexemeId: lexeme.id, cardType: "RECOGNITION", front: "tuba", back: "room" },
    });

    await applyPatch({ kind: "SET_TRANSLATION", lexemeId: lexeme.id, translation: "chamber" }, REVIEWER);

    /*
      The hand-edit path rewrites the editor's own cards and deliberately
      nobody else's. A reviewer accepting a stranger's report has less claim
      still: the card belongs to a third person who did not ask.
    */
    const card = await prisma.card.findFirstOrThrow({ where: { ownerId: LEARNER, lexemeId: lexeme.id } });
    expect(card.back).toBe("room");
  });
});

describe("accepting a correction to a form", () => {
  it("replaces the principal part and leaves the retrieved paradigm alone", async () => {
    const lexeme = await seedWord();
    const outcome = await applyPatch(
      { kind: "SET_FORM", lexemeId: lexeme.id, formType: "GEN_SG", value: "toaa" },
      REVIEWER,
    );
    expect(outcome.ok).toBe(true);

    const forms = await prisma.form.findMany({ where: { lexemeId: lexeme.id } });
    expect(forms.filter((f) => f.formType === "GEN_SG").map((f) => f.value)).toEqual(["toaa"]);
    // The one thing on an entry that cannot be reconstructed.
    expect(forms.some((f) => f.morphCode === "SgIn" && f.value === "toas")).toBe(true);
  });

  /*
    THE GUARD THAT MATTERS. Everything outside the principal parts came from
    Ekilex and is authoritative. A proposal naming one of those forms is
    refused rather than written somewhere else, because a queue that quietly
    redirects a change is worse than one that says no.
  */
  it("refuses a form that is not ours to change", async () => {
    const lexeme = await seedWord();
    const outcome = await applyPatch(
      { kind: "SET_FORM", lexemeId: lexeme.id, formType: "EKILEX:SgIn", value: "toass" },
      REVIEWER,
    );
    expect(outcome.ok).toBe(false);

    const forms = await prisma.form.findMany({ where: { lexemeId: lexeme.id } });
    expect(forms.find((f) => f.morphCode === "SgIn")?.value).toBe("toas");
  });
});

describe("accepting a report about an example", () => {
  it("removes that sentence and keeps the rest", async () => {
    const lexeme = await seedWord();
    const outcome = await applyPatch(
      { kind: "DROP_EXAMPLE", lexemeId: lexeme.id, sentence: "Tuba on suur." },
      REVIEWER,
    );
    expect(outcome.ok).toBe(true);

    const after = await prisma.lexeme.findUniqueOrThrow({ where: { id: lexeme.id } });
    expect(after.examples).toContain("Toas on soe.");
    expect(after.examples).not.toContain("Tuba on suur.");
  });

  it("says so when the sentence has already gone", async () => {
    const lexeme = await seedWord();
    const outcome = await applyPatch(
      { kind: "DROP_EXAMPLE", lexemeId: lexeme.id, sentence: "Ei ole siin." },
      REVIEWER,
    );
    expect(outcome).toMatchObject({ ok: false });
  });
});

describe("accepting a missing word", () => {
  it("creates the entry with its principal parts", async () => {
    const outcome = await applyPatch(
      {
        kind: "CREATE_WORD", lemma: "itest-suggest-uus", pos: "NOUN", translation: "new thing",
        forms: { NOM_SG: "uus", GEN_SG: "uue" },
      },
      REVIEWER,
    );
    expect(outcome).toMatchObject({ ok: true, changed: true });

    const created = await prisma.lexeme.findFirstOrThrow({
      where: { lemma: "itest-suggest-uus" },
      include: { forms: true },
    });
    expect(created.translation).toBe("new thing");
    expect(created.editedBy).toBe(REVIEWER);
    expect(created.forms.map((f) => f.formType).sort()).toEqual(["GEN_SG", "NOM_SG"]);
  });

  /*
    An entry Ekilex supplied stays marked as Ekilex's after a correction.
    Relabelling it USER would discard where the paradigm came from, which is
    the fact the whole provenance column exists to carry.
  */
  it("never relabels where an existing entry came from", async () => {
    const lexeme = await seedWord();
    await applyPatch(
      { kind: "CREATE_WORD", lemma: LEMMA, pos: "NOUN", translation: "room", forms: {} },
      REVIEWER,
    );
    const after = await prisma.lexeme.findUniqueOrThrow({ where: { id: lexeme.id } });
    expect(after.provenance).toBe("EKILEX");
  });
});

describe("a report with nothing to apply", () => {
  it("changes nothing and says why", async () => {
    const outcome = await applyPatch(null, REVIEWER);
    expect(outcome).toMatchObject({ ok: true, changed: false });
  });
});
