/**
 * WHAT A RIGHT ANSWER LOOKS LIKE, AND A WRONG ONE, EVERYWHERE.
 *
 * Twenty screens mark an answer, and each one used to paint its own verdict
 * out of the tokens by hand: a tint here, a fill there, an ink on some, the
 * hue itself on others. The palette had already decided what the colours mean
 * (docs/14-design-system.md §1: mint is recalled, butter is nearly, peach is
 * missed), so nothing was wrong on purpose. What went wrong was the copying.
 * Four rounds wrote a verdict in the fill at 2.2:1, one round never marked the
 * option the learner actually pressed, another marked a near miss the same
 * peach as a blank, and the picture board said nothing in colour at all.
 *
 * So there is one vocabulary and this is it. A verdict is one of three words,
 * and each names a class in `app/globals.css` that paints the tint and writes
 * in the ink, in both themes. An option, once the answer is known, is one of
 * three others: the right one, the one the learner pressed when it was not,
 * and the rest. Every screen that marks an answer reads these; none paints a
 * verdict tint by hand, and `scripts/test-invariants.ts` fails on one that
 * does.
 *
 * Pure: no React, no tokens, no colour. The colour lives in the stylesheet,
 * where the theme can flip it.
 */

export type Verdict = "right" | "nearly" | "wrong";

/** The class a panel, a chip or a self-grade button wears for a verdict. */
export const VERDICT_CLASS: Record<Verdict, string> = {
  right: "verdict-right",
  nearly: "verdict-nearly",
  wrong: "verdict-wrong",
};

/**
 * The ink alone, for a verdict that is a run of text with nothing behind it:
 * the headline over a dictation, a form marked inside a table cell, a figure
 * on a summary card. The ink and never the fill, which lands near 2.5:1 as
 * text (docs/14-design-system.md, "Every hue has an ink").
 */
export const VERDICT_INK: Record<Verdict, string> = {
  right: "var(--good-ink)",
  nearly: "var(--hard-ink)",
  wrong: "var(--again-ink)",
};

export type OptionState = "right" | "wrong" | "other";

/**
 * An option after the answer is known. `right` is the answer, whether or not
 * the learner picked it; `wrong` is what they pressed instead; `other` is an
 * option nobody chose and nobody wanted.
 */
export const OPTION_CLASS: Record<OptionState, string> = {
  right: "option-right",
  wrong: "option-wrong",
  other: "option-other",
};

/**
 * Which state an option is in once the answer is known. Passing `picked` as
 * null means nothing was pressed (a round timed out), so the answer lights up
 * and everything else steps back.
 */
export function optionState(isAnswer: boolean, isPicked: boolean): OptionState {
  if (isAnswer) return "right";
  if (isPicked) return "wrong";
  return "other";
}

/**
 * The scheduler's four ratings read as three verdicts: Again is a miss, Hard
 * is nearly, Good and Easy are both a recall. Which rating a round sends is
 * that round's decision (ADR-016); how the rating looks is not.
 */
export function verdictOfRating(rating: number): Verdict {
  if (rating <= 1) return "wrong";
  if (rating === 2) return "nearly";
  return "right";
}

/**
 * `checkAnswer`'s four readings as three verdicts. A dropped diacritic and a
 * one-letter slip are both the word, nearly, which is what `countsAsRecalled`
 * already says about them one module over.
 */
export function verdictOfCheck(check: "correct" | "diacritics" | "typo" | "wrong"): Verdict {
  if (check === "correct") return "right";
  if (check === "wrong") return "wrong";
  return "nearly";
}
