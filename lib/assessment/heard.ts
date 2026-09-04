import { ESTONIAN_WORD } from "@/lib/estonian/cloze";
import { gapForms, type GapWord } from "@/lib/estonian/gapForms";

/**
 * WHAT ELSE WAS IN THE SENTENCE.
 *
 * The listening check plays a whole sentence and asks for the meaning of "a
 * word you heard in it", without saying which. So every word in the recording
 * is a word the question could be about, and a wrong answer that is the
 * meaning of one of the *other* words is a second right answer. It shipped:
 * `Moraali ja eetika kategooriad.` was asked about `eetika`, "morality" stood
 * among the options as a distractor, and a learner who heard `moraali` and
 * chose it was marked wrong for listening correctly. Measured over ten pools
 * drawn the way the placement draws them, 22 of 4,320 such questions carried
 * one: "Isa ja ema ei olnud kodus" offered "mother" against "father", "Märg ja
 * külm sügis" offered "cold" against "wet".
 *
 * A distractor may be tricky. It may not be true.
 *
 * So the sentence is read the way a gap-fill reads it: every spelling a
 * dictionary word could take in a sentence (`gapForms`: the stored forms, the
 * cases off the genitive stem, a verb's persons) is indexed to the glosses of
 * the words spelled that way, and what the sentence holds is the union over
 * its tokens. Nothing is guessed about which word a token *is*: `tule` is the
 * imperative of `tulema` and the genitive of `tuli`, and both "fire" and "to
 * come" are ruled out as wrong answers, which costs a distractor and never a
 * mark.
 *
 * The index is built from whatever words the caller holds. The placement is
 * handed a window of two hundred words a band, so the pool alone reaches
 * about half of these; `lib/dict/facts.ts` builds the same index over the
 * whole dictionary and `paperFor` hands it in, which is what reaches the rest.
 *
 * Pure: no database, no clock.
 */

export interface HeardWord extends GapWord {
  readonly translation: string;
}

/** A lowercased spelling to every gloss the dictionary files a word spelled that way under. */
export type HeardIndex = ReadonlyMap<string, readonly string[]>;

export function heardIndex(words: readonly HeardWord[]): HeardIndex {
  const out = new Map<string, string[]>();
  for (const word of words) {
    const gloss = word.translation.trim();
    if (!gloss) continue;
    for (const spelling of gapForms(word).keys()) {
      const list = out.get(spelling);
      if (list) {
        if (!list.includes(gloss)) list.push(gloss);
      } else {
        out.set(spelling, [gloss]);
      }
    }
  }
  return out;
}

/**
 * Every meaning a learner could have heard in the sentence, across every
 * index handed in. The word the question is about is in there too, and that
 * is harmless: the picker already throws out anything that means the answer.
 */
export function meaningsHeard(sentence: string, ...indexes: readonly HeardIndex[]): string[] {
  const out = new Set<string>();
  for (const match of sentence.matchAll(ESTONIAN_WORD)) {
    const token = match[0].toLowerCase();
    for (const index of indexes) {
      for (const gloss of index.get(token) ?? []) out.add(gloss);
    }
  }
  return [...out];
}
