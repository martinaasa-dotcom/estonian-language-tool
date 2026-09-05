import { BANDS, type Band } from "@/lib/assessment/types";
import type { CaseSpec } from "@/lib/estonian/cases";
import { shuffle } from "@/lib/random/shuffle";

/*
  THE WRONG ANSWERS.

  A multiple choice question is exactly as hard as its second best option, and
  this test had no second best option. `choices` took whatever the shuffle
  handed back first out of every gloss in the dictionary, so a beginner asked
  what `must` means chose between "black", "plastic bag", "narcomania, drug
  addiction, substance abuse" and "user experience". Three of those can be
  crossed out by somebody who has never seen an Estonian word in their life:
  two are C1 nouns out of a corner of the dictionary an A1 question has no
  business in, and one runs to three senses where the answer is one word. What
  that question measures is whether the reader can spot the odd option, and
  nobody is placed at A2 for that.

  It matters more here than anywhere else in the app. A placement check is ten
  minutes long and every question it asks is load bearing, so a question that
  can be answered by elimination is a question that measured nothing and a
  level built on four of them is wrong about somebody's Estonian on the day
  they are deciding where to start.

  So a wrong answer is chosen for how near it is to the right one. Near means
  what a learner cannot use to eliminate it: the same part of speech, the same
  CEFR band, the same shape on the page, and, where the course teaches the
  word, the same unit, which is how "black" ends up beside "white", "gray" and
  "brown" rather than beside a plastic bag. For a case it means the cases that
  answer the same question word, since `kus?` is answered by two of them and
  telling those two apart is the whole of what the question asks.

  The one thing nearness may never do is produce a second right answer. Every
  pick is still filtered by the caller's own test of what counts as the same
  answer, and that test got stricter as the options got closer, not looser:
  `sameMeaning` for a gloss, and for a sentence a containment rule, because
  two recorded usages that share every content word are two ways of saying one
  thing and a learner picking either of them is right.

  Three callers read it and that is why it lives here rather than inside any
  one of them: the placement check (`lib/assessment/items.ts`), the mock exam
  (`lib/exam/paper.ts`) and `buildOptions` in `lib/estonian/government.ts`,
  which is the one table of what cases to offer against a governed one and is
  shared by the exam and the government practice mode. A copy per caller is
  three answers to one question, drifting a weight at a time, which is the
  argument `lib/cache/singleFlight.ts` makes about itself.

  Pure, and it holds no Estonian of its own: every gloss, form and sentence it
  sorts was read out of the dictionary by the caller, and a case reaches it as
  a `CaseSpec` from `lib/estonian/cases.ts`. The CEFR ladder comes from
  `lib/assessment/types.ts`, which is where this app declares it.
*/

/** Anything a learner can be asked to pick between. */
export interface Textual {
  readonly text: string;
}

/** How many wrong answers a question carries. Four options, one of them right. */
const WRONG = 3;

/**
 * The right answer and three wrong ones, in a random order.
 *
 * Returns null rather than padding when the pool cannot supply three that are
 * genuinely wrong. A question with two right answers marks a learner wrong for
 * being right, which is the one thing a placement check may never do, and it
 * is the reason nearness is a ranking rather than a filter: the candidates
 * that survive `distinct` are the same ones as before, this only decides which
 * three of them are worth putting on the screen.
 */
export function pickOptions<T extends Textual>(input: {
  answer: T;
  candidates: readonly T[];
  rng: () => number;
  /** True when the two can safely sit in one question. Never relaxed here. */
  distinct: (a: string, b: string) => boolean;
  /** Higher is harder to cross out. Ties are broken by the shuffle. */
  nearness: (candidate: T, answer: T) => number;
}): { options: string[]; answer: number } | null {
  const { answer, candidates, rng, distinct, nearness } = input;

  // Shuffled before it is sorted, and the sort is stable, so options that are
  // equally near come up in a different order for every seed. Without that a
  // retake of the check would show the same four lines it had just been given
  // the answer to.
  const ranked = shuffle(candidates, rng)
    .map((c, i) => ({ c, score: nearness(c, answer), i }))
    .sort((a, b) => b.score - a.score || a.i - b.i);

  /*
    Ranked first and tested second, which is an ordering rather than a taste.
    Testing the pool before sorting it asks whether every gloss in the
    dictionary could sit beside this one, and that is the expensive half: three
    hundred candidates a question and about fifteen hundred questions a paper.
    Walking the ranked list asks it of the handful actually in the running,
    which took a paper from 569ms to 384ms, and counting a line's shape when
    the option is built rather than inside every comparison took it to 68ms,
    against the 18ms the shuffle it replaced cost. The answer itself ranks top
    and is thrown out here on the first pass, exactly as any other option that
    means the same thing is.
  */
  const wrong: T[] = [];
  for (const { c } of ranked) {
    if (!distinct(c.text, answer.text)) continue;
    if (wrong.some((w) => !distinct(w.text, c.text))) continue;
    wrong.push(c);
    if (wrong.length === WRONG) break;
  }
  if (wrong.length < WRONG) return null;

  const options = shuffle([answer, ...wrong], rng).map((o) => o.text);
  return { options, answer: options.indexOf(answer.text) };
}


// ── What counts as the same answer ───────────────────────────────────────────

/**
 * Words that say nothing about what a gloss means.
 *
 * Without this list "in the morning" and "in the evening" share `the` and are
 * read as one meaning, so the two options a learner would find hardest to tell
 * apart are the two this can never offer them. Anything under three letters is
 * dropped anyway.
 */
const EMPTY_WORDS = new Set([
  "the", "and", "for", "with", "from", "into", "onto", "out", "off", "not",
  "are", "was", "were", "been", "being", "his", "her", "its", "their", "our",
  "you", "your", "they", "them", "she", "him", "who", "whom", "that", "this",
  "these", "those", "there", "here", "any", "some", "one", "someone",
  "something", "somebody", "sth", "sb", "etc",
]);

function words(text: string, dropEmpty: boolean): Set<string> {
  const out = new Set<string>();
  for (const word of text.toLowerCase().replace(/[^\p{L}\s]/gu, " ").split(/\s+/)) {
    if (word.length > 2 && !(dropEmpty && EMPTY_WORDS.has(word))) out.add(word);
  }
  return out;
}

/**
 * What two pieces of English are about, in the strictest reading that still
 * says something.
 *
 * The empty words come out first, and both sides go back to the full reading
 * the moment either one is left with nothing. Dropping them one side at a time
 * is what would hurt: "one" would empty out while "one, single" kept `single`,
 * and the two would be read as different meanings and offered in one question.
 */
function compared(a: string, b: string): [Set<string>, Set<string>] {
  const strict: [Set<string>, Set<string>] = [words(a, true), words(b, true)];
  if (strict[0].size > 0 && strict[1].size > 0) return strict;
  return [words(a, false), words(b, false)];
}

/** Loose enough to catch "a car" against "car", which is not a distractor. */
export function sameMeaning(a: string, b: string): boolean {
  const [x, y] = compared(a, b);
  if (x.size === 0 || y.size === 0) return a.trim().toLowerCase() === b.trim().toLowerCase();
  for (const w of x) if (y.has(w)) return true;
  return false;
}

/**
 * Whether two recorded sentences say the same thing.
 *
 * A gloss shares one word with another gloss and the two are usually one
 * meaning; a sentence shares one word with another sentence and they are
 * usually about the same room. So the rule is containment: when everything the
 * shorter sentence says is also said by the longer one, a learner who picks
 * either is right and the question is unmarkable. Overlap short of that is the
 * whole point, because it forces the sentence to be read rather than scanned
 * for the one word that was recognized.
 */
export function sameSentence(a: string, b: string): boolean {
  if (a.trim().toLowerCase() === b.trim().toLowerCase()) return true;
  const [x, y] = compared(a, b);
  if (x.size === 0 || y.size === 0) return true;
  const [small, large] = x.size <= y.size ? [x, y] : [y, x];
  for (const w of small) if (!large.has(w)) return false;
  return true;
}

export const differentText = (a: string, b: string) => a.trim().toLowerCase() !== b.trim().toLowerCase();
export const differentMeaning = (a: string, b: string) => !sameMeaning(a, b);
export const differentSentence = (a: string, b: string) => !sameSentence(a, b);

// ── Nearness ─────────────────────────────────────────────────────────────────

/** What a line of English looks like before anybody reads it. */
interface Shape {
  readonly senses: number;
  readonly words: number;
  readonly length: number;
}

/** An English meaning, with the four things a learner could eliminate it by. */
export interface GlossOption extends Textual {
  /** As the dictionary labels it: NOUN, VERB, ADJECTIVE and the rest. */
  readonly pos: string;
  readonly band: Band | null;
  /** The course unit that introduces the word, where the course teaches it. */
  readonly theme: string | null;
  readonly shape: Shape;
}

/**
 * An option, built once.
 *
 * Ranking asks every candidate in the pool about every question, so anything
 * the line already knows about itself is counted here rather than inside a
 * comparison that runs several hundred thousand times a paper. Splitting the
 * same string over and over was most of what a paper cost.
 */
export function glossOption(input: Omit<GlossOption, "shape">): GlossOption {
  return { ...input, shape: shapeOf(input.text) };
}

function shapeOf(text: string): Shape {
  let senses = 1;
  let words = 0;
  let inWord = false;
  for (const ch of text) {
    if (ch === ",") senses++;
    if (ch === " " || ch === "\t" || ch === "\n") inWord = false;
    else if (!inWord) {
      inWord = true;
      words++;
    }
  }
  return { senses, words, length: text.length };
}

/**
 * How hard an English meaning is to cross out without knowing the word.
 *
 * The four signals are the four ways the old options gave themselves away,
 * weighted by how cheap each one is to spot. A shared course unit is worth
 * most because it is the only signal that puts the answer among its own
 * neighbors: "black" against "white" and "gray" cannot be reasoned out at
 * all, it has to be known. The part of speech is next, since an adjective
 * standing among three nouns is one glance. The band is what kept a C1 noun
 * out of an A1 question, and shape is the giveaway nobody notices they are
 * using: three senses and a comma beside three one-word options is the answer
 * before a word of it has been read.
 */
export function glossNearness(candidate: GlossOption, answer: GlossOption): number {
  let score = 0;
  if (candidate.theme && candidate.theme === answer.theme) score += 5;
  if (candidate.pos === answer.pos) score += 4;
  score += bandCloseness(candidate.band, answer.band);
  score += shapeCloseness(candidate.shape, answer.shape);
  return score;
}

/**
 * The CEFR tag a dictionary entry carries, where it carries a usable one.
 *
 * Here rather than in either caller because a band is only ever read to decide
 * what an option is worth, and both question builders were about to write the
 * same three lines.
 */
export function bandOf(cefr: string | null | undefined): Band | null {
  return BANDS.includes(cefr as Band) ? (cefr as Band) : null;
}

function bandCloseness(a: Band | null, b: Band | null): number {
  if (!a || !b) return 0;
  const gap = Math.abs(BANDS.indexOf(a) - BANDS.indexOf(b));
  if (gap === 0) return 3;
  if (gap === 1) return 1;
  return 0;
}

/** How alike two options look before either of them is understood. */
function shapeCloseness(a: Shape, b: Shape): number {
  let score = near(a.senses, b.senses, 2) + near(a.words, b.words, 2);
  const longer = Math.max(a.length, b.length);
  const gap = Math.abs(a.length - b.length);
  if (gap <= Math.max(3, longer * 0.25)) score += 2;
  else if (gap <= longer * 0.6) score += 1;
  return score;
}

/** Full marks for the same count, half for one out, nothing beyond that. */
function near(a: number, b: number, worth: number): number {
  const gap = Math.abs(a - b);
  if (gap === 0) return worth;
  if (gap === 1) return Math.ceil(worth / 2);
  return 0;
}

/** A recorded sentence's English, with the words it is about counted once. */
export interface SentenceOption extends Textual {
  readonly said: ReadonlySet<string>;
}

export function sentenceOption(text: string): SentenceOption {
  return { text, said: words(text, true) };
}

/**
 * How hard an English sentence is to cross out without reading it.
 *
 * Shared vocabulary is worth most, and it is the signal the old rule could not
 * offer at all: it read any shared word as a shared meaning, so the only
 * sentences it would put in one question were four sentences about four
 * unrelated things, and picking between those is a vocabulary question wearing
 * a sentence. A question mark among three full stops, and one line among three
 * paragraphs, are the same free elimination that shape is for a gloss.
 */
export function sentenceNearness(candidate: SentenceOption, answer: SentenceOption): number {
  let shared = 0;
  for (const w of candidate.said) if (answer.said.has(w)) shared++;

  let score = Math.min(shared, 2) * 2;
  score += near(candidate.said.size, answer.said.size, 3);
  if (asks(candidate.text) === asks(answer.text)) score += 1;
  const longer = Math.max(candidate.text.length, answer.text.length);
  score += Math.abs(candidate.text.length - answer.text.length) <= longer * 0.35 ? 2 : 0;
  return score;
}

const asks = (sentence: string) => sentence.trim().endsWith("?");

/**
 * The three cases a first year does not reach.
 *
 * Everything else is a principal part, one of the six local cases, saav or
 * kaasaütlev, which is roughly what a beginner's course covers. Rajav, olev
 * and ilmaütlev a learner can cross out without looking at the form in front
 * of them, simply because their class has not got there.
 *
 * Which is why this is a match rather than a bonus, and it took a question
 * about kaasaütlev to see it. Rewarding a familiar option outright would put
 * three first-year cases around every answer, so on the rarer ones it would
 * hand back the elimination it exists to remove: the odd option is the answer,
 * and the reader never has to read an ending at all. It is drawn by name
 * rather than by where the traditional order puts a case, because that order
 * has kaasaütlev last and a class teaches -ga in its first month.
 */
const LATE_CASES: readonly string[] = ["TERMINATIVE", "ESSIVE", "ABESSIVE"];

const familiar = (spec: CaseSpec) => !LATE_CASES.includes(spec.key);

/**
 * How hard a case is to tell from another case.
 *
 * The question word is what a class actually teaches, and it is what makes
 * this hard in the right way: `kus?` is answered by seesütlev and alalütlev
 * both, so a learner who knows only that the form means "somewhere" has to
 * decide whether the thing is in it or on it, which is the distinction the
 * question exists to measure. After that comes the ending family, since -s,
 * -st and -sse are one series and hearing which of them was said is most of
 * the listening question.
 *
 * This is the only part of the case ranking that survived the level check
 * dropping its case-name questions: what asks one now is `buildOptions` in
 * `lib/estonian/government.ts`, which is a question about a verb rather than
 * about a form, so it needs the scoring and none of the labeling that went
 * with it.
 */
export function caseNearness(candidate: CaseSpec, answer: CaseSpec): number {
  let score = 0;

  const asked = new Set(answer.question.split(/\s+/));
  for (const word of candidate.question.split(/\s+/)) if (asked.has(word)) score += 5;

  if (
    candidate.suffix && answer.suffix
    && (candidate.suffix.startsWith(answer.suffix) || answer.suffix.startsWith(candidate.suffix))
  ) score += 3;
  if (candidate.principal === answer.principal) score += 2;
  if (familiar(candidate) === familiar(answer)) score += 2;
  if (candidate.suffix.length === answer.suffix.length) score += 1;
  return score;
}

/**
 * How hard one Estonian form is to tell from another.
 *
 * These are all forms of the one word, so the stem is shared and the ending is
 * the question. What this sorts out is the three principal parts, which are
 * where the stem itself changes: `tuba` beside `toas` is answered by looking
 * at the first two letters, where `toast`, `toasse` and `toale` all have to be
 * read to the end.
 */
export function formNearness(candidate: Textual, answer: Textual): number {
  const a = candidate.text.toLowerCase();
  const b = answer.text.toLowerCase();
  let shared = 0;
  while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared++;

  let score = Math.min(shared, 8);
  score += near(a.length, b.length, 3);
  if (a.slice(-1) === b.slice(-1)) score += 1;
  return score;
}
