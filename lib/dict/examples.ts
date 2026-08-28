/**
 * Example sentences.
 *
 * `Lexeme.examples` is a JSON string column, which is the right shape for a
 * handful of sentences per word and the wrong shape to trust blindly — it is
 * written by the Ekilex mapper, by the learner's own edits and by restores of
 * old backups. Everything reading it comes through here, so a malformed or
 * outdated blob degrades to "no examples" instead of throwing on a page.
 *
 * The sentences themselves are attested Estonian recorded by lexicographers,
 * never generated (ADR-005). That is what makes the cloze and sentence-building
 * exercises possible at all: the app can rearrange and blank real sentences
 * because it never has to invent one.
 */

export type ExampleSource = "EKILEX" | "SEED" | "USER" | "AI";

export interface Example {
  /** The Estonian sentence, exactly as recorded. */
  et: string;
  /** An English translation, when one exists. Ekilex has none on a reader key. */
  en?: string | null;
  source: ExampleSource;
}

/** Sentences outside this range are unusable: a fragment, or a paragraph. */
const MIN_CHARS = 8;
const MAX_CHARS = 140;
const MAX_PER_WORD = 8;

export function parseExamples(json: string | null | undefined): Example[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isExample);
  } catch {
    return [];
  }
}

function isExample(value: unknown): value is Example {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.et === "string" && v.et.trim().length > 0;
}

export function serialiseExamples(examples: Example[]): string {
  return JSON.stringify(examples.map((e) => ({
    et: e.et.trim(),
    ...(e.en ? { en: e.en.trim() } : {}),
    source: e.source,
  })));
}

/**
 * Keeps the sentences worth showing a learner: not fragments, not paragraphs,
 * no duplicates, shortest first.
 *
 * Shortest first is deliberate — a first example that fits on one line is worth
 * more to a beginner than a subtler one that runs to three, and the cloze
 * generator takes the first sentence that works.
 */
export function usableExamples(examples: Example[]): Example[] {
  const seen = new Set<string>();
  const out: Example[] = [];

  for (const example of examples) {
    const et = example.et.trim().replace(/\s+/g, " ");
    const key = et.toLowerCase();
    if (et.length < MIN_CHARS || et.length > MAX_CHARS) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...example, et });
  }

  return out.sort((a, b) => a.et.length - b.et.length).slice(0, MAX_PER_WORD);
}

/**
 * Merges freshly fetched sentences into what is already stored.
 *
 * A translation the learner has typed, or one already resolved, survives a
 * refetch — the same rule the English gloss follows in lib/dict/lookup.ts.
 */
export function mergeExamples(existing: Example[], incoming: Example[]): Example[] {
  const byText = new Map(existing.map((e) => [e.et.trim().toLowerCase(), e]));
  for (const example of incoming) {
    const key = example.et.trim().toLowerCase();
    const held = byText.get(key);
    byText.set(key, held?.en ? { ...example, en: held.en } : example);
  }
  return usableExamples([...byText.values()]);
}

/**
 * The first sentence that contains a form as a whole word.
 *
 * Whole-word, not substring, and that is the entire point: `toa` sits inside
 * `toas`, so a substring match would happily present a sentence as an example
 * of a case it does not contain — teaching the opposite of the lesson. A
 * sentence with a translation wins, because a learner can check their reading
 * against it.
 */
export function sentenceContaining(examples: Example[], form: string): Example | null {
  const wanted = form.trim().toLocaleLowerCase("et");
  if (!wanted) return null;
  const matches = usableExamples(examples).filter((e) => sentenceWords(e.et).includes(wanted));
  return matches.find((e) => e.en) ?? matches[0] ?? null;
}

/**
 * A sentence split into lowercased words, with Estonian's own letters kept and
 * punctuation dropped. Hyphens stay inside a word: `üle-eestiline` is one word.
 */
export function sentenceWords(sentence: string): string[] {
  return sentence.toLocaleLowerCase("et").split(/[^\p{L}\p{M}-]+/u).filter(Boolean);
}
