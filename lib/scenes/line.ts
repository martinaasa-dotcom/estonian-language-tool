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
import type { BeatSpec } from "./types";

/** Where a line came from. Printed beside it, every time (ADR-025). */
export type Provenance =
  /** A sentence a lexicographer recorded, used whole. Nothing was generated. */
  | "attested"
  /**
   * A model drafted it before anybody played, inside the same closed word
   * list, it passed the same four checks then, and a person read it in the
   * diff before it shipped. ADR-025 amendment 1; `lib/scenes/scripted.ts`.
   */
  | "scripted"
  /** A model wrote it inside the closed word list and it passed all four checks. */
  | "composed"
  /**
   * The repair phrase: they did not catch what was said. Said only as a
   * reaction to a turn `readTurn` could not read (`lib/scenes/reply.ts`), and
   * where `sceneLine` returns it, it means the ladder had nothing and the
   * caller decides what that means for the learner.
   */
  | "fallback"
  /** The line the learner already heard, said once more, because they did not answer it. */
  | "again"
  /**
   * The learner's own word, said back the way the other side would say it.
   * `Poodi.` after `pood`, `Tulen?` after `ma tulema`: the one correction a
   * conversation makes without stopping, and the form is the dictionary's
   * (`lib/scenes/nearly.ts`), never composed. Set only by `replyFor`.
   */
  | "recast"
  /**
   * A word handed over because the learner said they were not following.
   * The course's own lemma, as the dictionary spells it, offered rather
   * than asked for (`lib/scenes/reply.ts`).
   */
  | "offered"
  /** Said in English on purpose: the other side switched, and the learner is practising not to. */
  | "english"
  /**
   * Nothing could be built for a move the other side has to make, so what the
   * screen gets is a line of English saying what they did: the beat's own
   * `they`, with the card's values filled in by `stageFor`.
   *
   * THIS RUNG EXISTS BECAUSE THE FALLBACK WAS DOING TWO JOBS AND LYING ABOUT
   * ONE OF THEM. `fallback` is `Ma ei saa aru`, and it is the right move
   * exactly once: when the learner was not understood. It was also what came
   * out when the learner was understood perfectly, the scene advanced, and the
   * ladder had nothing to build the *next* line with. A learner reported that
   * from the first two turns of a scene: greeted with `Tere!`, told to greet
   * back, wrote `Tere`, had the objective ticked, and was answered with "I do
   * not understand". English is the one language this project may write
   * (ADR-005), and "the receptionist asks where it hurts" is at least true.
   */
  | "unspoken"
  /**
   * TIME PASSING, SAID OUT LOUD, BECAUSE OTHERWISE NOBODY KNOWS IT DID.
   *
   * A scene can span an errand: you leave the house, you get to the shop, you
   * walk home. The beats knew that and the screen did not, so a learner
   * answering "where are you now?" was still, as far as the screen was
   * concerned, standing in their own kitchen where the card had put them. They
   * answered honestly, were refused, answered again, were refused again, and
   * reported the whole scene as broken. They were right: the conversation had
   * moved and nothing had told them.
   *
   * `BeatSpec.meanwhile` is one line of English saying what has happened since
   * the last beat, and it is printed as a break in the conversation rather
   * than as something anybody said. It is not a stage direction: `unspoken`
   * stands in for a line the other side could not be given in Estonian, and
   * this is the scene itself moving the learner from one place to another.
   */
  | "meanwhile"
  /**
   * THE APP STEPPING OUT OF CHARACTER TO SAY WHAT IS WANTED.
   *
   * Everything else in a reply is the other side of a conversation, and the
   * other side of a conversation cannot explain itself: a receptionist who has
   * asked twice asks a third time and then gives up, and a learner watching
   * that happen has no way to tell a question they answered wrongly from one
   * they answered in the wrong shape. Two people reported the same feeling
   * from it, which is that the app had decided they were stupid.
   *
   * So when somebody is stuck the app says so in its own voice, in English,
   * off the beat's own requirements: this is the word they are waiting for,
   * or the answer is the line on your card. It is never Estonian this app
   * wrote (`lib/scenes/coach.ts` holds no Estonian and names only lemmas the
   * dictionary spells), it never advances anything, and it is drawn as a note
   * rather than as a bubble, because nobody said it.
   */
  | "coach";

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
  /**
   * A reaction to the learner's turn rather than the other side's move, so
   * the screen knows it is not the line the learner is now answering.
   * `lib/scenes/reply.ts` is the only thing that sets it.
   */
  readonly reaction?: true;
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
  /**
   * Lines drafted for this beat in advance and kept in the repository.
   *
   * **Required rather than optional**, for the reason `fallback` is: a caller
   * that has not asked the bank does not compile, so the rung cannot be
   * skipped by a route that forgot it existed. Empty is the ordinary case for
   * a beat nobody has drafted, and for one that cannot be drafted at all
   * because its line has to name a time or a number the card drew this run.
   */
  readonly scripted: readonly string[];
  /** Attested and scripted lines this run has already used, so none repeats until the pool runs dry. */
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
 * The ladder's "nothing", carrying the repair phrase.
 *
 * Composition can fail twice and there is still a person standing there
 * waiting. Whether what they then say is "I did not catch that" or a line of
 * English about what they did is decided by `replyFor` off how the learner's
 * turn was read, never here: this function knows which rung answered and
 * nothing about the turn before it, and deciding on that alone is how the
 * repair phrase came to be printed at people who had been understood. The
 * text is the caller's, because it is Estonian and this file may not write
 * any.
 */
export function fallbackLine(text: string, withheld: readonly Check[] = []): SpokenLine {
  return { text, provenance: "fallback", ...(withheld.length > 0 ? { withheld } : {}) };
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

  /*
    THE SCRIPTED RUNG SITS BETWEEN THE LEXICOGRAPHER AND THE MODEL, and the
    order is the provenance order. An attested line is somebody's recorded
    Estonian and outranks anything a model wrote; a scripted line was written
    by a model but was gated then and read by a person since, which is more
    than a line composed a second ago can say. It costs a comparison, so like
    the attested rung it is tried before the ledger is asked, and it is what
    lets a keyless deployment hold a conversation on a beat retrieval cannot
    fill. Passed over once used, like an attested line, so a run that comes
    back to a beat does not hear the same sentence twice while another is left.
  */
  const scripted = request.scripted.find((text) => !request.used.has(text));
  if (scripted) return { text: scripted, provenance: "scripted" };

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
