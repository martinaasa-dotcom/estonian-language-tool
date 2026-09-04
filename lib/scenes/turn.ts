/**
 * What the dictionary found in a learner's turn, and nothing else.
 *
 * This is the half of a scene with no model in it (`docs/19-situations.md` §8),
 * and the type system is what keeps it that way: `readTurn` is the only
 * producer of `Evidence` and `advance` is its only consumer, so a caller
 * holding a model's opinion about whether somebody was understood cannot
 * satisfy the type. That is `buildOptions` taking a parsed `Government` rather
 * than a case key, pointed at a conversation.
 *
 * Every requirement is decided by a string comparison against something the
 * dictionary vouches for, assembled once into a `TurnContext` by the caller:
 * a form of a word, a case of a word through `caseAnswer`, a value off the
 * role card, a question word, the negator, a pronoun of the expected register.
 * None of that needs a network, a database or a clock.
 *
 * FIVE READINGS RATHER THAN TWO, which is most of what makes this a
 * conversation instead of a marker. "Understood, and you left out the bit I
 * asked for" is what a receptionist actually says and no drill in this app has
 * ever imitated it; "several words I know, none of them the point" is a
 * learner who said something real that the scene did not anticipate, and it
 * gets a narrower re-ask and a report button rather than "say again"; and a
 * turn written in English is recognised as English, because telling somebody
 * "I did not understand" when they wrote a clear English sentence is a lie.
 *
 * Pure: no React, no Next, no Prisma, no network, no clock.
 */
import { looksLikeSentence } from "@/lib/estonian/writing";
import { words, type Lexicon } from "./lexicon";
import { caseKeyFor } from "./lexicon";
import type { BeatSpec, Requirement } from "./types";

/**
 * How a turn was read. The order below is the order they are tested in, and
 * three of them are decided before any requirement is looked at.
 */
export type TurnReading =
  /** Every requirement met. The scene advances and the other side answers. */
  | "complete"
  /** Some met. They answer, and ask again for the part that was missing. */
  | "incomplete"
  /** Nothing met, and most of the words vouched: real Estonian, wrong target. */
  | "offtarget"
  /** Nothing met and little vouched. The repair move: they did not catch it. */
  | "unrecognised"
  /** Written in English. Counted, answered in character, never scolded. */
  | "english"
  /** Their own line handed back. Answered once, and advances nothing. */
  | "echo"
  /** One word where a person would have said a sentence. A look, and a wait. */
  | "fragment";

/** One word of a turn, and whether the scene's own list could vouch for it. */
export interface TurnWord {
  readonly word: string;
  readonly vouched: boolean;
}

/**
 * What the dictionary found. The only thing that can advance a scene.
 *
 * `met` is parallel to the beat's `needs` rather than a set of ids, because a
 * beat can ask for two things of the same kind and the re-ask has to be able
 * to name which one is missing.
 */
export interface Evidence {
  readonly reading: TurnReading;
  /** One per requirement, in the order the beat asked them. */
  readonly met: readonly boolean[];
  /** The indices of the requirements not met, for a narrow re-ask. */
  readonly missing: readonly number[];
  /** Every word of the turn, marked. The debrief prints this. */
  readonly words: readonly TurnWord[];
}

/**
 * Everything the marker needs, resolved from the dictionary by the caller.
 *
 * A struct rather than a pile of parameters because the caller assembles all
 * of it in one query and because the alternative is this module resolving a
 * lemma to its forms, which would put a database inside the one function that
 * may never have one.
 */
export interface TurnContext {
  readonly lexicon: Lexicon;
  /** Every form of the question words the course teaches. */
  readonly questionWords: ReadonlySet<string>;
  /** Every form of the negator. */
  readonly negators: ReadonlySet<string>;
  /** Every form of the pronoun this scene's register expects. */
  readonly registerForms: ReadonlySet<string>;
  /** Prop slot to every spelling that counts as that value, off the role card. */
  readonly data: ReadonlyMap<string, ReadonlySet<string>>;
  /** The line the other side just said, for the echo rule. */
  readonly previous: string;
}

/**
 * English function words, for telling English from unreadable Estonian.
 *
 * §8 says a turn with no Estonian in it is recognised as English rather than
 * as Estonian nobody could read, because those are different things. Nothing
 * else in this module can tell them apart: an unvouched word is unvouched
 * whichever language it is in.
 *
 * A closed list of function words rather than a guess about spelling, and
 * function words rather than content words, because "appointment" is a word a
 * learner might be reaching for and "I don't" is not. English is the one
 * language this project may write (ADR-005), which is what makes a list here
 * allowed at all; the same latitude `lib/copy/voice.ts` takes.
 *
 * Two of them, so a single loan word inside an Estonian sentence is not read
 * as a turn in English.
 */
const ENGLISH = new Set([
  "a", "an", "and", "are", "at", "but", "can", "cannot", "did", "do", "does",
  "dont", "for", "from", "have", "how", "i", "in", "is", "it", "me", "my",
  "not", "of", "on", "or", "please", "she", "sorry", "that", "the", "there",
  "they", "this", "to", "was", "we", "what", "when", "where", "who", "why",
  "will", "with", "would", "you", "your",
]);
const ENGLISH_FLOOR = 2;

/**
 * Half the words vouched is the line between "real Estonian, wrong target" and
 * "I did not catch that".
 *
 * Drawn at a half rather than at a threshold with more decimal places in it
 * because the two readings differ in what the other side *says* rather than in
 * anything scored: one asks a narrower question and the other asks again. A
 * turn on the boundary gets a re-ask either way and neither is a mark.
 */
const VOUCHED_SHARE = 0.5;

/**
 * Reads one turn. The only producer of `Evidence`.
 *
 * The three readings that are decided before any requirement is looked at are
 * decided in this order, and each ordering is a decision.
 *
 * English leads, because a turn in English satisfies no requirement and would
 * otherwise be reported as Estonian nobody could read.
 *
 * The echo comes next and it closes a real hole: the other side's line is full
 * of vouched words, so handing it straight back would satisfy several
 * requirements at once. A turn whose words are all in the line above it is
 * answered in character, once, and advances nothing.
 *
 * The fragment comes last of the three and *before* the requirements, which is
 * the half that matters: on a beat that wants a sentence, the one required word
 * on its own would otherwise be a complete turn, and a learner could finish a
 * scene without ever building one. It is not marked wrong. It gets the response
 * a person gives, which is a look and a wait.
 */
export function readTurn(
  text: string,
  beat: BeatSpec,
  context: TurnContext,
): Evidence {
  const spoken = words(text);
  const marked = spoken.map((word) => ({
    word,
    vouched: context.lexicon.forms.has(word),
  }));

  const met = beat.needs.map((need) => satisfies(need, text, spoken, context));
  const missing = met.flatMap((ok, i) => (ok ? [] : [i]));
  const shape = (reading: TurnReading): Evidence => ({ reading, met, missing, words: marked });

  if (spoken.length === 0) return shape("unrecognised");
  if (isEnglish(spoken, marked)) return shape("english");
  if (isEcho(spoken, context.previous)) return shape("echo");
  if (beat.shape === "sentence" && !looksLikeSentence(text)) return shape("fragment");

  if (missing.length === 0) return shape("complete");
  if (missing.length < beat.needs.length) return shape("incomplete");

  const vouched = marked.filter((w) => w.vouched).length;
  return shape(vouched >= marked.length * VOUCHED_SHARE ? "offtarget" : "unrecognised");
}

/** Whether one requirement is met. Every branch is a comparison against the dictionary. */
function satisfies(
  need: Requirement,
  text: string,
  spoken: readonly string[],
  context: TurnContext,
): boolean {
  const has = (forms: ReadonlySet<string> | undefined) =>
    forms !== undefined && spoken.some((word) => forms.has(word));

  switch (need.kind) {
    case "any":
      return true;
    case "lemma":
      return need.oneOf.some((lemma) => has(context.lexicon.byLemma.get(lemma)));
    case "case":
      return has(context.lexicon.byCase.get(caseKeyFor(need.lemma, need.grammCase)));
    case "datum":
      return has(context.data.get(need.slot));
    /*
      A question mark or a question word, and the mark counts on its own,
      because `Homme?` is a question anybody asks and has no question word in
      it. The words come from `kusisonad`, which is one of the units the
      seventeenth pass added for the words between the words: before it, "did
      they ask a question" was not a question the dictionary could answer.
    */
    case "question":
      return text.includes("?") || has(context.questionWords);
    case "negation":
      return has(context.negators);
    case "register":
      return has(context.registerForms);
  }
}

/** Two English function words and nothing the scene's list could vouch for. */
function isEnglish(spoken: readonly string[], marked: readonly TurnWord[]): boolean {
  if (marked.some((w) => w.vouched)) return false;
  return spoken.filter((word) => ENGLISH.has(word)).length >= ENGLISH_FLOOR;
}

/**
 * Whether the turn is the line above it handed back.
 *
 * Every word of the turn is in that line, and there are at least two of them:
 * a one-word turn repeating one of their words is an ordinary answer, since
 * `Neljapäev?` after they said `neljapäev` is what a person says.
 */
const ECHO_FLOOR = 2;
function isEcho(spoken: readonly string[], previous: string): boolean {
  if (spoken.length < ECHO_FLOOR || !previous) return false;
  const said = new Set(words(previous));
  return spoken.every((word) => said.has(word));
}

/** Whether this reading lets the scene move to the next beat. */
export function advances(reading: TurnReading): boolean {
  return reading === "complete";
}
