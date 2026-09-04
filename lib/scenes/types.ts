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
 * Who is behind the desk today, and what they want.
 *
 * The agenda is the strongest lever in the draw and it is nearly free: the
 * same beats and the same props with a receptionist who wants the queue gone
 * and one who is new and unsure are two conversations that feel nothing
 * alike. What an agenda changes is written down in `personas.ts`, and it is a
 * patience shift, a pace, and how the other side answers an English turn;
 * never a word of Estonian, which the dictionary supplies as for everybody.
 *
 * The voice is the persona's name. The twelve voices in `lib/audio/voice.ts`
 * are the only proper names this app says, and a second persona in a scene
 * takes a second voice, which is how an interruption reads as another person.
 */
export type Agenda = "brisk" | "thorough" | "new" | "script";

export interface PersonaSpec {
  readonly voice: string;
  readonly agenda: Agenda;
}

/**
 * A value on the role card the learner is handed, and asked for.
 *
 * `weekday` is a lemma from the `aeg` unit, so it is a word the dictionary
 * has forms for and the learner can be marked on. `clock`, `number` and
 * `code` are digits, which are not Estonian and are the one thing this
 * module may generate. A code is always fictional (§3 of the design): a
 * practice app is the last place anybody should type their own.
 */
export type PropKind = "weekday" | "clock" | "number" | "code";

export interface PropSlot {
  readonly id: string;
  readonly kind: PropKind;
  /** English. What the card calls it: "It started on". */
  readonly label: string;
}

/**
 * Who the learner is today. English, and never themselves (§3).
 *
 * `{slot}` in a fact is filled from the props, so the card can say "It started
 * on Tuesday" without this file knowing which day was drawn.
 */
export interface RoleCardSpec {
  readonly who: string;
  readonly wants: string;
  readonly facts: readonly string[];
}

/** How a scene can end, including badly and not through the learner's fault. */
export interface OutcomeSpec {
  readonly id: string;
  /** Which required beats have to have been met. Empty means the fallback. */
  readonly when: readonly string[];
  /** One line, English, in the debrief. The thing a person remembers. */
  readonly says: string;
}

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
  readonly personas: readonly PersonaSpec[];
  readonly props: readonly PropSlot[];
  /** Which curveballs this scene admits, by id. See `curveballs.ts`. */
  readonly curveballs: readonly string[];
  readonly role: RoleCardSpec;
  readonly outcomes: readonly OutcomeSpec[];
}
