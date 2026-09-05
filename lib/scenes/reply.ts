/**
 * What the other side says back, which is a reaction and then a move.
 *
 * The first version of this module answered every turn with the next beat's
 * line and nothing else, and a learner reported that every situation felt
 * strange. It was. They wrote `poodi` and the friend on the phone said nothing
 * about it and asked the next question; they wrote something that landed and
 * were answered "I do not understand"; they wrote one word where a sentence
 * was due and the other side asked a fresh question as if the word had never
 * been said. A person does none of that. A person says "hästi" and then asks
 * the next thing, says "I did not catch that" and asks the same thing again,
 * or says "jah?" and waits.
 *
 * So a reply is a short list of lines, and the first is how they took what was
 * said. `replyFor` is the one place that list is assembled and it is pure:
 * `state.ts` says what the other side does about the turn (`Response`),
 * `line.ts` says what Estonian the ladder could build for the next move, and
 * this decides what reaches the screen and in what order. It takes the reading
 * rather than a boolean for the reason `advance` takes `Evidence`: the repair
 * phrase may only be said about a turn `readTurn` could not read, and a caller
 * that has not marked the turn cannot call this.
 *
 * WHAT IT MAY WRITE. English, in a stage direction, and nothing else. Every
 * Estonian word in a reaction is a lemma out of `REACTIONS` or the repair
 * phrase, both of which are requests against the course the catalogue test
 * checks word by word (ADR-005). A stage direction is what the other side did,
 * in English, off the beat's own `they`, and it is printed only where no
 * Estonian line could be built or where a helpful persona is translating for
 * somebody who wrote English.
 *
 * Pure: no React, no Next, no Prisma, no network, no clock.
 */
import { FALLBACK_PHRASE, REACTIONS } from "./catalogue";
import type { Check } from "./gate";
import { fallbackLine, type SpokenLine } from "./line";
import { propBySlot, type RoleCard } from "./props";
import type { Response } from "./state";
import type { TurnReading } from "./turn";
import type { BeatSpec } from "./types";

export interface ReplyInput {
  /** The beat the other side speaks on now, after the turn was read. Undefined once the scene is over. */
  readonly beat: BeatSpec | undefined;
  /** The beat the learner just answered. Null on the opening line. */
  readonly answered: BeatSpec | null;
  /** What `advance` decided about the turn. Null on the opening line. */
  readonly response: Response | null;
  /** How `readTurn` read it. Null on the opening line. */
  readonly reading: TurnReading | null;
  /**
   * What the ladder built for `beat`, or null where nothing was asked of it.
   * A `fallback` provenance here means the ladder had nothing, not that the
   * learner was misheard: that decision is made below, off the reading.
   */
  readonly line: SpokenLine | null;
  /** The last Estonian line the learner was answering, so it can be said again. */
  readonly heard: string | null;
  /** The card this run dealt, for a stage direction that names a time. */
  readonly card: RoleCard | null;
  /** Whether this persona puts the question into English when the learner writes English. */
  readonly translates: boolean;
  /**
   * The curveball now standing in front of the beat, as a beat, with the line
   * the ladder built for it. When one is up it is what the other side says
   * instead of the beat's move, and the learner's goal on screen is its way
   * out. Null where nothing is in the way.
   */
  readonly hurdle: {
    readonly beat: BeatSpec;
    readonly line: SpokenLine | null;
    /** The curveball's own English line, where it is one (they switched to English). */
    readonly said?: string;
  } | null;
  /**
   * The learner's own word that met the beat, to be repeated back: "Poodi."
   * before the next question is what a person on the phone does, and it is
   * the learner's word, vouched by the dictionary as the form the beat asked
   * for, so nothing here chose it. Null where the beat was met by something
   * that is not a word (a question, a no) or where nothing was met.
   */
  readonly echo: string | null;
  /** How many beats have been met, which is what rotates the acknowledgement. */
  readonly met: number;
  /**
   * Whether this persona says "hästi" before moving on. The brisk one does
   * not: they take the answer and ask the next thing, which is most of what
   * makes them read as brisk rather than as a slightly smaller number.
   */
  readonly acknowledges: boolean;
}

/**
 * The line a beat says out of one course word and the value the card dealt,
 * or null where the beat has none or the card holds no such value.
 *
 * `Kell 13:30?` for an offer. Tried by the route before the ledger, since it
 * costs nothing, and after the bank, since a line a person has read outranks
 * one assembled here. Its provenance is the course's, because every letter
 * in it is a headword or a datum the learner is already reading off the card.
 */
export function datumLine(beat: BeatSpec, card: RoleCard | null): SpokenLine | null {
  if (!beat.says || !card) return null;
  const value = propBySlot(card, beat.says.slot)?.value;
  if (!value) return null;
  const word = beat.says.lemma;
  const mark = beat.move === "ask" || beat.move === "offer" ? "?" : ".";
  return {
    text: `${word.charAt(0).toUpperCase()}${word.slice(1)} ${value}${mark}`,
    provenance: "attested",
    from: word,
  };
}

/**
 * Whether the route has to walk the ladder at all for this turn.
 *
 * A turn nobody understood, a turn in English and a one-word turn are all
 * answered with the line the learner already heard, or with nothing, so
 * asking a model for a fresh one would spend a booking on a line that is not
 * wanted. The route asks this before it asks the ledger.
 */
export function wantsFreshLine(response: Response | null, heard: string | null): boolean {
  if (response === "wait") return false;
  if ((response === "repeat" || response === "english") && heard) return false;
  return true;
}

/** The reply, in the order it is said. Empty once the scene is over and nothing is owed. */
export function replyFor(input: ReplyInput): SpokenLine[] {
  const { beat, answered, response, reading, line, heard, card } = input;
  const out: SpokenLine[] = [];

  /*
    A one-word turn where a sentence was due gets a look and a wait (§8), and
    on a screen the look is one word with a question mark. No move follows it,
    because the other side is waiting for the rest of the sentence rather than
    moving on from it.
  */
  if (response === "wait") return [reaction(REACTIONS.waiting[0], "?")];

  /*
    THE REPAIR PHRASE IS SAID ABOUT A TURN NOBODY COULD READ, AND ABOUT NOTHING
    ELSE. `reading` rather than `response`, because the response is what the
    state machine did and the reading is what the marker found, and only the
    second is a fact about whether anybody understood. An echo is the other
    side's own line handed back, which is not an answer either, and the honest
    reaction to it is the same: they did not get what they asked for.
  */
  if (response === "repeat" && (reading === "unrecognised" || reading === "echo")) {
    out.push({ ...fallbackLine(FALLBACK_PHRASE, line?.withheld ?? []), reaction: true });
  }

  /*
    An acknowledgement after an answer that landed, rotating so the same word
    does not come back six times. Not after a greeting, since the greeting is
    answered by the next line, and not once the scene is over.
  */
  if (response === "answer" && answered && answered.move !== "greet" && beat) {
    /*
      Never a number, which the confirm beat reads back in its own line, and
      never yes or no: "Jah." repeated back after "Jah, piimaga" is the
      machine showing through.
    */
    const flat = new Set<string>([...REACTIONS.acknowledge, ...REACTIONS.waiting, "ei"]);
    const echo = input.echo && !/\d/.test(input.echo) && !flat.has(input.echo) ? input.echo : null;
    if (echo) {
      out.push({
        text: echo.charAt(0).toUpperCase() + echo.slice(1) + ".",
        provenance: "again", reaction: true,
      });
    } else if (input.acknowledges) {
      const choices = REACTIONS.acknowledge;
      out.push(reaction(choices[input.met % choices.length] ?? choices[0], "."));
    }
  }

  if (response === "moveOn") out.push(stage("They let it go, and move on."));

  /*
    Over. If the learner said goodbye first, they are owed one back, and the
    route walked the ladder for the farewell; otherwise nothing is owed.
  */
  if (!beat) {
    if (answered?.move === "close" && line && line.provenance !== "fallback") out.push(line);
    return out;
  }

  /*
    Something went wrong, and it comes before the beat: the other side does
    what the curveball says, in Estonian where a line could be built and in
    English where not, and asks nothing else until it is dealt with. Said
    again where the learner did not answer it, like any other move.
  */
  if (input.hurdle) {
    if (sayAgainWanted(response, heard)) out.push({ text: heard!, provenance: "again" });
    else if (input.hurdle.said) out.push({ text: input.hurdle.said, provenance: "english" });
    else if (input.hurdle.line && input.hurdle.line.provenance !== "fallback") out.push(input.hurdle.line);
    else out.push(stage(stageFor(input.hurdle.beat, card)));
    if (response === "english" && input.translates) out.push(stage(stageFor(input.hurdle.beat, card)));
    return out;
  }

  /*
    The move. Said again where the learner did not answer it, from the text
    they already heard, because a person who was not understood repeats
    themselves rather than rephrasing. A fresh line where there is one;
    otherwise the same line once more; otherwise what they did, in English.
  */
  const sayAgain = sayAgainWanted(response, heard);
  if (sayAgain) {
    out.push({ text: heard, provenance: "again" });
  } else if (line && line.provenance !== "fallback") {
    out.push(line);
  } else if (heard && response !== "answer" && response !== "moveOn") {
    out.push({ text: heard, provenance: "again" });
  } else {
    out.push(stage(stageFor(beat, card), line?.withheld));
  }

  /*
    A helpful persona translates the question for somebody who wrote English
    (§8); a brisk one has already repeated it in Estonian above and says no
    more. Never scolded, and the turn has already cost its try.
  */
  if (response === "english" && input.translates) out.push(stage(stageFor(beat, card)));

  return out;
}

function sayAgainWanted(response: Response | null, heard: string | null): heard is string {
  return (response === "repeat" || response === "english") && Boolean(heard);
}

/**
 * What the other side did on this beat, in English, with the card's values
 * filled in. `{time}` becomes the time this run dealt, so a stage direction
 * for an offer offers the time on the learner's own card rather than "a time".
 */
export function stageFor(beat: BeatSpec, card: RoleCard | null): string {
  return beat.they.replace(/\{(\w+)\}/g, (whole, slot: string) => {
    const value = card ? propBySlot(card, slot)?.value : undefined;
    return value ?? whole;
  });
}

/**
 * One course word as a line: capitalised, with the mark that makes it the
 * move. The word is the dictionary's; the mark says whether it is said or
 * asked, which is the difference between "Jah." and "Jah?".
 */
export function reaction(lemma: string, mark: "." | "?"): SpokenLine {
  const text = lemma.charAt(0).toUpperCase() + lemma.slice(1) + mark;
  return { text, provenance: "attested", from: lemma, reaction: true };
}

function stage(text: string, withheld?: readonly Check[]): SpokenLine {
  return {
    text,
    provenance: "unspoken",
    ...(withheld && withheld.length > 0 ? { withheld } : {}),
  };
}
