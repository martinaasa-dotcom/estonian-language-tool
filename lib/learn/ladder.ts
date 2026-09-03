/**
 * THE LADDER A NEW WORD CLIMBS, AND WHY IT IS THE SCHEDULER'S OWN.
 *
 * A word arrives knowing nothing about you and leaves as something you can
 * use, and the distance between those two is not one question. Meeting a word
 * is not answering it, picking its meaning out of four is not producing it, and
 * producing it in a sentence is not the same as recognising it on a card. So
 * Learn walks each word up three rungs before it is handed to Practice:
 *
 *   meet    the word, what it means, and an attested sentence with it in
 *   choice  what does this word mean, four options, one of them right
 *   gap     the same sentence with the word taken out of it, typed back in
 *
 * Pass the gap and the word leaves Learn. Miss it and the word drops to the
 * rung below, which is where somebody who nearly had it should be asked from.
 *
 * THE RUNGS ARE NOT A SECOND PROGRESSION. This is the part worth reading. FSRS
 * already keeps a card in Learning across two steps before it graduates to
 * Review, and it already sends a card that was missed back to the first step.
 * A ladder of our own beside that would be two answers to when a word is
 * known, drifting apart a grade at a time, and this app has fixed that fault
 * often enough to know what it costs. So the rung is *read off* the scheduler:
 * `state` and `learningSteps` are both persisted on `Card` already, and the
 * mapping below is the whole of it. Measured against ts-fsrs with the default
 * steps of one minute and ten:
 *
 *   New         + Good  -> Learning, step 1   (choice passed, gap next)
 *   Learning(1) + Good  -> Review              (gap passed, off to Practice)
 *   Learning(1) + Again -> Learning, step 0    (back to choice)
 *   Learning(1) + Hard  -> Learning, step 1    (nearly, ask the gap again)
 *   New         + Easy  -> Review              ("I already know this one")
 *
 * Nothing here needs a column, a counter or a second table, and a learner who
 * never opens Learn is scheduled exactly as they always were.
 *
 * Pure: two numbers in, a rung out. `lib/progress/learn.ts` is the half that
 * reads a database.
 */

/** FSRS's own state numbers, named so a call site does not read as an integer. */
const NEW = 0;
const LEARNING = 1;

/**
 * The card a word's ladder is kept on.
 *
 * One card per word, and every rung reads and writes this one. The rungs ask
 * the same question at a greater depth each time, what does this word mean and
 * then produce it in a sentence, and the recognition card is the one row in a
 * deck that stands for exactly that. A word's other cards are drills on a word
 * you already know, which is what Practice is for.
 *
 * Named here rather than typed into the three queries that filter on it,
 * because "which card carries the ladder" is one fact and three copies of it
 * are how Learn and Practice end up teaching the same word.
 */
export const LADDER_CARD_TYPE = "RECOGNITION";

/**
 * The scheduler states a word on the ladder is in.
 *
 * New and Learning. Relearning is deliberately not one of them: see
 * `isLearningWord`.
 */
export const LADDER_STATES = [NEW, LEARNING] as const;

/**
 * Where a word stands.
 *
 * `kept` is the end of it: the word has been produced in a sentence and is
 * Practice's from then on. It is not "done", because nothing about a word is
 * ever done, and calling it that on a screen would promise a learner something
 * spaced repetition spends the next year quietly disagreeing with.
 */
export type Rung = "meet" | "choice" | "gap" | "kept";

/** In the order a word climbs them, which is the order a session asks in. */
export const RUNGS: readonly Rung[] = ["meet", "choice", "gap", "kept"];

/** How far up a word is, from the two scheduling fields the card already carries. */
export function rungOf(state: number, learningSteps: number): Rung {
  if (state === NEW) return "meet";
  if (state !== LEARNING) return "kept";
  return learningSteps >= 1 ? "gap" : "choice";
}

/**
 * Whether a word is Learn's rather than Practice's.
 *
 * New and Learning, and deliberately **not** Relearning. `isStillLearning` in
 * the scheduler takes all three, which is the right line for "should this card
 * be scaffolded"; it is the wrong line here. A word that reached Review and
 * then broke is a memory that formed and slipped, which is what a review
 * schedule exists to catch. Sending it back to a first meeting would teach
 * somebody a word they already know and take the slot from one they do not.
 */
export function isLearningWord(state: number): boolean {
  return (LADDER_STATES as readonly number[]).includes(state);
}

/**
 * How many words a session takes at once.
 *
 * Five, and the number is doing real work rather than looking round. It is the
 * whole of a round: five words met, then the same five asked, then the same
 * five again in a sentence, so a learner sees a word, meets four others, and
 * is asked the first one back at the point where they have to actually
 * retrieve it rather than read it off the screen above. Karpicke and Roediger
 * measured what that distance is worth and this app cites it on the first
 * meeting screen already.
 *
 * It is also the gap a word waits before it comes round again, which is why
 * there is one constant and not two: a round is a lap of the batch.
 */
export const LEARN_BATCH = 5;

/** What a learner did with a question, in the four shapes Learn can tell apart. */
export type Outcome = "right" | "near" | "wrong" | "known";

/**
 * The grade an outcome sends.
 *
 * `RATINGS` is untouched and so is the scheduler: this only decides which of
 * the four to send, which is the same latitude every other mode has (ADR-016).
 * `near` is the diacritics-and-typos verdict the marker already returns, and
 * Hard is what it has always meant elsewhere: right enough not to start again,
 * not right enough to move on.
 *
 * `known` is the one button on this screen that is a claim rather than an
 * answer. Easy from New graduates a card outright, which is exactly what
 * somebody pressing "I already know this one" is asserting, and it puts the
 * word into the review rotation at a week rather than dropping it out of the
 * app.
 */
export function ratingFor(outcome: Outcome): 1 | 2 | 3 | 4 {
  switch (outcome) {
    case "right": return 3;
    case "near": return 2;
    case "wrong": return 1;
    case "known": return 4;
  }
}

/**
 * A batch in the order a session asks it.
 *
 * Lowest rung first, so the words that have never been seen are taught before
 * the returning ones are tested. Stable inside a rung, because the caller has
 * already answered a different question with that order: the words nearest the
 * learner's level come first.
 */
export function orderByRung<T>(items: readonly T[], rungOfItem: (item: T) => Rung): T[] {
  return [...items].sort((a, b) => RUNGS.indexOf(rungOfItem(a)) - RUNGS.indexOf(rungOfItem(b)));
}

/** How a session ended: what moved on, and what is coming back tomorrow. */
export interface LadderTally {
  kept: number;
  staying: number;
}

export function tally(rungs: Iterable<Rung>): LadderTally {
  let kept = 0;
  let staying = 0;
  for (const rung of rungs) {
    if (rung === "kept") kept += 1;
    else staying += 1;
  }
  return { kept, staying };
}
