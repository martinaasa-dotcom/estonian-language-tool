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
 * Parses a stored government string.
 *
 * Returns null rather than guessing when no case name is present — a drill
 * question built on a failed parse would be a question with no right answer.
 */
export function parseGovernment(raw: string | null | undefined): Government | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;

  // The case name is always at the front, before the em dash.
  const [head = "", ...rest] = text.split("—");
  const headLower = head.toLowerCase();

  const match = BY_NAME.find((c) => headLower.includes(c.en));
  if (!match) return null;

  const body = rest.join("—").trim();
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
