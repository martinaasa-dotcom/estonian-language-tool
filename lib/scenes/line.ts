/**
 * The one function that answers "what does the other side say here".
 *
 * `docs/19-situations.md` §2. It works the way `caseAnswer` works: an attested
 * sentence ahead of a composed one ahead of the way out, **with the screen
 * saying which it got**. That last clause is the whole of ADR-025's second
 * half, and it is why the return type carries a provenance rather than a
 * string: a caller holding only the text cannot print the chip, and a chip
 * nobody printed is a composed line a learner reads as a lexicographer's.
 *
 * FOUR RUNGS, AND THE MEASURED ORDER IS NOT THE OBVIOUS ONE. `npm run
 * measure:scenes` found that retrieval fills the moves every conversation
 * shares and almost none of the moves that make it *this* conversation,
 * because a lexicographer records a sentence to illustrate a word rather than
 * to ask a question about it. So the composer is load-bearing rather than a
 * fallback, and the gate is the thing the module rests on.
 *
 * COMPOSITION IS INJECTED. This module may not open a socket, so the caller
 * hands in a function that asks a model and this decides what to do with the
 * answer. That keeps the ladder, the retry and the fallback in one pure place
 * with unit tests around them, and puts the provider in a route where the
 * ledger can see it. It is also what lets the browser suite stub a model the
 * way `test-scan.mjs` does.
 *
 * Pure: no React, no Next, no Prisma, no network, no clock.
 */
import { passes, runGate, type Check, type GateContext } from "./gate";
import { fits, type Line } from "./retrieval";
import { words, type Lexicon } from "./lexicon";
import type { TurnReading } from "./turn";
import type { BeatSpec, MoveKind } from "./types";

/** Where a line came from. Printed beside it, every time (ADR-025). */
export type Provenance =
  /** A sentence a lexicographer recorded, used whole. Nothing was generated. */
  | "attested"
  /** A model wrote it inside the closed word list and it passed all four checks. */
  | "composed"
  /** They did not catch what was said, so they ask again. Always in character. */
  | "fallback"
  /**
   * Nothing could be built for a move the other side has to make, so what the
   * screen gets is a line of English saying what they did.
   *
   * THE FOURTH RUNG EXISTS BECAUSE THE THIRD WAS DOING TWO JOBS AND LYING
   * ABOUT ONE OF THEM. `fallback` is `Ma ei saa aru`, "I do not understand",
   * and it is the right move exactly once: when the learner was not
   * understood. It was also what came out when the learner was understood
   * perfectly, the scene advanced, and the ladder had nothing to build the
   * *next* line with. A learner reported that from the first two turns of a
   * scene: they were greeted with `Tere!`, told to greet back, wrote `Tere`,
   * had the objective ticked, and were answered with "I do not understand".
   *
   * Measured over the catalogue: six of the eight `ask` beats have no
   * recorded question anywhere in their topic words, because a lexicographer
   * writes a usage to illustrate a word rather than to ask about one, and six
   * of the thirteen other beats have no usage at all. So on a deployment with
   * no key, or one whose allowance has gone, over half of every conversation
   * was somebody claiming not to have understood a turn that was fine.
   *
   * What replaces it is the truth and it is *not in character*: the other side
   * made their move, and we could not put it into Estonian. The learner still
   * has the objective, which was already on the screen in English, so the
   * conversation carries on rather than stalling on a repair move that repairs
   * nothing. English is the one language this project may write (ADR-005).
   */
  | "unspoken";

export interface SpokenLine {
  readonly text: string;
  readonly provenance: Provenance;
  /**
   * The lemma whose entry holds an attested line, so the screen can say whose
   * sentence it is. Absent on the other two rungs.
   */
  readonly from?: string;
  /** Which checks withheld a composed line, for the debrief and the report button. */
  readonly withheld?: readonly Check[];
}

/** What the caller has to supply for one turn. */
export interface LineRequest {
  readonly beat: BeatSpec;
  readonly lexicon: Lexicon;
  readonly gate: GateContext;
  /** Recorded sentences that could fill this beat, already fetched. */
  readonly pool: readonly Line[];
  /** Every form of the beat's own topic words. */
  readonly topic: ReadonlySet<string>;
  readonly hasFiniteVerb: (word: string) => boolean;
  /**
   * What they say when nothing could be built. Estonian, and the caller's.
   *
   * **Required rather than optional**, which is `NounStems.illSgShort`'s rule:
   * a caller that has not resolved a phrase for "I did not catch that" does not
   * compile, so the way out cannot be reached and found empty. The text is
   * resolved from the course's own phrases, because this file may write no
   * Estonian and a hardcoded one here would be exactly that.
   */
  readonly fallback: string;
  /** Attested lines this run has already used, so none repeats until the pool runs dry. */
  readonly used: ReadonlySet<string>;
  /**
   * Asks a model for one line. `avoid` names the words the last attempt reached
   * for that the list could not vouch for, which is what §6 gives the one retry.
   *
   * Returns null where there is no key, no allowance, or no answer, and that is
   * an ordinary case rather than an error: a keyless deployment runs this module
   * with the attested rungs alone.
   */
  readonly compose?: (avoid: readonly string[]) => Promise<string | null>;
}

/**
 * The fallback, which is a move rather than an error.
 *
 * Composition can fail twice and there is still a person standing there
 * waiting. What the learner sees is somebody who missed what they said, which
 * is the truest thing that can happen in a conversation. The text is the
 * caller's, because it is Estonian and this file may not write any: the route
 * resolves it from the course's own phrases the way every other line here is
 * resolved.
 */
export function fallbackLine(text: string, withheld: readonly Check[] = []): SpokenLine {
  return { text, provenance: "fallback", ...(withheld.length > 0 ? { withheld } : {}) };
}

/**
 * WHAT THE OTHER SIDE DID, IN ENGLISH, WHEN NOTHING COULD BE SAID IN ESTONIAN.
 *
 * One line per move rather than per beat, because the move is the act and the
 * beat's own `goal` is already on the screen saying what the learner has to do
 * about it. Two sentences would be the objective printed twice.
 *
 * Deliberately about the act and not about the app. "They ask you about it" is
 * what happened; "the model could not answer" is a fact about a deployment,
 * and the session already says that once, above the conversation, where it
 * belongs. A line inside the log saying it again on every turn would be an
 * error message wearing a costume.
 */
const MOVE_STAGE: Record<MoveKind, string> = {
  greet: "They say hello and wait.",
  ask: "They ask you about it.",
  offer: "They offer you something.",
  confirm: "They read it back to check.",
  instruct: "They tell you what happens next.",
  refuse: "They say that will not work.",
  correct: "They put you right.",
  close: "They say goodbye.",
};

/**
 * The way out, and which of the two it is depends on the learner rather than
 * on the rung.
 *
 * `sceneLine` knows which rung answered and nothing about the turn that came
 * before it, which is why the repair move used to be printed at people who had
 * done nothing wrong. This is the one function that decides between the two,
 * and it takes the reading rather than a boolean so it cannot be called
 * without the caller having marked the turn.
 *
 * `null` is the opening line, where there is no turn to have misread. A scene
 * that opens with nothing to say has not failed to understand anybody.
 */
export function wayOut(input: {
  readonly beat: BeatSpec;
  /** How the learner's last turn was read, or null on the opening line. */
  readonly reading: TurnReading | null;
  /** The repair phrase, resolved from the course by the caller. Estonian. */
  readonly fallback: string;
  readonly withheld?: readonly Check[];
}): SpokenLine {
  const misheard = input.reading === "unrecognised" || input.reading === "offtarget";
  if (misheard) return fallbackLine(input.fallback, input.withheld ?? []);
  return {
    text: MOVE_STAGE[input.beat.move],
    provenance: "unspoken",
    ...(input.withheld && input.withheld.length > 0 ? { withheld: input.withheld } : {}),
  };
}

/**
 * Walks the ladder.
 *
 * The attested rung is tried against the whole pool before the model is asked,
 * because it costs a comparison and the model costs a call. Within the pool the
 * order is the caller's and lines already used in this run are passed over, so
 * **no attested line repeats until the pool for that move is exhausted**, which
 * is §5's third promise. When it is exhausted the run says so by falling
 * through rather than quietly cycling.
 *
 * One retry, and only one. §6 allows it with the failing words named, and the
 * second failure is the fallback: a third attempt is a slower way to reach the
 * same place, and the learner is waiting through every one of them.
 */
export async function sceneLine(request: LineRequest): Promise<SpokenLine> {
  const attested = pickAttested(request);
  if (attested) return attested;

  if (!request.compose) return fallbackLine(request.fallback);

  const first = await request.compose([]);
  const firstVerdict = first ? runGate(first, request.beat, request.gate) : null;
  if (first && firstVerdict && passes(firstVerdict)) {
    return { text: first, provenance: "composed" };
  }

  const second = await request.compose(firstVerdict?.unknown ?? []);
  const secondVerdict = second ? runGate(second, request.beat, request.gate) : null;
  if (second && secondVerdict && passes(secondVerdict)) {
    return { text: second, provenance: "composed" };
  }

  return fallbackLine(request.fallback, secondVerdict?.failed ?? firstVerdict?.failed ?? []);
}

/** The first recorded sentence that fits this beat and has not been used yet. */
export function pickAttested(request: LineRequest): SpokenLine | null {
  for (const line of request.pool) {
    if (request.used.has(line.text)) continue;
    const verdict = fits({
      line,
      tokens: words(line.text),
      beat: request.beat,
      topic: request.topic,
      lexicon: request.lexicon,
      hasFiniteVerb: request.hasFiniteVerb,
    });
    if (verdict.ok) return { text: line.text, provenance: "attested", from: line.lemma };
  }
  return null;
}
