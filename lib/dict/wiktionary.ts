/**
 * English glosses from Wiktionary.
 *
 * Ekilex is authoritative for Estonian morphology but, on a reader key, carries no
 * English — its `ing` dataset is not public. Wiktionary fills that gap: free, no
 * key, and good coverage of everyday and mid-level vocabulary.
 *
 * Its glosses are community-written, so they are stored with `provenance:
 * WIKTIONARY` and are always editable. That is the same honesty rule the AI path
 * follows: the learner can see where a word's English came from.
 *
 * Content is CC BY-SA 4.0, credited in the UI.
 */
const API = "https://en.wiktionary.org/w/api.php";
const UA = "Kodukeel/0.1 (personal Estonian learning tool)";

export interface WiktionaryGloss {
  /** A short translation suitable for a flashcard, e.g. "to depend". */
  short: string;
  /** Up to three senses, for the entry view. */
  senses: string[];
}

export async function fetchEnglishGloss(lemma: string): Promise<WiktionaryGloss | null> {
  const url =
    `${API}?action=parse&page=${encodeURIComponent(lemma)}` +
    `&prop=wikitext&format=json&formatversion=2`;

  let wikitext: string;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { parse?: { wikitext?: string } };
    wikitext = data.parse?.wikitext ?? "";
  } catch {
    return null;
  }

  const senses = extractEstonianSenses(wikitext);
  if (senses.length === 0) return null;
  return { short: senses[0]!, senses: senses.slice(0, 3) };
}

/** Pulls the numbered definitions out of the page's `==Estonian==` section. */
function extractEstonianSenses(wikitext: string): string[] {
  const section = /==\s*Estonian\s*==([\s\S]*?)(?:\n==[^=]|$)/.exec(wikitext);
  if (!section?.[1]) return [];

  const senses: string[] = [];
  for (const line of section[1].split("\n")) {
    if (!line.startsWith("# ")) continue;
    const cleaned = cleanWikitext(line.slice(2));
    if (cleaned && !senses.includes(cleaned)) senses.push(cleaned);
    if (senses.length >= 5) break;
  }
  return senses;
}

/**
 * Strips wiki markup down to plain text.
 *
 * Templates are removed innermost-first, because they nest — `{{lb|et|{{q|rare}}}}`
 * left a trailing `}}` when handled with a single non-greedy pass.
 */
function cleanWikitext(raw: string): string {
  let text = raw;

  let previous: string;
  do {
    previous = text;
    text = text.replace(/\{\{[^{}]*\}\}/g, "");
  } while (text !== previous);

  return text
    // [[target|shown]] and [[shown]]
    .replace(/\[\[(?:[^[\]|]*\|)?([^[\]]*)\]\]/g, "$1")
    .replace(/'{2,}/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s*\([^)]*\)\s*$/, "")   // trailing parenthetical qualifiers
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,;:]+|[\s,;:]+$/g, "")
    .trim();
}
