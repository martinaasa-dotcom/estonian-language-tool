import { CASES } from "./cases";
import type { CaseKey } from "./types";

/**
 * Verb government (*rektsioon*) — which case a verb demands of its complement.
 *
 * This is the error English speakers never stop making, because there is nothing
 * in the English sentence to predict it from: *aitan sind* takes the partitive
 * where English says "help **to** you" is wrong, and *helistan sulle* takes the
 * allative where English "call you" suggests a direct object. No amount of
 * exposure fixes it; it has to be drilled per verb.
 *
 * The seed data records it as a single human-readable string,
 *   `"partitive — aitan sind (I help you), not 'to you'"`
 * which is right for display and useless for a drill. This turns it into
 * something answerable without a second source of truth: the case is parsed out,
 * the Estonian example is kept verbatim, and nothing is generated.
 */

export interface Government {
  /** The case the verb governs. */
  caseKey: CaseKey;
  caseEn: string;
  caseEt: string;
  /** The Estonian example, exactly as stored. Never synthesised. */
  example: string | null;
  /** The English gloss that followed the example in brackets. */
  gloss: string | null;
  /** True for verbs whose subject is the thing experienced (*mulle meeldib*). */
  experiencer: boolean;
  /** The original string, for display where the parse is not needed. */
  raw: string;
}

/** Lowercased English case names, longest first so "allative" cannot shadow nothing. */
const BY_NAME = CASES
  .map((c) => ({ key: c.key, en: c.en.toLowerCase(), et: c.et, label: c.en }))
  .sort((a, b) => b.en.length - a.en.length);

/**
 * Does this text name a case at all? Used only to decide whether the seed's
 * head is informative, or whether the whole string has to be read because the
 * entry came from Ekilex and names its cases in brackets further along.
 */
const EARLIEST_CASE_NAME = new RegExp(BY_NAME.map((c) => c.en).join("|"));

/**
 * The separator between the case name and the example in a stored government
 * string.
 *
 * Written with escapes so the reader-copy sweep cannot see a dash here and
 * rewrite it: this one is being read, not shown. All three spellings are
 * accepted because the dictionary is seeded data that outlives a deploy and a
 * hand-typed entry may carry any of them. The case name comes first, so the
 * first separator in the string is always the right one to cut at.
 */
const GOVERNMENT_SEPARATOR = /[\u2014\u2013-]/;

/**
 * Parses a stored government string.
 *
 * Returns null rather than guessing when no case name is present — a drill
 * question built on a failed parse would be a question with no right answer.
 */
export function parseGovernment(raw: string | null | undefined): Government | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;

  /*
    Two shapes reach here, and only one of them was designed.

    The seed writes the case name at the front, before a separator:
      "partitive - aitan sind (I help you)"

    Ekilex writes the question words it records, each annotated with the case
    they signal, most important first:
      "kellele (allative) - mida (partitive)"

    Reading the second with a rule written for the first picked whichever case
    came first in *the app's own list*, not in the entry: `aitama` survived
    that by luck, and a verb governing the allative was drilled as partitive.
    A drill that states the wrong rektsioon is worse than no drill, because
    the learner memorises it.

    So the case is whichever one is named earliest in the text. That is the
    front for the seed shape and the primary government for the Ekilex shape,
    which is the same answer both times without either format having to know
    about the other.
  */
  const cut = text.search(GOVERNMENT_SEPARATOR);
  const head = cut < 0 ? text : text.slice(0, cut);
  const headLower = head.toLowerCase();
  const searchIn = headLower.match(EARLIEST_CASE_NAME) ? headLower : text.toLowerCase();

  let match: (typeof BY_NAME)[number] | undefined;
  let at = Number.POSITIVE_INFINITY;
  for (const candidate of BY_NAME) {
    const where = searchIn.indexOf(candidate.en);
    // Ties go to BY_NAME's order, which is longest name first, so "ablative"
    // cannot be claimed by a shorter name sitting at the same index.
    if (where >= 0 && where < at) { at = where; match = candidate; }
  }
  if (!match) return null;

  const body = cut < 0 ? "" : text.slice(cut + 1).trim();
  // "aitan sind (I help you), not 'to you'" → example + gloss.
  const bracket = body.match(/^([^(]+)\(([^)]*)\)/);
  const example = bracket?.[1]?.trim() || (body ? body.split("(")[0]?.trim() ?? null : null);
  const gloss = bracket?.[2]?.trim() ?? null;

  return {
    caseKey: match.key,
    caseEn: match.label,
    caseEt: match.et,
    example: example || null,
    gloss: gloss || null,
    experiencer: headLower.includes("experiencer"),
    raw: text,
  };
}

/**
 * Builds the answer options for one question.
 *
 * The distractors are the cases *other verbs in the learner's own deck*
 * actually govern, not a random sample of the fourteen. Estonian government
 * clusters hard — partitive, allative, elative, comitative account for nearly
 * all of it — so options drawn from the real distribution make the question a
 * genuine discrimination rather than a giveaway.
 */
export function buildOptions(
  answer: CaseKey,
  pool: CaseKey[],
  count = 4,
  random: () => number = Math.random,
): CaseKey[] {
  const distractors = [...new Set(pool)].filter((c) => c !== answer);

  // Shuffle the distractors, take what is needed, then top up from the common
  // government cases if the deck is too small to supply enough.
  const shuffled = distractors
    .map((c) => ({ c, k: random() }))
    .sort((a, b) => a.k - b.k)
    .map(({ c }) => c);

  const FALLBACK: CaseKey[] = ["PARTITIVE", "ALLATIVE", "ELATIVE", "COMITATIVE", "ADESSIVE", "GENITIVE"];
  const chosen = [...shuffled];
  for (const c of FALLBACK) {
    if (chosen.length >= count - 1) break;
    if (c !== answer && !chosen.includes(c)) chosen.push(c);
  }

  return [answer, ...chosen.slice(0, count - 1)]
    .map((c) => ({ c, k: random() }))
    .sort((a, b) => a.k - b.k)
    .map(({ c }) => c);
}

/**
 * Blanks the governed word in the example so it can be shown as a cue without
 * giving the answer away. Falls back to hiding nothing rather than mangling a
 * sentence it cannot parse.
 */
export function maskExample(example: string | null): string | null {
  if (!example) return null;
  const words = example.trim().split(/\s+/);
  if (words.length < 2) return example;
  // The governed complement is the last word in every example in the seed set.
  return [...words.slice(0, -1), "…"].join(" ");
}
