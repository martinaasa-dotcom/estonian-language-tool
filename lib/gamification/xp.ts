/**
 * XP and levels.
 *
 * The one rule that keeps this honest: **XP is derived, never stored.** It is a
 * pure function of the append-only review log, so it cannot drift out of sync
 * with what was actually studied, cannot be lost in a restore, and applies
 * retroactively to reviews done before this file existed. There is no column to
 * quietly increment, and therefore no way to award XP for something that did
 * not happen.
 *
 * The rating weighting is deliberate. A card you got wrong still earns XP —
 * less than a clean recall, but never zero. Zero XP for a lapse teaches people
 * to avoid hard cards, which is the exact opposite of what an SRS is for.
 */

export const XP_PER_RATING: Record<number, number> = {
  1: 4,  // Again — you turned up and found the gap. That is the work.
  2: 8,  // Hard
  3: 10, // Good
  4: 12, // Easy
};

/** XP for a single review at the given rating. */
export function xpForRating(rating: number): number {
  return XP_PER_RATING[rating] ?? 0;
}

/** Total XP for a tally of `{ rating: count }`. */
export function xpFromRatingCounts(counts: Record<number, number>): number {
  let total = 0;
  for (const [rating, count] of Object.entries(counts)) {
    total += xpForRating(Number(rating)) * count;
  }
  return total;
}

/**
 * Level titles, in Estonian with a gloss.
 *
 * They are flavor, not a CEFR claim — the app never pretends a level here says
 * anything about real proficiency, which is what the CEFR tags on words are for.
 */
export const LEVEL_TITLES: readonly { title: string; gloss: string }[] = [
  { title: "Alustaja", gloss: "beginner" },
  { title: "Uudishimulik", gloss: "curious" },
  { title: "Sõnakoguja", gloss: "word collector" },
  { title: "Käänaja", gloss: "case-bender" },
  { title: "Vestleja", gloss: "conversationalist" },
  { title: "Lugeja", gloss: "reader" },
  { title: "Jutuvestja", gloss: "storyteller" },
  { title: "Grammatik", gloss: "grammarian" },
  { title: "Keelemeister", gloss: "language master" },
  { title: "Kodukeelne", gloss: "at home in the language" },
];

/**
 * Total XP needed to *reach* a level. Quadratic, so early levels arrive quickly
 * and later ones take real work: 0, 250, 600, 1050, 1600, 2250, …
 */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  const n = level - 1;
  return 250 * n + 50 * n * (n - 1);
}

export interface LevelInfo {
  level: number;
  title: string;
  gloss: string;
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level spans. */
  span: number;
  /** XP still to go before the next level. */
  remaining: number;
  /** Progress through the current level, 0–100. */
  pct: number;
  totalXp: number;
}

/** Which level a total XP figure puts you at, and how far into it you are. */
export function levelFromXp(totalXp: number): LevelInfo {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  while (xpForLevel(level + 1) <= xp && level < 999) level++;

  const floor = xpForLevel(level);
  const ceiling = xpForLevel(level + 1);
  const span = ceiling - floor;
  const into = xp - floor;
  const titleIndex = Math.min(level - 1, LEVEL_TITLES.length - 1);
  const title = LEVEL_TITLES[titleIndex]!;

  return {
    level,
    title: title.title,
    gloss: title.gloss,
    into,
    span,
    remaining: Math.max(0, ceiling - xp),
    pct: span > 0 ? Math.min(100, Math.round((into / span) * 100)) : 100,
    totalXp: xp,
  };
}
