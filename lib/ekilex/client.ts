/**
 * Ekilex API client. Server-side only — the key never reaches the browser.
 *
 * Ekilex is the Institute of the Estonian Language's lexicographic database, and
 * the authority for Estonian morphology. Everything it returns is stored with
 * `provenance: EKILEX`; nothing here is generated.
 *
 * Dictionary data is CC BY 4.0, so the UI credits it on every entry — attribution
 * is a condition of the license, not a courtesy.
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
  /**
   * The Institute's semantic type codes for the word's primary sense.
   *
   * `loom` for a horse, `in_elukutse` for a teacher, `koht_hoone` for a room.
   * Estonian chooses between two whole sets of local cases on this fact and
   * nothing in a word's spelling carries it, so without this the app drilled
   * `hobusesse` and `koeras`. See `lib/estonian/semantics.ts`, which is the
   * only place these are read, and `primarySemanticTypes` below for why the
   * primary sense alone.
   */
  semanticTypes: string[];
  /**
   * THE INSTITUTE'S OWN RUSSIAN AND UKRAINIAN, WHICH IS NOT A TRANSLATION THIS
   * APP MADE.
   *
   * Most people learning Estonian in Estonia already speak Russian or
   * Ukrainian, and telling them `kohv` is "coffee" asks them to go through a
   * third language to reach a word their own would have landed instantly.
   * Ekilex records the equivalents in `synonymLangGroups`, in the same
   * response the harvest already fetches and caches, written by the same
   * lexicographers who wrote the Estonian: 1,965 of the 1,975 entries in the
   * cache carry a Russian one and 1,755 a Ukrainian one.
   *
   * ADR-005 is untouched by this and is the reason it is worth having: no
   * model writes a character of it, exactly as with the forms and the
   * sentences. Nothing here is Estonian either, so the ban on writing Estonian
   * has nothing to say about it.
   */
  translations: { rus: string[]; ukr: string[] };
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

/**
 * The semantic type codes on the word's primary sense.
 *
 * THE PRIMARY SENSE, NOT THE UNION. Ekilex answers for the whole word, senses
 * and all, and a word's later senses wander far enough to be wrong about it:
 * `jõgi` carries `inimene` on a metaphor about a river of people and `pilv`
 * carries `loom_putukas`, so a union would have the app drilling a river as
 * though it were a person. Taking the source's own sense order is the same
 * rule the gloss pipeline follows over a Wiktionary page.
 *
 * ALL OF THAT SENSE'S CODES, THOUGH, because one meaning carries several and
 * the one that matters is not always first: `arst` is `esitus_tiitel` and
 * `in_elukutse`, and only the second says it is a person.
 *
 * `eki` alone, because the other datasets on a word id are etymology and term
 * bases which carry no semantic type at all, and letting one of those be the
 * first lexeme would decide the answer by which dataset happened to sort first.
 *
 * Exported because two scripts read the same field off their own cached copies
 * of this response, and a second reading of somebody else's JSON is where the
 * two stop agreeing.
 */
export function primarySemanticTypes(
  lexemes: readonly { datasetCode?: string; meaning?: { semanticTypes?: { code?: string }[] } }[]
    | undefined,
): string[] {
  for (const lexeme of lexemes ?? []) {
    if (lexeme.datasetCode !== "eki") continue;
    const codes = (lexeme.meaning?.semanticTypes ?? [])
      .map((s) => s.code)
      .filter((code): code is string => Boolean(code));
    // A sense the Institute has typed nothing on is not an answer, so the next
    // one is asked rather than the word being written down as unclassified.
    if (codes.length > 0) return [...new Set(codes)];
  }
  return [];
}

export async function fetchEkilexDetails(wordId: number): Promise<EkilexDetails | null> {
  const data = await call<RawDetails>(`/word/details/${wordId}`);
  if (!data?.word) return null;

  const definitions: string[] = [];
  const governments: string[] = [];
  const usages: string[] = [];
  const translations: { rus: string[]; ukr: string[] } = { rus: [], ukr: [] };
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
    /*
      The equivalents in the other languages of the country. `MEANING_WORD` is
      the synonym that *is* this meaning in that language; the other kinds are
      relations between meanings and are not what a learner wants on a card.
      `wordValue` is the plain spelling, where `wordValuePrese` carries
      Ekilex's own `<eki-stress>` markup for a rendering this app does not do.
    */
    for (const group of lexeme.synonymLangGroups ?? []) {
      const into = group.lang === "rus" ? translations.rus
        : group.lang === "ukr" ? translations.ukr
        : null;
      if (!into) continue;
      for (const synonym of group.synonyms ?? []) {
        if (synonym.type !== "MEANING_WORD") continue;
        for (const word of synonym.words ?? []) {
          const value = word.wordValue?.trim();
          if (value && !into.includes(value)) into.push(value);
        }
      }
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
    semanticTypes: primarySemanticTypes(data.lexemes),
    translations,
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
    datasetCode?: string;
    lexemeProficiencyLevelCode?: string | null;
    governments?: { value?: string }[];
    usages?: { value?: string; lang?: string; public?: boolean }[];
    meaning?: {
      definitions?: { value?: string; lang?: string }[];
      semanticTypes?: { code?: string }[];
    };
    synonymLangGroups?: {
      lang?: string;
      synonyms?: { type?: string; words?: { wordValue?: string }[] }[];
    }[];
  }[];
}
