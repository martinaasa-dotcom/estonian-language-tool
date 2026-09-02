import { FREQUENCY_GROUPS, type FrequencyGroup } from "./frequency";
import type { Tone } from "@/lib/ux/nav";

/**
 * WHAT THE FOUR COMMONEST-WORD LISTS ARE CALLED, ONCE.
 *
 * `lib/collections/frequency.ts` is the order and is generated, so it holds a
 * lemma, a part of speech and a group and nothing a person wrote. This is the
 * other half: what each of those four groups is called on a screen, and the one
 * line saying what is in it.
 *
 * It is a module rather than a map inside a component because four screens want
 * it now: the dictionary's lists, the card on `/practice`, the round index and
 * the round itself. That was one map in one client component, and a second copy
 * is how "Describing words" becomes "Adjectives" on one screen out of four,
 * which is the fault `lib/ux/modes.ts` and `lib/ux/nav.ts` each exist to
 * prevent.
 *
 * The slug is here too, and it is why the round's URL is `/review/common/noun`
 * rather than `/review/common/NOUN`: a path is not shouted, and a learner who
 * types one should get the page. `groupBySlug` folds case for the same reason.
 *
 * Pure, and the tone is a token name for the reason an icon is a lucide name in
 * `lib/ux/nav.ts`: this file holds no JSX and is unit tested without a DOM.
 */

/**
 * HOW MANY WORDS ONE PRESS DEEPENS.
 *
 * `addCommonWords` puts a whole hundred in the deck with a recognition card and
 * a production card each, which is the right trade for a browsing screen: two
 * hundred cheap cards, and the list is a list of words you have collected.
 *
 * The round wants the other thing. "Used in different ways and different case
 * endings" means every card type the word can support, and for a noun that is
 * the ten regular cases plus a gap-fill on top of the two, so a hundred nouns
 * would be well over a thousand cards for one press. First run already learned
 * what that produces: ticking everything at A1 built 2,063 cards, a four year
 * backlog assembled by accident on the evening somebody installed the app.
 *
 * So the round deepens a batch at a time and the batch is twenty, which is one
 * round's worth of words and about the size of a course unit. Press it again
 * and it takes the next twenty that are not finished yet.
 */
export const COMMON_BATCH = 20;

export interface CommonGroup {
  key: FrequencyGroup;
  /** The URL segment. */
  slug: string;
  /** What the group is called, on every screen that offers it. */
  title: string;
  /** One line on what is in it. */
  blurb: string;
  /**
   * Its hue.
   *
   * Deliberately none of mint or peach. Those two carry fixed meanings in this
   * app, recalled and missed, and these four sit on a card in a review round
   * where that reading is live (docs/14-design-system.md §1).
   */
  tone: Tone;
}

/**
 * The four, in the order they are worth offering.
 *
 * The small words lead, and that is the argument the list is making. They are
 * the commonest words in the language by a long way, a course leaves them until
 * the grammar needs them, and they are what turns a sentence heard on a bus
 * into a sentence understood. `ei`, `et`, `ja`, `kui`, `kas` and `jah` are the
 * first six and not one of them is a word anybody would have thought to look up.
 */
export const COMMON_GROUPS: readonly CommonGroup[] = [
  {
    key: "SMALL",
    slug: "small",
    title: "Small words",
    blurb: "The joins, the answers and the ones that say how much. Every sentence has several.",
    tone: "sky",
  },
  {
    key: "VERB",
    slug: "verb",
    title: "Verbs",
    blurb: "Shown as the dictionary shows them, in the ma-infinitive.",
    tone: "accent",
  },
  {
    key: "NOUN",
    slug: "noun",
    title: "Nouns",
    blurb: "Counted on the dictionary form, so the order is fair between them.",
    tone: "butter",
  },
  {
    key: "ADJECTIVE",
    slug: "adjective",
    title: "Describing words",
    blurb: "What things are like, which is most of what a conversation is about.",
    tone: "blush",
  },
];

/** One group by its key, for a caller that already has one. */
export function commonGroup(key: FrequencyGroup): CommonGroup {
  // Non-null by the invariant below: every group in the generated table has a
  // row here, and a missing one fails `commonGroups.test.ts` rather than
  // rendering a screen with no name on it.
  return COMMON_GROUPS.find((g) => g.key === key)!;
}

/**
 * The group a URL segment names, or nothing.
 *
 * Takes `unknown` because it is the boundary of a pure module and the caller is
 * a route parameter, which is a string off the wire whatever the type says.
 */
export function groupBySlug(slug: unknown): CommonGroup | undefined {
  if (typeof slug !== "string") return undefined;
  const wanted = slug.toLowerCase();
  return COMMON_GROUPS.find((g) => g.slug === wanted);
}

/** Every group named by the generated table, in the order this file sets. */
export const COMMON_GROUP_KEYS: readonly FrequencyGroup[] = COMMON_GROUPS.map((g) => g.key);

/** True when the generated table and this one still name the same four. */
export function groupsAgree(): boolean {
  return FREQUENCY_GROUPS.every((k) => COMMON_GROUPS.some((g) => g.key === k))
    && COMMON_GROUPS.every((g) => FREQUENCY_GROUPS.includes(g.key));
}
