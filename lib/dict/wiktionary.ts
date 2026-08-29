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

/**
 * Pulls the numbered definitions out of the page's `==Estonian==` section.
 *
 * Exported because the seed builder fetches these pages itself: it has to tell
 * a page with no Estonian section from a request that was rate-limited, and
 * `fetchEnglishGloss` deliberately answers null to both. Reusing the parser
 * rather than writing a second one keeps the two paths reading the same
 * markup the same way.
 */
export function extractEstonianSenses(wikitext: string): string[] {
  const section = /==\s*Estonian\s*==([\s\S]*?)(?:\n==[^=]|$)/.exec(wikitext);
  if (!section?.[1]) return [];

  /*
    Sense order is the page's own, deliberately.

    Demoting the senses Wiktionary marks `rare`, `obsolete` or `dialectal` was
    tried and reverted. It corrected `kõrb`, whose everyday "desert" sits under
    a later etymology than a `rare` sense meaning a large uninhabited forest,
    and it broke more than it fixed: `soldat` is tagged `obsolete` on "soldier"
    and would have been drilled as "jack", `vats` is `dialectal` on "belly" and
    became "rumen", `raisk` is `dated` on "carrion" and landed on a vulgar
    usage note. Which sense a learner needs is a lexical judgement, and the
    labels do not carry it. Entries like `kõrb` are for a person to correct,
    which the dictionary is editable for.
  */
  const senses: string[] = [];
  for (const line of section[1].split("\n")) {
    if (!line.startsWith("# ")) continue;
    const raw = line.slice(2);
    if (NOT_A_DEFINITION.test(raw)) continue;
    const cleaned = cleanWikitext(raw);
    if (cleaned && !senses.includes(cleaned)) senses.push(cleaned);
    if (senses.length >= 5) break;
  }
  return senses;
}

/**
 * Sense lines Wiktionary marks as not being a definition yet.
 *
 * `{{rfdef}}` is an editor asking somebody to write the definition, and the
 * text beside it is a placeholder rather than a gloss. `müristama` shipped as
 * "to make a certain noise." from one of these, which is what a request for a
 * definition looks like once the request itself has been stripped out. The
 * word's real sense sat on the next line.
 */
const NOT_A_DEFINITION = /\{\{\s*rfdef\s*[|}]/i;

/**
 * Splits a template's parameters on `|`, leaving the pipes inside a wikilink
 * alone. `{{l|en|dressing#Noun|dressing}}` and `{{l|en|[[a|b]]}}` both have to
 * come apart in the right place.
 */
function templateParams(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2);
    if (two === "[[") { depth++; current += two; i++; continue; }
    if (two === "]]") { depth = Math.max(0, depth - 1); current += two; i++; continue; }
    const char = body[i]!;
    if (char === "|" && depth === 0) { parts.push(current); current = ""; continue; }
    current += char;
  }
  parts.push(current);
  return parts;
}

/**
 * Templates whose visible output *is* the gloss, unwrapped rather than removed.
 *
 * This is the fault that cost the most. `{{l|en|lamp}}` renders as the word
 * "lamp", and the sweep below deletes balanced templates wholesale, so the
 * line went empty and the picker moved on to the next one. That next line is
 * frequently a different sense, and on a page with more than one etymology it
 * is a different word: `lamp` shipped as "random", `oktoober` as "hard hat",
 * `ooper` as "opera house", `rida` as "many, much". Where the template sat
 * mid-line the gloss survived with a hole in it, which is worse, because
 * nothing about "to , to , to" (`segama`) looks like missing data to the
 * checks that were watching. `vana` reached a learner as "an person".
 *
 * The language matters and is checked. `{{m|et|kohta}}` is an Estonian word
 * quoted inside an English note, and unwrapping it would write Estonian into
 * a gloss, which is the one thing this file may never do (ADR-005). Only an
 * English-tagged link is unwrapped; anything else is removed as before.
 */
function unwrapLinkTemplates(text: string): string {
  return text.replace(/\{\{\s*([a-zA-Z-]+)\s*\|([^{}]*)\}\}/g, (whole, rawName: string, body: string) => {
    const name = rawName.trim().toLowerCase();
    const params = templateParams(body).filter((p) => !/^[a-zA-Z0-9_-]+\s*=/.test(p.trim()));

    // {{l|en|target|display}} and its aliases: second language-tagged form.
    if (name === "l" || name === "ll" || name === "link" || name === "m" || name === "mention") {
      if ((params[0] ?? "").trim().toLowerCase() !== "en") return whole;
      const shown = (params[2] ?? "").trim() || (params[1] ?? "").trim();
      return shown;
    }
    // {{tcl|et|October}}: the Estonian word's English translation, categorised.
    if (name === "tcl") return (params[1] ?? "").trim();
    // {{vern|common magpie}}: an English vernacular name.
    if (name === "vern") return (params[0] ?? "").trim();
    // {{w|Grammatical particle|particle}}: a Wikipedia link, shown as its
    // second parameter when it has one.
    if (name === "w") return ((params[1] ?? "").trim() || (params[0] ?? "").trim());
    return whole;
  });
}

/**
 * Strips wiki markup down to plain text.
 *
 * Templates are removed innermost-first, because they nest — `{{lb|et|{{q|rare}}}}`
 * left a trailing `}}` when handled with a single non-greedy pass.
 */
function cleanWikitext(raw: string): string {
  let text = raw;
  /*
    An unterminated template, which the balanced-pair sweep below cannot see.

    Wiktionary writes `{{gl|a short explanation}}` after a gloss, and where the
    closing braces are missing or fall outside the line the pair loop leaves
    the opening brace and everything after it. The seed builder shipped
    "dictaphone, dictation machine {{gl|a small portable device for recording"
    as a flashcard answer before this. Trimmed first, so what follows sees a
    line that only contains balanced markup.
  */
  text = text.replace(/\s*\{\{[^}]*$/, "").replace(/\s*\[\[[^\]]*$/, "");

  // Gloss-bearing templates first, innermost-first for the same reason.
  let unwrapped: string;
  do {
    unwrapped = text;
    text = unwrapLinkTemplates(text);
  } while (text !== unwrapped);

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
    /*
      The gap a removed template leaves behind.

      Everything above deletes markup in place, so a template sitting in the
      middle of a list takes its slot's contents and leaves the separators:
      `sort` shipped as "kind, , brand" and `esimees` as "chairman,
      chairperson, , president". A hole reads as a typo rather than as missing
      data, which is why neither was noticed. Repaired here rather than at each
      template, so a kind of markup nobody has met yet cannot open a new one.

      `{{taxfmt}}` is the reason this is a repair and not another unwrapping.
      Its contents are a scientific name, and putting it back turned "sprat"
      into "sprat, Sprattus sprattus". A binomial belongs in the entry, not on
      the answer side of a flashcard.
    */
    .replace(/\s*\(\s*\)/g, "")
    .replace(/\s+([,;.])/g, "$1")
    .replace(/([,;])(?:\s*[,;])+/g, "$1")
    .replace(/[,;]\s*\./g, ".")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,;:]+|[\s,;:]+$/g, "")
    .trim();
}
