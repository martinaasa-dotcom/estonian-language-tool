import { courseWords } from "@/lib/collections/syllabus";
import { CASES, caseByKey } from "@/lib/estonian/cases";
import { deriveCase } from "@/lib/estonian/derive";
import { parseGovernment } from "@/lib/estonian/government";
import { dictationWords } from "@/lib/estonian/dictation";
import { authoritativeForm } from "@/lib/estonian/writing";
import type { CaseKey } from "@/lib/estonian/types";
import {
  CASE_OPTIONS,
  caseNearness,
  caseOptionFor,
  differentMeaning,
  differentSentence,
  differentText,
  formNearness,
  glossNearness,
  glossOption,
  pickOptions,
  sentenceNearness,
  sentenceOption,
  shuffled,
  type GlossOption,
} from "./distractors";
import { BANDS, type Band, type ChoiceItem, type DictationItem, type Item, type SpeakItem, type WriteItem } from "./types";

/**
 * Turning the dictionary into a placement test.
 *
 * Every question here is assembled out of material the dictionary already
 * holds: a lemma, a stored gloss, a principal part, a case computed from the
 * genitive stem by the app's own derivation, an example sentence a
 * lexicographer recorded. Nothing is written, nothing is inflected, nothing is
 * translated. That is the only way a test can be trusted to mark an answer,
 * and it is the same rule the writing exercise is built on: the correctness of
 * a form is decided by string comparison against an authoritative source before
 * anything else happens.
 *
 * It also means the test degrades honestly. The built-in dictionary carries no
 * example sentences, so with no Ekilex key there are no dictation items and no
 * sentence-meaning items, and the sections that survive say how many questions
 * they managed to ask. A thinner test reported as thin is useful; a thin test
 * reported as a full one is a lie about somebody's Estonian.
 *
 * Pure. The caller reads the rows; this only shapes them.
 */

export interface WordRow {
  id: string;
  lemma: string;
  translation: string;
  pos: string;
  cefr: string | null;
  government: string | null;
  forms: readonly { formType: string; value: string; morphCode?: string | null }[];
  examples: readonly { et: string; en?: string | null }[];
}

/**
 * How hard a case is, independently of how hard its word is.
 *
 * A band is a claim about the whole question, so an A1 noun in the terminative
 * is not an A1 question. The three principal parts sit at A2 because they are
 * the unpredictable ones every beginner meets and nobody gets right by rule;
 * the six local cases are the regular payoff of learning the genitive; the last
 * four are the ones a B1 syllabus reaches and a beginner has never needed.
 */
const CASE_BAND: Partial<Record<CaseKey, Band>> = {
  GENITIVE: "A2", PARTITIVE: "A2",
  ILLATIVE: "A2", INESSIVE: "A2", ELATIVE: "A2",
  ALLATIVE: "A2", ADESSIVE: "A2", ABLATIVE: "A2",
  COMITATIVE: "A2",
  TRANSLATIVE: "B1", TERMINATIVE: "B1", ESSIVE: "B1", ABESSIVE: "B1",
};

/** Cases worth asking about: the ones a learner actually produces. */
const ASKABLE: readonly CaseKey[] = [
  "GENITIVE", "PARTITIVE", "ILLATIVE", "INESSIVE", "ELATIVE",
  "ALLATIVE", "ADESSIVE", "ABLATIVE", "TRANSLATIVE", "COMITATIVE",
];

export function bandOf(cefr: string | null | undefined): Band | null {
  return BANDS.includes(cefr as Band) ? (cefr as Band) : null;
}

/** The harder of two bands, which is what a question costs to answer. */
function raise(a: Band, b: Band | undefined): Band {
  if (!b) return a;
  return BANDS.indexOf(a) >= BANDS.indexOf(b) ? a : b;
}

/**
 * A deterministic shuffle.
 *
 * Seeded rather than `Math.random` so a test asserts on a fixed paper, and so
 * two learners handed the same dictionary on the same day do not sit an
 * identical test.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The course unit that introduces a word, which is the nearest thing this app
 * has to a topic.
 *
 * `lib/collections/syllabus/` is a course rather than a thesaurus, and for this
 * it is the better source of the two: a unit is a dozen words a teacher put in
 * one lesson because they turn up together, which makes them exactly the words
 * a learner has to be able to tell apart. Reading it adds nothing to the
 * dictionary and asks nothing of it. A word the course does not teach has no
 * theme and is ranked on everything else, which is most of what the signal is
 * worth anyway.
 */
const COURSE_UNIT = (() => {
  const byLemma = new Map<string, string>();
  for (const word of courseWords()) {
    const lemma = word.lemma.trim().toLowerCase();
    byLemma.set(`${lemma}|${word.pos}`, word.unitId);
    if (!byLemma.has(lemma)) byLemma.set(lemma, word.unitId);
  }
  return byLemma;
})();

/** A gloss with what a learner would otherwise eliminate it by. */
function glossFor(word: WordRow): GlossOption {
  const lemma = word.lemma.trim().toLowerCase();
  return glossOption({
    text: word.translation,
    pos: word.pos,
    band: bandOf(word.cefr),
    theme: COURSE_UNIT.get(`${lemma}|${word.pos}`) ?? COURSE_UNIT.get(lemma) ?? null,
  });
}

/** Every form of a word that the app can vouch for, for near-miss messages. */
function knownForms(word: WordRow): string[] {
  const out = new Set<string>(word.forms.map((f) => f.value));
  const gen = word.forms.find((f) => f.formType === "GEN_SG")?.value;
  for (const spec of CASES) {
    const value = deriveCase(gen, spec.key);
    if (value) out.add(value);
  }
  out.delete(word.lemma);
  return [...out];
}

function usableWords(words: readonly WordRow[]): WordRow[] {
  return words.filter((w) => w.lemma.trim() && w.translation.trim() && bandOf(w.cefr));
}

// ── Reading ──────────────────────────────────────────────────────────────────

/**
 * Reading is asked in four ways, because "can you read Estonian" is four
 * different questions and only the first is about vocabulary: knowing a word,
 * knowing which case an ending marks, knowing which form a case calls for, and
 * understanding a whole recorded sentence.
 */
export function readingItems(words: readonly WordRow[], rng: () => number): ChoiceItem[] {
  const pool = usableWords(words);
  const glosses = pool.map(glossFor);
  const out: ChoiceItem[] = [];

  for (const word of shuffled(pool, rng)) {
    const band = bandOf(word.cefr)!;
    const set = pickOptions({
      answer: glossFor(word), candidates: glosses, rng,
      distinct: differentMeaning, nearness: glossNearness,
    });
    if (!set) continue;
    out.push({
      id: `r-mean-${word.id}`,
      kind: "choice",
      skill: "reading",
      band,
      lemma: word.lemma,
      question: "What does this word mean?",
      et: word.lemma,
      heard: false,
      options: set.options,
      estonianOptions: false,
      answer: set.answer,
      source: "dictionary",
      because: `${word.lemma} is ${word.translation}.`,
    });
  }

  for (const word of shuffled(pool, rng)) {
    if (word.pos !== "NOUN" && word.pos !== "ADJECTIVE") continue;
    const forms = knownForms(word).map((text) => ({ text }));
    for (const caseKey of shuffled(ASKABLE, rng)) {
      const form = authoritativeForm(
        { lemma: word.lemma, translation: word.translation, pos: word.pos, forms: [...word.forms] },
        caseKey,
      );
      if (!form) continue;
      if (form.value.toLowerCase() === word.lemma.toLowerCase()) continue;
      const spec = caseByKey(caseKey)!;
      const set = pickOptions({
        answer: { text: form.value }, candidates: forms, rng,
        distinct: differentText, nearness: formNearness,
      });
      if (!set) continue;
      out.push({
        id: `r-case-${word.id}-${caseKey}`,
        kind: "choice",
        skill: "reading",
        band: raise(bandOf(word.cefr)!, CASE_BAND[caseKey]),
        lemma: word.lemma,
        question: `Which one is "${word.lemma}" (${word.translation}) in the ${spec.et}, the case that answers ${spec.question}?`,
        et: "",
        heard: false,
        options: set.options,
        estonianOptions: true,
        answer: set.answer,
        source: form.provenance === "ekilex" ? "ekilex" : "derived",
        because: `The ${spec.et}, the ${spec.en.toLowerCase()}, of ${word.lemma} is ${form.value}.`,
      });
      break;
    }
  }

  for (const word of shuffled(pool, rng)) {
    if (word.pos !== "NOUN" && word.pos !== "ADJECTIVE") continue;
    const gen = word.forms.find((f) => f.formType === "GEN_SG")?.value;
    if (!gen) continue;
    for (const caseKey of shuffled(ASKABLE, rng)) {
      const spec = caseByKey(caseKey)!;
      if (spec.principal) continue;
      const value = deriveCase(gen, caseKey);
      if (!value || value.toLowerCase() === word.lemma.toLowerCase()) continue;
      const set = pickOptions({
        answer: caseOptionFor(spec), candidates: CASE_OPTIONS, rng,
        distinct: differentText, nearness: caseNearness,
      });
      if (!set) continue;
      out.push({
        id: `r-ident-${word.id}-${caseKey}`,
        kind: "choice",
        skill: "reading",
        band: raise(bandOf(word.cefr)!, CASE_BAND[caseKey]),
        lemma: word.lemma,
        question: `"${value}" is a form of ${word.lemma} (${word.translation}). Which case is it?`,
        et: value,
        heard: false,
        options: set.options,
        estonianOptions: false,
        answer: set.answer,
        source: "derived",
        because: `The ending marks the ${spec.et}, the ${spec.en.toLowerCase()}, which answers ${spec.question}.`,
      });
      break;
    }
  }

  for (const word of shuffled(pool, rng)) {
    const government = parseGovernment(word.government);
    if (!government) continue;
    const govSpec = caseByKey(government.caseKey);
    if (!govSpec) continue;
    const set = pickOptions({
      answer: caseOptionFor(govSpec), candidates: CASE_OPTIONS, rng,
      distinct: differentText, nearness: caseNearness,
    });
    if (!set) continue;
    out.push({
      id: `r-gov-${word.id}`,
      kind: "choice",
      skill: "reading",
      band: raise(bandOf(word.cefr)!, "B1"),
      lemma: word.lemma,
      question: `Which case does the verb "${word.lemma}" (${word.translation}) demand of its object?`,
      et: "",
      heard: false,
      options: set.options,
      estonianOptions: false,
      answer: set.answer,
      source: "dictionary",
      because: government.example
        ? `${word.lemma} takes the ${government.caseEt}, the ${government.caseEn.toLowerCase()}: ${government.example}`
        : `${word.lemma} takes the ${government.caseEt}, the ${government.caseEn.toLowerCase()}.`,
    });
  }

  const translated = pool.flatMap((w) =>
    w.examples.filter((e) => e.en && e.en.trim()).map((e) => ({ word: w, et: e.et, en: e.en!.trim() })),
  );
  /*
    A sentence is never offered against another sentence about the same word.
    Two usages recorded under one headword are the likeliest pair in the whole
    dictionary to be two ways of saying one thing, and a distractor that is
    arguably right is worse than an easy one.
  */
  const sentenceOptions = translated.map((t) => ({ ...sentenceOption(t.en), from: t.word.id }));
  for (const sentence of shuffled(translated, rng)) {
    const set = pickOptions({
      answer: { ...sentenceOption(sentence.en), from: sentence.word.id },
      candidates: sentenceOptions.filter((o) => o.from !== sentence.word.id),
      rng, distinct: differentSentence, nearness: sentenceNearness,
    });
    if (!set) continue;
    out.push({
      id: `r-sent-${sentence.word.id}-${sentence.et.length}`,
      kind: "choice",
      skill: "reading",
      band: raise(bandOf(sentence.word.cefr)!, "B1"),
      lemma: sentence.word.lemma,
      question: "What does this sentence say?",
      et: sentence.et,
      heard: false,
      options: set.options,
      estonianOptions: false,
      answer: set.answer,
      source: "usage",
      because: `${sentence.et} means ${sentence.en}`,
    });
  }

  return out;
}

// ── Listening ────────────────────────────────────────────────────────────────

/** A sentence short enough to hold in your head, which is what dictation asks. */
export function dictatable(sentence: string): boolean {
  const count = dictationWords(sentence).length;
  return count >= 3 && count <= 9 && sentence.length <= 80;
}

export function listeningItems(words: readonly WordRow[], rng: () => number): (ChoiceItem | DictationItem)[] {
  const pool = usableWords(words);
  const glosses = pool.map(glossFor);
  const out: (ChoiceItem | DictationItem)[] = [];

  for (const word of shuffled(pool, rng)) {
    const set = pickOptions({
      answer: glossFor(word), candidates: glosses, rng,
      distinct: differentMeaning, nearness: glossNearness,
    });
    if (!set) continue;
    out.push({
      id: `l-word-${word.id}`,
      kind: "choice",
      skill: "listening",
      band: bandOf(word.cefr)!,
      lemma: word.lemma,
      question: "Listen, then pick what it means. The word is not written down.",
      et: word.lemma,
      heard: true,
      options: set.options,
      estonianOptions: false,
      answer: set.answer,
      source: "dictionary",
      because: `${word.lemma} is ${word.translation}.`,
    });
  }

  for (const word of shuffled(pool, rng)) {
    if (word.pos !== "NOUN" && word.pos !== "ADJECTIVE") continue;
    const gen = word.forms.find((f) => f.formType === "GEN_SG")?.value;
    if (!gen) continue;
    for (const caseKey of shuffled(ASKABLE, rng)) {
      const spec = caseByKey(caseKey)!;
      if (spec.principal) continue;
      const value = deriveCase(gen, caseKey);
      if (!value || value.toLowerCase() === word.lemma.toLowerCase()) continue;
      const set = pickOptions({
        answer: caseOptionFor(spec), candidates: CASE_OPTIONS, rng,
        distinct: differentText, nearness: caseNearness,
      });
      if (!set) continue;
      out.push({
        id: `l-case-${word.id}-${caseKey}`,
        kind: "choice",
        skill: "listening",
        band: raise(bandOf(word.cefr)!, CASE_BAND[caseKey]),
        lemma: word.lemma,
        question: `Listen to a form of ${word.lemma} (${word.translation}). Which case did you hear?`,
        et: value,
        heard: true,
        options: set.options,
        estonianOptions: false,
        answer: set.answer,
        source: "derived",
        because: `You heard ${value}, the ${spec.et}, which an English grammar calls the ${spec.en.toLowerCase()}.`,
      });
      break;
    }
  }

  for (const word of shuffled(pool, rng)) {
    const sentence = word.examples.find((e) => dictatable(e.et));
    if (!sentence) continue;
    out.push({
      id: `l-dict-${word.id}`,
      skill: "listening",
      band: raise(bandOf(word.cefr)!, "B1"),
      lemma: word.lemma,
      question: "Listen as often as you like, then write down what you heard.",
      et: sentence.et,
      source: "usage",
      kind: "dictation",
    });
  }

  return out;
}

// ── Writing ──────────────────────────────────────────────────────────────────

export function writingItems(words: readonly WordRow[], rng: () => number): WriteItem[] {
  const out: WriteItem[] = [];
  for (const word of shuffled(usableWords(words), rng)) {
    if (word.pos !== "NOUN" && word.pos !== "ADJECTIVE") continue;
    for (const caseKey of shuffled(ASKABLE, rng)) {
      const form = authoritativeForm(
        { lemma: word.lemma, translation: word.translation, pos: word.pos, forms: [...word.forms] },
        caseKey,
      );
      if (!form) continue;
      if (form.value.toLowerCase() === word.lemma.toLowerCase()) continue;
      const spec = caseByKey(caseKey)!;
      out.push({
        id: `w-${word.id}-${caseKey}`,
        skill: "writing",
        band: raise(bandOf(word.cefr)!, CASE_BAND[caseKey]),
        lemma: word.lemma,
        question: `Write one Estonian sentence using ${word.lemma} (${word.translation}) in the ${spec.et} (${spec.question}).`,
        translation: word.translation,
        caseKey,
        caseEn: spec.en,
        caseEt: spec.et,
        caseQuestion: spec.question,
        targetForm: form.value,
        otherForms: knownForms(word).filter((f) => f !== form.value),
        source: form.provenance === "ekilex" ? "ekilex" : "derived",
        kind: "write",
      });
      break;
    }
  }
  return out;
}

// ── Speaking ─────────────────────────────────────────────────────────────────

export function speakingItems(words: readonly WordRow[], rng: () => number): SpeakItem[] {
  const out: SpeakItem[] = [];
  for (const word of shuffled(usableWords(words), rng)) {
    const sentence = word.examples.find((e) => dictatable(e.et) && e.en);
    if (sentence) {
      out.push({
        id: `s-sent-${word.id}`,
        skill: "speaking",
        band: raise(bandOf(word.cefr)!, "B1"),
        lemma: word.lemma,
        question: "Say this out loud, then listen to both recordings and judge for yourself.",
        et: sentence.et,
        translation: sentence.en!.trim(),
        isSentence: true,
        source: "usage",
        kind: "speak",
      });
      continue;
    }
    out.push({
      id: `s-word-${word.id}`,
      skill: "speaking",
      band: bandOf(word.cefr)!,
      lemma: word.lemma,
      question: "Say this out loud, then listen to both recordings and judge for yourself.",
      et: word.lemma,
      translation: word.translation,
      isSentence: false,
      source: "dictionary",
      kind: "speak",
    });
  }
  return out;
}

// ── The paper ────────────────────────────────────────────────────────────────

/** How many questions each skill may ask, and how many at any one band. */
export const BLUEPRINT = {
  reading: { total: 8, perBand: 2 },
  listening: { total: 6, perBand: 2 },
  writing: { total: 3, perBand: 1 },
  speaking: { total: 2, perBand: 1 },
} as const;

/**
 * Picks the paper: bands in order, at most a couple of questions each, and no
 * word asked about twice.
 *
 * Ascending order is what makes the early stop in `session.ts` meaningful, and
 * it is also the kinder shape: a test that opens with C1 vocabulary tells a
 * beginner nothing except that they were right to be nervous.
 */
export function assemble(candidates: readonly Item[], limit: { total: number; perBand: number }): Item[] {
  const perBand = new Map<Band, number>();
  const usedLemmas = new Set<string>();
  const out: Item[] = [];

  for (const band of BANDS) {
    for (const item of candidates) {
      if (item.band !== band) continue;
      if (out.length >= limit.total) break;
      if ((perBand.get(band) ?? 0) >= limit.perBand) break;
      if (usedLemmas.has(item.lemma)) continue;
      usedLemmas.add(item.lemma);
      perBand.set(band, (perBand.get(band) ?? 0) + 1);
      out.push(item);
    }
  }
  return out;
}

export interface Paper {
  items: Item[];
  /** True when the dictionary could not fill a section, so it is not asked. */
  missing: string[];
}

/**
 * The whole test, in the order it is sat: reading, listening, writing, speaking.
 *
 * Kinds are interleaved inside a skill so that eight reading questions are not
 * eight of the same question, and each kind gets its turn at each band.
 */
export function buildPaper(words: readonly WordRow[], seed: number): Paper {
  const rng = mulberry32(seed);
  const reading = assemble(interleave(readingItems(words, rng)), BLUEPRINT.reading);
  const listening = assemble(interleave(listeningItems(words, rng)), BLUEPRINT.listening);
  const writing = assemble(writingItems(words, rng), BLUEPRINT.writing);
  const speaking = assemble(speakingItems(words, rng), BLUEPRINT.speaking);

  const missing: string[] = [];
  if (reading.length === 0) missing.push("reading");
  if (listening.length === 0) missing.push("listening");
  if (writing.length === 0) missing.push("writing");
  if (speaking.length === 0) missing.push("speaking");

  return { items: [...reading, ...listening, ...writing, ...speaking], missing };
}

/** Round-robins items by their id prefix, so one kind cannot fill a section. */
function interleave<T extends Item>(items: readonly T[]): T[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const kind = item.id.slice(0, item.id.indexOf("-", 2));
    const bucket = buckets.get(kind);
    if (bucket) bucket.push(item);
    else buckets.set(kind, [item]);
  }
  const lists = [...buckets.values()];
  const out: T[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) {
    for (const list of lists) {
      const item = list[i];
      if (item) out.push(item);
    }
  }
  return out;
}
