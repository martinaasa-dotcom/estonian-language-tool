import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { WORKED_FORMS } from "./prompt";

/**
 * Anu's worked examples, checked against the dictionary itself rather than
 * trusted because they were typed once.
 *
 * `lib/estonian/grammar.ts` holds no Estonian at all, and `scripts/test-invariants.ts`
 * asserts it. This file is the same guarantee for the other module that writes
 * about Estonian at length: `buildSystemPrompt` used to type its examples
 * straight into the template, and a wrong form there would have shipped to
 * every learner, at every level, in every single conversation, with nothing
 * ever re-checking it. `WORKED_FORMS` in `lib/tutor/prompt.ts` is now the one
 * place a claim is made, and this is where each one is checked against a real
 * stored `Form` row, the same standard `matchEstonianForm` holds a scanned
 * word to (ADR-021).
 */
describe("Anu's worked examples are real dictionary forms", () => {
  for (const [key, example] of Object.entries(WORKED_FORMS)) {
    it(`${key}: "${example.value}" is the stored ${example.formType} of "${example.lemma}"`, async () => {
      const row = await prisma.form.findFirst({
        where: {
          formType: example.formType,
          value: example.value,
          lexeme: { lemma: example.lemma },
        },
      });
      expect(row, `no stored ${example.formType} "${example.value}" for "${example.lemma}"`).toBeTruthy();
    });
  }

  it("the present 3sg the prompt derives from meeldima's stored 1sg still ends in -n to change", async () => {
    // buildSystemPrompt turns WORKED_FORMS.meeldin's value into "meeldib" by
    // replacing a trailing -n with -b. That derivation is only regular Estonian
    // grammar while the stored form it starts from actually ends in -n; this
    // guards the assumption itself, separately from the value being the right
    // word at all (checked above).
    expect(WORKED_FORMS.meeldin.value).toMatch(/n$/);
  });
});
