import { checkAnswer, countsAsRecalled } from "@/lib/estonian/answer";
import { sentenceMatches } from "@/lib/estonian/cloze";
import { checkDictation } from "@/lib/estonian/dictation";
import { usesRequiredWord, wordsOf } from "./written";
import { bandFor, PASS_PCT, RETAKE_WAIT_PCT, type Band, type ExamLevel } from "./spec";
import type { ExamItem, ExamTask, Paper } from "./paper";
import type { SkillKey } from "./types";

/**
 * Marking a paper.
 *
 * TWO RULES SHAPE EVERY LINE OF THIS.
 *
 * **No model decides whether an answer is right.** Every mark below is settled
 * by comparing what the learner typed or chose against a form that came out of
 * the dictionary. That is the same ordering `app/api/write/route.ts` keeps, and
 * for the same reason: a hallucination that marks a correct answer wrong is the
 * failure that destroys trust fastest, and here it would do it while telling
 * somebody whether they are ready to sit a real examination.
 *
 * **A part is marked out of what was actually asked.** `buildPaper` reports a
 * shortfall when the dictionary could not fill a task; the weighting here uses
 * `rawAvailable` rather than the specification's raw total, so a thin paper
 * gives an honest percentage of a shorter paper instead of a punishing
 * percentage of a paper that was never set.
 *
 * Pure: no React, no Prisma, no clock.
 */

/** What the learner did with one item. */
export type Response =
  | { kind: "chosen"; value: string }
  | { kind: "typed"; value: string }
  | { kind: "ordered"; value: string[] }
  | { kind: "composed"; value: string; variant?: number }
  | { kind: "spoken"; recorded: boolean; criteria: boolean[] }
  /**
   * A listening question whose recording would not play.
   *
   * `components/Speak.tsx` removes itself when the speech proxy cannot produce
   * audio, which on a listening question leaves a dead end rather than a
   * question. Marking that as a wrong answer would charge the learner for the
   * app's own outage, so the item is treated as never set: no marks scored, and
   * no marks available either, exactly as if the dictionary had not been able
   * to fill it. The part is then marked out of the rest, and the result names
   * it.
   */
  | { kind: "unheard" }
  | { kind: "blank" };

export const BLANK_RESPONSE: Response = { kind: "blank" };

export interface ItemMark {
  itemId: string;
  /** Marks scored, and the marks available for this item. */
  scored: number;
  available: number;
  correct: boolean;
  /** What the right answer was, for the report. */
  expected: string;
  /** What they gave, as one readable line. */
  given: string;
  /** One line saying why, when there is anything to say. */
  note: string;
  /** The card behind this item, for the grades the submission writes. */
  cardId: string | null;
  lexemeId: string;
  lemma: string;
  /** True when the answer was close enough that the scheduler should hear about it. */
  recalled: boolean;
  /**
   * Which language `expected` and `given` are in.
   *
   * Most answers are Estonian and the answer list styles them as such, with a
   * `lang` attribute so a screen reader pronounces them. Three question shapes
   * answer in English: the meaning of a word, the name of a case, and the
   * spoken task. Tagging those as Estonian made the result list read out
   * "cheese" and "Partitive" in an Estonian voice and set them in the Estonian
   * face, which is wrong twice over.
   *
   * Required rather than optional with an Estonian default: a field whose
   * absence means something is a field somebody forgets to set, and the thing
   * it would silently mean here is "read this English out in Estonian".
   */
  language: "et" | "en";
  /**
   * The learner's own text, kept only for the composition.
   *
   * Every other item's answer fits in `given`. A composition does not, and the
   * result page needs it: it is what Anu reads when the learner asks for a note,
   * and there is nowhere else it survives, because the sitting itself is gone.
   */
  raw?: string;
}

/**
 * The spelling latitude the real paper allows.
 *
 * The specification says in as many words that spelling and grammar mistakes
 * which do not stop the answer being understood are not counted in the
 * listening gap task. So a missed diacritic and a single slipped keystroke take
 * the mark here. They are still reported as slips, because a learner who never
 * sees them never fixes them.
 */
function acceptsSlips(kind: ExamItem["kind"]): boolean {
  return kind === "dictation";
}

function markTyped(item: ExamItem, expected: string, typed: string, lenient: boolean): ItemMark {
  const check = checkAnswer(typed, expected, "et");
  const correct = lenient ? countsAsRecalled(check.verdict) : check.verdict === "correct";
  return {
    itemId: item.id,
    scored: correct ? 1 : 0,
    available: 1,
    correct,
    expected,
    given: typed.trim(),
    /*
      The result row already prints the form the paper wanted and the form the
      candidate typed, side by side, so `Not quite, it's “raamatut”.` is that
      word a third time on one card. What earns a line is the slip a candidate
      would not otherwise see named: which letter went, or that they were one
      keystroke out. Dictation calls that second one "one letter out" and this
      is the same mistake.
    */
    note: check.verdict === "diacritics" ? check.note
      : check.verdict === "typo" ? "One letter out."
      : "",
    cardId: item.cardId,
    lexemeId: item.lexemeId,
    lemma: item.lemma,
    recalled: countsAsRecalled(check.verdict),
    language: languageOf(item),
  };
}

function markChosen(item: ExamItem, expected: string, chosen: string, shown: string): ItemMark {
  const correct = chosen === expected;
  return {
    itemId: item.id,
    scored: correct ? 1 : 0,
    available: 1,
    correct,
    expected: shown,
    given: chosen,
    note: correct ? "" : "Not the one.",
    cardId: item.cardId,
    lexemeId: item.lexemeId,
    lemma: item.lemma,
    recalled: correct,
    language: languageOf(item),
  };
}

/**
 * Marks one item against one response.
 *
 * `choices` are the matching task's shared options, and are what turn the
 * matching question's answer back into words. The stored response is an option
 * id, because that is what a radio group carries, and the result page was
 * printing it: "you wrote dbcff369-4fb5-4a41-9a7d-6b3c3264dbf5" against a
 * question about a word. The list of what you got wrong is the half of a result
 * a real slip does not give you, and a line of it nobody can read is a line
 * that is not there.
 */
export function markItem(
  item: ExamItem,
  response: Response,
  marksPerItem: number,
  choices?: { id: string; label: string }[],
): ItemMark {
  const scale = (mark: ItemMark): ItemMark => ({
    ...mark,
    scored: Math.round(mark.scored * marksPerItem * 100) / 100,
    available: mark.available * marksPerItem,
  });

  if (response.kind === "unheard") {
    return {
      itemId: item.id, scored: 0, available: 0, correct: false,
      expected: expectedOf(item), given: "", language: languageOf(item),
      note: "The recording would not play, so this question was left out of the marks.",
      cardId: null, lexemeId: item.lexemeId, lemma: item.lemma, recalled: false,
    };
  }

  if (response.kind === "blank") {
    return scale({
      itemId: item.id, scored: 0, available: 1, correct: false,
      expected: expectedOf(item), given: "", note: "Left blank.", language: languageOf(item),
      cardId: item.cardId, lexemeId: item.lexemeId, lemma: item.lemma, recalled: false,
    });
  }

  switch (item.kind) {
    case "match-usage": {
      const chosen = response.kind === "chosen" ? response.value : "";
      const mark = scale(markChosen(item, item.answer, chosen, item.lemma));
      return { ...mark, given: choices?.find((c) => c.id === chosen)?.label ?? "" };
    }

    case "gap-choice":
    case "listen-choose":
    case "form-choice":
      return scale(markChosen(
        item,
        item.answer,
        response.kind === "chosen" ? response.value : "",
        item.answer,
      ));

    case "government": {
      const chosen = response.kind === "chosen" ? response.value : "";
      const shown = item.options.find((o) => o.key === item.answer)?.en ?? item.answer;
      const given = item.options.find((o) => o.key === chosen)?.en ?? "";
      return scale({ ...markChosen(item, item.answer, chosen, shown), given, language: "en" });
    }

    case "gloss-choice":
      return scale({
        ...markChosen(
          item, item.answer, response.kind === "chosen" ? response.value : "", item.answer,
        ),
        language: "en",
      });

    case "case-form":
      return scale(markTyped(
        item, item.answer, response.kind === "typed" ? response.value : "", false,
      ));

    case "order": {
      const built = response.kind === "ordered" ? response.value : [];
      const correct = built.length > 0 && sentenceMatches(built, item.answer);
      return scale({
        itemId: item.id, scored: correct ? 1 : 0, available: 1, correct,
        expected: item.answer, given: built.join(" "),
        note: correct ? "" : "That is not the order the writer chose.",
        cardId: item.cardId, lexemeId: item.lexemeId, lemma: item.lemma, recalled: correct,
        language: "et",
      });
    }

    case "dictation": {
      const typed = response.kind === "typed" ? response.value : "";
      const result = checkDictation(typed, item.answer);
      const correct = acceptsSlips("dictation")
        ? result.verdict === "correct" || result.verdict === "diacritics"
        : result.verdict === "correct";
      return scale({
        itemId: item.id, scored: correct ? 1 : 0, available: 1, correct,
        expected: item.answer, given: typed.trim(), note: result.note,
        cardId: item.cardId, lexemeId: item.lexemeId, lemma: item.lemma,
        recalled: result.accuracy >= 60,
        language: "et",
      });
    }

    case "message":
    case "compose":
      return markWritten(item, response.kind === "composed" ? response.value : "", marksPerItem);

    case "speak":
      return markSpeak(item, response, marksPerItem);
  }
}

/**
 * The composition, marked on the two things a machine can settle.
 *
 * Length and the words the task named. Nothing else, because nothing else can
 * be decided without a model, and a model may not decide whether Estonian is
 * correct. Anu still reads the text and says what she thinks, on the report,
 * clearly separated and carrying no marks at all. That division is the same one
 * the single sentence writing exercise already makes; it just matters more here,
 * because these marks are a quarter of the paper.
 *
 * Six marks in ten for reaching the length, four in ten for using the words.
 * Length is pro rata, because half a text is half the work rather than nothing.
 */
export const COMPOSE_LENGTH_SHARE = 0.6;

/** The written tasks are marked identically: the message and the composition. */
type WrittenItem = Extract<ExamItem, { kind: "compose" | "message" }>;

function markWritten(
  item: WrittenItem,
  text: string,
  marks: number,
): ItemMark {
  const written = wordsOf(text);
  const lengthPct = item.minWords === 0 ? 1 : Math.min(1, written.length / item.minWords);

  const used = item.mustUse.filter((w) => usesRequiredWord(w.lemma, text));
  const wordsPct = item.mustUse.length === 0 ? 1 : used.length / item.mustUse.length;

  const share = lengthPct * COMPOSE_LENGTH_SHARE + wordsPct * (1 - COMPOSE_LENGTH_SHARE);
  const missing = item.mustUse.filter((w) => !used.includes(w)).map((w) => w.lemma);

  return {
    itemId: item.id,
    scored: Math.round(share * marks * 100) / 100,
    available: marks,
    correct: share >= 0.6,
    expected: `${item.minWords} words, using ${item.mustUse.map((w) => w.lemma).join(", ")}`,
    given: `${written.length} words`,
    language: "en",
    raw: text.trim(),
    note: missing.length > 0 ? `Did not use ${missing.join(", ")}.` : "",
    cardId: null,
    lexemeId: item.lexemeId,
    lemma: item.lemma,
    recalled: false,
  };
}

/**
 * The spoken part, marked by the learner.
 *
 * ADR-018: there is no verified Estonian speech recogniser available to this
 * app, so nothing here scores a recording and nothing pretends to. The learner
 * plays themselves back and ticks the criteria they met. A recording that was
 * never made scores nothing, because ticking boxes about a thing you did not do
 * is not a self-assessment, it is a free quarter of the paper.
 */
function markSpeak(
  item: Extract<ExamItem, { kind: "speak" }>,
  response: Response,
  marks: number,
): ItemMark {
  const spoken = response.kind === "spoken" ? response : null;
  const met = spoken?.recorded ? spoken.criteria.filter(Boolean).length : 0;
  const criteria = Math.max(1, spoken?.criteria.length ?? marks);
  const scored = Math.round((met / criteria) * marks * 100) / 100;
  return {
    itemId: item.id,
    scored,
    available: marks,
    correct: scored >= marks * 0.6,
    expected: `${criteria} criteria`,
    given: spoken?.recorded ? `${met} of ${criteria}, your own marking` : "No recording",
    language: "en",
    note: spoken?.recorded ? "" : "Nothing was recorded, so this task scores nothing.",
    cardId: null,
    lexemeId: item.lexemeId,
    lemma: item.lemma,
    recalled: false,
  };
}

/** Which language an item's answer is written in. */
function languageOf(item: ExamItem): "et" | "en" {
  switch (item.kind) {
    case "government":
    case "gloss-choice":
    case "message":
    case "compose":
    case "speak": return "en";
    default: return "et";
  }
}

function expectedOf(item: ExamItem): string {
  switch (item.kind) {
    case "match-usage": return item.lemma;
    case "gap-choice":
    case "listen-choose":
    case "dictation":
    case "case-form":
    case "order":
    case "gloss-choice":
    case "form-choice": return item.answer;
    case "government": return item.options.find((o) => o.key === item.answer)?.en ?? item.answer;
    case "message":
    case "compose": return `${item.minWords} words`;
    case "speak": return "a recording";
  }
}

// ── The paper as a whole ─────────────────────────────────────────────────────

export interface TaskResult {
  taskId: string;
  title: string;
  marks: ItemMark[];
  raw: number;
  rawAvailable: number;
  shortfall: number;
}

export interface PartResult {
  skill: SkillKey;
  label: string;
  tasks: TaskResult[];
  raw: number;
  rawAvailable: number;
  /** Weighted to the points the real paper gives this part. */
  points: number;
  maxPoints: number;
  pct: number;
}

export interface ExamResult {
  level: ExamLevel;
  parts: PartResult[];
  points: number;
  maxPoints: number;
  /** Rounded down, because 59.6 percent is not a pass. */
  pct: number;
  passed: boolean;
  band: Band;
  /** Set when a part scored nothing, which fails the paper on its own. */
  zeroPart: SkillKey | null;
  /**
   * Parts the dictionary could not set a single question for.
   *
   * They are left out of the total rather than scored as zero, and the result
   * says which. Scoring an unset part as zero would fail every thin paper on a
   * fault of the dictionary rather than of the candidate, and it would trip the
   * zero-part rule as well, which is the one clause that is supposed to mean
   * "you did not attempt this".
   *
   * The same trade the browser suites make with `absent(n, why)`: lower the
   * target by exactly what was not reachable, and print the reason, so a part
   * that stops being set still shows up instead of quietly passing.
   */
  absentParts: SkillKey[];
  /** True when a real result this low would mean waiting six months to resit. */
  waitBeforeResit: boolean;
  /** True when the dictionary could not fill the paper, so the score is of a shorter one. */
  thin: boolean;
}

function markTask(task: ExamTask, responses: ReadonlyMap<string, Response>): TaskResult {
  const perItem = task.spec.raw / task.spec.items;
  const marks = task.items.map((item) =>
    markItem(item, responses.get(item.id) ?? BLANK_RESPONSE, perItem, task.choices));
  return {
    taskId: task.spec.id,
    title: task.spec.title,
    marks,
    raw: marks.reduce((sum, m) => sum + m.scored, 0),
    // Off the marks rather than off the specification, so an item whose audio
    // never played lowers what the task is marked out of instead of failing it.
    rawAvailable: marks.reduce((sum, m) => sum + m.available, 0),
    shortfall: task.shortfall,
  };
}

/**
 * Marks a whole paper.
 *
 * The pass rule is the real one and both halves of it matter: sixty percent of
 * the total, **and** not a zero anywhere. Somebody who scores full marks on
 * three parts and never records a word of the fourth has not passed, and a mock
 * that told them otherwise would be worse than no mock at all.
 */
export function markPaper(paper: Paper, responses: ReadonlyMap<string, Response>): ExamResult {
  const parts: PartResult[] = paper.parts.map((part) => {
    const tasks = part.tasks.map((task) => markTask(task, responses));
    const raw = tasks.reduce((sum, t) => sum + t.raw, 0);
    const rawAvailable = tasks.reduce((sum, t) => sum + t.rawAvailable, 0);
    const share = rawAvailable === 0 ? 0 : raw / rawAvailable;
    return {
      skill: part.spec.skill,
      label: part.spec.label,
      tasks,
      raw: Math.round(raw * 10) / 10,
      rawAvailable,
      points: Math.round(share * part.spec.points * 10) / 10,
      maxPoints: part.spec.points,
      pct: Math.round(share * 100),
    };
  });

  const set = parts.filter((p) => p.rawAvailable > 0);
  const points = Math.round(set.reduce((sum, p) => sum + p.points, 0) * 10) / 10;
  const maxPoints = set.reduce((sum, p) => sum + p.maxPoints, 0);
  const pct = maxPoints === 0 ? 0 : Math.floor((points / maxPoints) * 100);
  const zero = set.find((p) => p.points === 0);

  return {
    level: paper.level,
    parts,
    points,
    maxPoints,
    pct,
    passed: pct >= PASS_PCT && !zero,
    band: bandFor(pct),
    zeroPart: zero?.skill ?? null,
    absentParts: parts.filter((p) => p.rawAvailable === 0).map((p) => p.skill),
    waitBeforeResit: pct < RETAKE_WAIT_PCT,
    thin: paper.thin,
  };
}

/** Every mark in the paper, flattened, for the report and the grade batch. */
export function allMarks(result: ExamResult): ItemMark[] {
  return result.parts.flatMap((p) => p.tasks.flatMap((t) => t.marks));
}

/**
 * The grades a submitted paper writes to the review log.
 *
 * ADR-016: every mode grades through `gradeCard`, so the scheduler sees what was
 * actually practised, and a mock exam is a mode. Only items built on a word the
 * learner already has a card for produce anything; a paper two levels above them
 * is mostly words they have never added, and inventing cards for those would
 * turn a curiosity into a hundred card backlog nobody asked for.
 *
 * A blank answer is not a lapse. Running out of time on the reading part says
 * nothing about whether a word is remembered, and a scheduler told otherwise
 * would spend the next fortnight drilling words the learner never saw.
 */
export function gradesFrom(result: ExamResult): { cardId: string; rating: 1 | 3 }[] {
  const out = new Map<string, 1 | 3>();
  for (const mark of allMarks(result)) {
    if (!mark.cardId) continue;
    if (mark.given.trim() === "" && !mark.correct) continue;
    const rating: 1 | 3 = mark.recalled ? 3 : 1;
    // A word asked about twice takes the worse of the two, which is the answer
    // a scheduler should act on.
    const existing = out.get(mark.cardId);
    out.set(mark.cardId, existing === 1 ? 1 : rating);
  }
  return [...out].map(([cardId, rating]) => ({ cardId, rating }));
}
