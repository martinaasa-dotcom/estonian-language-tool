/**
 * ONE THING TO SAY TO A REAL PERSON, AND WHETHER ANYTHING WAS SAID AT ALL.
 *
 * Every other panel on Today is about the app: what is due, what is next,
 * what keeps going wrong. This one is about leaving it. An errand is a small
 * real-world task in English, tied to a unit of the course.
 *
 * THE CARD ASKS ABOUT YESTERDAY, AND THE ERRAND IS WHAT IT OFFERS WHEN THE
 * ANSWER IS NO. It used to set the errand in the morning and put the three
 * answers under it, which asked for a report on something that had not
 * happened yet: three buttons at eight in the morning are three ways to make
 * a card go away rather than an account of anything. And it could only ever
 * see conversations this app had set, so a learner who spent an hour with
 * their Estonian mother-in-law and ignored the errand was recorded as having
 * done nothing, in the one number this app claims to be measured by.
 *
 * So the question is always about a day that is over, the answer is always
 * about the learner's own life rather than about our homework, and the errand
 * is a small one for today offered to somebody who says there was nothing
 * yesterday. That report is the number no learning app keeps, because their
 * business is keeping you inside: conversations held outside, and how often
 * the other person gave up on your Estonian.
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
import { SCENES, sceneById } from "@/lib/scenes/catalogue";
import { SYLLABUS } from "./syllabus";

export interface Errand {
  readonly id: string;
  /** English. The thing to do. */
  readonly says: string;
  /** English. Where it happens. */
  readonly where: string;
  /** The unit whose words it takes. */
  readonly unit: string;
  /**
   * The scene that rehearses it, where one does. An id from
   * `lib/scenes/catalogue.ts`, and the scene has to declare the errand's unit,
   * which `errands.test.ts` asserts: a rehearsal that could not vouch for
   * the words the errand needs would be a rehearsal of something else.
   *
   * THIS IS THE JOIN THE PURPOSE RESTS ON. Situations is where the encounter
   * is played on somebody who wants something from you, and the errand is
   * where it is played on somebody real. For a while the two were built side
   * by side and never pointed at each other: the debrief ended in "have it
   * again", and the card offering the errand linked to a unit's word list.
   * `docs/22-real-life.md` says the app is to be left, and a rehearsal that
   * does not end in the door is a rehearsal that keeps you inside.
   */
  readonly scene?: string;
}

export const ERRANDS: readonly Errand[] = [
  { id: "hello", says: "Say hello to the first person you deal with today, and thank them when you leave.", where: "Anywhere", unit: "tervitused" },
  { id: "sorry", says: "Apologize in Estonian for something small, and say you are learning.", where: "Anywhere", unit: "tervitused" },
  { id: "coffee", says: "Order a coffee in Estonian, and say please.", where: "A café", unit: "sook-ja-jook", scene: "kohvikus" },
  { id: "bread", says: "Ask for bread at the counter, and say how much you want.", where: "A shop or a market", unit: "sook-ja-jook", scene: "poodi-piima" },
  { id: "price", says: "Ask what something costs before you look at the label.", where: "A shop", unit: "ostmine", scene: "poodi-piima" },
  { id: "time", says: "Ask somebody what time it is, even if you know.", where: "A bus stop, a corridor", unit: "aeg" },
  { id: "where", says: "Ask where something is, and follow the answer without asking again in English.", where: "Town", unit: "kus-ja-kuhu", scene: "tee-kusimine" },
  { id: "weather", says: "Say one sentence about the weather to somebody waiting beside you.", where: "A queue, a lift", unit: "ilm" },
  { id: "family", says: "Tell a colleague or a neighbor one thing about your family.", where: "Work, the stairwell", unit: "inimesed" },
  { id: "day", says: "Tell somebody what you did today, in three sentences.", where: "Home, a friend", unit: "iga-paev" },
  { id: "number", says: "Give your phone number in Estonian, digit by digit, and have it read back.", where: "A form, a friend", unit: "arvud" },
  { id: "clothes", says: "Ask for a size or a color in a shop.", where: "A clothes shop", unit: "riided" },
  { id: "call", says: "Make one phone call in Estonian, even a short one.", where: "The phone", unit: "suhtlemine" },
  { id: "appointment", says: "Book or ask about an appointment in Estonian, and hold the line if they switch.", where: "A health center, a salon", unit: "keha-ja-tervis", scene: "arsti-aeg" },
  { id: "plan", says: "Arrange to meet somebody, with a day and a time.", where: "Work, a friend", unit: "plaanid" },
  { id: "flat", says: "Tell somebody one thing about your flat, or ask about theirs.", where: "A neighbor, a colleague", unit: "kodu", scene: "uuri-remont" },
  { id: "help", says: "Ask somebody for help with one small thing, in Estonian.", where: "Anywhere", unit: "korraldused" },
  { id: "post", says: "Post a letter or collect a parcel, and do the whole thing in Estonian.", where: "The post office", unit: "linn-ja-teenused", scene: "ametiasutus" },
  { id: "ticket", says: "Buy a bus ticket at the window, and say where you are going and when.", where: "A bus station", unit: "reisimine", scene: "bussipilet" },
];

/**
 * What the learner said happened. The three words on the card.
 *
 * The stored values are unchanged, and that is deliberate rather than lazy:
 * the question moved from "how did the errand go" to "did you speak any
 * Estonian yesterday", and every row written under the first question reads
 * correctly under the second. `BAILED` was "I went and did not manage it" and
 * is now "there was none yesterday", which is the same fact about the day.
 */
export const OUTCOMES = ["UNDERSTOOD", "SWITCHED", "BAILED"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export function outcomeFrom(value: unknown): Outcome | null {
  return OUTCOMES.find((o) => o === value) ?? null;
}

export const OUTCOME_LABEL: Readonly<Record<Outcome, string>> = {
  UNDERSTOOD: "Yes, and they understood",
  SWITCHED: "They switched to English",
  BAILED: "Not yesterday",
};

/**
 * WHICH OF THE THREE IS A CONVERSATION, DECIDED ONCE.
 *
 * Progress prints a count of conversations and a run of days with one in
 * them, and both counted every row, including the days somebody said there
 * had been nothing. That was already loose when the third answer meant "I
 * tried and could not"; with the question asked the way it is asked now it
 * would be a plain untruth, since answering "not yesterday" every day for a
 * fortnight would build a fortnight's run of real conversations. Two readers
 * ask this and they may not disagree about it.
 */
export type Conversation = Extract<Outcome, "UNDERSTOOD" | "SWITCHED">;

export function isConversation(outcome: Outcome): outcome is Conversation {
  return outcome === "UNDERSTOOD" || outcome === "SWITCHED";
}

/** The errand for a day, over the units the learner has started. */
export function errandForDay(dayKey: string, startedUnits: ReadonlySet<string>): Errand {
  const pool = ERRANDS.filter((e) => e.unit === "tervitused" || startedUnits.has(e.unit));
  return pool[dayIndex(dayKey, "errand", pool.length)] ?? ERRANDS[0]!;
}

export function errandById(id: string): Errand | undefined {
  return ERRANDS.find((e) => e.id === id);
}

/**
 * The scene an errand rehearses, or nothing.
 *
 * Resolved here rather than by the screen so a stale id fails the test in
 * this file rather than rendering a link to a page that is not there.
 */
export function sceneForErrand(errand: Errand) {
  return errand.scene === undefined ? undefined : sceneById(errand.scene);
}

/**
 * The errand a scene was rehearsing, for the debrief.
 *
 * The first one that names the scene, which is a choice only where two do
 * (`bread` and `price` both go to the shop), and the first is the plainer
 * ask. A scene with none returns nothing rather than the day's errand, since
 * "now go and do it" has to be about the thing just rehearsed.
 */
export function errandForScene(sceneId: string): Errand | undefined {
  if (!SCENES.some((s) => s.id === sceneId)) return undefined;
  return ERRANDS.find((e) => e.scene === sceneId);
}

/** The units a deck has started: any of the unit's words with a card. */
export function startedUnits(startedLemmas: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  for (const unit of SYLLABUS) {
    if (unit.lemmas.some((l) => startedLemmas.has(l))) out.add(unit.id);
  }
  return out;
}
