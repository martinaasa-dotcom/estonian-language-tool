/**
 * Reading a photograph of a page, and refusing to trust what comes back.
 *
 * A learner points a camera at a textbook page, a vocabulary list on the
 * whiteboard or last night's homework, and the model transcribes what is
 * printed there. That is optical character recognition, not authorship: the
 * Estonian on the page was written by somebody who knows Estonian, and the
 * model's only job is to copy it out.
 *
 * WHY THIS FILE IS SO SUSPICIOUS OF ITS OWN INPUT. A misread is
 * indistinguishable downstream from an invention, and ADR-005 exists because
 * `gpt-4o-mini` once produced "Ma söön aitamat" when asked for an example.
 * Nothing here can tell a badly-lit `ö` from a hallucinated word, so nothing
 * here pretends to: every string that comes out of this module is a
 * *candidate*, it is checked against the dictionary by
 * `lib/dict/resolveScan.ts`, and a candidate the dictionary does not vouch
 * for reaches a flashcard only after a person has looked at it beside the
 * paper and ticked it.
 *
 * Pure on purpose (the same rule as lib/estonian/): no network, no database,
 * no framework, so the parsing of a hostile reply can be tested over fixtures
 * rather than against whatever a provider felt like sending today.
 */

/** One line as it appears on the page: an Estonian word, and its gloss if the page had one. */
export interface ScannedItem {
  /** The Estonian, copied from the page. Never anything the model composed. */
  et: string;
  /** The English printed beside it, or "" when the page carried none. */
  en: string;
}

/**
 * A page is a page, not a book. Sixty words is a generous vocabulary list and
 * far more than anyone reviews in a sitting; past that the reply is either a
 * mistake or a run-on, and neither is worth spending a screen on.
 */
export const MAX_ITEMS = 60;

/** Longest Estonian entry taken seriously. Liitsõnad are long; sentences are longer. */
export const MAX_ET_CHARS = 48;

/** Longest gloss kept. A translation, not a paragraph of notes. */
export const MAX_EN_CHARS = 90;

/**
 * What the model is asked to do, and the three things it is told not to.
 *
 * The instruction is a request rather than a guarantee, which is why the
 * checking happens after: this prompt makes good behaviour likely, and
 * `parseScanReply` plus the dictionary make bad behaviour harmless.
 */
export const SCAN_PROMPT = [
  "You are reading a photograph of a page from an Estonian course: a vocabulary list, a",
  "textbook exercise, a handout, or handwritten homework.",
  "",
  "Transcribe the Estonian vocabulary you can actually see. Copy each word exactly as it is",
  "printed, including every diacritic (õ ä ö ü š ž). If a word is blurred, cut off, or you are",
  "not certain what letter is there, leave it out entirely.",
  "",
  "Rules:",
  "1. Never invent an Estonian word, and never correct, complete or inflect one. Copy only.",
  "2. Never translate English into Estonian. If the page shows an English word with no Estonian",
  "   beside it, skip that line.",
  "3. Give the English only where the page itself prints it. Otherwise leave it empty.",
  "4. Skip page numbers, exercise numbers, headings, names and instructions in English.",
  "",
  'Answer with JSON only, in this shape: {"words":[{"et":"tuba","en":"room"}]}',
  "No prose, no code fence, no commentary.",
].join("\n");

/**
 * Letters an Estonian word can be spelled with, plus the punctuation that
 * legitimately turns up inside one.
 *
 * Written with escapes rather than the characters themselves for the hyphen,
 * because `lib/copy/readerCopy.test.ts` walks this tree and a literal dash in
 * a source file cannot be told apart from a dash used as punctuation in copy.
 * The hyphen is here because compounds are written with one (`eesti-inglise`),
 * and the apostrophe because a foreign name in an Estonian text keeps it.
 */
const ESTONIAN_WORD = /^[a-zõäöüšžA-ZÕÄÖÜŠŽ][a-zõäöüšžA-ZÕÄÖÜŠŽ0-9 .!?'-]*$/;

/** At least one letter, or "42" and "..." would both count as vocabulary. */
const HAS_LETTER = /[a-zõäöüšž]/i;

/**
 * Letters that are not Estonian and not English.
 *
 * A model that has drifted from transcription into generation tends to drift
 * into a language it knows better, and Cyrillic or CJK in the answer is the
 * cheapest possible signal that what came back is not what is on the page.
 */
const FOREIGN_SCRIPT = /[Ѐ-ӿ֐-ࣿ　-鿿가-힯]/;

interface RawItem {
  et?: unknown;
  en?: unknown;
}

/**
 * Pulls the JSON object out of whatever the model actually sent.
 *
 * Asking for "JSON only" gets JSON only most of the time. The rest of the time
 * it arrives inside a code fence, or after a sentence explaining that here is
 * the JSON. Both are recoverable and neither is worth failing a scan over, so
 * this looks for the first balanced object rather than insisting on a clean
 * reply.
 */
function extractJson(reply: string): unknown {
  const trimmed = reply.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  const body = fenced?.[1]?.trim() ?? trimmed;

  const direct = tryParse(body);
  if (direct !== undefined) return direct;

  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start >= 0 && end > start) return tryParse(body.slice(start, end + 1));
  return undefined;
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Collapses runs of whitespace and trims, so a line break inside a cell does not become a word. */
function tidy(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Whether a string is worth showing to the learner as something read off their page.
 *
 * Deliberately narrow. Everything this rejects is still on the paper in front
 * of them and can be typed in by hand, and a list padded with the model's
 * asides is a list nobody reads to the bottom of.
 */
export function looksTranscribed(value: string): boolean {
  if (!value || value.length > MAX_ET_CHARS) return false;
  if (!HAS_LETTER.test(value)) return false;
  if (FOREIGN_SCRIPT.test(value)) return false;
  return ESTONIAN_WORD.test(value);
}

/**
 * Turns one reply into candidates.
 *
 * Never throws: a scan that comes back as an apology, an empty object or a
 * wall of prose is an empty list, which the screen already has to handle
 * because a photograph of a coffee cup is also an empty list.
 */
export function parseScanReply(reply: string): ScannedItem[] {
  const parsed = extractJson(reply);
  if (!parsed || typeof parsed !== "object") return [];

  const container = parsed as { words?: unknown; items?: unknown };
  const rows = Array.isArray(container.words)
    ? container.words
    : Array.isArray(container.items)
      ? container.items
      : [];

  const out: ScannedItem[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const raw = row as RawItem;
    const et = tidy(typeof raw.et === "string" ? raw.et : "");
    if (!looksTranscribed(et)) continue;

    const key = et.toLocaleLowerCase("et");
    if (seen.has(key)) continue;
    seen.add(key);

    const enRaw = tidy(typeof raw.en === "string" ? raw.en : "");
    // A gloss in a script the page cannot have printed is dropped on its own,
    // rather than taking the Estonian word down with it: the word is still on
    // the page and the dictionary may well know its meaning already.
    const en = FOREIGN_SCRIPT.test(enRaw) ? "" : enRaw.slice(0, MAX_EN_CHARS);

    out.push({ et, en });
    if (out.length >= MAX_ITEMS) break;
  }

  return out;
}

/**
 * A first guess at the part of speech, for a word the dictionary has never
 * heard of.
 *
 * The same guess the paste importer makes, and it is a guess: `ma` is how
 * every Estonian infinitive is cited, so a word ending in one is almost
 * always a verb. Anything else is left as OTHER rather than assumed, because
 * a wrong POS is a wrong unique key in the dictionary and outlives the scan.
 */
export function guessPos(lemma: string): "VERB" | "PHRASE" | "OTHER" {
  const word = lemma.trim();
  if (/\s/.test(word)) return "PHRASE";
  return word.toLocaleLowerCase("et").endsWith("ma") ? "VERB" : "OTHER";
}
