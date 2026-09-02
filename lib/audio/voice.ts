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
 * **Off by default**, and that is a reversal worth writing down, because the
 * usual rule here is that a missing row reads as the behaviour everybody
 * already had. This one deliberately changes under existing learners.
 *
 * The argument for `on` was that hearing a word every time it is met is the
 * cheapest thing an app can do for somebody learning a language whose spelling
 * only half records its length. That is still true, and it is not what the
 * setting was doing. A card reads itself aloud when the word is first met *and*
 * again when the answer appears, so a review session is a speaker firing twice
 * a card, unasked, on a phone in a room with other people in it. The learner
 * who wanted it got it; the learner who did not had to find Settings to stop
 * it, and the one who was somewhere they could not have sound reached for the
 * volume key instead and turned the whole thing off, including the feedback
 * tones.
 *
 * Silence is the safer default for the same reason a video does not autoplay
 * with sound: the cost of being wrong is asymmetric. A learner who wanted audio
 * and has silence presses a speaker icon, which is on every card. A learner who
 * did not want it and gets it is startled in a library.
 *
 * What pays for the flip is that the speaker is easy to reach rather than that
 * the sound is easy to stop: `SpeakPair` is a labelled control on the card, not
 * a hover target, and the setting is one chip in Settings for anybody who wants
 * the old behaviour back.
 */
export type Autoplay = "on" | "off";
export const DEFAULT_AUTOPLAY: Autoplay = "off";

/**
 * An unset row and an unrecognised value both read as the default, which is
 * why this tests for `"on"` rather than against `"off"`. Written the other way
 * round, flipping the constant above would have left every existing learner on
 * the old behaviour and only new spellings on the new one.
 */
export function autoplayFrom(value: string | null | undefined): Autoplay {
  return value === "on" ? "on" : "off";
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
