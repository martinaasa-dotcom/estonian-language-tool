/**
 * Which voice reads Estonian aloud, and whether it does so unasked.
 *
 * TartuNLP's speech service offers a dozen Estonian voices and this app used
 * one of them, chosen by whoever deployed it, for everybody. A learner who
 * finds one voice hard to follow had no way to change it, and a learner who
 * has only ever heard one voice say a word has learned that voice rather than
 * the word: the state examination's listening part is read by several
 * speakers, and so is the country.
 *
 * So the voice is a setting, and the list here is the allowlist the speech
 * route checks a request against: a value not on it is answered with the
 * default rather than passed to a third party as typed. The names are the
 * service's own identifiers, which is why one is spelled without its umlaut.
 *
 * Pure. No React, no Prisma; the setting store holds the value and this says
 * what a valid one is.
 */
export interface Voice {
  /** The identifier the speech service expects. */
  readonly id: string;
  /** How the name is written, for a screen. */
  readonly name: string;
}

export const VOICES: readonly Voice[] = [
  { id: "mari", name: "Mari" },
  { id: "tambet", name: "Tambet" },
  { id: "liivika", name: "Liivika" },
  { id: "kalev", name: "Kalev" },
  { id: "kylli", name: "Külli" },
  { id: "meelis", name: "Meelis" },
  { id: "vesta", name: "Vesta" },
  { id: "peeter", name: "Peeter" },
  { id: "albert", name: "Albert" },
  { id: "indrek", name: "Indrek" },
  { id: "lee", name: "Lee" },
  { id: "luukas", name: "Luukas" },
];

export const DEFAULT_VOICE = "mari";

/** A stored or requested voice, or the default when it is not one we offer. */
export function voiceFrom(value: string | null | undefined): string {
  return VOICES.some((v) => v.id === value) ? (value as string) : DEFAULT_VOICE;
}

/**
 * Whether a card reads itself aloud when it appears.
 *
 * On by default: hearing a word every time it is met is the cheapest thing an
 * app can do for somebody learning a language whose spelling only half
 * records its length, and pressing a speaker icon on every card is a tax on
 * exactly the learners who need it most. Off is for a library, a bus, or
 * somebody who would rather read.
 */
export type Autoplay = "on" | "off";
export const DEFAULT_AUTOPLAY: Autoplay = "on";

export function autoplayFrom(value: string | null | undefined): Autoplay {
  return value === "off" ? "off" : "on";
}

/**
 * Whether a right or wrong answer makes a sound.
 *
 * Two short tones, made in the browser rather than fetched, so they cost
 * nothing and work offline. On by default for the reason a good teacher says
 * "yes" before explaining: the verdict lands before the reading does.
 */
export type FeedbackSounds = "on" | "off";
export const DEFAULT_FEEDBACK_SOUNDS: FeedbackSounds = "on";

export function feedbackSoundsFrom(value: string | null | undefined): FeedbackSounds {
  return value === "off" ? "off" : "on";
}
