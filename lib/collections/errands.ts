/**
 * ONE THING TO SAY TO A REAL PERSON TODAY.
 *
 * Every other panel on Today is about the app: what is due, what is next,
 * what keeps going wrong. This one is about leaving it. An errand is a small
 * real-world task in English, tied to a unit of the course, and the learner
 * reports how it went in one of three words: they understood me, they
 * switched to English, I did not manage it. That report is the one number
 * this app keeps that no learning app reports, because their business is
 * keeping you inside: conversations held outside, and how often the other
 * person gave up on your Estonian.
 *
 * NO ESTONIAN HERE. An errand names a unit id, the way `topical.ts` does, and
 * never a word: the words the errand needs are the unit's, already in the
 * dictionary, and the card links to them. A hand-written phrase in this file
 * would be this project writing Estonian and the first misspelling shipping in
 * silence (ADR-005).
 *
 * An errand is offered only where the learner has started its unit, because
 * "order a coffee" to somebody who has not met `kohv` is a dare rather than a
 * task. The two that need only greetings are always available. The walk over
 * the pool is `dayIndex`, so the same errand does not come round for weeks.
 *
 * Pure.
 */
import { dayIndex } from "@/lib/random/dayHash";
import { SYLLABUS } from "./syllabus";

export interface Errand {
  readonly id: string;
  /** English. The thing to do. */
  readonly says: string;
  /** English. Where it happens. */
  readonly where: string;
  /** The unit whose words it takes. */
  readonly unit: string;
}

export const ERRANDS: readonly Errand[] = [
  { id: "hello", says: "Say hello to the first person you deal with today, and thank them when you leave.", where: "Anywhere", unit: "tervitused" },
  { id: "sorry", says: "Apologise in Estonian for something small, and say you are learning.", where: "Anywhere", unit: "tervitused" },
  { id: "coffee", says: "Order a coffee in Estonian, and say please.", where: "A café", unit: "sook-ja-jook" },
  { id: "bread", says: "Ask for bread at the counter, and say how much you want.", where: "A shop or a market", unit: "sook-ja-jook" },
  { id: "price", says: "Ask what something costs before you look at the label.", where: "A shop", unit: "ostmine" },
  { id: "time", says: "Ask somebody what time it is, even if you know.", where: "A bus stop, a corridor", unit: "aeg" },
  { id: "where", says: "Ask where something is, and follow the answer without asking again in English.", where: "Town", unit: "kus-ja-kuhu" },
  { id: "weather", says: "Say one sentence about the weather to somebody waiting beside you.", where: "A queue, a lift", unit: "ilm" },
  { id: "family", says: "Tell a colleague or a neighbour one thing about your family.", where: "Work, the stairwell", unit: "inimesed" },
  { id: "day", says: "Tell somebody what you did today, in three sentences.", where: "Home, a friend", unit: "iga-paev" },
  { id: "number", says: "Give your phone number in Estonian, digit by digit, and have it read back.", where: "A form, a friend", unit: "arvud" },
  { id: "clothes", says: "Ask for a size or a colour in a shop.", where: "A clothes shop", unit: "riided" },
  { id: "call", says: "Make one phone call in Estonian, even a short one.", where: "The phone", unit: "suhtlemine" },
  { id: "appointment", says: "Book or ask about an appointment in Estonian, and hold the line if they switch.", where: "A health centre, a salon", unit: "keha-ja-tervis" },
  { id: "plan", says: "Arrange to meet somebody, with a day and a time.", where: "Work, a friend", unit: "plaanid" },
  { id: "flat", says: "Tell somebody one thing about your flat, or ask about theirs.", where: "A neighbour, a colleague", unit: "kodu" },
  { id: "help", says: "Ask somebody for help with one small thing, in Estonian.", where: "Anywhere", unit: "korraldused" },
  { id: "post", says: "Post a letter or collect a parcel, and do the whole thing in Estonian.", where: "The post office", unit: "linn-ja-teenused" },
];

/** What the learner said happened. The three words on the card. */
export const OUTCOMES = ["UNDERSTOOD", "SWITCHED", "BAILED"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export function outcomeFrom(value: unknown): Outcome | null {
  return OUTCOMES.find((o) => o === value) ?? null;
}

export const OUTCOME_LABEL: Readonly<Record<Outcome, string>> = {
  UNDERSTOOD: "They understood me",
  SWITCHED: "They switched to English",
  BAILED: "I did not manage it",
};

/** The errand for a day, over the units the learner has started. */
export function errandForDay(dayKey: string, startedUnits: ReadonlySet<string>): Errand {
  const pool = ERRANDS.filter((e) => e.unit === "tervitused" || startedUnits.has(e.unit));
  return pool[dayIndex(dayKey, "errand", pool.length)] ?? ERRANDS[0]!;
}

export function errandById(id: string): Errand | undefined {
  return ERRANDS.find((e) => e.id === id);
}

/** The units a deck has started: any of the unit's words with a card. */
export function startedUnits(startedLemmas: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  for (const unit of SYLLABUS) {
    if (unit.lemmas.some((l) => startedLemmas.has(l))) out.add(unit.id);
  }
  return out;
}
