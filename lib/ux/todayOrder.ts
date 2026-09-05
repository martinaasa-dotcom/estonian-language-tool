/**
 * WHICH ORDER THE CARDS ON TODAY ARE DEALT IN, AND WHOSE CHOICE THAT IS.
 *
 * Today names its cards in priority order and draws the first `TODAY_CARDS`
 * of them (lib/ux/disclosure.ts). The order shipped with an argument behind
 * it, what to say to a real person, what is actually on today, the one short
 * round, the run of days, a word, and then the course, and the argument is
 * still the default. It is not the only honest order. Somebody in a class
 * wants the homework at the top; somebody who plays the game every morning
 * wants it first; somebody who never sets a calendar wants the word of the
 * day above an empty slot. A home page is the one screen whose reading order
 * is a fact about the reader rather than about the app, so it is theirs to
 * set, from Settings.
 *
 * WHAT IS CHOSEN IS THE ORDER AND NOTHING ELSE. The cap still applies after
 * the deal, so moving a card up is also what decides whether it survives the
 * cut; the disclosure table still decides whether a card is worth drawing at
 * all for somebody this far in; and a card with nothing to say this morning
 * is still absent whatever position it holds. Ordering never adds a seventh
 * box, and it never draws a card the learner is not ready for.
 *
 * ONE STRING, LIKE THE GOAL REASONS. The stored value is the slot ids in
 * order, space separated, which is the shape `goalReason` already takes, so
 * a row written by hand or by an older build reads back without a migration.
 * Reading is forgiving on purpose: an id this file no longer knows is
 * dropped, a duplicate is kept once, and any slot the row leaves out is
 * appended in the default order, so a card added to Today after somebody set
 * their order still appears rather than silently never being dealt.
 *
 * Pure: a string in, an order out. No React, no Prisma, no clock.
 */

export const TODAY_SLOTS = [
  {
    id: "errand",
    title: "Say it today",
    detail: "Whether you spoke Estonian yesterday, and one thing to say today.",
  },
  {
    id: "schedule",
    title: "On today",
    detail: "What is on your calendar today. Only drawn on a day that has something.",
  },
  {
    id: "plan",
    title: "Homework",
    detail: "What a teacher assigned, grouped by when it is due.",
  },
  {
    id: "round",
    title: "Today's round",
    detail: "The game of the day, and the quest on the day the week gives it.",
  },
  {
    id: "streak",
    title: "Keeping it up",
    detail: "The run of days, the week strip and any shields banked.",
  },
  {
    id: "word",
    title: "Word of the day",
    detail: "A word chosen by the date, with the reason it was chosen.",
  },
  {
    id: "next",
    title: "Next on the path",
    detail: "The unit the course would open next.",
  },
] as const;

export type TodaySlot = (typeof TODAY_SLOTS)[number]["id"];

/** The shipped order, which is the argument in the module header. */
export const DEFAULT_TODAY_ORDER: readonly TodaySlot[] = TODAY_SLOTS.map((s) => s.id);

const KNOWN = new Set<string>(DEFAULT_TODAY_ORDER);

function isSlot(value: string): value is TodaySlot {
  return KNOWN.has(value);
}

/**
 * A stored value, or the default. Never throws: a stored row can be anything.
 *
 * Every slot is always present in the result exactly once, which is the
 * property Today relies on: it hands this a record keyed on every slot and
 * expects each key to be visited.
 */
export function todayOrderFrom(value: string | null | undefined): TodaySlot[] {
  const seen = new Set<TodaySlot>();
  const order: TodaySlot[] = [];
  for (const token of (value ?? "").split(/\s+/)) {
    if (!isSlot(token) || seen.has(token)) continue;
    seen.add(token);
    order.push(token);
  }
  for (const slot of DEFAULT_TODAY_ORDER) {
    if (!seen.has(slot)) order.push(slot);
  }
  return order;
}

/** The shape the settings store holds. The inverse of `todayOrderFrom`. */
export function serialiseTodayOrder(order: readonly TodaySlot[]): string {
  return todayOrderFrom(order.join(" ")).join(" ");
}

/** True where the stored order is the shipped one, so a hint can say so. */
export function isDefaultTodayOrder(order: readonly TodaySlot[]): boolean {
  return order.length === DEFAULT_TODAY_ORDER.length
    && order.every((slot, i) => slot === DEFAULT_TODAY_ORDER[i]);
}

/**
 * Deal the cards in the learner's order, dropping the ones with nothing to
 * say. The cap is the caller's, applied after this, so the order is also what
 * decides which cards survive it.
 */
export function orderTodayCards<T>(
  cards: Readonly<Record<TodaySlot, T | null>>,
  order: readonly TodaySlot[],
): T[] {
  const dealt: T[] = [];
  for (const slot of todayOrderFrom(order.join(" "))) {
    const card = cards[slot];
    if (card !== null && card !== undefined) dealt.push(card);
  }
  return dealt;
}

/**
 * The order with one slot moved a step up or down, for the Settings panel.
 * A move off either end is a no-op rather than a wrap: a list that wraps
 * reads as the row having vanished.
 */
export function moveSlot(
  order: readonly TodaySlot[],
  slot: TodaySlot,
  direction: "up" | "down",
): TodaySlot[] {
  const next = [...order];
  const from = next.indexOf(slot);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= next.length) return next;
  next.splice(from, 1);
  next.splice(to, 0, slot);
  return next;
}
