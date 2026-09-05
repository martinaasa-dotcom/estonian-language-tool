/**
 * The closed word list a scene may use, and every form of every word in it.
 *
 * Two jobs, and they are the same set read two ways. Retrieval asks "is this
 * recorded sentence readable by somebody who has done these units", which is a
 * membership test over every word in the sentence. Composition asks the model
 * to work inside the same set, and the gate then checks it did. A second copy
 * of this would be two answers to what a scene is allowed to say.
 *
 * The forms are built rather than looked up one by one. `matchEstonianForm` is
 * the runtime gate and it is the right function for one word against the whole
 * dictionary; here the question is thousands of words against a few hundred
 * known entries, and the same knowledge inverted (every form each entry has, in
 * a set) answers it in constant time per word. The knowledge is the same
 * because it comes from the same two places: `buildCaseTable` for a nominal, so
 * the eleven regular cases and both illatives are in, and `derivedVerbForms`
 * for a verb, which `npm run audit:verbs` checked against Ekilex over 797 verbs.
 *
 * Deliberately not folded. `matchEstonianForm` folds diacritics because a
 * learner types `koik` for `kõik`; an attested sentence is spelled correctly,
 * so folding here would only let a wrong spelling read as known.
 *
 * Pure: takes entries, returns sets. No React, no Next, no Prisma.
 */
import { buildCaseTable, stemsFrom } from "@/lib/estonian/derive";
import { derivedVerbForms } from "@/lib/estonian/conjugate";
import { ESTONIAN_WORD } from "@/lib/estonian/cloze";

/** One dictionary entry, as this module needs to see it. */
export interface DictEntry {
  readonly lemma: string;
  readonly pos: string;
  readonly cefr: string | null;
  /** Principal parts by formType, exactly as the seed stores them. */
  readonly parts: Readonly<Record<string, string>>;
  /**
   * Whole forms Ekilex recorded that no rule reaches, by its own morph code.
   *
   * The seed writes these beside the principal parts and this module has to
   * read both, because between them they are what the dictionary can say. It
   * read `parts` alone at first and the cost was exactly the words a scene is
   * made of: `on`, `oli`, `pole`, `ta`, `tal`, `mu`, `nad` and `me` were all
   * absent from every scene's word list, so the gate would have withheld any
   * composed line that used one, which is most lines anybody would write.
   */
  readonly extraForms?: readonly { code: string; value: string }[];
  /** Sentences a lexicographer recorded against this entry. */
  readonly usages: readonly string[];
}

/** Lowercased words of a string, by the app's one tokeniser. */
export function words(text: string): string[] {
  return (text.match(ESTONIAN_WORD) ?? []).map((w) => w.toLowerCase());
}

/**
 * Every form of one entry, lowercased.
 *
 * A `PHRASE` has no forms because Ekilex has no headword for it, so what it
 * contributes is its own words: somebody who has met `Tere hommikust!` can read
 * both halves of it.
 */
export function formsOf(entry: DictEntry): string[] {
  const out = new Set<string>();
  for (const w of words(entry.lemma)) out.add(w);
  for (const value of Object.values(entry.parts)) {
    for (const w of words(value)) out.add(w);
  }
  const extra = entry.extraForms ?? [];
  for (const form of extra) for (const w of words(form.value)) out.add(w);

  if (entry.pos === "VERB") {
    for (const form of derivedVerbForms({ lemma: entry.lemma, pres1sg: entry.parts.PRES_1SG })) {
      for (const w of words(form.value)) out.add(w);
    }
  } else if (entry.parts.GEN_SG) {
    /*
      `stemsFrom` rather than `stemsFromParts`, because the retrieved forms are
      what tell `buildCaseTable` that a case has two of them. Through the parts
      alone a pronoun's table is `minule` and nothing else, and `mulle` is the
      half anybody says.
    */
    const rows = [
      ...Object.entries(entry.parts).map(([formType, value]) => ({ formType, value })),
      ...extra.map((f) => ({ formType: `EKILEX:${f.code}`, value: f.value })),
    ];
    for (const row of buildCaseTable(stemsFrom(rows))) {
      for (const value of [row.singular, row.plural, row.alsoRight, ...row.accepted]) {
        if (value) for (const w of words(value)) out.add(w);
      }
    }
  }

  return [...out];
}

export interface Lexicon {
  /** Every form of every word the scene may use. */
  readonly forms: ReadonlySet<string>;
  /** Lemma to its own forms, so a beat can ask whether its word is present. */
  readonly byLemma: ReadonlyMap<string, ReadonlySet<string>>;
  /**
   * `lemma|CASE` to every spelling that counts as that case of that word.
   *
   * A beat can require a word *in a case*, which is the one requirement that
   * cannot be answered by "is this word here at all": `Mul on kurguvalu` and
   * `Mul on kurguvalus` are the same word and only one of them is the answer.
   * `caseAnswer` is what decides that everywhere else in this app, and it
   * returns every accepted spelling rather than one, so `tuppa` and `toasse`
   * both count and a learner is not marked wrong for the other true answer.
   *
   * Built here rather than asked per turn, for the reason the forms are: this
   * is a few hundred entries answered once against a turn of half a dozen
   * words, and the alternative is resolving a lemma to its stems inside the
   * marker, which would put the dictionary back in a module that has none.
   */
  readonly byCase: ReadonlyMap<string, ReadonlySet<string>>;
  /**
   * `lemma|CASE` to the one spelling a screen prints for it.
   *
   * `byCase` is what a marker takes and is deliberately wider than what a
   * screen shows, for the reason `accepted` is wider than `alsoRight` on a
   * `DerivedForm`: it holds a suffix guess beside a retrieved form, and
   * printing the pair would assert the guess is a word. A line the other side
   * says off the card (`datumLine`) needs the printed form and only that,
   * `teisipäeval` for the day they are offering, so this is the table's own
   * singular, and a case the table has no form for is simply absent.
   */
  readonly caseForm: ReadonlyMap<string, string>;
}

/** The key `byCase` is read with. One place, so a caller cannot spell it wrong. */
export function caseKeyFor(lemma: string, grammCase: string): string {
  return `${lemma.toLowerCase()}|${grammCase}`;
}

/** The closed list for one scene: the entries behind the lemmas it may use. */
export function buildLexicon(entries: readonly DictEntry[]): Lexicon {
  const forms = new Set<string>();
  const byLemma = new Map<string, Set<string>>();
  const byCase = new Map<string, Set<string>>();
  const caseForm = new Map<string, string>();
  for (const entry of entries) {
    const own = byLemma.get(entry.lemma) ?? new Set<string>();
    for (const form of formsOf(entry)) {
      forms.add(form);
      own.add(form);
    }
    byLemma.set(entry.lemma, own);

    if (entry.pos === "VERB" || !entry.parts.GEN_SG) continue;
    for (const row of caseTableOf(entry)) {
      const key = caseKeyFor(entry.lemma, row.spec.key);
      const seen = byCase.get(key) ?? new Set<string>();
      for (const value of row.accepted) {
        for (const word of words(value)) seen.add(word);
      }
      byCase.set(key, seen);
      if (row.singular && !caseForm.has(key)) caseForm.set(key, row.singular);
    }
  }
  return { forms, byLemma, byCase, caseForm };
}

/** The eleven derivable cases of one nominal, attested forms leading. */
function caseTableOf(entry: DictEntry) {
  return buildCaseTable(stemsFrom([
    ...Object.entries(entry.parts).map(([formType, value]) => ({ formType, value })),
    ...(entry.extraForms ?? []).map((f) => ({ formType: `EKILEX:${f.code}`, value: f.value })),
  ]));
}

/**
 * A lexicon plus a set of bare words nothing in the dictionary can vouch for.
 *
 * THE SET IS MEASURED, NEVER TYPED, and that is the whole point of it. The
 * words that hold an Estonian sentence together are not in this app's
 * dictionary: Phase 0 found that `on`, `ja`, `ei`, `et` and their kind are in
 * neither the harvest, nor the built expansion, nor the hand seeds, so every
 * recorded sentence is unreadable to this module by one or two words a learner
 * has known since their first week. The seventeenth pass added six units for
 * the words between the words and caught question words, pronouns, time
 * adverbs, postpositions, months and countries. It did not catch the
 * conjunctions, the particles, or the present tense of `olema`.
 *
 * Writing that list here would be this file writing Estonian, which is the one
 * thing it may not do (ADR-005). So `measure-scenes.ts` derives it instead: the
 * commonest tokens in the attested corpus that no entry can account for, ranked
 * by frequency, which is both the honest floor for a coverage figure and the
 * list the missing syllabus unit should be built from. Nobody types a word, and
 * the number that comes out says exactly what that unit would buy.
 */
export function withExtras(lexicon: Lexicon, extras: Iterable<string>): Lexicon {
  const forms = new Set(lexicon.forms);
  for (const word of extras) forms.add(word.toLowerCase());
  return { forms, byLemma: lexicon.byLemma, byCase: lexicon.byCase, caseForm: lexicon.caseForm };
}
