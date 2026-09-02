/**
 * Two dictionary entries that ask the same question, and what to do about it.
 *
 * A production card is front `translation`, hint `pos`, back `lemma`, and it is
 * marked by `checkAnswer` against the back. So two entries with the same gloss
 * and the same part of speech are **one question with two right answers**, and
 * whichever of them the learner types, one of the two cards marks them wrong
 * and shows the card again until they stop. That is the fault the illative
 * taught this project, arriving through the vocabulary rather than through the
 * morphology, and the dictionary ships 372 of them.
 *
 * THE FIX IS THE ONE THE ILLATIVE GOT. Every accepted answer goes on the back,
 * joined the way `acceptedAnswers` already splits stored alternatives, so what
 * a screen shows and what a marker takes are the same string. `lib/srs/cards.ts`
 * does the joining and `lib/dict/facts.ts` finds the set.
 *
 * WHY THE PROMPT AND NOT THE MEANING. The first version of this grouped by
 * Ekilex's own definition, on the reasoning that two words the Institute gives
 * one definition are one meaning. That found twelve pairs and missed ten more,
 * because the fault is not that two words mean the same thing. It is that one
 * card cannot tell them apart, and a card knows nothing but its front. Grouping
 * by `sameMeaning` was tried too and is worse in the other direction: it is
 * built for "could these be offered as different answers to one question" and
 * is deliberately generous, so it called `abi` "help" and `aitama` "to help"
 * one prompt, which no learner reading the hint would confuse.
 *
 * WHAT EKILEX'S DEFINITION IS STILL FOR. It is the diagnosis rather than the
 * trigger. Where the Institute gives the group one definition, they really are
 * synonyms and there is nothing to fix beyond accepting both: `ja` and `ning`
 * are both "and" and no gloss could separate them. Where it gives them two, the
 * gloss is failing to identify its own word, which is a different and worse
 * bug: `iseloom` is a person's character and `tegelane` is a character in a
 * story, and both are glossed "character". Accepting both is still the fair
 * thing to do while that is true, because the learner is being punished for a
 * prompt that cannot be answered, but the gloss is what wants fixing.
 *
 * AND THE INSTITUTE SAYS "SYNONYM" IN TWO WAYS, NOT ONE. Comparing the
 * definitions as strings reads only the first of them. Where Ekilex has
 * nothing to say beyond naming the neighbours, its definition *is* a list of
 * synonyms: `teravmeelne` is defined as "vaimukas, nutikas, leidlik" and
 * `vaimukas` as "teravmeelne, ootamatu ja leidlik". Two different strings, and
 * each one names the other word. Read as a disagreement, that pair sat on the
 * defect list asking somebody to invent a distinction the language does not
 * have, which is the one repair worse than leaving a gloss alone.
 *
 * Pure: plain data in, plain data out. The caller supplies the entries.
 */
/** A dictionary entry, as this module needs to see it. */
export interface SenseWord {
  readonly lemma: string;
  readonly pos: string;
  /** The English gloss, which is a production card's whole prompt. */
  readonly gloss: string;
  /**
   * Ekilex's own Estonian definition of the sense this entry carries, where
   * there is one. Only the course harvest has these.
   */
  readonly note?: string | null;
  /** What Ekilex calls the word: s, v, adj, adv, konj, pron, num. */
  readonly ekilexPos?: readonly string[];
}

/**
 * What a production card actually asks, as one string.
 *
 * The front and the hint together, because the hint is the part of speech and
 * a learner reading "help · noun" is not being asked the same question as one
 * reading "to help · verb".
 */
export function promptKey(gloss: string, pos: string): string {
  return `${gloss.trim().toLowerCase()}|${pos}`;
}

export type SharedPromptDiagnosis =
  /**
   * Ekilex gives the group one definition, or defines each of them by naming
   * the others: real synonyms, and nothing to fix beyond accepting both.
   */
  | "synonyms"
  /** Ekilex gives them different definitions: the gloss cannot identify its word. */
  | "ambiguous"
  /** No Ekilex definition to judge by, which is every entry outside the course. */
  | "unjudged";

export interface PromptGroup {
  readonly key: string;
  /** The gloss as the first entry writes it, for a report to print. */
  readonly gloss: string;
  readonly pos: string;
  /** Every lemma that answers this prompt, in a stable order. */
  readonly lemmas: readonly string[];
  readonly diagnosis: SharedPromptDiagnosis;
}

/**
 * Does this definition name that word?
 *
 * Its own boundaries rather than `\b`, which is ASCII: the character before
 * `õigustama` in "seletama või õigustama" is a space, and to `\b` a space and
 * an `õ` are both non-word characters with no boundary between them, so the
 * one shape this has to catch is the one shape it would miss.
 */
function names(note: string | null | undefined, lemma: string): boolean {
  if (!note) return false;
  const word = lemma.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}])${word}([^\\p{L}]|$)`, "iu").test(note);
}

/**
 * Whether the Institute defines each of these words by naming the others.
 *
 * MUTUAL, AND THAT IS THE WHOLE OF WHY IT IS SAFE. A definition mentioning
 * another word means nothing on its own: `konkurents` is defined as a
 * "võistlus ... paremuse pärast" and is not a contest, `põhjendama` ends
 * "seletama või õigustama" and is not self-defence. Measured over the shipped
 * dictionary, one-way naming picks up both of those and mutual naming picks up
 * neither, matching exactly one pair in the whole file. A word can be used to
 * explain a second word without being it; two words can only define each other
 * when there is nothing between them to explain.
 */
function definedByEachOther(group: readonly SenseWord[]): boolean {
  if (group.length < 2) return false;
  return group.every((a) => group.every((b) => a === b || names(a.note, b.lemma)));
}

/** Every prompt more than one entry answers. */
export function sharedPrompts(words: readonly SenseWord[]): PromptGroup[] {
  const byPrompt = new Map<string, SenseWord[]>();
  for (const word of words) {
    const key = promptKey(word.gloss, word.pos);
    const group = byPrompt.get(key) ?? [];
    group.push(word);
    byPrompt.set(key, group);
  }

  const out: PromptGroup[] = [];
  for (const [key, group] of byPrompt) {
    if (group.length < 2) continue;
    const notes = new Set(group.map((w) => (w.note ?? "").trim().toLowerCase()));
    const diagnosis: SharedPromptDiagnosis = notes.has("")
      ? "unjudged"
      : notes.size === 1 || definedByEachOther(group)
        ? "synonyms"
        : "ambiguous";
    out.push({
      key,
      gloss: group[0]!.gloss,
      pos: group[0]!.pos,
      lemmas: [...new Set(group.map((w) => w.lemma))].sort((a, b) => a.localeCompare(b, "et")),
      diagnosis,
    });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key, "et"));
}

/**
 * A lemma to every other lemma answering the same prompt.
 *
 * What `generateCards` needs, and the reason it is a map rather than a lookup
 * per word: a deck build asks this for every word it is about to build, and the
 * dictionary is the same for all of them.
 */
export function alsoAcceptedByLemma(groups: readonly PromptGroup[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const group of groups) {
    for (const lemma of group.lemmas) {
      out.set(
        `${lemma}|${group.pos}`,
        group.lemmas.filter((other) => other !== lemma),
      );
    }
  }
  return out;
}

/**
 * Which Ekilex word classes each of this course's six labels may stand for.
 *
 * The course has six labels and Ekilex has more, so some coarsening is
 * inevitable. What this table buys is that each one is written down and
 * therefore checkable, instead of being invisible the way it was while the
 * harvest threw Ekilex's own label away.
 *
 * Two entries are the interesting ones and both were set by narrowing until
 * something honest complained, rather than by widening until nothing did.
 *
 * ADVERB is this course's bucket for an uninflecting function word: `kas`,
 * `kui` and `palju` were ADVERB before any connective unit existed, and the
 * harvest's own comment says demanding forms for one "would drop every single
 * connective in the course". It was first written wide enough to admit `s` and
 * `v` as well, on the assumption that something would need it. Nothing did:
 * every ADVERB in the course is `adv`, `konj`, `prep` or `interj` to Ekilex, so
 * the wide version was a check that could not have fired.
 *
 * `num` on NOUN and ADJECTIVE is the one genuine widening, and it is a fact
 * about what the app needs rather than a shrug. An Estonian numeral declines,
 * so `kakskümmend` has to be a nominal here or it gets no case table and the
 * numbers unit teaches nothing about `kahekümne`. The ordinal `teine` agrees
 * like an adjective, which is what it is labelled. Ekilex calls all five of
 * them `num` and is right; this course has no such label and does not need one.
 */
export const COARSENS: Record<string, readonly string[]> = {
  NOUN: ["s", "prop", "num"],
  VERB: ["v"],
  ADJECTIVE: ["adj", "s", "num"],
  PRONOUN: ["pron", "s"],
  ADVERB: ["adv", "konj", "prep", "interj"],
  /*
    Empty on purpose, and not a gap. A multi-word greeting is not a headword,
    so the harvest does not fetch one and Ekilex never labels it: `mislabelled`
    skips an entry with no Ekilex label at all, so this never fires today. It
    fires the day a phrase arrives carrying one, which would mean the harvest
    had started fetching them and somebody should know.
  */
  PHRASE: [],
};

/**
 * Entries whose course label and Ekilex label cannot both be true.
 *
 * A word Ekilex has no opinion about is not a disagreement, which is why an
 * empty `ekilexPos` is skipped rather than counted: the harvest has only
 * recorded that field since the connective units were added, so an entry
 * without one is an entry from before, not an entry that is wrong.
 */
export function mislabelled(words: readonly SenseWord[]): SenseWord[] {
  return words.filter((w) => {
    const codes = w.ekilexPos ?? [];
    if (codes.length === 0) return false;
    const allowed = COARSENS[w.pos] ?? [];
    return !codes.some((code) => allowed.includes(code));
  });
}
