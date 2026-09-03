/**
 * DOES EVERY QUESTION THIS APP ASKS MAKE SENSE FOR THE WORD IT IS ABOUT?
 *
 * `npm run audit:questions` asks the mechanical question: is the answer already
 * printed in the question. This asks the one after it, which no unit test can:
 * is the question a thing anybody would ask about *this* word.
 *
 * It exists because of a report from somebody using the app. A new word came up
 * in review, `hobune`, and the card asked for it in the sisseütlev and wanted
 * `hobusesse`. They asked Anu, who told them the ending goes on a place noun
 * and never on a person or an animal by themselves, which is right, so the app
 * had contradicted its own tutor on a card it built itself. Every animate noun
 * in the dictionary was drilled that way: `koeras`, `emasse`, `õpetajasse`, and
 * a learner who passes those cards has learned to say `ma annan raamatu
 * õpetajasse`.
 *
 * FOUR THINGS, and each is a rule with a module behind it rather than a taste.
 *
 *   1. A local case a word does not take. Estonian has two sets and a word
 *      takes one: `toas` for a room, `hobusel` for a horse, `Saksamaal` for a
 *      country. `caseFits` is the answer and `lib/estonian/semantics.ts` is
 *      where the fact comes from.
 *   2. A question word for the wrong kind of thing. A horse is a `kes`, so a
 *      card asking `hobune → millega?` is asking with the interrogative for a
 *      thing. `caseQuestionFor` is the answer.
 *   3. A place adverb on a card about one word. `kus?` is answered by the
 *      seesütlev *and* the alalütlev, so a card printing it can be answered
 *      correctly and marked wrong. It belongs in the case's name and not in a
 *      question about a word.
 *   4. A singular case asked of a word that has no singular. Nineteen entries
 *      are headed by a plural because that is the only number the word has,
 *      and Ekilex records the singular paradigm of the word underneath, so
 *      `prillid → milles?` wanted `prillis`.
 *   5. An exercise built out of something that is not a sentence.
 *      `naturalSentence` is the gate, and it was on four of the eight doors:
 *      the mock exam and the level check had it, the deck's gap-fills, the
 *      printable worksheet, the lesson planner and speaking practice did not.
 *
 * WHAT IT IS NOT. It does not judge whether a question is hard, or whether the
 * word is worth teaching, or whether the wrong answers are any good, which is
 * `lib/questions/distractors.ts` and was measured separately. It asks four
 * mechanical things, which is why it can be trusted over forty thousand cards.
 *
 * No database and no network: it reads `prisma/data/expanded.json`, which is
 * what `npm run db:seed` loads.
 */
import { readExpanded } from "./lib/expandedFile";
import { generateCards, availableCardTypes, type LexemeForCards } from "../lib/srs/cards";
import { writingTasksFor } from "../lib/estonian/writing";
import { CASES } from "../lib/estonian/cases";
import { caseFits, type CaseSubject } from "../lib/estonian/caseQuestion";
import { naturalSentence, nominalOpener } from "../lib/estonian/cloze";
import { parseExamples, usableExamples } from "../lib/dict/examples";
import { semanticGroup } from "../lib/estonian/semantics";
import type { CaseKey } from "../lib/estonian/types";

interface Row {
  lemma: string; pos: string; cefr: string | null; translation: string;
  semanticTypes?: string | null;
  forms: { formType: string; value: string }[];
  examples: { et: string; en?: string | null }[];
  government: string | null; gradation?: string | null; gradationNote?: string | null;
}

const entries = readExpanded<Row>();

interface Fault { rule: string; where: string; detail: string }
const faults: Fault[] = [];
let asked = 0;

/** Every question word that names a place rather than a case. */
const PLACE_ADVERBS = new Set(
  CASES.map((c) => c.asksWhere).filter((q): q is string => Boolean(q)),
);
/** The `mis-` series, which may not be asked about a person or an animal. */
const THING_ASKS = new Map(CASES.map((c) => [c.asksThing, c.key]));
/** And the `kes-` series, which may not be asked about a thing. */
const PERSON_ASKS = new Map(CASES.map((c) => [c.asksPerson, c.key]));

/**
 * Checks one question put to a learner about one word.
 *
 * `question` is whatever the screen prints as the prompt's question half, and
 * `caseKey` is the case the answer is in, where the generator names one.
 */
function check(
  where: string,
  word: CaseSubject,
  question: string | null,
  caseKey: CaseKey | null,
): void {
  asked++;
  const group = semanticGroup(word.semanticTypes);

  /*
    READ OFF THE ENTRY RATHER THAN THROUGH `caseFits`, so this can fail on a
    word. Every other rule here asks the same function the generators ask,
    which catches a generator that forgot to call it and nothing else. A
    lemma that is not its own nominative singular is a fact about the
    dictionary, so it is checked against the dictionary.
  */
  if (word.nomSg && word.nomSg.toLocaleLowerCase("et") !== word.lemma.toLocaleLowerCase("et")) {
    faults.push({
      rule: "a case asked of a word with no singular",
      where,
      detail: `${word.lemma} is asked for a case; the dictionary's singular here is ${word.nomSg}`,
    });
  }

  if (caseKey && !caseFits(caseKey, word)) {
    const why = word.nomSg && word.nomSg !== word.lemma
      ? `${word.lemma} has no singular (the dictionary holds ${word.nomSg})`
      : `${word.lemma} is ${group.toLowerCase()}`;
    faults.push({
      rule: "case the word does not take",
      where,
      detail: `${why} and was asked for the ${caseKey.toLowerCase()}`,
    });
  }

  if (!question) return;
  for (const asked of question.split(/\s+/)) {
    if (PLACE_ADVERBS.has(asked)) {
      faults.push({
        rule: "place adverb in a question about one word",
        where,
        detail: `${word.lemma} → ${question} (${asked} names two cases at once)`,
      });
    }
    if (group === "ANIMATE" && THING_ASKS.has(asked)) {
      faults.push({
        rule: "the mis-series asked about a person or an animal",
        where,
        detail: `${word.lemma} → ${question}`,
      });
    }
    if (group === "THING" && PERSON_ASKS.has(asked)) {
      faults.push({
        rule: "the kes-series asked about a thing",
        where,
        detail: `${word.lemma} → ${question}`,
      });
    }
  }
}

/** Every sentence an exercise is built from has to be one. */
function checkSentence(where: string, word: Row, sentence: string): void {
  asked++;
  const opener = nominalOpener(word.pos, [word.lemma, ...word.forms.map((f) => f.value)]);
  if (!naturalSentence(sentence, opener)) {
    faults.push({ rule: "not a sentence", where, detail: sentence });
  }
}

for (const entry of entries) {
  const word = {
    lemma: entry.lemma,
    semanticTypes: entry.semanticTypes ?? null,
    nomSg: (entry.forms ?? []).find((f) => f.formType === "NOM_SG")?.value ?? null,
  };
  const lex: LexemeForCards = {
    lemma: entry.lemma,
    translation: entry.translation,
    pos: entry.pos,
    semanticTypes: entry.semanticTypes ?? null,
    gradation: entry.gradation ?? "NONE",
    gradationNote: entry.gradationNote ?? null,
    government: entry.government ?? null,
    examples: JSON.stringify(entry.examples ?? []),
    forms: (entry.forms ?? []).map((f) => ({ formType: f.formType, value: f.value, morphCode: null })),
  };

  /* ── The deck ─────────────────────────────────────────────────────────── */
  for (const card of generateCards(lex, availableCardTypes(lex))) {
    if (card.cardType === "CASE_FORM" || card.cardType === "GRADATION") {
      // The front is `lemma → question`; the question is what is checked.
      const question = card.front.split("→")[1]?.trim() ?? null;
      check(`card ${card.cardType} ${entry.lemma}`, word, question, card.targetCase as CaseKey | null);
    }
    if (card.cardType === "CLOZE") {
      const full = card.front.replace(/_{2,}/, card.back);
      checkSentence(`card CLOZE ${entry.lemma}`, entry, full);
    }
    if (card.cardType === "GOVERNMENT" && entry.pos !== "VERB") {
      faults.push({
        rule: "government asked of a word that is not a verb",
        where: `card GOVERNMENT ${entry.lemma}`,
        detail: `${entry.pos.toLowerCase()}: ${card.back}`,
      });
    }
  }

  /* ── The writing exercise, and the exam's case-form task through it ───── */
  for (const task of writingTasksFor(lex)) {
    check(`writing ${entry.lemma}`, word, task.caseQuestion, task.caseKey);
  }

  /* ── Every sentence the dictionary offers an exercise builder ─────────── */
  for (const example of usableExamples(parseExamples(lex.examples))) {
    // Only the ones a builder would take: `usableExamples` is the dictionary
    // entry's rule and is deliberately looser than a question's.
    const opener = nominalOpener(entry.pos, [entry.lemma, ...entry.forms.map((f) => f.value)]);
    if (naturalSentence(example.et, opener)) asked++;
  }
}

/* ── The verdict ─────────────────────────────────────────────────────────── */

/*
  A FLOOR, for the reason `audit-questions.ts` has one: every loop above is a
  `continue` away from asking nothing at all, and an audit that checked nothing
  prints the same cheerful line as one that passed.
*/
const FLOOR = 30_000;

console.log(
  `Checked ${asked.toLocaleString("en-GB")} questions and sentences over `
  + `${entries.length.toLocaleString("en-GB")} entries.`,
);
if (asked < FLOOR) {
  console.error(
    `\nOnly ${asked.toLocaleString("en-GB")} were built, against a floor of `
    + `${FLOOR.toLocaleString("en-GB")}. Something above stopped producing rather than started `
    + "passing: check that the dictionary loaded and that every generator still returns items.",
  );
  process.exit(1);
}

if (faults.length === 0) {
  console.log("Every one of them makes sense for the word it is about.");
  process.exit(0);
}

const byRule = new Map<string, Fault[]>();
for (const fault of faults) {
  byRule.set(fault.rule, [...(byRule.get(fault.rule) ?? []), fault]);
}
console.log(`\n${faults.length} do not:\n`);
for (const [rule, list] of [...byRule].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${list.length.toLocaleString("en-GB")} × ${rule}`);
  for (const fault of list.slice(0, 6)) console.log(`      ${fault.where}: ${fault.detail}`);
  if (list.length > 6) console.log(`      ...and ${list.length - 6} more`);
}
process.exit(1);
