/**
 * Which owner-scoped tables a backup deliberately leaves out, and why.
 *
 * Article 20 is a right to receive the personal data concerning you, and
 * /privacy says in as many words that nothing is held back. Keeping that true
 * needs a check that reads the schema rather than a list somebody typed, so
 * that a table added next year fails until a person decides about it. There is
 * one, in `scripts/test-invariants.ts`.
 *
 * IT HAD A HOLE THE EXACT SHAPE OF ITS OWN SKIP LIST. `UsageEvent` is a real
 * exclusion with a reason on the page. Three more had been appended beside it
 * — mock exam sittings, classes, class memberships — and appending to the skip
 * list is how you make that check pass without exporting anything. So the
 * feature that cannot be reconstructed from anything, a sat paper with the
 * learner's own composition in it, was absent from every backup and the
 * invariant said the backup was complete.
 *
 * This module is the fix, and the shape of it is the point: an exclusion has
 * to be written down here, in a sentence, next to the others. A bare model
 * name is not a decision, so the check refuses one — a reason is required and
 * has to be long enough to be an argument. The same rule this project applies
 * to its copy tests, where an allow list only stays honest while every entry
 * on it still has to earn its place.
 *
 * Nothing here is exempt from *deletion*. Erasure has no exclusions at all,
 * which is the other half of the check.
 */
export const NOT_EXPORTED: Readonly<Record<string, string>> = {
  UsageEvent:
    "This deployment's spending record, not the learner's work: which model was " +
    "asked, roughly how much text went in and out, and what it cost. It is kept to " +
    "enforce the daily cap, it is named on /privacy as the one thing an export does " +
    "not carry, and it is deleted with the account like everything else.",
};

/** True when this model may be absent from a backup, with a reason on file. */
export function exportExcluded(model: string): boolean {
  return Object.hasOwn(NOT_EXPORTED, model);
}
