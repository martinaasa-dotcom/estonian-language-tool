/**
 * The shape of the course.
 *
 * A unit is a *request* against the dictionary, never a copy of it: it names
 * lemmas and glosses them in English, and every Estonian form, sentence and
 * level comes from Ekilex through `scripts/harvest-ekilex.ts`. That direction of
 * authority is the whole reason the course could get wide without anybody
 * writing Estonian (ADR-005). A lemma this file gets wrong does not become a
 * wrong word in the dictionary — it fails to arrive, and the harvest says so.
 *
 * Framework-free on purpose, like the rest of lib/collections: plain data and
 * pure functions, unit-tested without a database or a DOM.
 */
import type { CardType } from "@/lib/srs/cards";

export type Level = "A1" | "A2" | "B1" | "B2" | "C1";

export const LEVELS: readonly Level[] = ["A1", "A2", "B1", "B2", "C1"];

/**
 * `PHRASE` is the one part of speech the harvest does not fetch. A multi-word
 * greeting is not a headword, so Ekilex has no forms for it; the phrases in
 * the course are the hand-checked ones the built-in dictionary already carried,
 * and no new ones are written here.
 */
export type Pos = "NOUN" | "VERB" | "ADJECTIVE" | "ADVERB" | "PRONOUN" | "PHRASE";

/**
 * A word the unit teaches: the Estonian lemma, an English gloss, and the part of
 * speech when it is not inferable.
 *
 * The gloss is authored, and it is the only authored column in the whole
 * pipeline — English is the one language this project is allowed to write. The
 * part of speech defaults from the lemma: an Estonian verb's citation form is
 * its `-ma` infinitive, which is unambiguous. Everything else defaults to a noun
 * and is marked where it is not one.
 */
/**
 * A word the course asks for.
 *
 * THE FOURTH SLOT NAMES WHICH WORD, WHERE ESTONIAN HAS TWO OF THEM SPELLED THE
 * SAME. Ekilex numbers homonyms, and the harvest used to take the first one
 * whose forms fit, silently: 87 of the 1,185 course words have more than one
 * exact match and six of them came back as the wrong word entirely. `kohus`
 * was taught as "court" with the forms and sentences of the moral duty
 * (kohuse, not kohtu); `kaste` as "sauce" with the forms of dew; `pidama`,
 * the A1 verb for must, with the past of the verb for keeping a farm, so the
 * conjugation card for lihtminevik answered `pidasin` and marked `pidin`
 * wrong. A number here is how a person resolves that, and it is a number
 * rather than a word because this file may not write Estonian either.
 *
 * Unpinned and ambiguous is now a reported drop rather than a guess, which is
 * what the script's own header always promised.
 */
export type WordSpec =
  | readonly [lemma: string, gloss: string]
  | readonly [lemma: string, gloss: string, pos: Pos]
  | readonly [lemma: string, gloss: string, pos: Pos, ekilexWordId: number];

export interface UnitSpec {
  id: string;
  /** Estonian title. This is a course in Estonian; the titles should be too. */
  title: string;
  /** English subtitle, so a beginner is never blocked by the title itself. */
  subtitle: string;
  /** Lucide icon name, mapped to a component in components/icons.tsx. */
  icon: string;
  level: Level;
  /** The block of the level this belongs to, for grouping on the path. */
  module: string;
  /**
   * What the learner can do afterwards, phrased as CEFR phrases them.
   *
   * This is the honest unit of progress in a language course. "You learned 14
   * words" is a fact about the app; "you can order a meal and ask what is in it"
   * is a fact about the learner.
   */
  canDo: string;
  /** One line on why this unit is worth doing now. */
  blurb: string;
  /** Grammar topic ids this unit teaches — keys into lib/estonian/grammar.ts. */
  grammar: readonly string[];
  /** Card types added when the whole unit goes into the deck. */
  cardTypes: readonly CardType[];
  words: readonly WordSpec[];
  /** Unit ids that should be finished first. Empty means it opens immediately. */
  requires?: readonly string[];
}

/** A unit with its word list resolved into lemmas and parts of speech. */
export interface SyllabusUnit extends UnitSpec {
  /** Lemmas only, in order. The form every consumer before the rewrite used. */
  readonly lemmas: readonly string[];
  readonly vocabulary: readonly { lemma: string; gloss: string; pos: Pos; ekilexWordId?: number }[];
  readonly requires: readonly string[];
  /** Kept for the pre-syllabus consumers that read `unit.cefr`. */
  readonly cefr: Level;
}

/**
 * An Estonian verb is cited by its `-ma` infinitive, so the part of speech is
 * readable off the lemma. Adjectives and adverbs decline or do not in ways the
 * spelling cannot show, so they are marked explicitly in the word list.
 */
export function inferPos(lemma: string, given?: Pos): Pos {
  if (given) return given;
  return lemma.endsWith("ma") && lemma.length > 3 ? "VERB" : "NOUN";
}

/**
 * A unit that asks for a form also asks for the form every other one is built on.
 *
 * THE ONE CARD THE COURSE NEVER BUILT.
 *
 * `GRADATION` asks `hammas → kelle? mille?` and takes `hamba`. Nothing else in
 * the deck asks for the genitive: `PRODUCTION` wants the nominative,
 * `CLOZE` wants whatever form the sentence happens to have, and `CASE_FORM`
 * drills the local cases, the comitative and the translative, every one of
 * which is the genitive stem plus an ending. So the one form the others are
 * all built on was the one form nobody was asked to produce, and consonant
 * gradation, which is where it gets hard and which no rule predicts, went
 * undrilled for the whole course. Not one of the 79 units named the type. The
 * landing page has been promising it the entire time, beside government and
 * the partial object, both of which units do ask for.
 *
 * It is added here rather than typed into unit literals because it is a
 * property of the word and not a choice the unit makes: a learner who cannot
 * say `hamba` cannot say `hambaga` either. The generator produces nothing for
 * a word that does not gradate, so a unit of colors gets none.
 */
function withGradation(types: readonly CardType[]): readonly CardType[] {
  // `CASE_FORM` and not `CONJUGATION`: the card asks for the genitive, and a
  // verb has none. A verb gradates too (`andma` is `nd : nn`) and it shows in
  // the present stem rather than in a case, so a unit of verbs that advertised
  // this would be promising a card the generator cannot build.
  if (!types.includes("CASE_FORM") || types.includes("GRADATION")) return types;
  return [...types, "GRADATION"];
}

/** Builds a unit, resolving its word list once at module load. */
export function unit(spec: UnitSpec): SyllabusUnit {
  const vocabulary = spec.words.map((w) => ({
    lemma: w[0],
    gloss: w[1],
    pos: inferPos(w[0], w[2]),
    // Which of Ekilex's homonyms, where a person has had to say. See WordSpec.
    ...(w.length > 3 && typeof w[3] === "number" ? { ekilexWordId: w[3] } : {}),
  }));
  return {
    ...spec,
    cardTypes: withGradation(spec.cardTypes),
    vocabulary,
    lemmas: vocabulary.map((v) => v.lemma),
    requires: spec.requires ?? [],
    cefr: spec.level,
  };
}
