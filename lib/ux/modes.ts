/**
 * Every way to practise, once.
 *
 * There were four lists of these. Today carried six tiles with one wording,
 * `/practice` carried eleven modes with another, `components/PracticeModes.tsx`
 * carried seven with a third and no screen rendered it at all, and the command
 * palette carried six more. The same mode was called "60 seconds, weak cards"
 * on one screen and "60 seconds" on the next, Sentences was `accent` here and
 * `blush` there, and adding a mode meant remembering four files, which is how
 * a mode ends up on two screens and missing from the other two.
 *
 * So this is the table and the screens read it. What a mode *is* lives here;
 * what it is like *right now* does not, because that is a database query and
 * this module has none. `/practice` computes "12 ready" or "Best: 38" and
 * hands it in beside the row.
 *
 * Two groups, and the split is how long the thing takes rather than how hard
 * it is: `quick` is a round you can finish waiting for a bus, `targeted` is
 * what you open when you already know what is going wrong.
 *
 * Pure, and the icon is a lucide *name* for the reason `lib/ux/nav.ts` gives.
 */

import type { Tone } from "./nav";

export interface PracticeMode {
  href: string;
  /** What it is called, on every screen that offers it. */
  title: string;
  /** Three or four words for what it does. Under the title on a tile. */
  subtitle: string;
  /** The longer reason to press it. Shown where there is room for a paragraph. */
  blurb: string;
  /** A lucide icon name. See components/icons.tsx. */
  icon: string;
  /** Its hue. Six quick modes, six hues, and no two of them share one. */
  tone: Tone;
  /**
   * What kind of thing it is: a round, or a drill for a named weakness.
   */
  group: "quick" | "targeted";
  /**
   * A standing fact about the mode, for the ones where there is no figure to
   * show. `/practice` prefers a live count when it has one.
   */
  note: string;
  /**
   * Reached from the screen that names the weakness it drills, so the practice
   * menu does not carry a row for it. The same field, with the same meaning, as
   * `Destination.within` in `lib/ux/nav.ts`.
   *
   * Never "hidden". This file already drew the distinction and then ignored it:
   * `targeted` is described above as "what you open when you already know what
   * is going wrong", and all five of them sat on a menu under a heading saying
   * so, which is a list of answers to a question the learner has not been asked
   * yet. A verb government drill is worth pressing on the page explaining verb
   * government, and worth nothing on a menu beside five other things.
   *
   * All of them stay in `PRACTICE_MODES`, so the command palette still goes
   * there and a bookmark still works. The value is where it is reached from,
   * and there is an invariant that the page it names really does link to it.
   */
  within?: string;
}

export const PRACTICE_MODES: readonly PracticeMode[] = [
  {
    href: "/review/sprint", title: "Case Sprint", subtitle: "60 seconds", icon: "Zap", tone: "butter",
    group: "quick", note: "No score yet",
    blurb: "Sixty seconds, as many case forms as you can manage, drawn from the cards you are weakest on.",
  },
  {
    href: "/review/match", title: "Match", subtitle: "Eight pairs", icon: "Grid2x2", tone: "mint",
    group: "quick", note: "No time yet",
    blurb: "Pair eight words with their meanings against the clock.",
  },
  {
    href: "/review/sentences", title: "Sentences", subtitle: "Word order", icon: "Puzzle", tone: "accent",
    group: "quick", note: "Needs sentences",
    blurb: "Rebuild a sentence a native writer actually wrote, one word at a time.",
  },
  {
    href: "/review/listening", title: "Listening", subtitle: "Hear it, pick it", icon: "Headphones",
    tone: "sky", group: "quick", note: "Audio from TartuNLP",
    blurb: "Hear a word with nothing written down, and pick what it means.",
  },
  {
    href: "/review/dictation", title: "Dictation", subtitle: "Hear it, write it", icon: "Ear", tone: "peach",
    group: "quick", note: "Needs sentences",
    blurb: "Hear a sentence and write it down, diacritics and all.",
  },
  {
    href: "/review/speaking", title: "Speaking", subtitle: "Out loud", icon: "Mic", tone: "blush",
    group: "quick", note: "Shadowing",
    blurb: "Say it, then compare yourself with a native rendering. Nothing scores your pronunciation.",
  },
  {
    href: "/review/write", title: "Writing", subtitle: "Your own sentence", icon: "PenLine", tone: "mint",
    group: "targeted", note: "Free production",
    blurb:
      "Use a word in a named case. The form is checked against the dictionary before Anu ever " +
      "sees it, so the verdict is certain even when the AI is off.",
    within: "/grammar/[case]",
  },
  {
    href: "/review/government", title: "Verb government", subtitle: "Which case?", icon: "Scale",
    tone: "peach", group: "targeted", note: "Multiple choice",
    blurb:
      "Aitan sind, but helistan sulle. English gives you no clue, so rektsioon has to be learned " +
      "per verb.",
    within: "/grammar/topic/government",
  },
  {
    href: "/review/pairs", title: "Minimal pairs", subtitle: "Long or short", icon: "Ear", tone: "sky",
    group: "targeted", note: "Needs audio", within: "/grammar/topic/gradation",
    blurb:
      "Maja or majja? The length distinction Estonian spelling only half records, and the one " +
      "thing reading practice can never teach you.",
  },
  {
    href: "/review/cloze", title: "From your reading", subtitle: "Paste real Estonian",
    icon: "ScissorsLineDashed", tone: "butter", group: "targeted", note: "Your own text",
    blurb:
      "Bring an article or your homework. Words already in your deck get blanked out, and the " +
      "answer is the form a native writer actually chose.",
    within: "/dictionary",
  },
  {
    href: "/review/clinic", title: "Leech clinic", subtitle: "What keeps failing", icon: "Stethoscope",
    tone: "blush", group: "targeted", note: "From your log",
    blurb:
      "The handful of cards you keep getting wrong, with what their history says about how they " +
      "are failing, instead of quietly burying them.",
    within: "/progress",
  },
];

/**
 * The quick rounds, in the order they are worth offering.
 *
 * The first three need nothing but a deck. The rest need audio, a microphone
 * or a recorded sentence, so they are the ones most likely to be a dead end on
 * a fresh account, and Today shows the first `practiceTiles(stage)` of them.
 */
export const QUICK_MODES = PRACTICE_MODES.filter((m) => m.group === "quick" && !m.within);

/**
 * The drills for a named weakness, and where each is reached from.
 *
 * `/practice` does not draw these. Each one is on the page that names the thing
 * it drills, which is the only screen where a learner has a reason to want it:
 * the clinic sits under the panel listing the cards they keep failing, the verb
 * government drill under the page explaining rektsioon, writing under the case
 * it asks you to write in, and pasting your own Estonian beside the scanner,
 * which is the other way of bringing your own text in.
 */
export const TARGETED_MODES = PRACTICE_MODES.filter((m) => m.within);

/** Whichever mode drills a given thing, for the page that names it. */
export function modeAt(href: string): PracticeMode | undefined {
  return PRACTICE_MODES.find((m) => m.href === href);
}
