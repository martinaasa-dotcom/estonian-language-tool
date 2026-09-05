/**
 * A SENTENCE RECORDED UNDER ANOTHER WORD IS STILL A LEXICOGRAPHER'S SENTENCE.
 *
 * A case card is built out of a recorded sentence with the form taken out, and
 * for a year the only sentences a word could be built from were the handful
 * Ekilex filed under that word. `ravim` has three, none of them in a case, so a
 * learner could never be shown `ravimit` in use although `Ravimit tuleb võtta
 * kindlal nädalapäeval.` is in the dictionary, recorded under another headword.
 * The dictionary ships about twelve thousand natural sentences and each one is
 * about every word in it, not only the one it was filed under.
 *
 * So a word may borrow. This module finds, for every entry, the sentences
 * recorded under other entries that carry one of its forms, and it hands them
 * to the card builder as a second pool behind the word's own. Measured over the
 * shipped dictionary: case cards go from 996 over 914 words to 1,546 over 1,327,
 * and conjugation cards from 539 over 427 verbs to 821 over 496, with nothing
 * written and no source added. Every sentence a card is cut from is one a
 * lexicographer recorded (ADR-005).
 *
 * THE SPELLING HAS TO BELONG TO THIS WORD AND NO OTHER, and that is the whole of
 * what makes borrowing safe. A word's own usages are about the word, so a form
 * found in one is that word's form. A sentence found across the dictionary
 * makes no such promise: `Tolm ajas aevastama` carries `ajas`, which is the
 * inessive of `aeg` and the past of `ajama`, and the sentence means the
 * second. So a spelling is claimed by every entry whose forms reach it, and a
 * sentence is borrowed only for a spelling exactly one entry claims. The claim
 * index is deliberately wider than `gapForms`: the simple past is not derived
 * anywhere in this app, since `tahtsin` goes to `tahtis` and no rule gets
 * there, but the *refusal* can afford to over-reach, so a verb also claims its
 * stored first-person past with the `in` taken off. That is `ajas` for `ajama`,
 * which makes `ajas` ambiguous and keeps `Tolm ajas aevastama` off `aeg`. A
 * claim too many costs a sentence; a claim too few costs a wrong card.
 *
 * What it does not see is a homograph the dictionary does not hold at all, and
 * that is the residual: a spelling unique among six thousand entries is not
 * always unique in the language. The sentence is the second opinion in the
 * usual way, since a borrowed card is still cut by `buildCloze` and read by
 * `readCase`, and the audits that build every card the dictionary can make
 * cover the borrowed ones too.
 *
 * RANKED, because the builder takes the first sentence that fits. One with an
 * English translation first, since the reveal can print it; then shorter,
 * because a sentence about a Prussian occupation is a worse card than one
 * about a dog in a garden. Capped per word, since a common form appears in
 * hundreds of sentences and the builder needs one per case.
 *
 * Pure: entries in, a map out. No Prisma, no clock. `lib/dict/facts.ts` wraps
 * it over the deployment's own dictionary and caches the answer, and
 * `scripts/audit-questions.ts` runs it over the shipped file.
 */
import { gapForms } from "@/lib/estonian/gapForms";
import { naturalSentence, nominalOpener } from "@/lib/estonian/cloze";
import { sentenceWords, usableExamples, type Example } from "@/lib/dict/examples";

/** One dictionary entry, as much of it as borrowing needs. */
export interface BorrowEntry {
  /** Whatever the caller keys its entries on: an id, or `lemma|pos`. */
  readonly key: string;
  readonly lemma: string;
  readonly pos: string;
  readonly forms: readonly { readonly formType: string; readonly value: string; readonly morphCode?: string | null }[];
  readonly examples: readonly Example[];
}

/** How many borrowed sentences one word keeps. Eleven cases, a few sentences each. */
export const MAX_BORROWED = 24;

/**
 * Every spelling in the dictionary, and which entries could be spelled that way.
 *
 * Wider than `gapForms` on purpose; see the header.
 */
export function claimIndex(entries: readonly BorrowEntry[]): Map<string, Set<string>> {
  const claims = new Map<string, Set<string>>();
  const claim = (spelling: string, key: string) => {
    const clean = spelling.trim().toLocaleLowerCase("et");
    if (!clean) return;
    const held = claims.get(clean) ?? new Set<string>();
    held.add(key);
    claims.set(clean, held);
  };
  for (const entry of entries) {
    for (const spelling of gapForms(entry).keys()) claim(spelling, entry.key);
    const past = entry.forms.find((f) => f.formType === "PAST_1SG")?.value;
    // `ajasin` claims `ajas`; `lugesin` claims `luges`. Over-reach is the safe
    // direction here, since a claim only ever refuses.
    if (past && past.toLocaleLowerCase("et").endsWith("in")) claim(past.slice(0, -2), entry.key);
  }
  return claims;
}

/**
 * The sentences every entry may borrow from the others, keyed as the entries are.
 *
 * An entry with nothing to borrow has no key in the map, which is most of the
 * dictionary's long tail.
 */
export function borrowSentences(entries: readonly BorrowEntry[]): Map<string, Example[]> {
  const claims = claimIndex(entries);
  const out = new Map<string, Example[]>();

  for (const owner of entries) {
    // A sentence is offered only where it passes the gate its own headword
    // would pass it through: a fragment or a lexicographer's label is no
    // better as a borrowed sentence than as an own one.
    const opener = nominalOpener(owner.pos, [owner.lemma, ...owner.forms.map((f) => f.value)]);
    for (const example of usableExamples([...owner.examples])) {
      if (example.source === "USER" || example.source === "AI") continue;
      if (!naturalSentence(example.et, opener)) continue;
      for (const word of new Set(sentenceWords(example.et))) {
        const claimed = claims.get(word);
        if (!claimed || claimed.size !== 1) continue;
        const [key] = claimed;
        if (key === undefined || key === owner.key) continue;
        const held = out.get(key) ?? [];
        held.push(example);
        out.set(key, held);
      }
    }
  }

  for (const [key, held] of out) {
    const seen = new Set<string>();
    const unique = held.filter((e) => {
      const k = e.et.toLocaleLowerCase("et");
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    /*
      And it ends on the sentence itself, because the two keys above are not a
      total order: two sentences that both carry an English translation and are
      the same length compared equal, `sort` is stable, and what it was handed
      came out of a `findMany`. The `slice` below is what decides which
      sentences a word is taught with, so that was the query plan choosing a
      learner's cards. The text is unique here, since the list was just
      deduplicated on its own lower-cased spelling.
    */
    unique.sort((a, b) =>
      (Number(Boolean(b.en)) - Number(Boolean(a.en)))
      || (a.et.length - b.et.length)
      || a.et.localeCompare(b.et, "et"));
    out.set(key, unique.slice(0, MAX_BORROWED));
  }
  return out;
}
