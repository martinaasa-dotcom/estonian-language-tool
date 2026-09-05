/**
 * What a scene is, as data.
 *
 * A scene is a machine that knows the shape of an encounter without knowing
 * what anybody says in it. `docs/21-situations.md` is the design; this is the
 * half of it Phase 0 needs, because the question that decides whether the
 * module can be built at all is "how many attested sentences could fill this
 * beat", and that cannot be asked until the beats exist.
 *
 * WHAT A SCENE FILE MAY WRITE. A lemma, and nothing else. That is the standing
 * `lib/collections/syllabus/` already has: a lemma is a *request* against the
 * dictionary, so a misspelled one does not become a wrong Estonian word, it
 * fails to arrive and `scenes.test.ts` says so. What a scene may never write is
 * a sentence or a form, which is the thing ADR-005 is about, and the reason
 * every line in a finished scene comes from a recorded usage or from a model
 * working inside a closed word list with the dictionary vouching for every
 * token.
 *
 * The design doc's first invariant said "no Estonian letter in a scene file",
 * modeled on the tripwire over `lib/estonian/grammar.ts`. That was wrong and
 * building this is what showed it: a rule keyed on `õäöüšž` would allow `valu`
 * and reject `küte`, which is not a distinction about anything. The rule that
 * holds is stronger and is the one asserted: **every lemma a scene names is a
 * word one of its declared units already teaches**, so a scene cannot introduce
 * vocabulary at all, only point at vocabulary the Ekilex harvest has already
 * vouched for.
 *
 * Pure: no React, no Next, no Prisma, no clock.
 */
import type { CaseKey } from "@/lib/estonian/types";
import type { DerivedVerbCode } from "@/lib/estonian/conjugate";
import type { CurveballId } from "./curveballs";
import type { PropSpec } from "./props";
import type { Level } from "@/lib/collections/syllabus";

/**
 * What the other side is doing this turn.
 *
 * Deliberately about the *act* rather than the topic, because the topic is the
 * beat's lemmas and the dictionary supplies those. Eight of them covers every
 * counter, waiting room and viewing anybody has written down here so far; a
 * ninth should have to argue for itself, since each one is a shape the line
 * retrieval and the composer both have to know how to fill.
 */
export type MoveKind =
  | "greet"
  | "ask"
  | "offer"
  | "confirm"
  | "instruct"
  | "refuse"
  | "correct"
  | "close";

/**
 * Whether a move's line is a question, and the first of the gate's four checks.
 *
 * A move of `ask` that comes back without a question mark did not do what it
 * was told, and a greeting phrased as a question is not a greeting. `offer` and
 * `confirm` are genuinely either: a time can be offered as a statement or as a
 * question, and both are things people say.
 */
export const QUESTION_SHAPE: Record<MoveKind, "required" | "forbidden" | "either"> = {
  greet: "either",
  ask: "required",
  offer: "either",
  confirm: "either",
  instruct: "forbidden",
  refuse: "forbidden",
  correct: "forbidden",
  close: "forbidden",
};

/**
 * What counts as the learner having done the beat.
 *
 * Every kind here is decidable against the dictionary with no model in the
 * path, which is the whole of §8 of the design: `advance()` takes evidence
 * rather than a verdict, so a caller holding only a model's opinion cannot
 * satisfy the type.
 */
export type Requirement =
  /** A form of any one of these words. Lemmas, from the scene's own units. */
  | { readonly kind: "lemma"; readonly oneOf: readonly string[] }
  /** That word, in that case. `caseAnswer` decides, so both illatives count. */
  | { readonly kind: "case"; readonly lemma: string; readonly grammCase: CaseKey }
  /**
   * A value off the role card: a time, a date, a number, a document code, or
   * a drawn word. With `grammCase`, the drawn word in that case: "where to?"
   * wants `jaama`, and `jaam` is the word in the wrong case, understood and
   * said back put right, exactly as a `case` requirement is.
   */
  | { readonly kind: "datum"; readonly slot: string; readonly grammCase?: CaseKey }
  /** A question mark, or one of the question words the course teaches. */
  | { readonly kind: "question" }
  /** The negator. */
  | { readonly kind: "negation" }
  /** A form of the pronoun the scene's register expects. */
  | { readonly kind: "register" }
  /** Small talk. Never fails, and exists so a beat can be colour. */
  | { readonly kind: "any" }
  /**
   * Any one of these. The other kinds are joined with "and", which is right
   * for a beat that wants a word and a case of it, and wrong for the one
   * question a conversation asks most: "does that suit you?" A learner answers
   * an offered time with the time, with `sobib`, with `jah`, or with `ei`, and
   * every one of those is the beat done. The first version of the landlord's
   * offer took the time alone, so `Sobib` was read as real Estonian off the
   * point, asked again, and the landlord ran out of patience over an answer
   * that was the right one. `leafNeeds` is how a reader that wants the words
   * or the cases behind a beat sees through this one.
   */
  | { readonly kind: "anyOf"; readonly of: readonly LeafRequirement[] };

/** A requirement that is not itself a choice between requirements. */
export type LeafRequirement = Exclude<Requirement, { kind: "anyOf" }>;

/**
 * A beat's requirements with every `anyOf` opened, each leaf carrying the
 * index of the requirement it belongs to in `needs`, which is what a
 * `TurnRecord.met` row is indexed by. The readers that want to know which
 * words or cases a beat is about (the grades, the drills, the tile, the
 * catalog test) read this rather than `needs`, so a choice is one
 * requirement to the marker and each of its options to everybody else.
 */
export function leafNeeds(
  needs: readonly Requirement[],
): { readonly need: LeafRequirement; readonly index: number }[] {
  return needs.flatMap((need, index) =>
    need.kind === "anyOf" ? need.of.map((leaf) => ({ need: leaf, index })) : [{ need, index }],
  );
}

/**
 * One piece of a line said off the card. A lemma is printed as the dictionary
 * spells it; a slot is printed as the value the card dealt, or, where a case
 * is named, as the dictionary's form of the drawn word in that case.
 */
export type SaysPart =
  | { readonly lemma: string }
  /**
   * A verb in a derived form, read off `Lexicon.persons`: `tea` after `ei`
   * is the negative of `teadma`, which is the stored first person with its
   * ending taken off (ADR-005 amendment 1). Withheld whole where the rule
   * does not reach the verb, like every other part.
   */
  | { readonly lemma: string; readonly verb: DerivedVerbCode }
  | { readonly slot: string; readonly grammCase?: CaseKey };

export interface BeatSpec {
  readonly id: string;
  /** What the learner has to get done here. English, and shown to them. */
  readonly goal: string;
  /**
   * What the other side does on this beat, in English, from their side.
   *
   * "The receptionist asks what brings you in." It is the other half of
   * `goal`, which is written from the learner's side, and it is read three
   * ways: it is what the screen prints when no Estonian line could be built
   * for the beat, it is the translation a helpful persona offers when the
   * learner writes English, and it is what a model is told it is doing when it
   * drafts or composes the line. The first version of the drafter was handed
   * `goal` instead, so a landlord asked to say "since when" was told that what
   * he was doing was "say since when", and drafted a line asking the tenant
   * when they planned to do the repairs.
   *
   * May carry `{slot}` for a value off the card, filled by `stageFor`, since
   * a line offering a time has to offer the time this run dealt. English is
   * the one language this file may write (ADR-005).
   */
  readonly they: string;
  readonly move: MoveKind;
  /**
   * What the other side's line is about, as lemmas.
   *
   * This is what retrieval searches on: a recorded usage fills this beat when
   * it contains a form of one of these. Every one has to be taught by one of
   * the scene's declared units.
   */
  readonly topic: readonly string[];
  /**
   * Recorded usages chosen for this beat, by their text.
   *
   * A usage is about a word rather than about a beat (`poolsFor` in
   * `lib/progress/scene.ts` has the measurements), so the attested rung no
   * longer takes every usage under a topic word. A person may still pick one
   * out where it happens to be exactly the line: `Kuhu sa lähed?` is recorded
   * under `kuhu` and is what a friend on the phone asks. Naming a sentence a
   * lexicographer wrote is choosing, not writing (ADR-005): the catalog
   * test fails on a line that is not a usage of one of the beat's own topic
   * words in the shipped dictionary, and the context builder drops one the
   * live dictionary no longer holds rather than trusting the text here.
   */
  readonly lines?: readonly string[];
  /**
   * A line made of course words and values off the card, for a beat whose
   * line has to name what this run dealt: `Kell 13:30?` offers the time on
   * the learner's own card, and `Teisipäeval kell 13:30?` offers a day with
   * it. Each part is a lemma the scene's units teach, as the dictionary spells
   * it, or a slot the card deals, printed as its value or as the dictionary's
   * own form of the drawn word in a named case. The mark is the move. Nothing
   * is inflected here and nothing is invented: a case form is read off the
   * same table every case card reads, and a part the dictionary cannot supply
   * withholds the whole line (`datumLine`). It is what lets a keyless
   * deployment offer an appointment in Estonian rather than in a stage
   * direction, and offer a *day* rather than a bare clock time, which a
   * learner reported as the landlord agreeing to nothing in particular.
   */
  readonly says?: readonly SaysPart[];
  /**
   * What they say when the learner turns the offer down: a second offer.
   *
   * A person who hears "ei sobi" does not take it as the end of the
   * conversation, they try another day. So a beat that can be declined says
   * what the other side does instead, from their side, and how, as parts off
   * the card the way `says` is: the second day and the second time are
   * props of their own, drawn to differ from the first. The marker reads a
   * no on such a beat as `declined` rather than as the beat met, the machine
   * makes the counter once, and a second no is the learner saying it will
   * not do, which the goal allows. `replaces` names which of the card's
   * values the counter stands in for, so a later beat that reads the time
   * back (`Kell 10:30.`) reads the one that was actually accepted.
   */
  readonly counter?: {
    readonly they: string;
    readonly says?: readonly SaysPart[];
    readonly replaces: readonly (readonly [from: string, to: string])[];
  };
  /**
   * The other side opens this beat with nothing: they have said their piece
   * and are waiting to see whether the learner has a question. The screen
   * prints the stage direction, the ladder is not walked for an opening line,
   * and what the bank holds for the beat is its **answer**, said once the
   * learner has asked (`answerBeatId`). Without this the street corner said
   * "Jah, see on lähedal" before anybody had asked whether it was near, and
   * then said goodbye when they did.
   */
  readonly awaits?: true;
  /** What counts as the learner's turn being complete. */
  readonly needs: readonly Requirement[];
  /** Required beats are the objectives; optional ones are the color. */
  readonly required: boolean;
  /** How many times they try again before moving on. */
  readonly patience: number;
  /**
   * Whether a one-word turn is an answer here.
   *
   * "Which day?" is answered with a day. "What is wrong?" is not answered with
   * a noun, and a beat that accepted one would let somebody finish a scene
   * without ever building a sentence.
   */
  readonly shape: "word" | "sentence";
}

/**
 * How a run can end, including badly.
 *
 * At least one outcome is a failure that is **not the learner's fault**,
 * because a real encounter has those and a module where trying hard enough
 * always works has stopped simulating anything. Walking out is an outcome too,
 * and it is written kindly. `catalogue.test.ts` asserts both.
 *
 * `says` is one line of English, and it is what a person remembers, so it goes
 * first in the debrief, before any teaching.
 */
export interface OutcomeSpec {
  readonly id: string;
  /** Which required beats have to have been met. Listed fullest first. */
  readonly when: readonly string[];
  /** One line, English, in the debrief. */
  readonly says: string;
}

/** The id every scene reserves for the learner leaving. */
export const LEFT_OUTCOME = "left";

export interface SceneSpec {
  readonly id: string;
  /** English. What the scene is called on a screen. */
  readonly title: string;
  /** English. Where you are standing. */
  readonly place: string;
  /** The band the scene is written for. */
  readonly level: Level;
  /**
   * The unit whose `canDo` this scene takes apart.
   *
   * The course has been claiming for 81 units that a learner will be able to
   * do something. A scene is where one of those claims is checked, so it names
   * which one rather than being a situation somebody thought sounded useful.
   */
  readonly tests: string;
  /** Which units supply the vocabulary. Ids, never words. */
  readonly units: readonly string[];
  /** What the other side calls you, and expects back. */
  readonly register: "teie" | "sina";
  /** English, one line. Who the learner is today, and never themselves (§3). */
  readonly role: string;
  /** The facts the card hands them, which is what a `datum` requirement reads. */
  readonly props: readonly PropSpec[];
  /** Which curveballs this scene admits. The draw may take no others. */
  readonly curveballs: readonly CurveballId[];
  readonly beats: readonly BeatSpec[];
  /** Fullest first, because `outcomeOf` takes the first one that fits. */
  readonly outcomes: readonly OutcomeSpec[];
}
