import { isFormSlot } from "@/lib/srs/slots";

/**
 * HOW LONG ONE ANSWER TAKES, WHICH IS THE HALF OF LEARNING NOTHING HERE READ.
 *
 * `Review.durationMs` has been written since the scheduler was built. Every
 * timed round sends it, the offline outbox carries it, `writeGrade` bounds it,
 * and the backup includes it. `lib/stats/pace.ts` reads it as the length of a
 * sitting, for the plan, which is a fact about an evening. Nothing has read it
 * as the time on one answer, which is a fact about a word: not a chart, not
 * the scheduler, not the round that decides how hard to ask next. Two
 * quantities off one column, in two modules, so neither carries the other's
 * floor.
 *
 * The question it answers is the one a deck of flashcards cannot: **the
 * difference between knowing a form and being able to reach for it.** Accuracy
 * says a learner gets the seesütlev right nine times in ten. It cannot say
 * whether that takes them half a second or eight, and those are two different
 * states: one is a word they have, the other is a rule they are applying. A
 * conversation only gives you the first.
 *
 * THREE RULES DECIDE WHICH ROWS COUNT, AND EACH IS A WAY THE NUMBER WOULD
 * OTHERWISE BE ABOUT SOMETHING ELSE.
 *
 * **Only answers a round timed.** Zero is not a fast answer, it is a round
 * that never started a clock, and that is most of them: Sõnad, the crossword,
 * picture match, minimal pairs, the government drill and the paste-your-own
 * round all grade in bulk and write zero. Match used to divide its round clock
 * by the number of pairs, which is worse than zero because it survives a
 * `> 0` filter while measuring nothing; it writes zero now, for that reason.
 *
 * **Only answers that were recalled.** Time on a wrong answer measures how
 * long somebody stared at something they did not know, and that is dominated
 * by whether they gave up or kept trying, which is temperament rather than
 * memory. Retrieval speed is a fact about successful retrieval.
 *
 * **The median, never the mean.** `writeGrade` caps the column at ten
 * minutes, so a tab left open at lunch writes exactly 600,000 and the value is
 * a ceiling rather than a measurement. One of those moves a mean over twenty
 * answers by half a minute and moves a median not at all.
 *
 * A fourth shape is why `forms` defaults to true below. On a self-graded flip
 * card the duration runs until the learner presses a rating, so it includes
 * reading the answer and deciding what to call it, which is the reason
 * `docs/19-research-export.md` keeps the column out of the research file. A
 * case or a verb form is typed and marked, so its clock stops at the answer.
 *
 * AND THE COMPARISON IS AGAINST THE LEARNER'S OWN PACE, NEVER A NUMBER OF
 * OURS. Modes ask for different amounts of typing: producing `toas` and
 * writing a sentence around it are not the same keystrokes, so an absolute
 * threshold in milliseconds would name the typing rather than the recall, and
 * would be a different threshold on a phone. A slot is slow when it is slow
 * *for this learner*, against their own median across everything they were
 * timed on.
 *
 * Pure: no React, no Prisma, no clock. The rows come from the page.
 */

/** Below this many timed, recalled answers, a slot's median is not a pace. */
export const MIN_TIMED = 6;

/**
 * How far above their own median a slot has to sit to be called slow.
 *
 * A ratio rather than a number of seconds, for the reason in the header. Half
 * as long again is wide enough that ordinary variation between modes does not
 * trip it and narrow enough to catch the slot that is genuinely being worked
 * out rather than remembered.
 */
export const SLOW_RATIO = 1.5;

/**
 * How accurate a slot has to be before slowness is the interesting thing
 * about it.
 *
 * Below this the slot is simply not known yet, `components/WeakestCases.tsx`
 * already names it, and a second panel saying the same thing in a different
 * unit is two answers to one question. What this panel is for is the slot the
 * accuracy chart calls fine.
 */
export const FLUENT_ACCURACY = 80;

/** One review, in the shape a pace reading needs it. */
export interface AnswerTimePoint {
  slot: string | null;
  rating: number;
  durationMs: number;
}

export interface SlotAnswerTime {
  slot: string;
  /** Timed, recalled answers behind the median. Never below `MIN_TIMED`. */
  answers: number;
  medianMs: number;
  /** Over every timed answer of this slot, recalled or not. */
  accuracy: number;
}

export interface AnswerTimeReading {
  /** The learner's own median across every timed, recalled answer. */
  medianMs: number | null;
  /** Every slot with enough behind it, slowest first. */
  slots: SlotAnswerTime[];
  /**
   * The slots they get right and still have to think about: accurate, and at
   * least `SLOW_RATIO` times their own median. Slowest first.
   */
  slow: SlotAnswerTime[];
}

/** Whether one row is a timed answer at all. See the header. */
function timed(r: AnswerTimePoint): boolean {
  return r.durationMs > 0 && Number.isFinite(r.durationMs);
}

/**
 * The middle value, on a copy.
 *
 * Sorts numerically rather than by `sort()`'s default, which is lexicographic
 * and would put 10000 before 900.
 */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/**
 * Pace per slot, and the slots that are accurate but slow.
 *
 * `forms` keeps this to cases and named parts of the verb, which is the
 * default and is what the panel wants: "what does this word mean" is a
 * different kind of question and its pace is a fact about reading speed. Pass
 * false to read everything.
 */
export function answerTimeReading(reviews: readonly AnswerTimePoint[], forms = true): AnswerTimeReading {
  const perSlot = new Map<string, { times: number[]; ok: number; total: number }>();
  const all: number[] = [];

  for (const r of reviews) {
    if (!r.slot || !timed(r)) continue;
    if (forms && !isFormSlot(r.slot)) continue;

    const entry = perSlot.get(r.slot) ?? { times: [], ok: 0, total: 0 };
    entry.total++;
    // Recalled only, and the same test the rest of the app uses for it.
    if (r.rating >= 3) {
      entry.ok++;
      entry.times.push(r.durationMs);
      all.push(r.durationMs);
    }
    perSlot.set(r.slot, entry);
  }

  const overall = median(all);

  const slots: SlotAnswerTime[] = [...perSlot.entries()]
    .filter(([, v]) => v.times.length >= MIN_TIMED)
    .map(([slot, v]) => ({
      slot,
      answers: v.times.length,
      medianMs: median(v.times)!,
      accuracy: Math.round((v.ok / v.total) * 100),
    }))
    .sort((a, b) => b.medianMs - a.medianMs || b.answers - a.answers || a.slot.localeCompare(b.slot));

  const slow = overall === null ? [] : slots.filter(
    (s) => s.accuracy >= FLUENT_ACCURACY && s.medianMs >= overall * SLOW_RATIO,
  );

  return { medianMs: overall, slots, slow };
}
