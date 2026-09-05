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
import { caseKeyFor, type Lexicon } from "./lexicon";
import { propBySlot, type RoleCard } from "./props";
import type { Response } from "./state";
import type { TurnReading } from "./turn";
import { leafNeeds, type BeatSpec } from "./types";

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
 * The line a beat says out of course words and the values the card dealt, or
 * null where the beat has none or a part cannot be supplied.
 *
 * `Kell 13:30?` for an offer, `Teisipäeval kell 13:30?` for one that names
 * the day. Tried by the route before the ledger, since it costs nothing, and
 * after the bank, since a line a person has read outranks one assembled
 * here. Its provenance is the course's, because every letter in it is a
 * headword, a datum the learner is already reading off the card, or a case
 * form read off the same table every case card reads (`Lexicon.caseForm`).
 *
 * WITHHELD WHOLE WHERE A PART IS MISSING. A slot the card did not deal, or a
 * case the dictionary holds no form for, is not a part to leave out: `Kell
 * 13:30?` where the beat meant to name a day is the line a learner reported
 * as the landlord agreeing to nothing in particular, and it is worse than the
 * stage direction the route falls back to, which at least says "next week".
 */
export function datumLine(beat: BeatSpec, card: RoleCard | null, lexicon?: Lexicon): SpokenLine | null {
  if (!beat.says || beat.says.length === 0 || !card) return null;
  const pieces: string[] = [];
  let from: string | undefined;
  for (const part of beat.says) {
    if ("lemma" in part) {
      pieces.push(part.lemma);
      from ??= part.lemma;
      continue;
    }
    const prop = propBySlot(card, part.slot);
    if (!prop?.value) return null;
    if (!part.grammCase) {
      pieces.push(prop.value);
      continue;
    }
    /*
      A drawn word in a named case. The prop's lemma is what was drawn and the
      lexicon's own table is what spells it, so nothing here inflects; where
      the table has no form, the line is withheld rather than the lemma
      printed in the nominative, which would be Estonian nobody says.
    */
    const lemma = prop.lemmas[0];
    const form = lemma && lexicon ? lexicon.caseForm.get(caseKeyFor(lemma, part.grammCase)) : undefined;
    if (!form) return null;
    pieces.push(form);
  }
  const text = pieces.join(" ");
  const mark = beat.move === "ask" || beat.move === "offer" ? "?" : ".";
  return {
    text: `${text.charAt(0).toUpperCase()}${text.slice(1)}${mark}`,
    provenance: "attested",
    ...(from ? { from } : {}),
  };
}

/**
 * The beat as the other side speaks it after the offer was turned down: the
 * counter's own stage direction and parts, under an id of its own so nothing
 * drafted for the first offer is said as the second. The route hands this to
 * the ladder and to `replyFor` where the response is `counter`.
 */
export function counterBeat(beat: BeatSpec): BeatSpec {
  if (!beat.counter) return beat;
  const { they, says } = beat.counter;
  const { lines: _lines, ...rest } = beat;
  return { ...rest, id: `${beat.id}:counter`, they, ...(says ? { says } : {}) };
}

/**
 * The card with every countered beat's values stood in for by its second
 * offer's, so a line that reads the time back reads the one that was
 * accepted. The card itself is never rewritten: the draw is what a reload and
 * the debrief read, and this is a view of it for the lines said after a
 * counter.
 */
export function cardInPlay(
  card: RoleCard | null,
  beats: readonly BeatSpec[],
  countered: readonly string[] | undefined,
): RoleCard | null {
  if (!card || !countered || countered.length === 0) return card;
  const swaps = new Map<string, string>();
  for (const beat of beats) {
    if (!countered.includes(beat.id) || !beat.counter) continue;
    for (const [from, to] of beat.counter.replaces) swaps.set(from, to);
  }
  if (swaps.size === 0) return card;
  return {
    ...card,
    props: card.props.map((prop) => {
      const to = swaps.get(prop.slot);
      const stand = to ? propBySlot(card, to) : undefined;
      return stand ? { ...stand, slot: prop.slot } : prop;
    }),
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
  /*
    AND NOT AFTER THE LEARNER ASKED SOMETHING. "Millal teil on aeg?" was
    answered "Jah." and then the offer, which is a person saying yes to a
    question that has no yes in it. A turn the beat wanted as a question is
    answered by the move that follows, so the reaction is the move.
  */
  const askedThem = answered ? leafNeeds(answered.needs).some(({ need }) => need.kind === "question") : false;
  if (response === "answer" && answered && answered.move !== "greet" && !askedThem && beat) {
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
  } else if (heard && response !== "answer" && response !== "moveOn" && response !== "counter") {
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
    const prop = card ? propBySlot(card, slot) : undefined;
    // A drawn word is named in English inside an English sentence, where the caller supplied one.
    return prop?.english ?? prop?.value ?? whole;
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
