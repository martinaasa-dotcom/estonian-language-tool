/**
 * ENTER AND SPACE ARE ONE KEY ON A CARD.
 *
 * "Got it", "Next", "Carry on", "Continue": whatever the button says, it means
 * "I have read this, move on", and a learner reaching for the keyboard reaches
 * for whichever of the two big keys their hand is nearest. Half the rounds
 * took Enter alone and half took either, so the same gesture worked on one
 * screen and dropped a space into nothing on the next. This is the one reading
 * of "the key that moves forward", and every round asks it rather than naming
 * a key of its own.
 *
 * Space is a letter inside a text box. A learner typing `Ma lähen poodi` must
 * not be moved on halfway through the sentence, so Space advances only while
 * nothing editable has focus. Enter is still the field's own "check this",
 * which the rounds handle before they get here.
 *
 * No React in here: `lib/ux/` is asserted free of it, and a keyboard event is
 * only ever read for its key and its target.
 */

const EDITABLE = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** What a keyboard event is read for. `target` is typed loosely so a DOM
 *  `EventTarget`, which declares neither field, passes without a cast. */
export interface KeyLike {
  key: string;
  target: object | null;
}

export function inEditable(target: object | null): boolean {
  if (!target) return false;
  const el = target as { tagName?: unknown; isContentEditable?: unknown };
  if (el.isContentEditable === true) return true;
  return typeof el.tagName === "string" && EDITABLE.has(el.tagName);
}

/** Enter anywhere, or Space outside a text box: the key that moves forward. */
export function isAdvanceKey(e: KeyLike): boolean {
  if (e.key === "Enter") return true;
  if (e.key === " ") return !inEditable(e.target);
  return false;
}

/**
 * ONE KEY IS NAMED ON THE BUTTON, AND IT IS THE ONE THAT ALWAYS WORKS.
 *
 * The reading above takes both keys, and the buttons did not agree about
 * which one to say: the first meeting of a word offered "Got it, ask me
 * later" with Space on the cap, the card after it offered "Got it, next"
 * with Enter, and the footer under both said Space. Two names for one
 * gesture on two consecutive screens reads as two gestures, so a learner
 * either reaches for the mouse or finds out by pressing.
 *
 * Enter is the name, because Enter is the half with no exception: Space is a
 * letter inside a text box, so a typed card that promised it would be lying
 * on the one shape where it matters most. Space still works everywhere
 * `isAdvanceKey` is asked, and the shortcut sheet is where both are written
 * down, because that is a reference rather than a button.
 */
export const ADVANCE_KEY_LABEL = "Enter";
