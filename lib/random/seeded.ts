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
