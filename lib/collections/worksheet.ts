import { buildCloze, naturalSentence, nominalOpener } from "@/lib/estonian/cloze";
import { gapForms } from "@/lib/estonian/gapForms";
import { usableExamples, type Example } from "@/lib/dict/examples";

/**
 * A printable worksheet for one unit.
 *
 * The feature a real Estonian course asks for and no flashcard app has: paper.
 * Teachers hand out worksheets, and a course that lives only behind a login is
 * a course half the class does at home and nobody does in the room. This turns
 * a unit into a sheet with an answer key on the back.
 *
 * Every exercise is built from material the dictionary already holds — attested
 * sentences from Ekilex, principal parts from the seed — and nothing is
 * generated. A gap-fill is a real sentence with one of its own words hidden; a
 * case table is a table with cells left out. That is the whole trick, and it is
 * the same one the cloze cards use (ADR-005, ADR-017).
 *
 * Deterministic on purpose. Printing the same unit twice has to produce the same
 * sheet, or a class ends up comparing answers to two different worksheets.
 */
export interface WorksheetWord {
  lemma: string;
  translation: string;
  pos: string;
  forms: readonly { formType: string; value: string }[];
  examples: readonly Example[];
}

export interface VocabularyItem {
  lemma: string;
  translation: string;
}

export interface GapItem {
  /** The sentence with one word replaced by a blank. */
  text: string;
  /** The word that was taken out. */
  answer: string;
  /** The dictionary form of the word, given so the exercise tests the form. */
  hint: string;
  english: string | null;
}

export interface CaseRow {
  lemma: string;
  nominative: string;
  genitive: string;
  partitive: string;
  /** Which cells are printed blank for the learner to fill in. */
  blanks: readonly ("genitive" | "partitive")[];
}

export interface Worksheet {
  vocabulary: VocabularyItem[];
  gaps: GapItem[];
  cases: CaseRow[];
  /** True when there is nothing at all to print. */
  empty: boolean;
}

export interface WorksheetLimits {
  vocabulary?: number;
  gaps?: number;
  cases?: number;
}

const DEFAULTS: Required<WorksheetLimits> = { vocabulary: 12, gaps: 8, cases: 6 };

export function buildWorksheet(words: readonly WorksheetWord[], limits: WorksheetLimits = {}): Worksheet {
  const max = { ...DEFAULTS, ...limits };

  const vocabulary: VocabularyItem[] = words
    .filter((w) => w.translation.trim().length > 0)
    .slice(0, max.vocabulary)
    .map((w) => ({ lemma: w.lemma, translation: w.translation }));

  const gaps: GapItem[] = [];
  for (const word of words) {
    if (gaps.length >= max.gaps) break;
    const gap = firstGap(word);
    if (gap) gaps.push(gap);
  }

  const cases: CaseRow[] = [];
  for (const word of words) {
    if (cases.length >= max.cases) break;
    const row = caseRow(word, cases.length);
    if (row) cases.push(row);
  }

  return {
    vocabulary,
    gaps,
    cases,
    empty: vocabulary.length === 0 && gaps.length === 0 && cases.length === 0,
  };
}

/**
 * The first attested sentence for this word that can carry a gap.
 *
 * Any of the word's own forms may be the one hidden — a sentence about `tuba`
 * usually contains `toas`, not `tuba`, and hiding the inflected form is the
 * more useful exercise anyway.
 */
function firstGap(word: WorksheetWord): GapItem | null {
  // Which is what the comment above has always said and what the list could
  // not do: `toas` is a derived case, so a stored-forms-only list could hide
  // it on an enriched entry and not on a seeded one.
  const forms = [...gapForms(word).keys()];
  /*
    And only out of something that is a sentence. `usableExamples` keeps what is
    worth printing on a dictionary entry; a gap on a sheet a class works through
    is a question, and the mock exam and the level check have put every sentence
    through `naturalSentence` since a real sitting turned up a usage that trails
    off and one that leaves the answer standing beside the gap in its other
    spelling. This is paper, so nobody can ask about it afterwards.
  */
  const opener = nominalOpener(word.pos, [word.lemma, ...word.forms.map((f) => f.value)]);
  for (const example of usableExamples([...word.examples])) {
    if (!naturalSentence(example.et, opener)) continue;
    const cloze = buildCloze(example.et, forms);
    if (!cloze) continue;
    return {
      text: cloze.text,
      answer: cloze.answer,
      hint: word.lemma,
      english: example.en ?? null,
    };
  }
  return null;
}

/**
 * A row of the case table, with cells left blank in a rotating pattern.
 *
 * Rotating rather than random: the first row leaves the genitive out, the second
 * the partitive, the third both. A sheet where every row blanks the same column
 * teaches the column; this one makes the learner read the row.
 */
function caseRow(word: WorksheetWord, position: number): CaseRow | null {
  if (word.pos !== "NOUN") return null;
  const value = (type: string) => word.forms.find((f) => f.formType === type)?.value;

  const nominative = value("NOM_SG") ?? word.lemma;
  const genitive = value("GEN_SG");
  const partitive = value("PART_SG");
  if (!genitive || !partitive) return null;

  const pattern: CaseRow["blanks"][] = [["genitive"], ["partitive"], ["genitive", "partitive"]];
  return {
    lemma: word.lemma,
    nominative,
    genitive,
    partitive,
    blanks: pattern[position % pattern.length]!,
  };
}
