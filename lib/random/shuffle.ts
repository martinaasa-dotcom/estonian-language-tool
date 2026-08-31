/**
 * One shuffle, because there were ten and they did not agree.
 *
 * Four copies in `app/` were Fisher-Yates, character for character the same
 * function four times. Four more in `lib/` were the same again with an rng
 * passed in. And two places did it with a comparator instead:
 *
 *     [...cards].sort(() => Math.random() - 0.5)
 *
 * which is not a shuffle. A comparator is asked about a pair and expected to
 * answer the same way every time; one that answers at random leaves the sort
 * finishing early over runs it thinks are already ordered, so an element tends
 * to stay near where it started. Measured over 200,000 rounds at the sizes the
 * app actually uses: in a 40-card sprint the first card led 7.0% of rounds
 * against a uniform 2.5%, and the first ten cards filled the first ten places
 * 39.5% of the time against 25%; in a 20-card listening round the first card
 * led 11.7% against 5.0%. The pool arrives `orderBy: { due: "asc" }`, so "the
 * first card" is the most overdue one: a learner doing sprint after sprint met
 * their most overdue word first about three times as often as chance, and the
 * tail of the pool was under-practised. Fisher-Yates measures flat.
 *
 * `random` is a parameter so a seeded caller can hand in its own generator and
 * a test can hand in a fixed one, which is what keeps this module hermetic and
 * what the four seeded copies needed. `Math.random` is the default because
 * most callers want a different round each time.
 *
 * The one shuffle not folded in here is `lib/exam/paper.ts`, and it says why:
 * the server rebuilds a paper from its seed to mark it, so changing how that
 * one draws would mis-mark a paper somebody started before a deploy and handed
 * in after it.
 */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const held = out[i]!;
    out[i] = out[j]!;
    out[j] = held;
  }
  return out;
}
