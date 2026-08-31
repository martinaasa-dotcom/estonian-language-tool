import { prisma } from "@/lib/db";
import { parseExamples, serialiseExamples } from "@/lib/dict/examples";
import { upsertLexemeWithForms } from "@/lib/dict/upsert";
import { isPrincipalFormType } from "@/lib/estonian/types";
import type { Patch } from "./model";

/**
 * Pushing an accepted change into the shared dictionary.
 *
 * "Very simple to accept and push through" is the requirement, and the risk it
 * carries is exactly the one the hand-edit path already guards: this writes to
 * reference data every learner sees. So the same three rules hold here, and
 * they hold *because* the button is one click rather than in spite of it.
 *
 * - **Only principal parts are ever written.** A form retrieved from Ekilex is
 *   authoritative and is never touched by a correction, which is what
 *   `upsertLexemeWithForms` enforces and what the form branch below repeats
 *   for the one-field case.
 * - **An example is only ever removed, never rewritten.** Dropping a
 *   misleading sentence is a judgement about which attested sentence to show;
 *   editing one would be this app writing Estonian, which it may not do.
 * - **The edit is attributed to the reviewer**, not to the person who
 *   suggested it. `editedBy` answers "who is answerable for what the
 *   dictionary now says", and the answer is whoever pressed the button.
 *
 * What it deliberately does not do is rewrite anybody's cards. The hand-edit
 * path rewrites the editor's own, on the argument that reaching into a
 * stranger's deck is not a correction they asked for. That argument is
 * stronger here, not weaker: a reviewer accepting a stranger's report has no
 * business rewriting a third party's cards.
 */
export type ApplyOutcome =
  | { ok: true; changed: true; lexemeId: string; summary: string }
  | { ok: true; changed: false; summary: string }
  | { ok: false; error: string };

export async function applyPatch(patch: Patch | null, reviewerId: string): Promise<ApplyOutcome> {
  if (!patch) {
    return {
      ok: true,
      changed: false,
      summary: "Nothing to apply automatically. This one is a report for a person to act on.",
    };
  }

  switch (patch.kind) {
    case "CREATE_WORD": {
      const written = await upsertLexemeWithForms({
        lemma: patch.lemma,
        translation: patch.translation,
        pos: patch.pos,
        forms: patch.forms,
        editedBy: reviewerId,
      });
      return {
        ok: true,
        changed: true,
        lexemeId: written.id,
        summary: written.previous
          ? `The dictionary already had ${patch.lemma}, so this updated it.`
          : `Added ${patch.lemma} to the dictionary.`,
      };
    }

    case "SET_TRANSLATION": {
      const lexeme = await prisma.lexeme.findUnique({ where: { id: patch.lexemeId } });
      if (!lexeme) return { ok: false, error: "That entry is no longer in the dictionary." };
      await prisma.lexeme.update({
        where: { id: lexeme.id },
        data: { translation: patch.translation, editedBy: reviewerId, editedAt: new Date() },
      });
      return {
        ok: true,
        changed: true,
        lexemeId: lexeme.id,
        summary: `${lexeme.lemma} now reads "${patch.translation}".`,
      };
    }

    case "SET_FORM": {
      /*
        The one field case, and the one that has to be refused rather than
        clamped. A form type outside the principal parts is a request to
        overwrite a retrieved Ekilex form, and quietly writing it somewhere
        else would be worse than saying no.
      */
      if (!isPrincipalFormType(patch.formType)) {
        return {
          ok: false,
          error:
            `${patch.formType} is not one of the principal parts. Only those are ours to change; ` +
            `the rest of the forms come from Ekilex and are left as they are.`,
        };
      }
      const lexeme = await prisma.lexeme.findUnique({ where: { id: patch.lexemeId } });
      if (!lexeme) return { ok: false, error: "That entry is no longer in the dictionary." };

      await prisma.form.deleteMany({ where: { lexemeId: lexeme.id, formType: patch.formType } });
      await prisma.form.create({
        data: { lexemeId: lexeme.id, formType: patch.formType, value: patch.value, isPrincipal: true },
      });
      await prisma.lexeme.update({
        where: { id: lexeme.id },
        data: { editedBy: reviewerId, editedAt: new Date() },
      });
      return {
        ok: true,
        changed: true,
        lexemeId: lexeme.id,
        summary: `${lexeme.lemma}: ${patch.formType} is now ${patch.value}.`,
      };
    }

    case "DROP_EXAMPLE": {
      const lexeme = await prisma.lexeme.findUnique({ where: { id: patch.lexemeId } });
      if (!lexeme) return { ok: false, error: "That entry is no longer in the dictionary." };
      const examples = parseExamples(lexeme.examples);
      const kept = examples.filter((e) => e.et.trim() !== patch.sentence.trim());
      if (kept.length === examples.length) {
        return { ok: false, error: "That sentence is no longer on the entry, so there is nothing to remove." };
      }
      await prisma.lexeme.update({
        where: { id: lexeme.id },
        data: { examples: serialiseExamples(kept), editedBy: reviewerId, editedAt: new Date() },
      });
      return {
        ok: true,
        changed: true,
        lexemeId: lexeme.id,
        summary: `Removed one example from ${lexeme.lemma}.`,
      };
    }
  }
}
