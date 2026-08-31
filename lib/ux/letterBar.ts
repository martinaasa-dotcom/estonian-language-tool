/**
 * THE ESTONIAN LETTER BAR: WHICH LETTERS IT OFFERS, AND WHETHER IT IS DRAWN.
 *
 * Two facts that were previously three copies of one and a decision nobody had
 * made. The six letters were a `DIACRITICS` constant in `EstonianInput` and a
 * second `DIACRITICS` constant in `DiacriticBar`, and the bar was drawn for
 * everybody, everywhere, always.
 *
 * That last part is the fault this module exists for. A learner in Tallinn is
 * typing on an Estonian keyboard, where õ is a key next to ä; a row of buttons
 * offering to type it for them is clutter under every field in the app, on the
 * exam paper and the dictation screen included. A learner on a UK or US layout
 * has no way to write õ at all short of an alt code, so the same row is the
 * only thing making half these exercises answerable.
 *
 * WHICH ONE SOMEBODY IS CANNOT BE DETECTED. There is no way to ask a browser
 * what is printed on the keys: `KeyboardEvent.key` reports what was typed, and
 * a learner who never reaches for õ looks identical to one who cannot. So it is
 * asked, once, at first run, and changed whenever they like.
 *
 * ON IS THE DEFAULT AND STAYS THE DEFAULT. Everybody who signed up before this
 * existed is never asked, and a missing answer must not quietly take away the
 * only way they have of writing õ. Defaulting the other way would break those
 * learners silently, which is the worse of the two failures by a distance.
 */

/** The six letters Estonian has and a UK or US keyboard does not. */
export const ESTONIAN_LETTERS = ["õ", "ä", "ö", "ü", "š", "ž"] as const;

export type LetterBar = "on" | "off";

export const DEFAULT_LETTER_BAR: LetterBar = "on";

/** A stored answer, or the default when it is absent or unrecognised. */
export function letterBarFrom(value: string | undefined | null): LetterBar {
  return value === "off" ? "off" : DEFAULT_LETTER_BAR;
}

/**
 * The two answers, worded once.
 *
 * First run asks the question and Settings shows the standing answer, and they
 * are the same choice: a learner who reads "I have them already" at sign-up and
 * then hunts Settings for "diacritics" a month later has been asked one
 * question and shown another.
 */
export const LETTER_BAR_CHOICES: { value: LetterBar; label: string; detail: string }[] = [
  {
    value: "on",
    label: "Show the letters",
    detail: "My keyboard has no õ, ä, ö or ü.",
  },
  {
    value: "off",
    label: "I have them already",
    detail: "I have an Estonian keyboard.",
  },
];
