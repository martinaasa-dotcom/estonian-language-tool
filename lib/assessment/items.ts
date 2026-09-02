import { CASES } from "@/lib/estonian/cases";
import { buildCloze, ESTONIAN_WORD, naturalSentence } from "@/lib/estonian/cloze";
import { caseAnswer, stemsFrom } from "@/lib/estonian/derive";
import { dictationWords } from "@/lib/estonian/dictation";
import { CASE_NOTES } from "@/lib/estonian/grammar";
import { formName } from "@/lib/estonian/morph";
import type { CaseKey } from "@/lib/estonian/types";
import { unitIntroducing } from "@/lib/collections/syllabus";
import { shuffle } from "@/lib/random/shuffle";
import {
  bandOf,
  differentMeaning,
  differentSentence,
  differentText,
  formNearness,
  glossNearness,
  glossOption,
  pickOptions,
  sentenceNearness,
  sentenceOption,
  type GlossOption,
} from "@/lib/questions/distractors";
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
 * Every spelling of a word the dictionary can vouch for.
 *
 * The stored principal parts, whatever paradigm Ekilex returned, and the ten
 * regular cases the app computes off the genitive stem. Nothing here is
 * generated in the sense ADR-005 forbids: a derivation is a deterministic rule
 * over a form already stored, wrong the same way for every word that takes the
 * ending, where a model is wrong about one word unpredictably.
 */
function vouchedForms(word: WordRow): string[] {
  const out = new Set<string>([word.lemma, ...word.forms.map((f) => f.value)]);
  /*
    Every spelling, not the first one: a word with two illatives has both, and
    this set is what stops a distractor being drawn that is secretly the answer.
  */
  const stems = stemsFrom(word.forms);
  for (const spec of CASES) {
    for (const value of caseAnswer(stems, spec.key)?.accepted ?? []) out.add(value);
  }
  return [...out].filter((f) => f.trim());
}

/** Forms a lexicographer actually wrote down, as opposed to computed ones. */
function attestedForms(word: WordRow): Set<string> {
  return new Set([word.lemma, ...word.forms.map((f) => f.value)].map((f) => f.toLowerCase()));
}

/** A gloss with what a learner would otherwise eliminate it by. */
function glossFor(word: WordRow): GlossOption {
  return glossOption({
    text: word.translation,
    pos: word.pos,
    band: bandOf(word.cefr),
    theme: unitIntroducing(word.lemma, word.pos),
  });
}

function usableWords(words: readonly WordRow[]): WordRow[] {
  return words.filter((w) => w.lemma.trim() && w.translation.trim() && bandOf(w.cefr));
}

/**
 * A word means everything the dictionary says it means, not just the line
 * printed as the answer.
 *
 * "What does kallis mean" offered `expensive`, `beautiful`, `fast` and
 * `morning`, and the learner who chose `beautiful` had a case: `kallis` is
 * also what you call somebody you are fond of, so with no sentence around it
 * the question is asking which of two real senses the dictionary happened to
 * print. Nothing in the ranking could see that, because `differentMeaning`
 * compares one gloss against another and a sense the gloss does not mention is
 * invisible to it.
 *
 * What *is* visible is a second entry under the same lemma, and `@@unique` is
 * on `(lemma, pos)` so the dictionary holds plenty: `hall` is a noun meaning
 * frost and an adjective meaning grey, and offering "grey" as a wrong answer
 * to "what does hall mean" marks somebody wrong for knowing the word. So every
 * gloss the dictionary files under this lemma is treated as an answer, and
 * none of them can stand as a distractor.
 *
 * It does not reach a sense that no entry records, which is the `kallis` case
 * itself: that one is a gloss worth correcting rather than a rule worth
 * writing, and `npm run audit:glosses` and the report queue are the two ways
 * that happens. What this rules out is the half a rule can see.
 */
function meaningTest(word: WordRow, pool: readonly WordRow[]): (a: string, b: string) => boolean {
  const senses = pool
    .filter((w) => w.lemma.toLowerCase() === word.lemma.toLowerCase() && w.id !== word.id)
    .map((w) => w.translation);
  if (senses.length === 0) return differentMeaning;
  return (a, b) => differentMeaning(a, b) && senses.every((sense) => differentMeaning(a, sense));
}

/**
 * The label pattern, as `naturalSentence` needs to be told about it.
 *
 * A usage that opens with its own headword and a comma is a dictionary
 * illustrating a sense rather than a sentence somebody said, and the sense is
 * often not the one the gloss beside it names: `Kahvel, lipp kukub!` is filed
 * under `kahvel` and is a call about a sailing gaff, not about a fork. Only a
 * nominal, because a verb before a comma is an ordinary main clause and
 * `Usun, et ta ei valeta` is a sentence worth reading.
 */
function nominalOpener(word: WordRow): ((opening: string) => boolean) | undefined {
  if (word.pos === "VERB") return undefined;
  const forms = attestedForms(word);
  return (opening: string) => forms.has(opening.toLowerCase());
}

// ── Gaps ─────────────────────────────────────────────────────────────────────

/**
 * A sentence worth putting a hole in.
 *
 * Long enough that the context can decide the answer and short enough to hold
 * in your head, which is the whole premise of the task: nobody is being asked
 * to remember an ending, they are being asked to read. Ekilex records phrase
 * fragments alongside whole sentences, and a gap in a fragment is a question
 * with nothing to answer it from.
 */
export function gappable(sentence: string, opensWithNominal?: (word: string) => boolean): boolean {
  const count = dictationWords(sentence).length;
  if (count < 3 || count > 12 || sentence.trim().length > 90) return false;
  return naturalSentence(sentence, opensWithNominal);
}

export interface Gap {
  /** The sentence with one word replaced by a blank. */
  text: string;
  /** The whole sentence, restored, which is the explanation afterwards. */
  full: string;
  /** The form that was taken out, spelled exactly as the sentence spelled it. */
  answer: string;
  /** Other forms of the same word, none of them standing in the sentence. */
  siblings: string[];
}

/**
 * Takes one word out of a sentence a lexicographer recorded.
 *
 * **This is what a placement test is actually made of.** The state examination
 * calls it `valikvastustega lünkülesanne` and sets ten of them in the B1
 * reading part; every Estonian school's own placement test is a page of them.
 * A sentence with a hole in it, and a few forms of one word to choose between.
 * What none of them do, anywhere, is ask a learner to name a case, which is
 * what this module used to spend half of its reading section on.
 *
 * Nothing is written and nothing is inflected: `buildCloze` hides a word that
 * a lexicographer put there, and the options are forms the dictionary already
 * vouches for. That is the same latitude the mock exam takes with the same
 * function, and the two call it rather than each keeping a copy.
 *
 * Two guards beyond the exam's, both learned from reading what came out.
 *
 * A blank at the very start of the sentence hands the answer over, because the
 * word standing there is capitalised and none of the distractors is: `____ eas
 * naine` offered `Viljakas`, `viljaka`, `viljakat` and `viljakate`, and the
 * capital letter answers it without a word of Estonian.
 *
 * And the answer has to be the only form that fits. Estonian syncretism means
 * two of a word's forms are often the same string, which `differentText`
 * already catches, but two *different* forms can both be grammatical in one
 * slot: an object is genitive or partitive depending on whether the action
 * finished. So a sibling that is the answer's partner in that pair is dropped
 * rather than offered. It costs a distractor and it is the one ambiguity this
 * shape can actually be rid of.
 */
export function gapFrom(word: WordRow): Gap | null {
  const forms = vouchedForms(word);
  const attested = attestedForms(word);
  const objectPair = new Set(
    // The genitive and the partitive, which is the pair an object is in.
    // A third entry here asked `deriveCase` for the genitive, which is a
    // principal part: it answered `undefined` every time it was ever called.
    [word.forms.find((f) => f.formType === "GEN_SG")?.value,
     word.forms.find((f) => f.formType === "PART_SG")?.value]
      .filter((f): f is string => !!f)
      .map((f) => f.toLowerCase()),
  );

  for (const example of word.examples) {
    const sentence = example.et.trim().replace(/\s+/g, " ");
    if (!gappable(sentence, nominalOpener(word))) continue;

    const cloze = buildCloze(sentence, forms);
    if (!cloze || cloze.index === 0) continue;

    const standing = new Set(
      [...cloze.text.matchAll(ESTONIAN_WORD)].map((m) => m[0].toLowerCase()),
    );
    const answer = cloze.answer.toLowerCase();
    const ambiguous = objectPair.has(answer);
    const siblings = forms.filter((f) => {
      const lower = f.toLowerCase();
      if (lower === answer || standing.has(lower)) return false;
      return !(ambiguous && objectPair.has(lower));
    });

    // Attested forms make better wrong answers than computed ones, so they are
    // offered alone wherever there are enough of them. The right answer is
    // always the word the sentence itself used, whichever way this falls.
    const written = siblings.filter((f) => attested.has(f.toLowerCase()));
    const pool = written.length >= 3 ? written : siblings;
    if (pool.length < 3) continue;

    return { text: cloze.text, full: cloze.full, answer: cloze.answer, siblings: pool };
  }
  return null;
}

/**
 * What to call the form that was taken out, and what that form is for.
 *
 * Read off the dictionary first, because a stored form knows its own slot, and
 * only then off the derivation, because a form the app computed is named by
 * the case that computed it. Returns null where neither can say, which is the
 * honest answer for a participle nobody stored, and is why the explanation
 * below is written to work without it.
 */
function nameForm(word: WordRow, value: string): FormName | null {
  const lower = value.toLowerCase();

  /*
    Estonian syncretism means one spelling is often two cases: `trammi` is both
    the omastav and the osastav, `tuba` is both the nimetav and the osastav,
    and `kaarti` is the osastav and the short sisseütlev. Naming whichever the
    dictionary happens to list first would state the wrong one about half the
    time, in the sentence the learner is being told is the explanation.

    So both are named and neither is claimed. The version before this returned
    null for the pair and the explanation read "a form of kaart", which is the
    least a sentence can say: a learner who wants to know why `kaarti` and not
    `kaardi` is told that `kaarti` is a form, which they could see. Two names
    and the sentence deciding between them is the honest answer and the useful
    one, and it is the thing a class says about these words anyway.
  */
  const claimed = new Set<CaseKey>();
  for (const form of word.forms) {
    if (form.value.toLowerCase() !== lower) continue;
    const key = CASE_BY_FORM_TYPE[form.formType];
    if (key) claimed.add(key);
  }
  const stems = stemsFrom(word.forms);
  for (const spec of CASES) {
    const answer = caseAnswer(stems, spec.key);
    if (answer?.accepted.some((f) => f.toLowerCase() === lower)) claimed.add(spec.key);
  }

  // A verb form is not a case and cannot be syncretic with one, so the stored
  // slot names it outright: `aidata` is the da-tegevusnimi and nothing else.
  const stored = word.forms.find((f) => f.value.toLowerCase() === lower);
  if (stored && !CASE_BY_FORM_TYPE[stored.formType] && claimed.size === 0) {
    const named = formName(stored);
    if (named) return { names: [named] };
  }

  const specs = CASES.filter((c) => claimed.has(c.key));
  if (specs.length === 0) return null;

  // The plural slots name a case the app has no plural derivation for, so the
  // stored name is the precise one where there is one: "mitmuse osastav". It
  // can only stand in for a single claim, since one stored form names one slot.
  const precise = specs.length === 1 && stored ? formName(stored) : null;
  const names = specs.map((spec) => ({
    et: precise?.et ?? spec.et,
    en: precise?.en ?? spec.en.toLowerCase(),
  }));
  return {
    names,
    // Only where the form is one case. Two summaries is the explanation
    // arguing with itself about which case the learner is looking at.
    ...(specs.length === 1
      ? { summary: CASE_NOTES.find((n) => n.key === specs[0]!.key)?.summary }
      : {}),
  };
}

/** What a form is called, and what that case is for where it is only one case. */
interface FormName {
  /** One name, or every name the spelling could be. Never a guess between them. */
  names: readonly { et: string; en: string }[];
  summary?: string;
}

/** "the nimetav (nominative)", or "the osastav (partitive) or the sisseütlev". */
function nameList(names: readonly { et: string; en: string }[]): string {
  const written = names.map((n) => `the ${n.et} (${n.en})`);
  const last = written.pop()!;
  return written.length === 0 ? last : `${written.join(", ")} or ${last}`;
}

/** The stored slots that are a case, so the case's own note can explain them. */
const CASE_BY_FORM_TYPE: Record<string, CaseKey | undefined> = {
  NOM_SG: "NOMINATIVE", GEN_SG: "GENITIVE", PART_SG: "PARTITIVE",
  NOM_PL: "NOMINATIVE", GEN_PL: "GENITIVE", PART_PL: "PARTITIVE",
  ILL_SG_SHORT: "ILLATIVE",
};

/**
 * Why that word and not one of the others.
 *
 * The sentence leads, because the sentence is the reason: put the word back
 * and a learner can see what the ending is doing. Then the form is named the
 * way a class names it, and `CASE_NOTES` says in one line what the case is
 * for and what the nearest English habit is. That table is the grammar
 * reference's own, so the explanation here and the page somebody opens next
 * cannot say two different things.
 *
 * **What it may not do is lead with the label.** The version this replaces
 * read "Here kõhn is in the nimetav, the nominative. The dictionary form. The
 * subject of a sentence, and what you point at.": three sentences of grammar
 * vocabulary at somebody who has just been told they were wrong, none of them
 * about the sentence in front of them. A learner reading feedback wants to
 * know what the gap was asking for, so the form comes first and its name comes
 * after it as the cross-reference it is. The Estonian name still leads the
 * English one, because that is the name a class and the state examination use
 * and an English label alone leaves a learner unable to follow their own
 * teacher.
 *
 * And it stops there. `CASE_NOTES` also carries an `englishHook` ("of the
 * book", "the book's cover") which was tried here and made the nominative read
 * "The dictionary form. The subject of a sentence, and what you point at.
 * Closest to plain English word order: the thing doing the verb.", which is
 * the same claim three times at somebody who wanted one line. The grammar
 * reference is where a learner goes for more, and the summary already says
 * what the case is for in the register a class uses.
 *
 * Where the form cannot be named the sentence stands alone, which is still an
 * answer.
 */
export function explainGap(word: WordRow, gap: Gap): string {
  const named = nameForm(word, gap.answer);
  const plain = gap.answer.toLowerCase() === word.lemma.toLowerCase();

  /*
    The gap is named before the case is, and it is named even when the case
    cannot be. Estonian syncretism means `kivi` is the nimetav, the omastav and
    the osastav all at once, and `nameForm` correctly refuses to pick one; the
    version this replaced returned the sentence on its own in that case, which
    on the writing screen printed the sentence twice and explained nothing.
    "The gap takes kivi exactly as the dictionary spells it" is short and is
    the useful half, and the label is added on top wherever there is one to
    add.
  */
  const where = named ? nameList(named.names) : null;
  const decides = named && named.names.length > 1 ? " The sentence decides which." : "";
  const takes = plain
    ? where
      ? `The gap takes ${word.lemma} unchanged, in ${where}.`
      : `The gap takes ${word.lemma} unchanged.`
    : where
      ? `The gap takes ${gap.answer}, which is ${word.lemma} in ${where}.`
      : `The gap takes ${gap.answer}, a form of ${word.lemma}.`;

  return [gap.full, takes + decides, named?.summary].filter(Boolean).join(" ");
}

// ── Reading ──────────────────────────────────────────────────────────────────

/**
 * Reading is asked in three ways, and all three are shapes a real test sets.
 *
 * Knowing a word, choosing the form a sentence needs, and understanding a
 * whole recorded sentence. The state examination's published reading tasks are
 * `valikvastustega ülesanne`, `valikvastustega lünkülesanne` and `sobitamine`;
 * the placement tests Estonian language schools set are almost entirely the
 * middle one. None of them asks what a case is called.
 *
 * This module used to. Half of every reading section was metalanguage: which
 * case is this ending, which form does this case call for, which case does
 * this verb govern. Three faults came with it, and the third is the one that
 * matters. The questions named the grammar rather than using it, which is not
 * how anybody is taught or examined. They were worded as facts the dictionary
 * could not support, asking "which case does the verb demand of its object"
 * about 45 entries that are nouns and adjectives, and about verbs like
 * `kõlbama` that take no object at all. And 18 of them offered a second
 * genuinely correct case as a wrong answer, because a word's government string
 * names every case it governs and the distractor pool drew from all of them:
 * `segama` governs the partitive and the comitative, and a learner who knew
 * the comitative was marked wrong for it. A placement test that marks somebody
 * wrong for being right is the one thing this file's own comment says it may
 * never do.
 */
export function readingItems(words: readonly WordRow[], rng: () => number): ChoiceItem[] {
  const pool = usableWords(words);
  const glosses = pool.map(glossFor);
  const out: ChoiceItem[] = [];

  for (const word of shuffle(pool, rng)) {
    const band = bandOf(word.cefr)!;
    const set = pickOptions({
      answer: glossFor(word), candidates: glosses, rng,
      distinct: meaningTest(word, pool), nearness: glossNearness,
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

  for (const word of shuffle(pool, rng)) {
    const gap = gapFrom(word);
    if (!gap) continue;
    const set = pickOptions({
      answer: { text: gap.answer }, candidates: gap.siblings.map((text) => ({ text })), rng,
      distinct: differentText, nearness: formNearness,
    });
    if (!set) continue;
    out.push({
      id: `r-gap-${word.id}`,
      kind: "choice",
      skill: "reading",
      /*
        Never A1. Choosing between four endings of a word asks for more than
        the word, so the easiest gap is still a step past the vocabulary
        question above it, and the first band stays what it should be: can you
        read this word at all.
      */
      band: raise(bandOf(word.cefr)!, "A2"),
      lemma: word.lemma,
      question: "Which one fits the gap?",
      et: gap.text,
      heard: false,
      options: set.options,
      estonianOptions: true,
      answer: set.answer,
      // The sentence is what is being read, and a lexicographer wrote it. Some
      // of the wrong answers may be computed from the genitive stem; the right
      // one is always the word that was standing in the sentence.
      source: "usage",
      because: explainGap(word, gap),
    });
  }

  const translated = pool.flatMap((w) => {
    const opener = nominalOpener(w);
    return w.examples
      .filter((e) => e.en && e.en.trim() && naturalSentence(e.et, opener))
      .map((e) => ({ word: w, et: e.et, en: e.en!.trim() }));
  });
  /*
    A sentence is never offered against another sentence about the same word.
    Two usages recorded under one headword are the likeliest pair in the whole
    dictionary to be two ways of saying one thing, and a distractor that is
    arguably right is worse than an easy one.
  */
  const sentenceOptions = translated.map((t) => ({ ...sentenceOption(t.en), from: t.word.id }));
  for (const sentence of shuffle(translated, rng)) {
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
export function dictatable(sentence: string, opensWithNominal?: (word: string) => boolean): boolean {
  const count = dictationWords(sentence).length;
  if (count < 3 || count > 9 || sentence.length > 80) return false;
  return naturalSentence(sentence, opensWithNominal);
}

/**
 * Listening is a word, a sentence and a dictation.
 *
 * The A2 and B1 listening papers are short spoken excerpts answered from two
 * to four verbal options, plus a task with information to write down. So: hear
 * a word and pick its meaning, hear a sentence and pick the word that is in
 * it, and write down what you heard.
 *
 * The middle one replaces a question that asked which case the learner had
 * just heard, with the fourteen Estonian case names as options. Estonian
 * listening is genuinely hard, and it is hard because of consonant length and
 * word boundaries rather than because case names are difficult to recall.
 * Asking a beginner to identify `alaltütlev` from audio measured how much
 * grammatical vocabulary they had, in the section that is supposed to measure
 * whether they can follow somebody speaking.
 */
export function listeningItems(words: readonly WordRow[], rng: () => number): (ChoiceItem | DictationItem)[] {
  const pool = usableWords(words);
  const glosses = pool.map(glossFor);
  const out: (ChoiceItem | DictationItem)[] = [];

  for (const word of shuffle(pool, rng)) {
    const set = pickOptions({
      answer: glossFor(word), candidates: glosses, rng,
      distinct: meaningTest(word, pool), nearness: glossNearness,
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

  for (const word of shuffle(pool, rng)) {
    const sentence = word.examples.find((e) => gappable(e.et, nominalOpener(word)));
    if (!sentence) continue;
    const set = pickOptions({
      answer: glossFor(word), candidates: glosses, rng,
      distinct: meaningTest(word, pool), nearness: glossNearness,
    });
    if (!set) continue;
    out.push({
      id: `l-use-${word.id}`,
      kind: "choice",
      skill: "listening",
      // A word at sentence speed is harder than the same word on its own, which
      // is most of what makes listening hard in the first place.
      band: raise(bandOf(word.cefr)!, "A2"),
      lemma: word.lemma,
      question: "Listen to the whole sentence, then pick the meaning of a word you heard in it.",
      et: sentence.et,
      heard: true,
      options: set.options,
      estonianOptions: false,
      answer: set.answer,
      source: "usage",
      because: `${sentence.et} That sentence is about ${word.lemma}, which is ${word.translation}.`,
    });
  }

  for (const word of shuffle(pool, rng)) {
    const sentence = word.examples.find((e) => dictatable(e.et, nominalOpener(word)));
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

/**
 * The same gap, typed rather than chosen.
 *
 * `lünkülesanne` is a task the real paper sets, and it is the only shape in
 * which this app can ask somebody to *produce* a form and still mark it with
 * certainty: the sentence decides which form it wants, and a lexicographer
 * already wrote down which one that is.
 *
 * What it replaces was "write one Estonian sentence using kolmandik (third) in
 * the seesütlev (milles? kus?)", marked on whether `kolmandikus` turned up
 * anywhere in the answer. Three things were wrong with it. It asked for a case
 * by name, so it measured whether somebody had memorised fourteen labels
 * before it measured any Estonian. It asked for forms nobody would ever write,
 * because every noun in the dictionary has a grammatical inessive and almost
 * nothing is ever said to be inside a third. And its feedback restated the
 * question: it answered "why this form" with "because the seesütlev answers
 * milles?", which is the same sentence the learner had just read.
 *
 * A gap answers all three at once. The case is never named in the question, it
 * is the sentence's job to imply it; the form asked for is one somebody
 * actually wrote; and the explanation is the sentence with the word put back.
 */
export function writingItems(words: readonly WordRow[], rng: () => number): WriteItem[] {
  const out: WriteItem[] = [];
  for (const word of shuffle(usableWords(words), rng)) {
    const gap = gapFrom(word);
    if (!gap) continue;
    out.push({
      id: `w-${word.id}`,
      skill: "writing",
      band: raise(bandOf(word.cefr)!, "A2"),
      lemma: word.lemma,
      // The word itself is not interpolated in here: it is Estonian, and the
      // screen prints it under the question with `lang="et"` on it, beside
      // what it means. A question string is metalanguage and stays English.
      question: "Put this word into the gap, in the form the sentence needs.",
      translation: word.translation,
      sentence: gap.text,
      full: gap.full,
      targetForm: gap.answer,
      otherForms: gap.siblings,
      because: explainGap(word, gap),
      source: "usage",
      kind: "write",
    });
  }
  return out;
}

// ── Speaking ─────────────────────────────────────────────────────────────────

export function speakingItems(words: readonly WordRow[], rng: () => number): SpeakItem[] {
  const out: SpeakItem[] = [];
  for (const word of shuffle(usableWords(words), rng)) {
    const sentence = word.examples.find((e) => dictatable(e.et, nominalOpener(word)) && e.en);
    if (sentence) {
      out.push({
        id: `s-sent-${word.id}`,
        skill: "speaking",
        band: raise(bandOf(word.cefr)!, "B1"),
        lemma: word.lemma,
        question: "Listen to this said properly, then say how confident you would be saying it.",
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
      question: "Listen to this said properly, then say how confident you would be saying it.",
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

/**
 * How many questions each skill may ask, and how many at any one band.
 *
 * **Eighty, and every number in it was measured rather than chosen.** The
 * shape came from a published CEFR placement test covering A1 to C1, which is
 * thirty five multiple choice at seven per level plus ten listening, ten
 * writing and five spoken. What it had instead was nineteen questions at two
 * per band per skill, and two four-option questions cannot decide anything:
 * one lucky guess moves a band from half to full, one slip moves it back.
 *
 * So `scripts/` was not the place for this and a simulation was. Learners at
 * each true level were sat against papers built from the shipped dictionary,
 * answering at the rates a learner actually answers, and the reported level
 * was compared with the one they were given. The old paper placed 43% of them
 * correctly and put 57% *below* where they were, which is exactly the
 * complaint this rewrite started from.
 *
 * Three things came out of the sweep and only one of them was the obvious one.
 *
 * **The threshold has to be reachable.** `PASS` is two thirds, so at two items
 * a band demands a perfect score and at four it demands three, which is
 * stricter than two thirds rather than looser. Multiples of three are the
 * sizes where two thirds is a score somebody can actually get, and 4 per band
 * measured *worse* than 3.
 *
 * **Writing was the bottleneck, not reading.** Its answers are typed rather
 * than chosen, so there is no floor under a band the way four options put one
 * under a reading band, and it is the noisiest of the three. At the same
 * eighty items, spending them on writing (6/3/6) placed 87% correctly where
 * spending them on listening (6/6/3) placed 83% and on reading (9/3/3) placed
 * 82%.
 *
 * **The overall level is the weakest of three skills (ADR-020), so noise in
 * any one of them lands on the result.** That is why raising reading alone was
 * not enough: 7/2/2 took the placement from 43% to 52% and left a genuine C1
 * being told A1 more often than C1.
 *
 * Measured on the shipped dictionary at 6/3/6, by true level: pre-A1 97%, A1
 * 98%, A2 93%, B1 85%, B2 80%, C1 72%. Before: 99%, 62%, 42%, 25%, 18%, 12%.
 *
 * The paper is four times longer and the sitting is not, because `session.ts`
 * stops a skill one band past the first band it was not passed at. A beginner
 * answers about fifteen questions, somebody at A2 about forty, and somebody at
 * C1 the lot, which is the paper each of them needed.
 */
export const BLUEPRINT = {
  reading: { total: 30, perBand: 6 },
  listening: { total: 15, perBand: 3 },
  writing: { total: 30, perBand: 6 },
  speaking: { total: 5, perBand: 1 },
} as const;

/**
 * The most questions a paper can hold, which is the blueprint added up.
 *
 * Derived rather than typed, because it is typed in one other place: the Zod
 * schema `recordAssessment` validates a finished sitting against. Those two
 * numbers were written independently and the moment the blueprint grew past
 * the schema's 60 every sitting was rejected on the way to being stored, with
 * the result still on screen and nothing in the history. That failure is
 * invisible from inside the check: the learner sees their level, presses on,
 * and the hub says nothing was ever measured.
 */
export const PAPER_SIZE = Object.values(BLUEPRINT).reduce((sum, s) => sum + s.total, 0);

/**
 * Picks the paper: bands in order, at most a couple of questions each, and no
 * word asked about twice.
 *
 * Ascending order is what makes the early stop in `session.ts` meaningful, and
 * it is also the kinder shape: a test that opens with C1 vocabulary tells a
 * beginner nothing except that they were right to be nervous.
 */
export function assemble(
  candidates: readonly Item[],
  limit: { total: number; perBand: number },
  /*
    Lemmas the paper has already asked about, shared across the four sections
    rather than reset for each. Each section used to keep its own, so one word
    could carry a reading question, a listening question and a written gap on
    the same paper, and with the gap questions that means the same recorded
    sentence three times over. Passing one set through makes a paper as wide as
    the dictionary allows.
  */
  usedLemmas: Set<string> = new Set(),
): Item[] {
  const perBand = new Map<Band, number>();
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
  const spent = new Set<string>();

  /*
    Each section takes words the sections before it did not, which is what
    stops one word carrying a reading question, a listening question and a
    written gap on the same paper. On a thin dictionary that can exhaust the
    pool before the last section is reached, and an empty writing section is a
    worse outcome than a word asked about twice, so a section that comes out
    with nothing is built again without the restriction. `missing` still
    reports a section the dictionary genuinely cannot fill.
  */
  const section = (candidates: Item[], limit: { total: number; perBand: number }) => {
    const first = assemble(candidates, limit, spent);
    return first.length > 0 ? first : assemble(candidates, limit);
  };

  const reading = section(interleave(readingItems(words, rng)), BLUEPRINT.reading);
  const listening = section(interleave(listeningItems(words, rng)), BLUEPRINT.listening);
  const writing = section(writingItems(words, rng), BLUEPRINT.writing);
  const speaking = section(speakingItems(words, rng), BLUEPRINT.speaking);

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
