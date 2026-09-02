import { unitIntroducing } from "@/lib/collections/syllabus";
import { buildCloze, ESTONIAN_WORD, isBuildable, naturalSentence, sentenceTiles } from "@/lib/estonian/cloze";
import { buildOptions, maskExample, parseGovernment } from "@/lib/estonian/government";
import { caseByKey } from "@/lib/estonian/cases";
import { dictationWords } from "@/lib/estonian/dictation";
import { writingTasksFor } from "@/lib/estonian/writing";
import {
  blueprintFor, lengthsFor, specFor,
  type ExamLevel, type ExamSpec, type PartSpec, type TaskKind, type TaskSpec,
} from "./spec";
import {
  bandOf, differentMeaning, differentText, formNearness, glossNearness, glossOption,
  pickOptions, sentenceNearness, sentenceOption, type GlossOption, type Textual,
} from "@/lib/questions/distractors";
import type { SkillKey } from "./types";

/**
 * Assembling one paper.
 *
 * THE WHOLE MODULE EXISTS BECAUSE THE APP MAY NOT WRITE ESTONIAN (ADR-005).
 * A mock exam is the most tempting place in this codebase to break that rule:
 * a model would happily produce four reading passages and thirty questions in
 * a second, and roughly one form in every ten would be invented. So every
 * Estonian character in a finished paper came out of the dictionary, and this
 * module only ever hides, shuffles, or surrounds it. The same discipline
 * `lib/estonian/cloze.ts` already applies to a single exercise, applied to a
 * three hour paper.
 *
 * The consequence is that a paper is only as long as the dictionary can make
 * it, and the honest thing to do about that is say so. Every task reports a
 * `shortfall`: how many items it could not fill and why. The exam screen prints
 * it, and `../exam/score` marks the part out of what was actually asked rather
 * than out of what the specification wanted. A paper that quietly dropped six
 * questions would inflate every score built on it.
 *
 * DETERMINISTIC. A paper is a pure function of the level, the seed and the
 * pool, so a reload during a sitting rebuilds the same questions instead of
 * quietly handing the learner a fresh set halfway through the listening part.
 *
 * Pure: no React, no Prisma, no clock, no Math.random.
 */

export interface PoolExample {
  et: string;
  en?: string | null;
}

/** One dictionary word, with everything a task builder might need from it. */
export interface PoolWord {
  lexemeId: string;
  lemma: string;
  translation: string;
  pos: string;
  cefr: string | null;
  /**
   * Which of the two sets of local cases the word takes, and whether it
   * answers `kes?` or `mis?`.
   *
   * A narrowing of what this paper asks rather than a widening of it, which is
   * why it is here despite the rule about not changing a measurement in
   * passing: the case-form task was setting the sisseütlev of `hobune` and
   * marking `hobusesse` correct. See lib/estonian/caseQuestion.ts.
   */
  semanticTypes: string | null;
  /** Stored principal parts plus anything retrieved from Ekilex. */
  forms: { formType: string; value: string; morphCode: string | null; morphName: string | null }[];
  /** Attested sentences. Never generated. */
  examples: PoolExample[];
  /** The raw government string, when the entry carries one. */
  government: string | null;
  /**
   * The learner's own card for this word, when they have one.
   *
   * Carried so that submitting the paper can grade through the same action
   * every other mode grades through (ADR-016). A word the learner has no card
   * for still makes a perfectly good question; it simply tells the scheduler
   * nothing, because there is nothing of theirs to schedule.
   */
  cardId: string | null;
}

// ── The random number generator ──────────────────────────────────────────────

/**
 * A seeded generator, so a paper is reproducible.
 *
 * mulberry32, thirty lines shorter than pulling in a dependency and more than
 * good enough to shuffle a word list. The seed is hashed from a string so a
 * paper can be addressed by something a person can put in a URL.
 */
export function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The one shuffle not folded into `lib/random/shuffle.ts`, on purpose.
 *
 * The client never sends a mark, only a level, a seed and its answers, so the
 * server rebuilds the paper from that seed to mark it (ADR-022). A paper is a
 * long sitting: change how this draws and a candidate who started before a
 * deploy and handed in after it has their answers marked against a different
 * paper from the one they sat. That is the worst mark this app could produce,
 * on the feature where a wrong one matters most.
 *
 * So it stays where it is and keeps its own algorithm, and the invariant that
 * bans a hand-rolled shuffle names this function as its single exception.
 */
function shuffle<T>(items: readonly T[], random: () => number): T[] {
  return items
    .map((item) => ({ item, k: random() }))
    .sort((a, b) => a.k - b.k)
    .map(({ item }) => item);
}

// ── Items ────────────────────────────────────────────────────────────────────

interface BaseItem {
  id: string;
  /** The word this question was built from, so the report can link to it. */
  lexemeId: string;
  lemma: string;
  translation: string;
  /** The learner's card, when they have one. Grades reach the log through it. */
  cardId: string | null;
}

export interface MatchItem extends BaseItem {
  kind: "match-usage";
  /** The sentence, with every form of its own headword blanked out. */
  sentence: string;
  /** The choice id that is right: the lexeme's own id. */
  answer: string;
}

export interface GapChoiceItem extends BaseItem {
  kind: "gap-choice";
  sentence: string;
  full: string;
  answer: string;
  options: string[];
}

export interface OrderItem extends BaseItem {
  kind: "order";
  tiles: string[];
  answer: string;
}

export interface CaseFormItem extends BaseItem {
  kind: "case-form";
  caseKey: string;
  caseEn: string;
  caseEt: string;
  caseQuestion: string;
  answer: string;
  provenance: "ekilex" | "derived";
}

export interface GovernmentItem extends BaseItem {
  kind: "government";
  /** The example with its governed word hidden, when there is one. */
  cue: string | null;
  options: { key: string; en: string; et: string; question: string }[];
  answer: string;
}

export interface DictationItem extends BaseItem {
  kind: "dictation";
  /** The sentence or word, which is both the audio and the answer. */
  answer: string;
  words: number;
  unit: "sentence" | "word";
}

export interface ListenChooseItem extends BaseItem {
  kind: "listen-choose";
  answer: string;
  options: string[];
  /** Whether the recording is a sentence or a single word. Said on screen. */
  unit: "sentence" | "word";
}

export interface GlossChoiceItem extends BaseItem {
  kind: "gloss-choice";
  /** The Estonian word, as the dictionary holds it. */
  word: string;
  /** English meanings. Written by lexicographers and translators, not by this app. */
  options: string[];
  answer: string;
}

export interface FormChoiceItem extends BaseItem {
  kind: "form-choice";
  caseKey: string;
  caseEn: string;
  caseEt: string;
  caseQuestion: string;
  options: string[];
  answer: string;
  provenance: "ekilex" | "derived";
}

export interface ComposeItem extends BaseItem {
  kind: "compose";
  /** The topic, in English. The app teaches in English; only the answer is Estonian. */
  topic: string;
  prompt: string;
  /**
   * The two briefs the real paper offers, and the learner picks one.
   *
   * "Testitaval tuleb kirjutada kas a) jutt etteantud teemal või b) isiklik
   * kiri" is the B1 specification's own wording for the second writing task, so
   * a mock that hands over one brief and no choice is setting a different task.
   * Both are marked identically, because both are marked on length and on the
   * words the dictionary asked for; the choice changes what somebody writes, not
   * what it is worth, which is the only way this app can offer one honestly.
   */
  variants: { label: string; prompt: string }[];
  minWords: number;
  /** Words from the dictionary the text must use, with their glosses. */
  mustUse: MustUseWord[];
}

/**
 * A word a written task names, carrying the forms that mark it.
 *
 * `pos` and `forms` are not decoration. `usesRequiredWord` used to prefix-match
 * a truncated lemma, which credited `kirjutan` for `kiri` and `aeglane` for
 * `aeg`; what tells those apart is the word's own forms, so the paper carries
 * them and the marker and the screen read one set of forms. The speak task's idea card
 * keeps the lighter shape, because nothing marks it.
 */
export interface MustUseWord {
  lemma: string;
  translation: string;
  lexemeId: string;
  pos: string;
  forms: { formType: string; value: string }[];
}

export interface MessageItem extends BaseItem {
  kind: "message";
  /** The situation, in English. */
  scenario: string;
  prompt: string;
  /** The points the message has to cover, which the real task always lists. */
  cover: string[];
  minWords: number;
  mustUse: MustUseWord[];
}

export interface SpeakItem extends BaseItem {
  kind: "speak";
  topic: string;
  prompt: string;
  seconds: number;
  /** The idea card: words to reach for, from the dictionary. */
  ideas: { lemma: string; translation: string; lexemeId: string }[];
}

export type ExamItem =
  | MatchItem | GapChoiceItem | OrderItem | CaseFormItem | GovernmentItem
  | DictationItem | ListenChooseItem | MessageItem | ComposeItem | SpeakItem
  | GlossChoiceItem | FormChoiceItem;

export interface ExamTask {
  spec: TaskSpec;
  items: ExamItem[];
  /** Choices shared by every item of a matching task. */
  choices?: { id: string; label: string; gloss: string }[];
  /**
   * The shape this task was actually set as, when it is not the one the
   * specification asked for. Null when it is.
   */
  fallbackFrom: TaskKind | null;
  /** Marks the dictionary could not supply a question for. */
  shortfall: number;
  /** Why, in one line, when there is a shortfall. Null otherwise. */
  shortfallReason: string | null;
  /** Marks actually on offer: the spec's raw marks less the shortfall. */
  rawAvailable: number;
}

export interface ExamPart {
  spec: PartSpec;
  tasks: ExamTask[];
}

export interface Paper {
  level: ExamLevel;
  spec: ExamSpec;
  /** The string the paper was built from. Put it in a URL to get it back. */
  seed: string;
  parts: ExamPart[];
  /** True when at least one task could not be filled. */
  thin: boolean;
  /** True when at least one task was set in its fallback shape. */
  substituted: boolean;
}

// ── Choosing the material ────────────────────────────────────────────────────

const RANK: Record<string, number> = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4 };

/**
 * The topics the examination draws on, published with the specification.
 *
 * In English, because the app teaches in English and a prompt is not a text to
 * be understood, it is an instruction. The Estonian is what the learner writes
 * back.
 */
export const TOPICS: readonly string[] = [
  "yourself and your family",
  "where you live",
  "an ordinary day",
  "free time",
  "travel",
  "people you know",
  "health",
  "study and school",
  "shopping",
  "food and drink",
  "services you use",
  "places in your town",
  "languages",
  "the weather",
  "work",
] as const;

/**
 * The situations the short message task is set in.
 *
 * `teate koostamine` is the first task of the real writing part, and what makes
 * it that task rather than a short essay is that it has a job to do: the paper
 * gives a situation and lists the points the message must cover. Those lists are
 * here, in English, for the same reason `TOPICS` is: a prompt is an instruction
 * rather than a text to be understood, and the Estonian is what the learner
 * writes back (ADR-005).
 *
 * The functions named in the specification are what these were written against:
 * seletamine, kirjeldamine, ettepaneku tegemine, isikuandmete edastamine.
 * Explaining, describing, proposing something, passing on your own details.
 */
export const MESSAGES: readonly { scenario: string; cover: readonly string[] }[] = [
  {
    scenario: "a note to a neighbour who took in a parcel for you",
    cover: ["say who you are", "say what you are collecting", "say when you will come"],
  },
  {
    scenario: "an e-mail cancelling an appointment you cannot keep",
    cover: ["say which appointment", "give a reason", "propose another time"],
  },
  {
    scenario: "a message to a landlord about something broken in the flat",
    cover: ["say what is broken", "say since when", "ask what happens next"],
  },
  {
    scenario: "a note to a colleague who will cover your work tomorrow",
    cover: ["say why you are away", "say what needs doing", "say how to reach you"],
  },
  {
    scenario: "a message to a friend inviting them somewhere",
    cover: ["say where and when", "say why you are going", "ask them to answer"],
  },
  {
    scenario: "an e-mail to a course you want to join",
    cover: ["give your name and details", "say which course", "ask what it costs"],
  },
  {
    scenario: "a note to a shop about something you bought that is faulty",
    cover: ["say what you bought and when", "say what is wrong", "say what you want done"],
  },
  {
    scenario: "a message to a doctor's surgery asking for an appointment",
    cover: ["give your name", "say what is wrong", "say when you can come"],
  },
] as const;

/**
 * Words this level may be examined on.
 *
 * A level examines everything up to and including itself, which is how the real
 * paper works: a B2 candidate is not excused an A2 word. Sorted so the words at
 * the level itself come first, then the level below, and so on, and the
 * builders take from the front. An entry with no CEFR tag is admitted from B1
 * upwards, where the untagged part of the dictionary mostly sits.
 */
export function eligibleWords(pool: readonly PoolWord[], level: ExamLevel): PoolWord[] {
  const ceiling = RANK[level] ?? 2;
  const scored: { word: PoolWord; rank: number }[] = [];
  for (const word of pool) {
    const rank = word.cefr ? RANK[word.cefr] : undefined;
    if (rank === undefined) {
      if (ceiling >= RANK.B1!) scored.push({ word, rank: ceiling });
      continue;
    }
    if (rank <= ceiling) scored.push({ word, rank });
  }
  // Closest to the level first, so a C1 paper is not quietly made of A1 nouns.
  return scored.sort((a, b) => b.rank - a.rank).map(({ word }) => word);
}

/** Every spelling the dictionary vouches for, for this word. */
export function formsOf(word: PoolWord): string[] {
  return [...new Set([word.lemma, ...word.forms.map((f) => f.value)])].filter(Boolean);
}

/** A gloss with what a candidate could otherwise be eliminated by. */
function glossFor(word: PoolWord): GlossOption {
  return glossOption({
    text: word.translation,
    pos: word.pos,
    band: bandOf(word.cefr),
    theme: unitIntroducing(word.lemma, word.pos),
  });
}

/** A form, and whether it belongs to the word the question is about. */
interface FormOption extends Textual {
  readonly sibling: boolean;
}

/**
 * How near one form is to another, with a form of the same word always first.
 *
 * `lib/questions/distractors.ts` decides what near means and this adds the one
 * fact it cannot know: which word an option came off. A gap question claims to
 * be asking the learner to choose an *ending*, and it only is while all four
 * options stand on one stem, so a sibling outranks any stranger however close
 * the stranger's spelling happens to be. The bonus is larger than any score
 * that function can return, which is what makes that a rule rather than a
 * preference. Strangers are still ranked among themselves, because a task with
 * two siblings and two strangers is better off with the two nearest strangers.
 */
const SIBLING_FIRST = 100;

function stemFirst(candidate: FormOption, answer: FormOption): number {
  return formNearness(candidate, answer) + (candidate.sibling ? SIBLING_FIRST : 0);
}

export const BLANK = "____";

/**
 * Hides every form of one word in a sentence.
 *
 * Used by the matching task, where the sentence would otherwise name its own
 * answer. Longest match first, for the same reason `buildCloze` prefers it: a
 * word list for `tuba` holds `toa` and `toas`, and blanking the shorter inside
 * the longer leaves `____s`, which asks a question nobody can answer.
 */
export function maskForms(sentence: string, forms: readonly string[]): string {
  const wanted = new Set(forms.map((f) => f.trim().toLowerCase()).filter(Boolean));
  if (wanted.size === 0) return sentence;
  let out = "";
  let cursor = 0;
  for (const token of sentence.matchAll(ESTONIAN_WORD)) {
    const value = token[0];
    if (!wanted.has(value.toLowerCase())) continue;
    const start = token.index;
    out += sentence.slice(cursor, start) + BLANK;
    cursor = start + value.length;
  }
  return out + sentence.slice(cursor);
}

/** Sentences worth using, shortest first, with the word they came from. */
interface Sentence {
  word: PoolWord;
  text: string;
}

function sentencesFrom(words: readonly PoolWord[]): Sentence[] {
  const out: Sentence[] = [];
  for (const word of words) {
    /*
      The same guard the placement check applies, and for the same reason: a
      usage that trails off, offers two alternatives round a slash, or opens
      with its own headword before a comma is lexicography rather than a
      sentence, and a candidate asked to read one cannot answer it or argue
      with it. One definition in `lib/estonian/cloze.ts`, because two papers
      disagreeing about what counts as a sentence is two answers to one
      question.
    */
    const forms = new Set(formsOf(word).map((f) => f.toLowerCase()));
    const opener = word.pos === "VERB" ? undefined : (opening: string) => forms.has(opening.toLowerCase());
    for (const example of word.examples) {
      const text = example.et.trim().replace(/\s+/g, " ");
      if (text.length < 8 || text.length > 140) continue;
      if (!naturalSentence(text, opener)) continue;
      out.push({ word, text });
    }
  }
  return out;
}

// ── The builders, one per task shape ─────────────────────────────────────────

interface BuildContext {
  level: ExamLevel;
  words: PoolWord[];
  sentences: Sentence[];
  random: () => number;
  /** Words already used for a question, so one word does not carry the paper. */
  spent: Set<string>;
}

function base(word: PoolWord, id: string): BaseItem {
  return {
    id,
    lexemeId: word.lexemeId,
    lemma: word.lemma,
    translation: word.translation,
    cardId: word.cardId,
  };
}

/** Sentences whose word has not been used yet, in a shuffled order. */
function freshSentences(ctx: BuildContext): Sentence[] {
  return shuffle(ctx.sentences.filter((s) => !ctx.spent.has(s.word.lexemeId)), ctx.random);
}

function buildMatch(spec: TaskSpec, ctx: BuildContext): ExamTask {
  const items: MatchItem[] = [];
  const choices: { id: string; label: string; gloss: string }[] = [];
  for (const sentence of freshSentences(ctx)) {
    if (items.length >= spec.items) break;
    if (ctx.spent.has(sentence.word.lexemeId)) continue;
    const masked = maskForms(sentence.text, formsOf(sentence.word));
    // A sentence that never names its own word teaches nothing here: with the
    // headword absent there is no evidence to match on, only a guess.
    if (!masked.includes(BLANK)) continue;
    ctx.spent.add(sentence.word.lexemeId);
    items.push({
      ...base(sentence.word, `${spec.id}-${items.length}`),
      kind: "match-usage",
      sentence: masked,
      answer: sentence.word.lexemeId,
    });
    choices.push({
      id: sentence.word.lexemeId,
      label: sentence.word.lemma,
      gloss: sentence.word.translation,
    });
  }
  return finish(spec, items, shuffle(choices, ctx.random), "sentences that name their own word");
}

function buildGapChoice(spec: TaskSpec, ctx: BuildContext): ExamTask {
  const items: GapChoiceItem[] = [];
  for (const sentence of freshSentences(ctx)) {
    if (items.length >= spec.items) break;
    if (ctx.spent.has(sentence.word.lexemeId)) continue;

    const forms = formsOf(sentence.word);
    const cloze = buildCloze(sentence.text, forms);
    if (!cloze) continue;

    /*
      The distractors are other real forms of the same word first, and forms of
      other words only to top up. That is what turns this from a vocabulary
      question into a grammar one: the learner is choosing an ending, which is
      what the gapped text on the real paper is testing. Anything already
      standing in the sentence is excluded, or two options look right at once.
    */
    const inSentence = new Set(
      [...cloze.text.matchAll(ESTONIAN_WORD)].map((m) => m[0].toLowerCase()),
    );
    const answerLower = cloze.answer.toLowerCase();
    const siblings = forms.filter(
      (f) => f.toLowerCase() !== answerLower && !inSentence.has(f.toLowerCase()),
    );
    const own = new Set(siblings.map((f) => f.toLowerCase()));
    const strangers = ctx.words
      .filter((w) => w.lexemeId !== sentence.word.lexemeId && w.pos === sentence.word.pos)
      .flatMap(formsOf)
      .filter((f) => f.toLowerCase() !== answerLower && !inSentence.has(f.toLowerCase()));

    const candidates: FormOption[] = [...new Set([...siblings, ...strangers])]
      .map((text) => ({ text, sibling: own.has(text.toLowerCase()) }));
    const set = pickOptions({
      answer: { text: cloze.answer, sibling: true },
      candidates,
      rng: ctx.random,
      distinct: differentText,
      nearness: stemFirst,
    });
    if (!set) continue;

    ctx.spent.add(sentence.word.lexemeId);
    items.push({
      ...base(sentence.word, `${spec.id}-${items.length}`),
      kind: "gap-choice",
      sentence: cloze.text,
      full: cloze.full,
      answer: cloze.answer,
      options: set.options,
    });
  }
  return finish(spec, items, undefined, "sentences that repeat their own headword");
}

function buildOrder(spec: TaskSpec, ctx: BuildContext): ExamTask {
  const items: OrderItem[] = [];
  for (const sentence of freshSentences(ctx)) {
    if (items.length >= spec.items) break;
    if (ctx.spent.has(sentence.word.lexemeId)) continue;
    if (!isBuildable(sentence.text)) continue;
    const tiles = sentenceTiles(sentence.text);

    // Shuffled until the order actually differs. Four attempts, because a
    // three word sentence can land back on itself and an infinite loop in a
    // pure function is still an infinite loop.
    let scrambled = tiles;
    for (let attempt = 0; attempt < 4 && scrambled.join(" ") === tiles.join(" "); attempt++) {
      scrambled = shuffle(tiles, ctx.random);
    }
    if (scrambled.join(" ") === tiles.join(" ")) continue;

    ctx.spent.add(sentence.word.lexemeId);
    items.push({
      ...base(sentence.word, `${spec.id}-${items.length}`),
      kind: "order",
      tiles: scrambled,
      answer: sentence.text,
    });
  }
  return finish(spec, items, undefined, "sentences of four to twelve different words");
}

function buildCaseForm(spec: TaskSpec, ctx: BuildContext): ExamTask {
  const items: CaseFormItem[] = [];
  for (const word of shuffle(ctx.words, ctx.random)) {
    if (items.length >= spec.items) break;
    if (ctx.spent.has(word.lexemeId)) continue;
    const tasks = writingTasksFor(word);
    if (tasks.length === 0) continue;
    const task = tasks[Math.floor(ctx.random() * tasks.length)] ?? tasks[0]!;
    ctx.spent.add(word.lexemeId);
    items.push({
      ...base(word, `${spec.id}-${items.length}`),
      kind: "case-form",
      caseKey: task.caseKey,
      caseEn: task.caseEn,
      caseEt: task.caseEt,
      caseQuestion: task.caseQuestion,
      answer: task.targetForm,
      provenance: task.provenance,
    });
  }
  return finish(spec, items, undefined, "nouns with a genitive stem to build on");
}

function buildGovernment(spec: TaskSpec, ctx: BuildContext): ExamTask {
  const governed = ctx.words
    /*
      Verbs only. The task asks "which case does the verb take", and the
      dictionary records a government for 36 nouns and 12 adjectives too:
      `osa` genuinely takes the partitive and the elative, but asking about it
      as a verb is a question worded as a fact the entry does not support. The
      government drill at /review/government has always filtered this way and
      this builder never did.
    */
    .filter((word) => word.pos === "VERB")
    .map((word) => ({ word, government: parseGovernment(word.government) }))
    .filter((row): row is { word: PoolWord; government: NonNullable<ReturnType<typeof parseGovernment>> } =>
      row.government !== null);
  const casePool = governed.map((row) => row.government.caseKey);

  const items: GovernmentItem[] = [];
  for (const row of shuffle(governed, ctx.random)) {
    if (items.length >= spec.items) break;
    if (ctx.spent.has(row.word.lexemeId)) continue;
    // Null when the word governs so much that no honest distractor is left.
    // Dropped rather than padded, and reported as a shortfall like any other.
    const keys = buildOptions(row.government, casePool, 4, ctx.random);
    if (!keys) continue;
    ctx.spent.add(row.word.lexemeId);
    const options = keys.map((key) => {
      const named = caseByKey(key);
      return {
        key,
        en: named?.en ?? key,
        et: named?.et ?? key,
        question: named?.question ?? "",
      };
    });
    items.push({
      ...base(row.word, `${spec.id}-${items.length}`),
      kind: "government",
      cue: maskExample(row.government.example),
      options,
      answer: row.government.caseKey,
    });
  }
  return finish(spec, items, undefined, "verbs whose government the dictionary records");
}

function buildDictation(spec: TaskSpec, ctx: BuildContext): ExamTask {
  const items: DictationItem[] = [];
  for (const sentence of freshSentences(ctx)) {
    if (items.length >= spec.items) break;
    if (ctx.spent.has(sentence.word.lexemeId)) continue;
    const words = dictationWords(sentence.text).length;
    // Short enough to hold in your head after one hearing, long enough to be
    // more than a word. The same window the dictation mode uses.
    if (words < 3 || words > 9 || sentence.text.length > 80) continue;
    ctx.spent.add(sentence.word.lexemeId);
    items.push({
      ...base(sentence.word, `${spec.id}-${items.length}`),
      kind: "dictation",
      answer: sentence.text,
      words,
      unit: "sentence",
    });
  }

  /*
    A keyless install has no recorded sentences at all, and a listening part
    with nothing in it is not a listening part. A single word is still a
    listening test, and a harder one than it sounds in Estonian: hearing `toas`
    and writing `toa` is the exact failure this exercise exists to catch.
  */
  for (const word of shuffle(ctx.words, ctx.random)) {
    if (items.length >= spec.items) break;
    if (ctx.spent.has(word.lexemeId)) continue;
    const spoken = pickSpokenForm(word, ctx.random);
    if (!spoken) continue;
    ctx.spent.add(word.lexemeId);
    items.push({
      ...base(word, `${spec.id}-${items.length}`),
      kind: "dictation",
      answer: spoken,
      words: 1,
      unit: "word",
    });
  }

  return finish(spec, items, undefined, "sentences of three to nine words, or words to say");
}

/**
 * One form of a word worth playing aloud.
 *
 * An inflected form rather than the headword wherever there is one: the
 * headword is the spelling the learner has already seen most, and a case ending
 * is what a listening test is actually for.
 */
function pickSpokenForm(word: PoolWord, random: () => number): string | null {
  const forms = formsOf(word).filter((f) => f.length >= 3 && !/\s/.test(f));
  if (forms.length === 0) return null;
  const inflected = forms.filter((f) => f.toLowerCase() !== word.lemma.toLowerCase());
  const pool = inflected.length > 0 ? inflected : forms;
  return pool[Math.floor(random() * pool.length)] ?? pool[0] ?? null;
}

function buildListenChoose(spec: TaskSpec, ctx: BuildContext): ExamTask {
  const all = ctx.sentences.map((s) => s.text);
  const items: ListenChooseItem[] = [];
  for (const sentence of freshSentences(ctx)) {
    if (items.length >= spec.items) break;
    if (ctx.spent.has(sentence.word.lexemeId)) continue;
    if (sentence.text.length > 90) continue;

    /*
      A similar length is the floor rather than the rule: an option half the
      length of the answer is crossed out on the page before the recording has
      played. Inside that, the nearest are the ones sharing words with what was
      said, because those are the ones that have to be *heard* apart rather
      than picked out by the one word the learner recognised.

      Two sentences that say the same thing are still two different recordings,
      so this asks for a different *text* where the reading comprehension
      question asks for a different meaning: there, either option would be a
      right answer, and here the question is which one was played.
    */
    const candidates = all
      .filter((t) => t !== sentence.text && Math.abs(t.length - sentence.text.length) <= 25)
      .map(sentenceOption);
    const set = pickOptions({
      answer: sentenceOption(sentence.text),
      candidates,
      rng: ctx.random,
      distinct: differentText,
      nearness: sentenceNearness,
    });
    if (!set) continue;

    ctx.spent.add(sentence.word.lexemeId);
    items.push({
      ...base(sentence.word, `${spec.id}-${items.length}`),
      kind: "listen-choose",
      answer: sentence.text,
      options: set.options,
      unit: "sentence",
    });
  }

  // The same fallback the dictation makes, and for the same reason: without an
  // Ekilex key there are no recorded sentences to hide one among.
  const spokenPool = ctx.words
    .map((word) => pickSpokenForm(word, ctx.random))
    .filter((form): form is string => Boolean(form));
  for (const word of shuffle(ctx.words, ctx.random)) {
    if (items.length >= spec.items) break;
    if (ctx.spent.has(word.lexemeId)) continue;
    const spoken = pickSpokenForm(word, ctx.random);
    if (!spoken) continue;
    // Words that look, and so mostly sound, like the one being played. A
    // recording is only a listening question while the four spellings are
    // close enough that hearing is the only way to tell them apart.
    const set = pickOptions({
      answer: { text: spoken },
      candidates: spokenPool.map((text) => ({ text })),
      rng: ctx.random,
      distinct: differentText,
      nearness: formNearness,
    });
    if (!set) continue;
    ctx.spent.add(word.lexemeId);
    items.push({
      ...base(word, `${spec.id}-${items.length}`),
      kind: "listen-choose",
      answer: spoken,
      options: set.options,
      unit: "word",
    });
  }

  return finish(spec, items, undefined, "recordings with three near neighbours to hide among");
}

/**
 * An Estonian word and four English meanings. Needs no sentence and no key.
 *
 * The four are ranked rather than shuffled, and the three wrong ones are
 * checked against the right one first. This task used to do neither, so it
 * could offer a word's own synonym as a distractor and mark a candidate wrong
 * for choosing it, and it filled a B2 question with whatever came first out of
 * a deck that spans four levels.
 */
function buildGlossChoice(spec: TaskSpec, ctx: BuildContext): ExamTask {
  const seen = new Set<string>();
  const glosses: GlossOption[] = [];
  for (const word of ctx.words) {
    if (!word.translation || seen.has(word.translation)) continue;
    seen.add(word.translation);
    glosses.push(glossFor(word));
  }

  const items: GlossChoiceItem[] = [];
  for (const word of shuffle(ctx.words, ctx.random)) {
    if (items.length >= spec.items) break;
    if (ctx.spent.has(word.lexemeId) || !word.translation) continue;
    const set = pickOptions({
      answer: glossFor(word),
      candidates: glosses,
      rng: ctx.random,
      distinct: differentMeaning,
      nearness: glossNearness,
    });
    if (!set) continue;
    ctx.spent.add(word.lexemeId);
    items.push({
      ...base(word, `${spec.id}-${items.length}`),
      kind: "gloss-choice",
      word: word.lemma,
      answer: word.translation,
      options: set.options,
    });
  }
  return finish(spec, items, undefined, "words with three other meanings to hide among");
}

/**
 * A word, a case, and four real forms to choose between.
 *
 * The recognition half of the same question `case-form` asks by hand, and the
 * one the real paper's gapped text actually asks: the distractors are other
 * forms of the same word, so the ending is what is being chosen.
 */
function buildFormChoice(spec: TaskSpec, ctx: BuildContext): ExamTask {
  const items: FormChoiceItem[] = [];
  for (const word of shuffle(ctx.words, ctx.random)) {
    if (items.length >= spec.items) break;
    if (ctx.spent.has(word.lexemeId)) continue;
    const tasks = writingTasksFor(word);
    if (tasks.length < 2) continue;
    const task = tasks[Math.floor(ctx.random() * tasks.length)] ?? tasks[0]!;
    const siblings = [
      ...new Set(tasks.map((t) => t.targetForm).filter((f) => f !== task.targetForm)),
    ];
    const own = new Set(siblings.map((f) => f.toLowerCase()));
    const strangers = ctx.words
      .filter((w) => w.lexemeId !== word.lexemeId)
      .flatMap((w) => writingTasksFor(w).map((t) => t.targetForm));
    const candidates: FormOption[] = [...new Set([...siblings, ...strangers])]
      .filter((f) => f !== task.targetForm)
      .map((text) => ({ text, sibling: own.has(text.toLowerCase()) }));
    const set = pickOptions({
      answer: { text: task.targetForm, sibling: true },
      candidates,
      rng: ctx.random,
      distinct: differentText,
      nearness: stemFirst,
    });
    if (!set) continue;

    ctx.spent.add(word.lexemeId);
    items.push({
      ...base(word, `${spec.id}-${items.length}`),
      kind: "form-choice",
      caseKey: task.caseKey,
      caseEn: task.caseEn,
      caseEt: task.caseEt,
      caseQuestion: task.caseQuestion,
      answer: task.targetForm,
      options: set.options,
      provenance: task.provenance,
    });
  }
  return finish(spec, items, undefined, "words with more than one case form to tell apart");
}

/** A pool word as a written task carries it: the gloss to show, the forms to mark with. */
function requiredWord(word: PoolWord): MustUseWord {
  return {
    lemma: word.lemma,
    translation: word.translation,
    lexemeId: word.lexemeId,
    pos: word.pos,
    forms: word.forms.map((f) => ({ formType: f.formType, value: f.value })),
  };
}

function buildMessage(spec: TaskSpec, ctx: BuildContext, index: number): ExamTask {
  const { messageWords } = lengthsFor(ctx.level);
  const brief = MESSAGES[Math.floor(ctx.random() * MESSAGES.length)] ?? MESSAGES[0]!;
  // Two rather than the composition's four: this is a short message, and asking
  // for four given words inside twenty of your own is asking for a word list.
  const mustUse = shuffle(ctx.words, ctx.random)
    .filter((w) => !ctx.spent.has(w.lexemeId))
    .slice(0, 2)
    .map(requiredWord);
  for (const word of mustUse) ctx.spent.add(word.lexemeId);

  const anchor = ctx.words[0];
  const items: MessageItem[] = [{
    id: `${spec.id}-${index}`,
    lexemeId: anchor?.lexemeId ?? "",
    lemma: anchor?.lemma ?? "",
    translation: anchor?.translation ?? "",
    cardId: null,
    kind: "message",
    scenario: brief.scenario,
    prompt: `Write ${brief.scenario}. At least ${messageWords} words.`,
    cover: [...brief.cover],
    minWords: messageWords,
    mustUse,
  }];
  return finish(spec, items, undefined, "a situation, three points to cover and two words");
}

function buildCompose(spec: TaskSpec, ctx: BuildContext, index: number): ExamTask {
  const { composeWords } = lengthsFor(ctx.level);
  const topic = TOPICS[Math.floor(ctx.random() * TOPICS.length)] ?? TOPICS[0]!;
  const mustUse = shuffle(ctx.words, ctx.random)
    .filter((w) => !ctx.spent.has(w.lexemeId))
    .slice(0, 4)
    .map(requiredWord);

  const variants = [
    {
      label: "A story",
      prompt:
        `Write a story about ${topic}. Say what happened, why, and what you think about it. ` +
        `At least ${composeWords} words.`,
    },
    {
      label: "A personal letter",
      prompt:
        `Write a personal letter to somebody you know about ${topic}. Greet them, tell them ` +
        `what has been happening, ask them something, and sign off. At least ${composeWords} words.`,
    },
  ];

  const anchor = ctx.words[0];
  const items: ComposeItem[] = [{
    id: `${spec.id}-${index}`,
    lexemeId: anchor?.lexemeId ?? "",
    lemma: anchor?.lemma ?? "",
    translation: anchor?.translation ?? "",
    cardId: null,
    kind: "compose",
    topic,
    prompt: variants[0]!.prompt,
    variants,
    minWords: composeWords,
    mustUse,
  }];
  return finish(spec, items, undefined, "a topic, two briefs to choose between and four words");
}

function buildSpeak(spec: TaskSpec, ctx: BuildContext, index: number): ExamTask {
  const { speakSeconds } = lengthsFor(ctx.level);
  const topic = TOPICS[Math.floor(ctx.random() * TOPICS.length)] ?? TOPICS[0]!;
  const ideas = shuffle(ctx.words, ctx.random)
    .slice(0, 6)
    .map((w) => ({ lemma: w.lemma, translation: w.translation, lexemeId: w.lexemeId }));

  /*
    One item, marked out of the task's several marks by the learner themselves.
    ADR-018: there is no verified Estonian speech recogniser available here, so
    nothing scores a recording. The exam screen says that where it cannot be
    missed, because a self-marked part sitting silently inside a percentage
    would make the whole percentage a lie.
  */
  const items: SpeakItem[] = [{
    id: `${spec.id}-${index}`,
    lexemeId: "",
    lemma: "",
    translation: "",
    cardId: null,
    kind: "speak",
    topic,
    prompt:
      index === 0
        ? `Speak about ${topic} for ${speakSeconds} seconds. Describe, then give a reason.`
        : `Now take the other side of ${topic}. Disagree with what you just said, and explain why.`,
    seconds: speakSeconds,
    ideas,
  }];
  return finish(spec, items, undefined, "an idea card of six words");
}

/** Wraps whatever a builder managed to make, with the shortfall stated. */
function finish(
  spec: TaskSpec,
  items: ExamItem[],
  choices: { id: string; label: string; gloss: string }[] | undefined,
  needed: string,
  fallbackFrom: TaskKind | null = null,
): ExamTask {
  const shortfall = Math.max(0, spec.items - items.length);
  // The composition and the spoken tasks are one item carrying many marks, so a
  // missing item costs all of them; every other task is one mark per item.
  const perItem = spec.raw / spec.items;
  return {
    spec,
    items,
    choices,
    fallbackFrom,
    shortfall,
    shortfallReason: shortfall > 0
      ? `The dictionary could supply ${items.length} of ${spec.items}. This task needs ${needed}.`
      : null,
    rawAvailable: Math.round(items.length * perItem),
  };
}

// ── The paper ────────────────────────────────────────────────────────────────

/**
 * Builds one paper.
 *
 * Tasks are built in the order the parts are sat, and each one marks the words
 * it used as spent. That ordering matters: it means the reading part and the
 * writing part cannot ask about the same six nouns, which is what happens when
 * every builder helps itself to the front of the same sorted list.
 */
export function buildPaper(
  level: ExamLevel,
  pool: readonly PoolWord[],
  seed: string,
): Paper {
  const spec = specFor(level);
  const words = eligibleWords(pool, level);
  const random = rng(seedFrom(`${level}:${seed}`));
  const ctx: BuildContext = {
    level,
    words,
    sentences: sentencesFrom(words),
    random,
    spent: new Set<string>(),
  };

  const parts: ExamPart[] = spec.parts.map((partSpec) => ({
    spec: partSpec,
    tasks: partSpec.tasks.map((taskSpec, index) => buildTask(taskSpec, ctx, index)),
  }));

  return {
    level,
    spec,
    seed,
    parts,
    thin: parts.some((p) => p.tasks.some((t) => t.shortfall > 0)),
    substituted: parts.some((p) => p.tasks.some((t) => t.fallbackFrom !== null)),
  };
}

/**
 * One task, in the shape the specification asks for or in its fallback.
 *
 * The primary shape is tried first and kept if it produced anything at all: a
 * task half filled with the real shape is closer to the paper than a full one
 * built out of word cards. Only a shape the dictionary cannot set *at all*
 * falls back, and the substitution is recorded rather than hidden.
 */
function buildTask(taskSpec: TaskSpec, ctx: BuildContext, index: number): ExamTask {
  const primary = buildOne(taskSpec.kind, taskSpec, ctx, index);
  if (primary.items.length > 0 || !taskSpec.fallback) return primary;

  const substitute = buildOne(taskSpec.fallback, taskSpec, ctx, index);
  if (substitute.items.length === 0) return primary;
  return {
    ...substitute,
    spec: { ...taskSpec, ...blueprintFor(taskSpec.fallback), id: taskSpec.id, items: taskSpec.items, raw: taskSpec.raw },
    fallbackFrom: taskSpec.kind,
  };
}

function buildOne(kind: TaskKind, taskSpec: TaskSpec, ctx: BuildContext, index: number): ExamTask {
  switch (kind) {
    case "match-usage": return buildMatch(taskSpec, ctx);
    case "gap-choice": return buildGapChoice(taskSpec, ctx);
    case "gap-type": return buildGapChoice(taskSpec, ctx);
    case "order": return buildOrder(taskSpec, ctx);
    case "case-form": return buildCaseForm(taskSpec, ctx);
    case "government": return buildGovernment(taskSpec, ctx);
    case "dictation": return buildDictation(taskSpec, ctx);
    case "listen-choose": return buildListenChoose(taskSpec, ctx);
    case "message": return buildMessage(taskSpec, ctx, index);
    case "compose": return buildCompose(taskSpec, ctx, index);
    case "speak": return buildSpeak(taskSpec, ctx, index);
    case "gloss-choice": return buildGlossChoice(taskSpec, ctx);
    case "form-choice": return buildFormChoice(taskSpec, ctx);
  }
}

/** Every card the paper touches, so a submission can grade them in one batch. */
export function cardsInPaper(paper: Paper): string[] {
  const out = new Set<string>();
  for (const part of paper.parts) {
    for (const task of part.tasks) {
      for (const item of task.items) if (item.cardId) out.add(item.cardId);
    }
  }
  return [...out];
}

/** How much of the paper the dictionary could actually fill, as a percentage. */
export function fillRate(paper: Paper): number {
  let wanted = 0;
  let got = 0;
  for (const part of paper.parts) {
    for (const task of part.tasks) {
      wanted += task.spec.raw;
      got += task.rawAvailable;
    }
  }
  return wanted === 0 ? 0 : Math.round((got / wanted) * 100);
}

/** The parts of the paper, keyed, for a screen that renders one at a time. */
export function partOf(paper: Paper, skill: SkillKey): ExamPart | undefined {
  return paper.parts.find((p) => p.spec.skill === skill);
}
