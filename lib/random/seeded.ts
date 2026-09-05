/**
 * A seeded generator, so a draw is reproducible.
 *
 * mulberry32, thirty lines shorter than pulling in a dependency and more than
 * good enough to shuffle a word list. The seed is hashed from a string so a
 * thing can be addressed by something a person can put in a URL.
 *
 * IT LIVES HERE RATHER THAN BESIDE ITS FIRST CALLER because a second copy is
 * how two of them stop agreeing. `lib/exam/paper.ts` wrote it first, for the
 * reason its own header gives: the client never sends a mark, only a level, a
 * seed and its answers, so the server rebuilds the paper from that seed to mark
 * it (ADR-022). `lib/scenes/` needs exactly the same property for exactly the
 * same reason, since a reload in the middle of a conversation has to give back
 * the same conversation and the server re-marks a finished run from its seed.
 *
 * What may never change is the sequence. Two features now address stored work
 * by a seed: a candidate who started a paper before a deploy and handed it in
 * after would be marked against a different paper, and a learner who reloaded
 * a scene would find a different card in their hand. So this is the one
 * function in the app where "an equivalent generator" is not equivalent.
 *
 * Pure: takes a number, returns a function.
 */
export function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The same generator with the constant added once before the first call.
 *
 * A SECOND SEQUENCE, KEPT BECAUSE SOMETHING IS ADDRESSED BY IT. This is the
 * crossword's, written out again in `lib/progress/crossword.ts` on the argument
 * that "a shared one would be shared state", which is not true of either of
 * these: both return a fresh closure and neither holds anything between calls.
 * What is true is that it is a different stream from `rng`, since it pre-adds
 * `0x6d2b79f5` and keeps its state signed, so `dayRng(n)` and `rng(n)` disagree
 * from the first number out.
 *
 * That is exactly what this file's own header warns a copy would do, and it is
 * why the fix is to move it here rather than to delete it: `recordCrossword`
 * rebuilds the day's puzzle from the date to mark it, the way `submitExam`
 * rebuilds a paper (ADR-022), so swapping the sequence would mark somebody
 * against a grid they were never given. Two sequences in one file, with the
 * difference written down, beats two in two files with nothing saying so.
 *
 * Nothing new should reach for this. It exists for the puzzle that already
 * uses it.
 */
export function dayRng(seed: number): () => number {
  let a = (seed + 0x6d2b79f5) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
