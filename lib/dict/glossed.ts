import { tokenise } from "@/lib/news/headlines";
import { candidatesFor } from "./resolveScan";
import { matchEstonianForm, type Candidate } from "./search";
import { splitOnForm } from "./examples";

/**
 * THE SENTENCE A WORD IS TAUGHT WITH, WITH A DICTIONARY UNDER EVERY OTHER WORD
 * IN IT.
 *
 * A first meeting shows the word doing its job in a sentence a lexicographer
 * recorded, which is the whole claim of that screen, and for most words the
 * sentence arrived with no English at all: Ekilex has none on a reader key. So
 * a beginner met `Lausa uskumatu, kui muutunud ta on!` under a word they had
 * been told the meaning of ten seconds earlier and could read one word of it.
 * The sentence was doing the opposite of its job. It was reported that way by
 * somebody using it, who asked for what Speakly does: the words around the new
 * one are underlined, and you can look at one without leaving the card.
 *
 * THE SAME GATE AS A PHOTOGRAPHED PAGE AND A HEADLINE (ADR-021). Nothing here
 * proposes a meaning: `matchEstonianForm` decides, at `VOUCHED_SCORE`, so a
 * word is offered a gloss only because the dictionary recognizes that exact
 * spelling, a stored form of an entry, or a regular case of its genitive stem.
 * What is shown is the dictionary's own headword and the dictionary's own
 * English, never a reading of this sentence: `kohvi` opens as `kohv, coffee`
 * and says which form it recognized. A word it will not vouch for is printed
 * plain, exactly as a headline's names are, because leaving it out would be
 * editing an attested sentence and guessing at it would be worse.
 *
 * Nothing is written, nothing is generated and nothing is stored. Every
 * English string in here is a gloss already sitting in `Lexeme.translation`,
 * and the Estonian is the sentence as it was recorded (ADR-005).
 *
 * Server only: it reads Prisma. `glossTokens` is the pure half, so what a
 * screen draws can be tested over fixtures without one.
 */

/** One run of the sentence, and what the dictionary made of it. */
export interface GlossedToken {
  /** The characters as the sentence spelled them. Joining every `text` gives it back. */
  text: string;
  /** A run of letters, rather than the spaces and punctuation between them. */
  word: boolean;
  /**
   * The word the card is teaching, which is already glossed at the top of the
   * screen. Marked rather than offered: a panel repeating the meaning printed
   * two lines above it is the screen saying one thing twice.
   */
  taught: boolean;
  /** The entry the dictionary vouched for, or null where it would not. */
  entry: {
    lexemeId: string;
    lemma: string;
    gloss: string;
    /** Which form it recognized, when the sentence's spelling is not the headword. */
    matchedAs: string | null;
  } | null;
}

/**
 * The sentence cut into runs, with the taught form marked and every other word
 * looked up.
 *
 * The taught runs are found by `splitOnForm`, which is what the screen used
 * before this existed and knows what `üle-eestiline` is: the marking a learner
 * sees is unchanged, and the lookup happens strictly outside it.
 */
export function glossTokens(
  sentence: string,
  form: string | null,
  lookup: (word: string) => GlossedToken["entry"],
): GlossedToken[] {
  const out: GlossedToken[] = [];
  for (const run of splitOnForm(sentence, form)) {
    for (const piece of tokenise(run.text)) {
      out.push({
        text: piece.text,
        word: piece.word,
        taught: run.match,
        entry: piece.word && !run.match ? lookup(piece.text) : null,
      });
    }
  }
  return out;
}

/** The words a sentence would have the dictionary asked about. */
function wordsIn(sentence: string, form: string | null): string[] {
  return glossTokens(sentence, form, () => null)
    .filter((t) => t.word && !t.taught)
    .map((t) => t.text.toLocaleLowerCase("et"));
}

/**
 * How many distinct words one call will ask the dictionary about.
 *
 * A session's first meetings are glossed in one query rather than one each,
 * for the reason every other batched read in this app gives: a loop of queries
 * is a round trip apiece, and a hosted database is in another region. Ten new
 * cards is the review queue's own ceiling and a sentence is capped at 140
 * characters, so the realistic worst case is around two hundred words; the
 * budget is stated so a caller that grows cannot quietly turn this into the
 * widest query on the page. Sentences past it are returned unglossed, which is
 * exactly what every sentence looked like before this existed.
 */
const WORD_BUDGET = 320;

/**
 * Glosses a batch of sentences in one read.
 *
 * Returns one token list per input, in the order given. A sentence the
 * dictionary can say nothing about comes back as tokens with no entries rather
 * than as null, so a screen has one shape to draw either way.
 */
export async function glossSentences(
  sentences: readonly { et: string; form: string | null }[],
): Promise<GlossedToken[][]> {
  const wanted = new Set<string>();
  const covered: boolean[] = [];
  for (const sentence of sentences) {
    const words = wordsIn(sentence.et, sentence.form);
    const room = words.every((w) => wanted.has(w)) || wanted.size + words.length <= WORD_BUDGET;
    covered.push(room);
    if (room) words.forEach((w) => wanted.add(w));
  }

  const candidates = wanted.size > 0 ? await candidatesFor([...wanted]) : [];
  const memo = new Map<string, GlossedToken["entry"]>();
  const lookup = (word: string): GlossedToken["entry"] => {
    const key = word.toLocaleLowerCase("et");
    if (memo.has(key)) return memo.get(key)!;
    const entry = entryFor(candidates, word);
    memo.set(key, entry);
    return entry;
  };

  return sentences.map((sentence, i) => glossTokens(
    sentence.et, sentence.form, covered[i] ? lookup : () => null,
  ));
}

/*
  The rule this file found first, now inside `matchEstonianForm` itself.

  `veeta` is the da-infinitive of `veetma`, to spend, and a formless entry
  spelled `veeta` that a model had offered a learner won the panel with its own
  gloss, "He'd like". A word in an attested sentence is glossed by an entry the
  dictionary can vouch for, which means one carrying forms or a seeded phrase,
  which has none because it is already the sentence. Filtering it here left the
  chat guard, the headlines, the scanner and the scene importer taking the
  model's word for it, so the filter moved to the one function all five ask.
*/

function entryFor(candidates: Candidate[], word: string): GlossedToken["entry"] {
  const match = matchEstonianForm(candidates, word);
  if (!match) return null;
  return {
    lexemeId: match.id,
    lemma: match.lemma,
    gloss: match.translation,
    // `matchedAs` is absent when the sentence's spelling *is* the headword, and
    // the screen has nothing to say in that case.
    matchedAs: withoutLemma(match.matchedAs, match.lemma),
  };
}

/**
 * The form's name without the headword hanging off the end of it.
 *
 * `matchEstonianForm` phrases a match as "omastav (genitive) of kaitsevägi",
 * which is right in a search result standing on its own and says the word
 * twice on a panel whose heading is that word. The name is never rebuilt here,
 * because there is one table of what a form is called and it is not this one:
 * the suffix is taken off where it is found and the whole string is kept where
 * it is not, so a change to that phrasing costs a repeated word rather than a
 * missing label.
 */
function withoutLemma(matchedAs: string | undefined, lemma: string): string | null {
  if (!matchedAs) return null;
  const suffix = ` of ${lemma}`;
  return matchedAs.endsWith(suffix) ? matchedAs.slice(0, -suffix.length) : matchedAs;
}

/** The half of this that is neither pure nor public, exposed for its own test. */
export const __test = { withoutLemma };
