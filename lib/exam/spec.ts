import type { SkillKey } from "./types";

/**
 * What the Estonian state language examination actually is.
 *
 * The app mocks a real exam, so the shape of that exam is data rather than
 * something a page improvises. Everything in `OFFICIAL` below was read off the
 * Education and Youth Board's own specifications and is cited in
 * `docs/16-exam.md`: four parts, the minutes each one runs for, the points each
 * one carries, and the rule that decides a pass.
 *
 * TWO THINGS ARE KEPT APART HERE ON PURPOSE.
 *
 * The **frame** is the real exam: parts, durations, points, the 60 percent
 * pass mark, and the clause that a zero in any one part fails the whole paper
 * however good the other three were. A learner sitting this should meet the
 * same clock and the same arithmetic they will meet in the hall.
 *
 * The **tasks** are the app's stand-ins. The real paper sets a 400 word
 * magazine article and a live examiner; this one has a dictionary and a speech
 * synthesiser. So each task declares, in `standsFor`, which official task type
 * it is standing in for, and the exam screen prints that. An imitation that
 * does not say where it stops imitating is a lie about how ready somebody is,
 * which is the one thing a mock exam must never be.
 *
 * Nothing here writes Estonian. The task specs describe shapes; the sentences
 * that fill them come from Ekilex by way of `./paper` (ADR-005).
 *
 * Pure: no React, no Prisma, no clock.
 */

export type ExamLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export const EXAM_LEVELS: readonly ExamLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

/** The four levels the state actually examines at. */
export const OFFICIAL_LEVELS: readonly ExamLevel[] = ["A2", "B1", "B2", "C1"] as const;

export function isExamLevel(value: string): value is ExamLevel {
  return (EXAM_LEVELS as readonly string[]).includes(value);
}

/** The exercise shapes the app can assemble out of attested Estonian. */
export type TaskKind =
  /** A recorded sentence with one word removed, chosen from four real forms. */
  | "gap-choice"
  /** The same, typed rather than chosen. */
  | "gap-type"
  /** Sentences matched to the words they illustrate. */
  | "match-usage"
  /** A sentence rebuilt from its own words. */
  | "order"
  /** An Estonian word, and four English meanings to choose between. */
  | "gloss-choice"
  /** A word and a named case, and four real forms to choose between. */
  | "form-choice"
  /** Produce a named case of a word. */
  | "case-form"
  /** Which case does this verb take? */
  | "government"
  /** Hear a sentence, type it back. */
  | "dictation"
  /** Hear a sentence, pick which one it was. */
  | "listen-choose"
  /** Write a text of your own. */
  | "compose"
  /** Record yourself, then mark yourself. */
  | "speak";

export interface TaskSpec {
  id: string;
  kind: TaskKind;
  /** How many marks this task is worth, one per item. */
  items: number;
  /** Raw marks. Equal to `items` everywhere except the two written tasks. */
  raw: number;
  title: string;
  /** What the learner is asked to do, in English, as the app teaches in English. */
  instruction: string;
  /** The official task this stands in for, named the way the paper names it. */
  standsFor: string;
  /**
   * What to set instead when the dictionary cannot supply this shape.
   *
   * THIS EXISTS BECAUSE OF WHAT A KEYLESS INSTALL ACTUALLY HOLDS. Three of the
   * task shapes here need an attested sentence, and the built-in 360 word set
   * carries none: example sentences arrive from Ekilex `usages`, so without a
   * key the whole of the reading and listening parts came out empty and half
   * the paper was marked absent. That is honest and it is also useless, and the
   * default install is the one a stranger gets.
   *
   * So a task that cannot be set falls back to one built from what the
   * dictionary always has: words, forms, glosses and a speech synthesiser that
   * needs no key. The fallback is declared here rather than chosen in the
   * builder, it is recorded on the built task, and the briefing and the result
   * both say when one was used. A substitution nobody is told about would make
   * the paper quietly easier than the one it claims to imitate.
   */
  fallback?: TaskKind;
}

export interface PartSpec {
  skill: SkillKey;
  /** The English name used across the app. */
  label: string;
  /** The name on the real paper. */
  et: string;
  /** Minutes the real part runs for. The mock runs the same clock. */
  minutes: number;
  /** Weighted points this part contributes. */
  points: number;
  tasks: TaskSpec[];
}

export interface ExamSpec {
  level: ExamLevel;
  /** True for the four levels the state examines. */
  official: boolean;
  /** One line on what this paper is, shown above the start button. */
  summary: string;
  totalPoints: number;
  parts: PartSpec[];
}

/** A pass is 60 percent of the total, and no part may score zero. */
export const PASS_PCT = 60;

/**
 * Below this a candidate waits six months before sitting again.
 *
 * Not something the app enforces, obviously. It is shown after a failed paper
 * because it is the difference between "close" and "not yet", and a learner
 * deciding whether to book a real sitting is deciding exactly that.
 */
export const RETAKE_WAIT_PCT = 45;

export interface Band {
  min: number;
  label: string;
  tone: string;
}

/** The verbal assessment printed beside a real result. */
export const BANDS: readonly Band[] = [
  { min: 91, label: "very good", tone: "mint" },
  { min: 76, label: "good", tone: "mint" },
  { min: 60, label: "satisfactory", tone: "sky" },
  { min: 50, label: "poor", tone: "butter" },
  { min: 0, label: "not up to the level", tone: "peach" },
] as const;

export function bandFor(pct: number): Band {
  return BANDS.find((b) => pct >= b.min) ?? BANDS[BANDS.length - 1]!;
}

/**
 * What each task shape asks for, written once.
 *
 * The wording does not change with the level; the number of items and the
 * material's difficulty do. Keeping the copy here rather than in a table with
 * six rows per level means a rewrite is one edit rather than six chances to
 * leave one behind.
 */
const BLUEPRINTS: Record<TaskKind, Omit<TaskSpec, "id" | "items" | "raw">> = {
  "match-usage": {
    kind: "match-usage",
    title: "Which word does each sentence use?",
    instruction:
      "Every sentence below was written by a lexicographer to show one word in use. " +
      "Match each sentence to the word it illustrates.",
    standsFor: "sobitamine, matching a description to the text it belongs with",
    fallback: "gloss-choice",
  },
  "gap-choice": {
    kind: "gap-choice",
    title: "Choose the missing word",
    instruction:
      "One word has been taken out of each sentence. Choose the form that belongs there. " +
      "Every option is a real Estonian form, so the ending is the question.",
    standsFor: "valikvastustega lunkulesanne, a gapped text with three or four options",
    fallback: "form-choice",
  },
  "gap-type": {
    kind: "gap-type",
    title: "Write the missing word",
    instruction: "One word has been taken out of each sentence. Type the form that belongs there.",
    standsFor: "lunkulesanne, a gapped text filled in by hand",
  },
  "gloss-choice": {
    kind: "gloss-choice",
    title: "What does the word mean?",
    instruction:
      "An Estonian word and four English meanings. Set when the dictionary has no recorded " +
      "sentence to build a real reading task from.",
    standsFor: "lugemine info hankimiseks, reading to find information",
  },
  "form-choice": {
    kind: "form-choice",
    title: "Which form is it?",
    instruction:
      "A word and a case. Choose the form that belongs to it. Every option is a real Estonian " +
      "form, so the ending is the question.",
    standsFor: "valikvastustega lunkulesanne, a gapped text with three or four options",
  },
  order: {
    kind: "order",
    title: "Put the sentence back together",
    instruction:
      "The words of a real sentence, out of order. Put them back. Estonian word order is freer " +
      "than English, so this is marked against the order the writer actually chose.",
    standsFor: "tekstisiseste seoste mõistmine, following how a text holds together",
  },
  "case-form": {
    kind: "case-form",
    title: "Write the form",
    instruction:
      "Write the named form of each word. Marked against the dictionary, never against a model.",
    standsFor: "andmete kirjutamine, the short controlled writing task",
  },
  government: {
    kind: "government",
    title: "Which case does the verb take?",
    instruction:
      "Estonian verbs govern a case, and English gives you no clue which. Choose the one each " +
      "verb takes.",
    standsFor: "grammatiline korrektsus, the accuracy the written parts are marked for",
  },
  dictation: {
    kind: "dictation",
    title: "Write down what you hear",
    instruction:
      "Play each recording as often as you like within the time, then type it. Marked word by " +
      "word, so a missed ending costs one word and not the whole of it. A missed diacritic is " +
      "reported and does not cost the mark, which is how the real paper marks this one.",
    standsFor: "puuduva infoga ulesanne, writing down what the recording said",
  },
  "listen-choose": {
    kind: "listen-choose",
    // "Recording" rather than "sentence", because the same task is set from
    // single words wherever the dictionary holds no recorded sentence, and a
    // title that promised a sentence and delivered a word would be the paper
    // misdescribing itself. Each question says which it is.
    title: "What did you hear?",
    instruction:
      "Play each recording as often as you like within the time, then choose what it said.",
    standsFor: "valikvastustega kuulamisulesanne, multiple choice after a recording",
  },
  compose: {
    kind: "compose",
    title: "Write a text",
    instruction:
      "Write in Estonian, on the topic given, using the words listed. Length and the words you " +
      "were asked to use are checked mechanically and carry the marks. Anu may add a note, and " +
      "her note carries none.",
    standsFor: "loovkirjutamine, the free writing task",
  },
  speak: {
    kind: "speak",
    title: "Speak",
    instruction:
      "Record yourself answering, then listen back and mark yourself against the criteria. " +
      "There is no verified Estonian speech recogniser available to this app, so nothing here " +
      "scores your pronunciation and nothing pretends to.",
    standsFor: "suuline esinemine ja dialoog, the spoken part with an examiner",
  },
};

/** Item counts per task, per level. The paper gets longer as the level rises. */
interface LevelPlan {
  minutes: Record<SkillKey, number>;
  points: number;
  reading: [match: number, gap: number, order: number];
  listening: [choose: number, dictate: number];
  /** Forms task items, government items, then the marks the composition carries. */
  writing: [forms: number, government: number, composeRaw: number];
  speaking: [first: number, second: number];
  /** Words the composition must reach. */
  composeWords: number;
  /** Seconds each spoken answer runs for. */
  speakSeconds: number;
  summary: string;
}

const PLANS: Record<ExamLevel, LevelPlan> = {
  A1: {
    minutes: { writing: 25, listening: 25, reading: 40, speaking: 12 },
    points: 20,
    reading: [5, 6, 4], listening: [5, 4], writing: [6, 4, 8], speaking: [4, 4],
    composeWords: 30, speakSeconds: 45,
    summary:
      "The state does not examine at A1, so this paper is the app's own. It is built to the " +
      "shape of the A2 paper, one step easier, for a first sitting that is meant to be passable.",
  },
  A2: {
    minutes: { writing: 30, listening: 30, reading: 50, speaking: 15 },
    points: 20,
    reading: [6, 8, 5], listening: [6, 5], writing: [8, 5, 10], speaking: [5, 5],
    composeWords: 40, speakSeconds: 60,
    summary:
      "The lowest level the state examines, and the one that meets the language requirement for " +
      "several jobs. Eighty points, twenty for each part.",
  },
  B1: {
    minutes: { writing: 30, listening: 35, reading: 50, speaking: 15 },
    points: 25,
    reading: [8, 10, 6], listening: [7, 6], writing: [8, 6, 12], speaking: [6, 6],
    composeWords: 80, speakSeconds: 90,
    summary:
      "The level a citizenship application asks for. A hundred points, twenty five for each " +
      "part, and the written half runs under two hours.",
  },
  B2: {
    minutes: { writing: 80, listening: 35, reading: 70, speaking: 20 },
    points: 25,
    reading: [8, 12, 8], listening: [8, 7], writing: [10, 7, 14], speaking: [7, 7],
    composeWords: 140, speakSeconds: 120,
    summary:
      "Three hours and five minutes of written paper, then twenty minutes of speaking. The " +
      "level most professional registers ask for.",
  },
  C1: {
    minutes: { writing: 90, listening: 45, reading: 60, speaking: 20 },
    points: 25,
    reading: [10, 14, 8], listening: [9, 8], writing: [10, 8, 16], speaking: [8, 8],
    composeWords: 260, speakSeconds: 150,
    summary:
      "The highest level the state examines. Ninety minutes of writing alone, and the second " +
      "written task runs to about 260 words.",
  },
  C2: {
    minutes: { writing: 100, listening: 50, reading: 70, speaking: 25 },
    points: 25,
    reading: [10, 16, 10], listening: [10, 9], writing: [12, 9, 18], speaking: [9, 9],
    composeWords: 300, speakSeconds: 180,
    summary:
      "There is no C2 examination. The Board's own note says a command of Estonian this far " +
      "past C1 cannot be required of anybody for a job, so nobody sets a paper for it. This one " +
      "is the app's, built past C1 for the fun of finding out. Sit it, by all means.",
  },
};

/** What one task shape asks for, without the counts. Used when a task falls back. */
export function blueprintFor(kind: TaskKind): Omit<TaskSpec, "id" | "items" | "raw"> {
  return BLUEPRINTS[kind];
}

function task(kind: TaskKind, id: string, items: number, raw = items): TaskSpec {
  return { id, items, raw, ...BLUEPRINTS[kind] };
}

/** The whole paper for one level. */
export function specFor(level: ExamLevel): ExamSpec {
  const plan = PLANS[level];
  const [match, gap, order] = plan.reading;
  const [choose, dictate] = plan.listening;
  const [forms, governed, composeRaw] = plan.writing;
  const [speakA, speakB] = plan.speaking;

  return {
    level,
    official: (OFFICIAL_LEVELS as readonly string[]).includes(level),
    summary: plan.summary,
    totalPoints: plan.points * 4,
    parts: [
      {
        skill: "writing", label: "Writing", et: "kirjutamine",
        minutes: plan.minutes.writing, points: plan.points,
        tasks: [
          task("case-form", "w1", forms),
          task("government", "w2", governed),
          task("compose", "w3", 1, composeRaw),
        ],
      },
      {
        skill: "listening", label: "Listening", et: "kuulamine",
        minutes: plan.minutes.listening, points: plan.points,
        tasks: [task("listen-choose", "l1", choose), task("dictation", "l2", dictate)],
      },
      {
        skill: "reading", label: "Reading", et: "lugemine",
        minutes: plan.minutes.reading, points: plan.points,
        tasks: [
          task("match-usage", "r1", match),
          task("gap-choice", "r2", gap),
          task("order", "r3", order),
        ],
      },
      {
        skill: "speaking", label: "Speaking", et: "rääkimine",
        minutes: plan.minutes.speaking, points: plan.points,
        /*
          One item each, carrying several marks. The spoken part is the one the
          learner marks themselves (ADR-018), and a criterion is worth a mark:
          splitting it into six questions would imply six recordings.
        */
        tasks: [task("speak", "s1", 1, speakA), task("speak", "s2", 1, speakB)],
      },
    ],
  };
}

/** Words the composition at this level must reach, and seconds per spoken answer. */
export function lengthsFor(level: ExamLevel): { composeWords: number; speakSeconds: number } {
  const plan = PLANS[level];
  return { composeWords: plan.composeWords, speakSeconds: plan.speakSeconds };
}

/** Total minutes of the written half, which is what a learner plans an evening around. */
export function writtenMinutes(spec: ExamSpec): number {
  return spec.parts
    .filter((p) => p.skill !== "speaking")
    .reduce((sum, p) => sum + p.minutes, 0);
}

/**
 * What a learner marks themselves against on the spoken part.
 *
 * ADR-018 forbids scoring pronunciation, and the honest consequence is that
 * somebody has to do the marking. A blank "how did that go?" gets a shrug, so
 * these are the criteria an examiner would actually be working from, written so
 * that each one is answerable by listening to your own recording once.
 *
 * They are deliberately about things you can hear rather than things you can
 * only know: "somebody Estonian would have understood me first time" is a
 * judgement a learner can make; "my pronunciation was accurate" is not.
 */
export const SPEAKING_CRITERIA: readonly string[] = [
  "I answered the question that was actually asked.",
  "I spoke for the whole time, without long silences.",
  "I gave a reason, not only a description.",
  "I used the case endings I meant to use.",
  "Somebody Estonian would have understood me first time.",
  "I used more than one tense, not only the olevik.",
  "I used at least three words from the idea card.",
  "I heard a mistake and corrected it as I went.",
  "I never switched into English.",
] as const;

/** The first `count` criteria, which is how many marks the task carries. */
export function speakingCriteria(count: number): string[] {
  return SPEAKING_CRITERIA.slice(0, Math.max(1, Math.min(count, SPEAKING_CRITERIA.length)));
}
