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
