/**
 * ONE NUMBER PER DAY, AND THE DAYS EITHER SIDE OF IT LAND SOMEWHERE ELSE.
 *
 * Three things in this app pick one item out of an ordered pool by the date:
 * the word of the day's fallback, Sõnad's answer, and anything that comes
 * after them. All three want the same two properties. The same day gives the
 * same answer, so a reload does not change the puzzle and two people talking
 * about it are talking about one word. And *different* days give unrelated
 * answers, which is the half that is easy to get wrong.
 *
 * THE OBVIOUS HASH FAILS THE SECOND ONE COMPLETELY. `h = h * 31 + charCode` is
 * the string hash everybody writes, and consecutive day keys differ by one in
 * their last character, so consecutive hashes differ by one, so `hash % pool`
 * walks the pool one row at a time. Measured on Sõnad's B1 pool with that
 * hash, the first ten days of September were `lammas, laulja, laulma, leidma,
 * lemmik, lennuk, leping, lihtne, liiter`: a week of the letter L, in a game
 * whose whole appeal is that today is not yesterday. It is the `aberratsioon`
 * fault again, which is what the dictionary's suggestion row was rebuilt to
 * escape: an ordered list, an index that moves by one a day, and a row that
 * looks alive and is not.
 *
 * So the accumulator is finished with an avalanche, the integer mixing step
 * out of the usual 32-bit hashes: multiply by a large odd constant, xor the
 * high bits down over the low ones, and repeat. Flipping one bit of the input
 * then changes about half the bits of the output, which is exactly the
 * property "yesterday and today are unrelated" asks for.
 *
 * AND SPREADING IS STILL NOT THE SAME AS NOT REPEATING. A hash modulo a pool
 * is an independent draw each day, so it collides at the rate a birthday
 * problem says it should: over Sõnad's 477-word B1 pool, two of any twelve
 * consecutive days share an answer about one time in seven, and the first
 * sample taken after the avalanche landed had `rekord` twice inside a
 * fortnight. On a daily puzzle that reads as broken rather than as chance.
 *
 * So `dayIndex` is what a caller with a pool should use, and it is a walk
 * rather than a draw: the day's ordinal times a stride that is coprime with
 * the pool. Every element comes up once before any comes up twice, which is
 * 477 days at B1, and the stride is large so consecutive days are still far
 * apart. `dayHash` stays for the callers that are breaking a tie rather than
 * indexing a pool.
 *
 * Pure and deterministic, so it is `lib/random/`'s business rather than
 * `lib/time/`'s: this is not a fact about a day, it is a way of drawing from a
 * pool without a random number.
 */

/** A stable non-negative number for a day key, spread so neighbors are not neighbors. */
export function dayHash(day: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < day.length; i++) {
    h ^= day.charCodeAt(i);
    // FNV-1a's prime, as the shifts a 32-bit multiply is written with in JS.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) | 0;
  }
  return avalanche(h);
}

/**
 * The same, with a second string mixed in.
 *
 * For a caller that wants one draw per day *per something*: a learner's level,
 * a section of a page, a second puzzle on the same date. Two callers using the
 * bare day hash over two pools would otherwise take the same index in both,
 * which is not wrong and is a coincidence somebody will eventually notice.
 */
export function dayHashFor(day: string, salt: string): number {
  return avalanche(dayHash(day) ^ dayHash(salt) ^ 0x9e3779b9);
}

/** Mixes the high bits down over the low ones, twice, and drops the sign. */
function avalanche(input: number): number {
  let h = input | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) | 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) | 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * How many days a `YYYY-MM-DD` key is past the start of 1970.
 *
 * A number that goes up by one a day, which is what a walk needs and what a
 * hash deliberately destroys. Parsed rather than handed to `Date` as a string,
 * because a bare date string is UTC in some engines and local in others and
 * this has to give one answer everywhere.
 */
export function dayOrdinal(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return 0;
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/**
 * Which element of a pool of `size` belongs to this day.
 *
 * A stride walk rather than a draw, so nothing repeats until everything has
 * been used: `STRIDE` is prime, so it is coprime with every pool this app will
 * ever have and the walk therefore visits all of it.
 *
 * THE OFFSET IS THE SALT'S AND NEVER THE DAY'S, which is the one line that
 * decides whether any of this works. The first version added
 * `dayHashFor(day, salt)`, which varies daily, so the whole thing collapsed
 * back into a hash and repeated 27 elements out of 47 in a 47-day sample. The
 * salt alone means two callers over one pool start in two places and stay a
 * fixed distance apart, which is all the separation they need.
 */
export function dayIndex(day: string, salt: string, size: number): number {
  if (size <= 0) return 0;
  const offset = dayHash(salt) % size;
  return (((dayOrdinal(day) * STRIDE) % size) + offset) % size;
}

/**
 * A prime, and a large one relative to any pool here, so consecutive days are
 * far apart as well as never repeating. 7919 is the thousandth prime, which is
 * not a reason and is how it was chosen.
 */
const STRIDE = 7919;
