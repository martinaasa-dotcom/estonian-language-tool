/**
 * The exam at the end of a level.
 *
 * A checkpoint is not another unit and deliberately not another lesson. It
 * teaches nothing, offers no options to pick between, and draws on the whole
 * level at once rather than one theme — because the question it answers is
 * whether a level is finished or merely visited, and recognition cannot answer
 * that. Four options give a quarter of the marks away to somebody who knows
 * nothing.
 *
 * So every question is production: either write the word from its English gloss,
 * or fill its form into a sentence a lexicographer recorded. Both are typed, and
 * both are graded by `lib/estonian/answer`, which tells a dropped diacritic from
 * a typo from a wrong word — so `soda` for `sõda` is called out by name rather
 * than being waved through or failed flat.
 *
 * Pure and framework-free, like the rest of lib/collections.
 */
import { buildCloze } from "@/lib/estonian/cloze";
import { deriveCase } from "@/lib/estonian/derive";
import { CASES } from "@/lib/estonian/cases";
import { shuffle } from "@/lib/random/shuffle";

export interface CheckpointWord {
  lemma: string;
  gloss: string;
  pos: string;
  examples: readonly string[];
  parts: Readonly<Record<string, string>>;
}

export interface CheckpointQuestion {
  id: string;
  kind: "type" | "gap";
  lemma: string;
  gloss: string;
  /** The sentence with a blank, for a gap question. Empty for a typed one. */
  sentence: string;
  /** The full sentence, revealed afterwards. */
  full: string;
  answer: string;
}

/**
 * Roughly this share of a checkpoint is gap-fill rather than bare production.
 *
 * Not all of it, because a word without an attested sentence would then be
 * untestable, and not none of it, because producing a lemma in isolation says
 * nothing about whether the learner can put it in a sentence.
 */
const GAP_SHARE = 0.4;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Every form of a word we hold or can derive, for finding it inside a sentence. */
function knownForms(word: CheckpointWord): string[] {
  const forms = new Set<string>([word.lemma, ...Object.values(word.parts)]);
  const genitive = word.parts.GEN_SG;
  if (genitive) {
    for (const spec of CASES) {
      if (spec.principal) continue;
      const derived = deriveCase(genitive, spec.key);
      if (derived) forms.add(derived);
    }
  }
  return [...forms].filter(Boolean);
}

/**
 * Builds a checkpoint.
 *
 * Returns fewer questions than asked for rather than repeating a word: a
 * twenty-question exam over a level with twelve usable words is twelve
 * questions, and saying so is better than asking about `ühiskond` twice and
 * calling it twenty.
 */
export function buildCheckpoint(
  words: readonly CheckpointWord[],
  count: number,
  seed = 1,
): CheckpointQuestion[] {
  const rand = rng(seed);
  const chosen = shuffle(words, rand).slice(0, count);
  const wantGaps = Math.round(chosen.length * GAP_SHARE);

  const questions: CheckpointQuestion[] = [];
  let gaps = 0;

  for (const [i, word] of chosen.entries()) {
    if (gaps < wantGaps) {
      const sentence = word.examples.find((s) => buildCloze(s, knownForms(word)));
      const cloze = sentence ? buildCloze(sentence, knownForms(word)) : null;
      if (cloze) {
        gaps += 1;
        questions.push({
          id: `q${i}`, kind: "gap", lemma: word.lemma, gloss: word.gloss,
          sentence: cloze.text, full: cloze.full, answer: cloze.answer,
        });
        continue;
      }
    }
    questions.push({
      id: `q${i}`, kind: "type", lemma: word.lemma, gloss: word.gloss,
      sentence: "", full: "", answer: word.lemma,
    });
  }

  return questions;
}

/** Whether a checkpoint was passed, as a whole-percent comparison. */
export function checkpointPassed(correct: number, total: number, passMark: number): boolean {
  if (total === 0) return false;
  return Math.round((correct / total) * 100) >= passMark;
}
