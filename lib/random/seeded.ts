/**
 * A seeded generator, so a draw is reproducible.
 *
 * mulberry32, which `lib/exam/paper.ts` and `lib/assessment/items.ts` each
 * carry a copy of and may not share, because both rebuild a marked instrument
 * from a seed and a change to how either draws would mis-mark a paper somebody
 * started before a deploy. This copy is for everything that is not a paper: a
 * scene run is a pure function of its seed for the same reason a paper is, a
 * reload mid-conversation has to give the same conversation back, and it is
 * held to the same rule, that the algorithm behind a stored seed does not
 * change under it.
 */
export function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One of `items`, by the generator. Undefined only on an empty list. */
export function pick<T>(items: readonly T[], random: () => number): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(random() * items.length)];
}
