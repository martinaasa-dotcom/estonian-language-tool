/**
 * What two course words sharing one Ekilex sense tells you.
 *
 * The English gloss is the only authored column in the whole pipeline, which
 * makes it the only one no upstream source can be blamed for, and until now
 * nothing checked it. `audit:glosses` and `audit:pos` both read the built
 * expansion; the course harvest was checked by people reading definitions one
 * at a time, which is how `ehk` shipped glossed "or" when the sense it carries
 * is "perhaps".
 *
 * The evidence was already in `prisma/data/harvested.ts`. Every course word
 * stores `note`, which is Ekilex's own Estonian definition of the sense whose
 * forms, level and sentences that entry carries. Two words with the same
 * definition are, by the Institute's own account, one meaning, and that single
 * fact reads two ways:
 *
 *   - same meaning, same English gloss: a production card asks "English to
 *     Estonian" and has two right answers, so it marks one of them wrong. This
 *     is the illative fault in a different coat, and the course ships twelve.
 *   - same meaning, different English glosses: either a synonym pair somebody
 *     deliberately keeps apart, or a gloss written for a sense this entry does
 *     not carry. Only a person can tell which, so it is reported rather than
 *     judged.
 *
 * One definition of the rule, read by `scripts/audit-senses.ts` for a person
 * and by `senses.test.ts` for CI. Two copies of it is how the report and the
 * check start disagreeing about what a collision is.
 *
 * Pure: plain data in, plain data out. The caller supplies the words.
 */
import { sameMeaning } from "@/lib/questions/distractors";

/** A course word, as this module needs to see it. */
export interface SenseWord {
  readonly lemma: string;
  readonly pos: string;
  readonly gloss: string;
  /** Ekilex's own Estonian definition of the sense this entry carries. */
  readonly note: string | null;
  /** What Ekilex calls the word: s, v, adj, adv, konj, pron, num. */
  readonly ekilexPos: readonly string[];
}

export interface SensePair {
  readonly a: SenseWord;
  readonly b: SenseWord;
  /** The Ekilex definition both of them carry. */
  readonly sense: string;
}

/**
 * Which Ekilex word classes each of this course's six labels may stand for.
 *
 * The course has six labels and Ekilex has more, so some coarsening is
 * inevitable. What this table buys is that each one is written down and
 * therefore checkable, instead of being invisible the way it was while the
 * harvest threw Ekilex's own label away.
 *
 * Two entries are the interesting ones and both were set by narrowing until
 * something honest complained, rather than by widening until nothing did.
 *
 * ADVERB is this course's bucket for an uninflecting function word: `kas`,
 * `kui` and `palju` were ADVERB before any connective unit existed, and the
 * harvest's own comment says demanding forms for one "would drop every single
 * connective in the course". It was first written wide enough to admit `s` and
 * `v` as well, on the assumption that something would need it. Nothing did:
 * every ADVERB in the course is `adv`, `konj`, `prep` or `interj` to Ekilex, so
 * the wide version was a check that could not have fired.
 *
 * `num` on NOUN and ADJECTIVE is the one genuine widening, and it is a fact
 * about what the app needs rather than a shrug. An Estonian numeral declines,
 * so `kakskümmend` has to be a nominal here or it gets no case table and the
 * numbers unit teaches nothing about `kahekümne`. The ordinal `teine` agrees
 * like an adjective, which is what it is labelled. Ekilex calls all five of
 * them `num` and is right; this course has no such label and does not need one.
 */
export const COARSENS: Record<string, readonly string[]> = {
  NOUN: ["s", "prop", "num"],
  VERB: ["v"],
  ADJECTIVE: ["adj", "s", "num"],
  PRONOUN: ["pron", "s"],
  ADVERB: ["adv", "konj", "prep", "interj"],
};

/** A stable name for a pair, so a report and a check can agree on one. */
export function pairKey(a: SenseWord, b: SenseWord): string {
  return [a.lemma, b.lemma].sort((x, y) => x.localeCompare(y, "et")).join(" = ");
}

export interface SharedSenses {
  /** One meaning, one gloss: a production card with two right answers. */
  readonly collisions: SensePair[];
  /** One meaning, two glosses: a synonym pair, or a gloss for the wrong sense. */
  readonly disagreements: SensePair[];
}

export function sharedSenses(words: readonly SenseWord[]): SharedSenses {
  const bySense = new Map<string, SenseWord[]>();
  for (const word of words) {
    if (!word.note) continue;
    const key = word.note.trim().toLowerCase();
    const group = bySense.get(key) ?? [];
    group.push(word);
    bySense.set(key, group);
  }

  const collisions: SensePair[] = [];
  const disagreements: SensePair[] = [];
  for (const [sense, group] of bySense) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!;
        const b = group[j]!;
        (sameMeaning(a.gloss, b.gloss) ? collisions : disagreements).push({ a, b, sense });
      }
    }
  }
  const order = (p: SensePair) => pairKey(p.a, p.b);
  collisions.sort((x, y) => order(x).localeCompare(order(y), "et"));
  disagreements.sort((x, y) => order(x).localeCompare(order(y), "et"));
  return { collisions, disagreements };
}

/**
 * Words whose course label and Ekilex label cannot both be true.
 *
 * A word Ekilex has no opinion about is not a disagreement, which is why an
 * empty `ekilexPos` is skipped rather than counted: the harvest has only
 * recorded that field since the connective units were added, so an entry
 * without one is an entry from before, not an entry that is wrong.
 */
export function mislabelled(words: readonly SenseWord[]): SenseWord[] {
  return words.filter((w) => {
    if (w.ekilexPos.length === 0) return false;
    const allowed = COARSENS[w.pos] ?? [];
    return !w.ekilexPos.some((code) => allowed.includes(code));
  });
}
