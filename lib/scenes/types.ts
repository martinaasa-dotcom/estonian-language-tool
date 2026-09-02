/**
 * What a scene is, as data.
 *
 * A scene is a machine that knows the shape of an encounter without knowing
 * what anybody says in it. `docs/19-situations.md` is the design; this is the
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
 * modelled on the tripwire over `lib/estonian/grammar.ts`. That was wrong and
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
  /** A value off the role card: a time, a date, a number, a document code. */
  | { readonly kind: "datum"; readonly slot: string }
  /** A question mark, or one of the question words the course teaches. */
  | { readonly kind: "question" }
  /** The negator. */
  | { readonly kind: "negation" }
  /** A form of the pronoun the scene's register expects. */
  | { readonly kind: "register" }
  /** Small talk. Never fails, and exists so a beat can be colour. */
  | { readonly kind: "any" };

export interface BeatSpec {
  readonly id: string;
  /** What the learner has to get done here. English, and shown to them. */
  readonly goal: string;
  readonly move: MoveKind;
  /**
   * What the other side's line is about, as lemmas.
   *
   * This is what retrieval searches on: a recorded usage fills this beat when
   * it contains a form of one of these. Every one has to be taught by one of
   * the scene's declared units.
   */
  readonly topic: readonly string[];
  /** What counts as the learner's turn being complete. */
  readonly needs: readonly Requirement[];
  /** Required beats are the objectives; optional ones are the colour. */
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
  readonly beats: readonly BeatSpec[];
  /** Fullest first, because `outcomeOf` takes the first one that fits. */
  readonly outcomes: readonly OutcomeSpec[];
}
