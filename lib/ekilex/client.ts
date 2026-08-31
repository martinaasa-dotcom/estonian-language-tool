/**
 * Ekilex API client. Server-side only — the key never reaches the browser.
 *
 * Ekilex is the Institute of the Estonian Language's lexicographic database, and
 * the authority for Estonian morphology. Everything it returns is stored with
 * `provenance: EKILEX`; nothing here is generated.
 *
 * Dictionary data is CC BY 4.0, so the UI credits it on every entry — attribution
 * is a condition of the licence, not a courtesy.
 */
const BASE = "https://ekilex.ee/api";

/** Datasets worth reading: the unified EKI dictionary plus the morphology base. */
const DATASETS = "eki,mab";

export interface EkilexWordSummary {
  wordId: number;
  wordValue: string;
  homonymNr: number;
  lang: string;
}

export interface EkilexForm {
  value: string;
  morphCode: string;
  morphValue: string;
}

/**
 * One set of inflected forms for a word, as Ekilex groups them.
 *
 * A word can have more than one: a noun set and a verb set where the same
 * spelling is both. Ekilex's own JSON calls this group by a linguist's word,
 * which is the one place in this app that word survives, because renaming a
 * key we do not own would be renaming their data rather than ours.
 */
export interface EkilexFormSet {
  inflectionType: string | null;
  wordClass: string | null;
  forms: EkilexForm[];
}

export interface EkilexDetails {
  wordId: number;
  wordValue: string;
  formSets: EkilexFormSet[];
  /** Estonian explanatory definitions — Ekilex has no English glosses on this key. */
  definitions: string[];
  /** Question words encoding a verb's case government, e.g. "mida", "kellele". */
  governments: string[];
  /**
   * Real Estonian sentences using the word, as lexicographers recorded them —
   * "Jõin tassi kohvi." These are the only source of example sentences the app
   * has, and the reason it can offer cloze and sentence-building exercises at
   * all: every character is attested Estonian, not generated (ADR-005).
   */
  usages: string[];
  cefr: string | null;
}

export function ekilexConfigured(): boolean {
  return Boolean(process.env.EKILEX_API_KEY);
}

async function call<T>(path: string): Promise<T | null> {
  const key = process.env.EKILEX_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "ekilex-api-key": key },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    // A dictionary lookup failing must never take the page down; the caller
    // falls back to the local dictionary.
    return null;
  }
}

export async function searchEkilex(query: string): Promise<EkilexWordSummary[]> {
  const data = await call<{ words?: EkilexWordSummary[] }>(
    `/word/search/${encodeURIComponent(query)}/${DATASETS}`,
  );
  return (data?.words ?? []).filter((w) => w.lang === "est");
}

export async function fetchEkilexDetails(wordId: number): Promise<EkilexDetails | null> {
  const data = await call<RawDetails>(`/word/details/${wordId}`);
  if (!data?.word) return null;

  const definitions: string[] = [];
  const governments: string[] = [];
  const usages: string[] = [];
  let cefr: string | null = null;

  for (const lexeme of data.lexemes ?? []) {
    if (!cefr && lexeme.lexemeProficiencyLevelCode) cefr = lexeme.lexemeProficiencyLevelCode;
    for (const g of lexeme.governments ?? []) {
      if (g.value && !governments.includes(g.value)) governments.push(g.value);
    }
    for (const def of lexeme.meaning?.definitions ?? []) {
      if (def.lang === "est" && def.value && !definitions.includes(def.value)) {
        definitions.push(def.value);
      }
    }
    for (const u of lexeme.usages ?? []) {
      // `public` is Ekilex's own flag for what may be shown; a non-public usage
      // is editorial working material and is not ours to display.
      if (u.lang !== "est" || u.public === false) continue;
      const value = u.value?.trim();
      if (value && !usages.includes(value)) usages.push(value);
    }
  }

  return {
    wordId: data.word.wordId,
    wordValue: data.word.wordValue,
    formSets: (data.word.paradigms ?? []).map((p) => ({
      inflectionType: p.inflectionType ?? null,
      wordClass: p.wordClass ?? null,
      // Ekilex writes "-" for a form that does not exist for this word — the short
      // illative most often. That is a real absence, not a value.
      forms: (p.forms ?? [])
        .filter((f): f is { value: string; morphCode: string; morphValue: string } =>
          Boolean(f.value) && f.value !== "-")
        .map((f) => ({ value: f.value, morphCode: f.morphCode, morphValue: f.morphValue })),
    })),
    definitions,
    governments,
    usages,
    cefr,
  };
}

interface RawDetails {
  word?: {
    wordId: number;
    wordValue: string;
    paradigms?: {
      inflectionType?: string | null;
      wordClass?: string | null;
      forms?: { value?: string; morphCode: string; morphValue: string }[];
    }[];
  };
  lexemes?: {
    lexemeProficiencyLevelCode?: string | null;
    governments?: { value?: string }[];
    usages?: { value?: string; lang?: string; public?: boolean }[];
    meaning?: { definitions?: { value?: string; lang?: string }[] };
  }[];
}
