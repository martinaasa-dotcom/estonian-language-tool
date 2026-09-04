/**
 * HOW PEOPLE ACTUALLY TALK, AS A TABLE.
 *
 * Every listening exercise in this app used to play one clean synthetic
 * voice at a normal speed in a silent room, and nobody a learner will ever
 * meet talks like that. The receptionist is quick, the shop is noisy, the
 * clinic rings you back on a bad line, and half the sentences you meet on a
 * bus you catch from the middle. An ear trained on studio audio freezes on all
 * four, which is the moment this app exists to prepare somebody for.
 *
 * WHAT THIS MAY AND MAY NOT MAKE IMPERFECT. The words stay exactly what the
 * dictionary says. Mumbled spellings, dropped endings and slang would be this
 * project writing Estonian, and a form the app invented is a form the
 * scheduler drills (ADR-005). So every condition here is about the *delivery*
 * of a sentence a lexicographer recorded: how fast it is said, which of twelve
 * voices says it, what is going on around it, and how much of it you caught.
 * Nothing about the text changes, and the screen says which condition it was
 * once the answer is shown, because a learner who did not catch a word wants
 * to know whether it was the word or the room.
 *
 * WHY A TABLE. `lib/audio/clip.ts` builds every cache key, the browser mixer
 * applies every effect, and two rounds choose a condition per card. Three
 * places agreeing on what "café" means is three places to disagree, so this is
 * the one list and each of them reads it.
 *
 * THE POOL WIDENS AS THE WORD SETTLES, which is the flash round's rule about
 * its shapes: the first time a word is heard it is heard cleanly, and each
 * time the scheduler brings it back and it is still known, the next condition
 * opens. A word you have met twice is not yet a word to hear down a phone.
 *
 * Pure: strings and numbers in, strings and numbers out. The mixer that turns
 * a condition into sound is `lib/audio/mixer.ts`, browser only.
 */

/** Whether the rounds vary the delivery at all. */
export type Hearing = "on" | "off";

/**
 * On by default, and that is deliberate rather than the usual rule about a
 * missing row: the point of the app is the counter, and a learner who wants
 * the studio back has one chip in Settings.
 */
export const DEFAULT_HEARING: Hearing = "on";

/** An unset row and an unrecognised value both read as the default. */
export function hearingFrom(value: string | null | undefined): Hearing {
  return value === "off" ? "off" : "on";
}

export type ConditionId = "clean" | "quick" | "cafe" | "phone" | "half";

export interface Condition {
  readonly id: ConditionId;
  /** What Settings and a debrief call it. */
  readonly name: string;
  /** How the screen says it after the answer: "Read by Mari, {said}." */
  readonly said: string;
  /** The rate the speech service is asked for. 1 is what everybody had. */
  readonly speed: number;
  /**
   * Background noise, as a fraction of the voice's own level, and the cut-off
   * of the low-pass filter shaping it. Null is a quiet room.
   */
  readonly noise: { readonly level: number; readonly lowpassHz: number } | null;
  /** A band-pass over the voice, which is what a telephone line does to one. */
  readonly band: { readonly lowHz: number; readonly highHz: number } | null;
  /** How much of the clip is skipped at the start, as a fraction of its length. */
  readonly skip: number;
}

/**
 * The conditions, in the order they open.
 *
 * `quick` is a real speech rate rather than a resampled one: the service is
 * asked for it, so the pitch stays where the voice puts it and only the
 * tempo changes. 1.3 is brisk, not a caricature; the state examination's
 * listening texts are read at about that pace and a receptionist is faster.
 *
 * `cafe` is filtered noise at a level where the voice still leads. `phone`
 * keeps the 300 to 3400 Hz band a landline keeps, which is enough to lose the
 * difference between `s` and `f` and is exactly what happens on a call. `half`
 * starts two fifths of the way in, which is a sentence caught from the middle
 * of a conversation, and it is last because it is the only one that removes
 * words rather than colouring them.
 */
export const CONDITIONS: readonly Condition[] = [
  { id: "clean", name: "A quiet room", said: "in a quiet room", speed: 1, noise: null, band: null, skip: 0 },
  { id: "quick", name: "At speed", said: "at speed", speed: 1.3, noise: null, band: null, skip: 0 },
  { id: "cafe", name: "In a café", said: "over café noise", speed: 1, noise: { level: 0.16, lowpassHz: 1400 }, band: null, skip: 0 },
  { id: "phone", name: "On the phone", said: "down a phone line", speed: 1.1, noise: null, band: { lowHz: 300, highHz: 3400 }, skip: 0 },
  { id: "half", name: "From halfway through", said: "from halfway through", speed: 1, noise: null, band: null, skip: 0.4 },
];

export const CLEAN: Condition = CONDITIONS[0]!;

export function conditionById(id: string | null | undefined): Condition {
  return CONDITIONS.find((c) => c.id === id) ?? CLEAN;
}

/**
 * How many times a word has been reviewed before each condition opens.
 *
 * Two clean hearings before anything changes, because the first meeting of a
 * word is a teaching screen and the second is the first real retrieval. After
 * that a new condition every three or so reviews, which on the default goal is
 * a new way of hearing a word about once a week.
 */
export const OPENS_AT: Readonly<Record<ConditionId, number>> = {
  clean: 0,
  quick: 2,
  cafe: 4,
  phone: 7,
  half: 10,
};

/** The conditions a word with this many reviews behind it may be heard in. */
export function openConditions(reps: number): readonly Condition[] {
  const n = Math.max(0, Math.floor(reps));
  return CONDITIONS.filter((c) => OPENS_AT[c.id] <= n);
}

/**
 * Which condition a card is heard in this time.
 *
 * Deterministic on the card's own history and its place in the round, for the
 * reason the flash round rotates on a word's correct answers: a reload has to
 * give back the same question rather than reshuffling under somebody who
 * refreshed. With the setting off every card is clean.
 */
export function conditionFor(reps: number, position: number, hearing: Hearing): Condition {
  if (hearing === "off") return CLEAN;
  const open = openConditions(reps);
  const i = (Math.max(0, Math.floor(reps)) + Math.max(0, Math.floor(position))) % open.length;
  return open[i] ?? CLEAN;
}

/**
 * How a finished clip is described, after the answer, beside the voice.
 *
 * Said only once the answer is on screen: before it, "over café noise" is a
 * hint about the sentence and the noise is audible anyway.
 */
export function describeHearing(voiceName: string, condition: Condition): string {
  return condition.id === "clean"
    ? `Read by ${voiceName}.`
    : `Read by ${voiceName}, ${condition.said}.`;
}
