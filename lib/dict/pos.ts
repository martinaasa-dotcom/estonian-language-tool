/**
 * Which part of speech a built dictionary entry carries.
 *
 * One function because two callers need the same answer and had no way to
 * share it: `scripts/expand-seed.ts` decides this when it builds an entry, and
 * `scripts/audit-pos.ts` re-decides it over the shipped file. A second copy is
 * where the two would drift, and a drift here is invisible — every answer this
 * returns is a plausible label, so nothing on screen looks wrong.
 *
 * Three sources have an opinion and they are not equal:
 *
 *   Ekilex   draws the line between a verb and a nominal, and that line is
 *            what decides which principal parts a word even has. It calls
 *            every nominal a "noomen", so it cannot tell a noun from an
 *            adjective and is never asked to.
 *   The page  heads each definition with the part of speech that definition
 *            belongs to. This is the only source that describes the sense the
 *            gloss was actually taken from, which is why it decides among the
 *            nominals.
 *   The category  is where the candidate came from, and says only that the
 *            word has *some* sense of that kind, somewhere on its page.
 *            Fallback only.
 */

/**
 * Whether an entry is a whole utterance rather than a word.
 *
 * `Tere!`, `Aitäh!`, `Kuidas läheb?`, `Ma ei saa aru`: the twenty entries the
 * A1 greetings unit teaches, and all twenty carry `PHRASE`. Ekilex records no
 * usage under any of them and never will, because a usage illustrates a *word*
 * in a sentence and these are already the sentence.
 *
 * Two screens did not know that and said so out loud. The first meeting told
 * every one of them "No example sentence for this one yet", which is the app
 * reporting a gap in itself on the first twenty cards a beginner ever sees, and
 * the dictionary entry promised that "one shows up the first time you look this
 * word up", which will not happen for any of them. An absence somebody can wait
 * out is worth saying; an absence that is simply what a phrase is, is not.
 *
 * A predicate rather than a comparison at each call site, because those two
 * screens are two readings of one fact about the entry, and the next screen
 * that needs it should not have to work it out again.
 */
export function isPhrase(pos: string | null | undefined): boolean {
  return pos === "PHRASE";
}

/**
 * Whether an entry of this part of speech has a table of forms to open.
 *
 * A noun, an adjective and a verb do. An adverb, a conjunction, a particle and
 * a formless pronoun do not, and that is the language rather than a gap: an
 * Estonian adverb does not inflect, and `meie` and `nemad` have no singular
 * for a lexicographer to record, so the harvest keeps them attested and
 * formless.
 *
 * A predicate rather than a list at each call site, for the reason `isPhrase`
 * is one: two screens promising a learner a table are two readings of one fact
 * about the entry. The dictionary's suggestion row kept its own copy of the
 * list, and `lib/dict/facts.ts` needed the same answer to say which lemmas the
 * row may offer at all.
 */
export function opensATable(pos: string | null | undefined): boolean {
  return pos === "NOUN" || pos === "VERB" || pos === "ADJECTIVE";
}

/** Parts of speech a built entry may carry. `Lexeme.pos` also allows PHRASE and OTHER. */
const NOMINALS = new Set(["NOUN", "ADJECTIVE", "ADVERB"]);

export interface PosInputs {
  /**
   * The part-of-speech heading the chosen gloss sat under, or null where the
   * page headed it as something this app has no label for.
   */
  sensePos: string | null;
  /** The headword template declared in the same block, or null where there was none. */
  headwordPos: string | null;
  /** Whether Ekilex's word class for the entry is a verb rather than a nominal. */
  ekilexSaysVerb: boolean;
  /** The category the candidate was drawn from, used only when nothing better answers. */
  fallback: string;
}

/**
 * Ekilex first on the verb question, the page's own block on everything else.
 *
 * The order matters in one direction only, and it is the direction that used to
 * be wrong. A heading saying `Verb` while Ekilex reports a nominal is a
 * contradiction this cannot resolve, and resolving it towards the heading would
 * label an entry a verb while its stored principal parts are a noun's, so the
 * heading is dropped and the fallback answers. That is the conservative side:
 * a word wearing the wrong nominal label is wrong metadata, and a word wearing
 * a verb label over a noun's forms is a card that cannot be answered.
 *
 * Between the heading and the headword template, an adjective claim from either
 * one is enough, and that is an asymmetry in the sources rather than a thumb on
 * the scale. `{{et-adj}}` carries a comparative and a superlative, which only
 * an adjective has, so nobody reaches for it by accident: on `võimas` it is
 * right and the `===Noun===` heading above it is a slip. `{{et-noun}}` is the
 * ordinary nominal declension and an Estonian adjective declines exactly like a
 * noun, so an editor writing out the forms of `üksik`, `lämbe` or `lämmi`
 * reaches for it with nothing whatever implied about the part of speech. One is
 * a statement and the other is a shrug, so only one of them gets to overturn
 * the heading beside it.
 */
export function resolvePos({ sensePos, headwordPos, ekilexSaysVerb, fallback }: PosInputs): string {
  if (ekilexSaysVerb) return "VERB";
  if (sensePos === "ADJECTIVE" || headwordPos === "ADJECTIVE") return "ADJECTIVE";
  if (sensePos && NOMINALS.has(sensePos)) return sensePos;
  return fallback === "VERB" ? "NOUN" : fallback;
}
