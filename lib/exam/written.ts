/**
 * The two things a machine may decide about a piece of writing.
 *
 * How long it is, and whether it used the words the task named. That is the
 * whole of what `lib/exam/score.ts` settles about a message or a composition,
 * because nothing else can be settled without a model deciding whether somebody's
 * Estonian is correct, and no model decides a mark here (ADR-022).
 *
 * SPLIT OUT OF THE MARKER SO THE EXAM SCREEN CAN SHOW IT LIVE. The screen ticks
 * each required word off as it is used and fills a length meter as the answer
 * grows, and both have to agree with the marking exactly: a chip that lit up on
 * a rule of its own would be promising a mark the server was not going to give.
 * It lives here rather than being exported from the marker because the sitting
 * screen may not import the marker at all, which is the invariant that stops a
 * client marking its own paper, and one convenience import is exactly how a rule
 * like that gets softened.
 *
 * Pure: no React, no Prisma, no clock, no provider.
 */

/** Splits a written answer the way the marking counts it. */
export function wordsOf(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/**
 * Whether a written answer used one of the words it was asked to use.
 *
 * A required word counts when its headword appears. Estonian inflects, so a
 * prefix match on the stem is the fair test: `raamatust` is `raamat` used.
 */
export function usesRequiredWord(lemma: string, text: string): boolean {
  const stem = lemma.toLocaleLowerCase("et");
  if (!stem) return false;
  const needle = stem.slice(0, Math.max(3, stem.length - 1));
  return wordsOf(text).some((word) =>
    word.toLocaleLowerCase("et").replace(/[^\p{L}\p{M}]/gu, "").startsWith(needle));
}
