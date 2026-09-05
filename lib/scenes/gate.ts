/**
 * The four checks a composed line has to pass, and it is withheld whole when
 * it fails any of them.
 *
 * `docs/19-situations.md` §2. Never shown with a caveat: a caveat still puts a
 * wrong form in front of somebody trying to learn one, which is the same rule
 * `lib/tutor/verify.ts` follows about a grader's note. What the learner sees
 * instead is the fallback, which is somebody who did not catch what they said.
 *
 * THIS FILE IS THE ONE COPY. `npm run eval:scene` measured the rejection rate
 * §29 publishes, and it did it against an implementation living in the script,
 * which is a number measured on code that was not going to ship. The script
 * reads this now, so the figure and the gate are the same thing. That is the
 * argument `PROVIDER_KEY_ENV` makes about itself: a list that lives in a script
 * measures the script.
 *
 * Everything the checks need comes in as data, because the eval builds it from
 * `prisma/data/expanded.json` and the app builds it from the database, and this
 * module may reach neither.
 *
 * Pure: no React, no Next, no Prisma, no network, no clock.
 */
import type { CaseKey } from "@/lib/estonian/types";
import { words, type Lexicon } from "./lexicon";
import { MAX_WORDS, isQuestion } from "./retrieval";
import { QUESTION_SHAPE, type BeatSpec } from "./types";

/** Which check withheld a line. A line can fail more than one. */
export type Check = "shape" | "vouching" | "register" | "government";

/** A word that demands a case of its complement, by every form it has. */
export interface GovernedWord {
  readonly lemma: string;
  readonly forms: ReadonlySet<string>;
  /** Every case its entry names, never only the primary. */
  readonly cases: ReadonlySet<CaseKey>;
}

export interface GateContext {
  /** The scene's closed word list. Vouching is against this, not the dictionary. */
  readonly lexicon: Lexicon;
  /** Every form of the course's question words, which stand in for a governed complement. */
  readonly questionWords?: ReadonlySet<string>;
  /** Forms of the pronoun this scene's register forbids. */
  readonly wrongRegister: ReadonlySet<string>;
  /** The governed words the scene can see. */
  readonly governed: readonly GovernedWord[];
  /** Every case form of every nominal, so a token can be asked which case it is. */
  readonly caseOf: ReadonlyMap<string, ReadonlySet<CaseKey>>;
}

export interface Verdict {
  /** Empty when the line may be shown. */
  readonly failed: readonly Check[];
  /** The words vouching could not account for, named so a retry can be told. */
  readonly unknown: readonly string[];
}

export function passes(verdict: Verdict): boolean {
  return verdict.failed.length === 0;
}

/**
 * Runs all four and reports every failure rather than the first.
 *
 * All four rather than short-circuiting, because §6 allows one retry with the
 * failing words named and a retry told about one problem out of two comes back
 * with the other.
 */
export function runGate(text: string, beat: BeatSpec, context: GateContext): Verdict {
  const failed: Check[] = [];
  const tokens = words(text);

  if (!shapeOk(text, tokens, beat)) failed.push("shape");

  /*
    VOUCHING IS AGAINST THE SCENE'S OWN LIST, and that distinction is the whole
    constraint. Vouching against the dictionary would pass any Estonian word in
    the language; vouching against a few hundred lemmas means the model is
    choosing inside a box, and a line reaching outside it is a line the learner
    has not been taught to read.
  */
  const unknown = tokens.filter((word) => !context.lexicon.forms.has(word));
  if (unknown.length > 0) failed.push("vouching");

  if (tokens.some((word) => context.wrongRegister.has(word))) failed.push("register");

  if (governmentSuspect(tokens, context)) failed.push("government");

  return { failed, unknown };
}

/**
 * One sentence, inside the word count, punctuated, no markdown, and the shape
 * the move asked for.
 *
 * A move of `ask` that comes back without a question mark did not do what it
 * was told, and a greeting phrased as a question is not a greeting.
 */
function shapeOk(text: string, tokens: readonly string[], beat: BeatSpec): boolean {
  const trimmed = text.trim();
  const sentences = trimmed.split(/[.!?]+\s+/).filter(Boolean).length;
  const shape = QUESTION_SHAPE[beat.move];
  return sentences === 1
    && /[.!?]"?$/.test(trimmed)
    && !/[*_`#[\]]/.test(text)
    && tokens.length > 0
    && tokens.length <= MAX_WORDS
    && !(shape === "required" && !isQuestion(text))
    && !(shape === "forbidden" && isQuestion(text));
}

/**
 * The government check, as weakly as it can be drawn and still be a check.
 *
 * There is no parser here, so nothing can say which noun is a verb's
 * complement, and the strict reading, that every noun must be in a governed
 * case, fires on any sentence carrying an adjunct, which is most of them. So
 * this asks the weakest thing that is still a check: a line holding a governed
 * word has to hold **at least one** nominal in a case that word governs. A line
 * with no governed word and a line with no nominal are both outside what it can
 * say, and it passes them.
 *
 * Measured before it shipped rather than reasoned about. `npm run eval:scene`
 * builds a labeled set out of attested lines and the same lines with one
 * nominal moved into a case the verb does not govern: it withholds 44.3% of
 * real errors and 8.3% of good lines over 494 pairs, so §2's condition is met.
 * A check that fires on honest output is a check somebody waives.
 */
export function governmentSuspect(tokens: readonly string[], context: GateContext): boolean {
  const lower = tokens.map((t) => t.toLowerCase());
  const word = context.governed.find((g) => lower.some((t) => g.forms.has(t)));
  if (!word) return false;

  /*
    A QUESTION WORD IS THE COMPLEMENT. `Kust sa tuled?` holds a governed verb
    and one nominal, the subject, and the case the verb governs is carried by
    `kust`; a check that wanted a noun in the elative beside it withheld the
    sentence a lexicographer recorded for `kuhu`, and every short question a
    friend on the phone asks. The question words are the course's own
    (`kusisonad`), handed in by the caller.
  */
  const questions = context.questionWords;
  if (questions && lower.some((t) => questions.has(t))) return false;

  /*
    AND A SUBJECT IS NOT A COMPLEMENT. The check was written to catch a noun in
    the wrong case after a verb, and it was firing on `See aeg ei sobi enam`,
    where the only nominals are the subject in the nominative and the verb's
    complement is simply not said. A nominal that can be read as a nominative
    is left out of the count, so the check asks its own question: is there a
    noun here in an oblique case the verb does not govern.
  */
  const nominals = lower.filter((t) => context.caseOf.has(t) && !word.forms.has(t));
  const governed = nominals.some((t) => [...(context.caseOf.get(t) ?? [])].some((c) => word.cases.has(c)));
  if (governed) return false;
  const oblique = nominals.filter((t) => !context.caseOf.get(t)?.has("NOMINATIVE"));
  return oblique.length > 0;
}
