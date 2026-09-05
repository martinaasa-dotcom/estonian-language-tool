/**
 * What the export contains, table by table, and what each table cannot be read
 * as.
 *
 * Kept apart from `corpus.ts` because the two answer different questions.
 * That file is the disclosure gate and would be the same for any table of
 * counts about people. This one is about Estonian, and every note in it is a
 * claim somebody could check against the app's own code.
 *
 * The notes are the point. A figure with no stated denominator is not a figure,
 * and the mistake this file exists to prevent is the one that makes a research
 * artifact worthless: a reader who takes "the partitive is answered correctly
 * 61% of the time" to mean something about Estonian, when it may equally mean
 * something about which cards this app happens to build. Every table says which
 * of those it can support.
 */

import type { SectionSpec } from "./corpus";

/**
 * The FSRS state of a card the scheduler had stopped treating as new.
 *
 * The same constant `lib/stats/history.ts` calls `REVIEW_STATE`, restated here
 * rather than imported so this module stays about the export. The two must
 * agree, and an invariant says so.
 */
export const MATURE_STATE = 2;

/**
 * What counts as a correct answer.
 *
 * The app's four grades are Again, Hard, Good and Easy, and everything in it
 * that reports accuracy counts Good and Easy: `ratingBreakdown`, `caseAccuracy`
 * and `retentionReading` all cut at three. Hard means recalled with difficulty
 * and it is deliberately on the wrong side of that line, because the question
 * these tables ask is whether the form came back, not whether it eventually
 * came back. Restating it here would create a second definition, so the number
 * lives in one place and the export prints it.
 */
export const CORRECT_FROM_RATING = 3;

/**
 * The tables, in the order they are worth reading.
 *
 * Case first, because it is what the app measures best and what a reader came
 * for. The word list is last because it is much the longest, and because it is
 * the one a reader should approach with the sampling caveat in hand.
 */
export const SECTIONS: readonly SectionSpec[] = [
  {
    id: "encounters",
    title: "Real conversations reported from outside the app, by the unit the errand drew on",
    dimensions: ["unit"],
    groupBy: 0,
    note:
      "Today asks each morning whether the learner spoke any Estonian to anybody yesterday, " +
      "and the answer is one of three words: yes and they understood, they switched to " +
      "English, not yesterday. This table counts those reports rather than answers to cards, " +
      "and \"correct\" here means understood. It is self-reported and it is the only figure " +
      "in this file about anything that happened away from a screen. IT COVERS ONLY THE " +
      "REPORTS TIED TO AN ERRAND THIS APP SET, which is a shrinking share of them: a " +
      "conversation the learner had on their own carries no unit to be grouped by and is not " +
      "in this table at all, so read it as a count of errands done rather than of " +
      "conversations held. The unit is the one the errand drew its words from, which is how " +
      "the errand was chosen, not a measurement of what was said. Mature figures do not " +
      "apply and are zero.",
  },
  {
    id: "case",
    title: "Accuracy by grammatical case",
    dimensions: ["case"],
    groupBy: 0,
    note:
      "Every answer to a question that asked for a particular case. Three kinds of card " +
      "ask one: a case form from the dictionary form, a gradating stem in the omastav, " +
      "and a recorded sentence with one word taken out. All three are marked against a " +
      "form in the dictionary rather than judged, and case_by_task splits them apart.",
  },
  {
    id: "case_by_task",
    title: "Accuracy by case and by the shape of the question",
    dimensions: ["case", "task"],
    groupBy: 1,
    note:
      "The same answers as the case table, split by what was actually asked. It is worth " +
      "reading before the rest: a gradation card always asks for the omastav and asks for " +
      "a stem change with it, so the omastav row of the case table mixes two difficulties, " +
      "and this is where they come apart. Answers whose card has since been deleted are " +
      "not here, because the shape of the question is no longer knowable for them. See " +
      "cardsResolvedPct for how many that is.",
  },
  {
    id: "case_by_level",
    title: "Accuracy by case and by the word's CEFR level",
    dimensions: ["case", "cefr"],
    groupBy: 1,
    note:
      "Whether a case stays hard as the vocabulary gets harder, or whether it was the " +
      "words all along. The level is the one recorded against the word in the dictionary, " +
      "not a level measured of the learner. Words with no level recorded are grouped as " +
      "unknown rather than dropped.",
  },
  {
    id: "case_by_gradation",
    title: "Accuracy by case and by whether the stem alternates",
    dimensions: ["case", "gradation"],
    groupBy: 1,
    note:
      "The one crosstab this app was built to be able to draw. Estonian errors do not " +
      "cluster by case alone, they cluster by a case meeting a stem that changes under " +
      "it, and a learner comfortable with the osastav of raamat can miss it every time on " +
      "tuba. NONE and QUALITATIVE are the app's own classification of the word, from the " +
      "principal parts the Institute records. The column allows a third value, " +
      "QUANTITATIVE, and no row carries it: Estonian's third quantity is not spelled, so " +
      "a classifier reading forms as strings cannot see it. Read the field as two values.",
  },
  {
    id: "gradation_pattern",
    title: "Accuracy by consonant gradation pattern",
    dimensions: ["pattern"],
    groupBy: 0,
    note:
      "Every answer about a word whose stem alternates, grouped by the alternation " +
      "itself. Only words classified as gradating appear. The pattern is written the way " +
      "the app shows it on a dictionary entry: the strong grade, then the weak one.",
  },
  {
    id: "task",
    title: "Accuracy by the shape of the question",
    dimensions: ["task"],
    groupBy: 0,
    note:
      "Every answer in the corpus, grouped by what the card asked for. These are not " +
      "comparable to each other as measures of difficulty: recognizing a word from its " +
      "English and producing a case form are different tasks, not the same task at two " +
      "levels. The row is here so that every other table can be read against the mix it " +
      "was drawn from. Answers whose card has since been deleted are not here: see " +
      "cardsResolvedPct for how many that is.",
  },
  {
    id: "level",
    title: "Accuracy by the word's CEFR level",
    dimensions: ["cefr"],
    groupBy: 0,
    note:
      "Whether the levels recorded in the dictionary predict what learners find hard. " +
      "Read it against the task table: the mix of card shapes is not the same at every " +
      "level, because a word with more forms recorded builds more kinds of card.",
  },
  {
    id: "pos",
    title: "Accuracy by part of speech",
    dimensions: ["pos"],
    groupBy: 0,
    note:
      "The word class the dictionary records. Verbs and nominals are asked different " +
      "questions, so the same caveat as the level table applies here with more force.",
  },
  {
    id: "word",
    title: "Accuracy by word",
    dimensions: ["lemma", "pos", "cefr"],
    groupBy: 0,
    note:
      "An empirical difficulty ordering of Estonian vocabulary, which is the table with " +
      "no equivalent anywhere else and the one to treat most carefully. A word is here " +
      "only if enough different people met it often enough, so the list is biased toward " +
      "words the course teaches early and toward words with many forms recorded. It says " +
      "which of the words learners actually meet are hard. It does not say which words in " +
      "Estonian are hard.",
  },
];

/**
 * What a reader has to know before any of the numbers mean anything.
 *
 * Every entry here is a limitation rather than a feature, which is deliberate:
 * the useful half of a dataset like this is the half that says where it stops
 * being evidence. Two of them cannot be fixed without changing what the app
 * records, and both say so.
 */
export const CAVEATS: readonly string[] = [
  "Accuracy counts an answer graded Good or Easy as correct. Hard means recalled with " +
    "difficulty and counts as not recalled, which is the cut every other figure in this " +
    "app uses.",
  "A first meeting with a card is not in here at all. The app shows a new word with its " +
    "answer and writes nothing down, and the grade comes from the retrieval a few cards " +
    "later, so nothing counted here is somebody being asked for a word they had never seen.",
  "Most answers were marked by the app against a form the dictionary holds, but not all " +
    "of them. A learner can set review to show the answer and grade themselves, and the " +
    "log records the grade rather than how the question was asked, so the two cannot be " +
    "separated after the fact. The share of people with each setting is given above, which " +
    "bounds it without resolving it.",
  "The mature column is the narrower and better question: of the answers to cards the " +
    "scheduler believed were learned and had scheduled to come back, how many came back. " +
    "It excludes learning steps, where a word is being drilled minutes after it was met " +
    "and a right answer says little. Where it is absent, the mature answers alone did not " +
    "clear the same threshold the cell did.",
  "Which cards exist for a word depends on what the dictionary holds for it, so a word " +
    "with a full set of recorded forms is asked about in more ways than one held as " +
    "principal parts alone. That shapes every table here and is not a fact about Estonian.",
  "Spaced repetition decides when a card comes back, so a card somebody keeps missing is " +
    "asked more often. Answers are therefore not a sample of encounters: a hard word is " +
    "over-represented in the count and its accuracy is measured over repeated attempts.",
];
