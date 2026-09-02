/**
 * Whether a sentence somebody recorded can be a line somebody says.
 *
 * This is the first rung of the ladder in `docs/19-situations.md` §2, and
 * Phase 0 exists to find out how far it reaches. Where a recorded usage fits a
 * beat, the other side's line costs a query, needs no model and needs no gate,
 * because nothing was generated. Where it does not, a model composes one inside
 * a closed word list and four checks decide whether the learner sees it. So the
 * share of beats this module can fill is the share of the feature that is free
 * and safe, and it is the number the whole design rests on.
 *
 * The funnel is five questions and they are asked in this order because each
 * one is cheaper than the next:
 *
 *   1. is it about this beat            a form of one of the beat's lemmas
 *   2. is it the right shape            a question where the move asks one
 *   3. is it a sentence somebody said   `naturalSentence`, plus a finite verb
 *   4. can the learner read it          every word inside the closed list
 *
 * There was a fifth and it was wrong. The first version filtered on the CEFR
 * band of the entry the sentence was recorded under, through `isAround`. That
 * window exists to decide which words to *teach* somebody, and it is the wrong
 * question here twice over: a band is a fact about the headword rather than
 * about the sentence filed beneath it, and a symmetric window drops a greeting
 * for being too easy, which took `Tere!` out of every B1 scene. The level
 * enters where it belongs instead, in which units the closed list is built
 * from, and readability then answers the question precisely rather than by
 * proxy: a line every one of whose words the learner has met is a line they
 * can read, whatever headword a lexicographer filed it under.
 *
 * Question three is the one that needed something new. `naturalSentence` was
 * written for the exam and rejects a usage that trails off, carries a slash or
 * labels itself; it has no opinion on `Kodune aadress.`, which is a perfectly
 * good illustration of a noun and is not a thing a receptionist says. A clause
 * needs a finite verb, and this app can list every finite verb form it knows
 * without a parser: the stored principal parts plus `derivedVerbForms`, which
 * `npm run audit:verbs` checked against Ekilex over 797 verbs. A question is
 * let through without one, because `Mis kell?` is a clause a person says and
 * has no verb in it at all.
 *
 * Pure: no React, no Next, no Prisma, no network. Every input is data.
 */
import { naturalSentence } from "@/lib/estonian/cloze";
import { words, type Lexicon } from "./lexicon";
import { QUESTION_SHAPE, type BeatSpec, type MoveKind } from "./types";

/** One recorded sentence, with the entry it was recorded against. */
export interface Line {
  readonly text: string;
  /** The lemma whose entry holds it. Its provenance, and its band. */
  readonly lemma: string;
  readonly cefr: string | null;
}

/**
 * How short and how long a spoken turn is.
 *
 * Two words at the bottom, because a one-word usage under a headword is a label
 * rather than a sentence: `Kodune aadress.` illustrates a noun and is not a
 * thing anybody says at a counter. Fourteen at the top, which is longer than
 * `isBuildable`'s twelve on purpose, because that limit is about holding a
 * sentence in your head to reorder it and this one is about whether a person
 * says the whole thing in one breath.
 *
 * Greeting and leaving are the exception and it is not a special case, it is
 * the shape of those two acts: `Tere!` is a complete turn and so is
 * `Nägemist!`. The floor of two dropped every greeting in the catalogue, which
 * is how this was found.
 */
export const MAX_WORDS = 14;

export function minWords(move: MoveKind): number {
  return move === "greet" || move === "close" ? 1 : 2;
}

export function isQuestion(text: string): boolean {
  return text.trim().endsWith("?");
}

/**
 * Is this something a person says, rather than something a dictionary prints?
 *
 * `hasFiniteVerb` is passed in rather than imported, because the set of every
 * verb form in the dictionary is built once over the whole pool and this
 * function is called once per usage per beat.
 */
export function spokenLine(
  text: string,
  hasFiniteVerb: (word: string) => boolean,
  move: MoveKind = "ask",
): boolean {
  if (!naturalSentence(text)) return false;
  const tokens = words(text);
  if (tokens.length < minWords(move) || tokens.length > MAX_WORDS) return false;
  // A greeting has no verb and needs none. Neither does `Mis kell?`.
  if (move === "greet" || move === "close") return true;
  return isQuestion(text) || tokens.some(hasFiniteVerb);
}

export function fitsMove(text: string, beat: BeatSpec): boolean {
  const shape = QUESTION_SHAPE[beat.move];
  if (shape === "either") return true;
  return isQuestion(text) === (shape === "required");
}

/**
 * Every form of every word one beat is about, as one set.
 *
 * Built once per beat rather than per line, which is not a micro-optimisation:
 * a beat has up to nine lemmas with thirty forms each and the corpus has
 * thousands of sentences, so asking it the other way round is a hundred million
 * lookups to answer a question that is one set membership test.
 */
export function topicForms(beat: BeatSpec, lexicon: Lexicon): ReadonlySet<string> {
  const out = new Set<string>();
  for (const lemma of beat.topic) {
    for (const form of lexicon.byLemma.get(lemma) ?? []) out.add(form);
  }
  return out;
}

/** Does the line actually mention one of the words this beat is about? */
export function onTopic(tokens: readonly string[], topic: ReadonlySet<string>): boolean {
  return tokens.some((t) => topic.has(t));
}

/** The words in the line the scene's own vocabulary cannot account for. */
export function unknownWords(tokens: readonly string[], lexicon: Lexicon): string[] {
  return tokens.filter((w) => !lexicon.forms.has(w));
}

/** Why a line was not usable. Ordered as the funnel asks. */
export type Rejection = "off-topic" | "shape" | "not-spoken" | "unreadable";

export interface Fit {
  readonly ok: boolean;
  readonly why?: Rejection;
  /** How many words the learner would not know. Zero is fully readable. */
  readonly unknown: number;
}

/**
 * Can this recorded sentence be this beat's line?
 *
 * `allowUnknown` is the dial worth having rather than a boolean: a receptionist
 * saying one word you do not know is an ordinary Tuesday, and a line that is
 * two thirds unknown is a wall. Reporting coverage at nought, one and two is
 * what turns "can this be built" into "at what price".
 */
export function fits(input: {
  line: Line;
  tokens: readonly string[];
  beat: BeatSpec;
  topic: ReadonlySet<string>;
  lexicon: Lexicon;
  hasFiniteVerb: (word: string) => boolean;
  allowUnknown?: number;
}): Fit {
  const { line, tokens, beat, topic, lexicon, hasFiniteVerb } = input;
  const allowUnknown = input.allowUnknown ?? 0;
  if (!onTopic(tokens, topic)) return { ok: false, why: "off-topic", unknown: 0 };
  if (!fitsMove(line.text, beat)) return { ok: false, why: "shape", unknown: 0 };
  if (!spokenLine(line.text, hasFiniteVerb, beat.move)) return { ok: false, why: "not-spoken", unknown: 0 };
  const unknown = unknownWords(tokens, lexicon).length;
  if (unknown > allowUnknown) return { ok: false, why: "unreadable", unknown };
  return { ok: true, unknown };
}
