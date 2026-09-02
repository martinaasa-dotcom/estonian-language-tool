/**
 * THE ORDER A SITTING TEACHES IN.
 *
 * A word was taught and then not asked. `askFor` sends a card nobody has seen
 * to `intro`, which shows the word, its meaning and an attested sentence with
 * the form marked in it, and that is the right first screen. What happened next
 * was that meeting it graded it Good and the session moved on, so a learner met
 * new words and was tested on none of them until the scheduler brought them
 * back, which on a fresh card is the next day at the earliest.
 *
 * That is teaching without checking, and it is the gap reported as the content
 * not flowing: see it once, then meet it cold tomorrow. Every app that does
 * this well tests inside the same sitting, because the point of meeting a word
 * is to have something to recall a minute later.
 *
 * So a sitting **teaches a few words, then asks those words back.** A few
 * rather than one because a word asked four seconds after it was shown is still
 * on the screen behind your eyes and tests nothing, and a few rather than twenty
 * because by the twentieth the first is gone.
 *
 * THE BATCH COUNTS WORDS, NOT CARDS, which is the correction that came out of
 * driving this in a browser. A word carries several cards: recognition,
 * production, and one per case the dictionary can build, so `Euroopa` alone is
 * five of them. Batching by card taught `Euroopa` five times in a row, on five
 * screens that differ only in a line at the bottom saying what the card will
 * ask later. That is not five new words, it is one word five times, and it is
 * the opposite of the variety the batch exists for.
 *
 * A WORD IS INTRODUCED ONCE, TOO. The introduction is about the word, since it
 * shows the lemma, the gloss and a sentence, and none of that changes between a
 * word's cards. So a batch emits one teaching step per word and then the
 * answering steps for every card of those words.
 *
 * WHAT THIS MODULE DOES NOT DECIDE. It does not grade, schedule, or choose
 * which words are taught: FSRS still decides when a card comes back and
 * `atLevelFirst` still decides which unseen ones are worth teaching. This is
 * the order of one sitting and nothing else.
 *
 * Pure and generic over the card, so it holds no React, no Prisma and no
 * Estonian, and the test can run it over strings.
 */

/** How many new words are met before the first of them is asked back. */
export const LEARN_BATCH = 5;

export interface LearnStep<T> {
  card: T;
  /**
   * True on the step that *shows* a word rather than asking for it.
   *
   * The distinction is the whole module. A teaching step writes no review: it
   * is not an answer, and grading a card for having been looked at is how a
   * word ends up scheduled a week out on the strength of nothing. The steps
   * after it, on the same word in the same sitting, are the ones that count.
   */
  teach: boolean;
}

export interface QueueOptions<T> {
  /** How many distinct words a batch introduces before asking any of them. */
  batch?: number;
  /**
   * What makes two cards the same word. Cards sharing a key are introduced
   * once between them and counted once against the batch.
   *
   * Defaults to every card being its own word, which is the honest answer for
   * a caller that has no lemma to offer: it degrades to batching by card
   * rather than silently collapsing unrelated cards into one.
   */
  wordOf?: (card: T) => string | null | undefined;
}

/**
 * A sitting, in the order it happens.
 *
 * Due cards first and unbatched, because they are not being taught: they have
 * a schedule and the schedule is what brought them here. New words follow in
 * groups, each group introduced and then asked.
 *
 * The caller's order inside each group is kept exactly, which matters: the page
 * hands new cards down through `inTeachingOrder`, so a word's recognition card
 * comes before the conjugation card that would otherwise be somebody's first
 * sight of a verb. Nothing here copies or mutates a card.
 */
export function learningQueue<T>(
  due: readonly T[],
  fresh: readonly T[],
  options: QueueOptions<T> = {},
): LearnStep<T>[] {
  const { batch = LEARN_BATCH, wordOf } = options;
  const steps: LearnStep<T>[] = due.map((card) => ({ card, teach: false }));

  // `Math.max(1, ...)` so a caller passing 0 or a negative batch gets one word
  // at a time rather than an infinite loop. There is no batch size at which
  // "teach nothing, then ask it" is the intended answer.
  const size = Math.max(1, Math.floor(batch));

  for (const group of byWord(fresh, size, wordOf)) {
    // One introduction per word, on the first card the caller gave for it.
    const introduced = new Set<string>();
    for (const card of group) {
      const key = keyFor(card, wordOf, group.indexOf(card));
      if (introduced.has(key)) continue;
      introduced.add(key);
      steps.push({ card, teach: true });
    }
    for (const card of group) steps.push({ card, teach: false });
  }
  return steps;
}

/**
 * The new cards split into groups of at most `size` distinct words.
 *
 * A word's cards are never split across two groups, so a word is always asked
 * in the same group it was taught in. That is the property the whole batching
 * rests on and it is why this counts words as it walks rather than slicing.
 */
function byWord<T>(
  fresh: readonly T[],
  size: number,
  wordOf: ((card: T) => string | null | undefined) | undefined,
): T[][] {
  const groups: T[][] = [];
  let current: T[] = [];
  const words = new Set<string>();

  fresh.forEach((card, i) => {
    const key = keyFor(card, wordOf, i);
    if (!words.has(key) && words.size === size) {
      groups.push(current);
      current = [];
      words.clear();
    }
    words.add(key);
    current.push(card);
  });
  if (current.length > 0) groups.push(current);
  return groups;
}

/**
 * What makes two cards the same word.
 *
 * A card whose lemma is missing falls back to its position, which makes it its
 * own word. Reading a missing lemma as one shared key would collapse every
 * such card into a single word, so one introduction would stand for all of
 * them and the rest would be asked having never been shown.
 */
function keyFor<T>(
  card: T,
  wordOf: ((card: T) => string | null | undefined) | undefined,
  index: number,
): string {
  return wordOf?.(card) ?? `#${index}`;
}

/**
 * How many steps in a sitting are answers rather than introductions.
 *
 * The progress counter reads this rather than the queue length. Telling
 * somebody they are 3 of 30 through when several of those thirty are a word
 * being shown to them overstates the work.
 */
export function answerCount<T>(steps: readonly LearnStep<T>[]): number {
  return steps.reduce((n, step) => n + (step.teach ? 0 : 1), 0);
}
