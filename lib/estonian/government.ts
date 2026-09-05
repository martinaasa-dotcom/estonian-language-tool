import { CASES, caseByKey } from "./cases";
import { caseNearness } from "@/lib/questions/distractors";
import { shuffle } from "@/lib/random/shuffle";
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
  /**
   * Every *other* case the entry names, in the order it names them.
   *
   * An Ekilex entry records the whole government of a word, not one case:
   * `aitama` is "keda/mida* (partitive) · millest (elative)" and takes both,
   * in different senses. `caseKey` is the primary, and these are the ones that
   * are also true. They travel beside it so that a drill cannot offer one as a
   * wrong answer, which is the whole reason this field exists: 58 of the 268
   * governed verbs in the shipped dictionary could be shown a second genuinely
   * correct case and marked wrong for choosing it.
   */
  alsoGoverned: readonly CaseKey[];
  /** The Estonian example, exactly as stored. Never synthesized. */
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
 * Every case a government string names, in the order it names them.
 *
 * A left-to-right scan that consumes the *longest* name matching at each
 * position, which is the only way to read these correctly: `adessive` contains
 * `essive` and `abessive` contains it too, so a plain substring search finds
 * cases the entry never mentioned. `hakkama` is "kelleks (translative) ·
 * kellel (adessive)", and a naive scan reads a third government out of it that
 * does not exist.
 *
 * The first entry is the primary government, which is what `parseGovernment`
 * has always returned: the front for the seed shape, and the first-listed for
 * the Ekilex shape, which writes them most important first. Finding all of
 * them here rather than in a second function is deliberate, because two scans
 * over one string are two answers waiting to disagree.
 */
function namedCases(text: string): (typeof BY_NAME)[number][] {
  const found: (typeof BY_NAME)[number][] = [];
  let i = 0;
  while (i < text.length) {
    const hit = BY_NAME.find((c) => text.startsWith(c.en, i));
    if (!hit) { i++; continue; }
    if (!found.some((f) => f.key === hit.key)) found.push(hit);
    i += hit.en.length;
  }
  return found;
}

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
    the learner memorizes it.

    So the case is whichever one is named earliest in the text. That is the
    front for the seed shape and the primary government for the Ekilex shape,
    which is the same answer both times without either format having to know
    about the other.
  */
  const cut = text.search(GOVERNMENT_SEPARATOR);
  const head = cut < 0 ? text : text.slice(0, cut);
  const headLower = head.toLowerCase();
  const searchIn = headLower.match(EARLIEST_CASE_NAME) ? headLower : text.toLowerCase();

  const named = namedCases(searchIn);
  const match = named[0];
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
    alsoGoverned: named.slice(1).map((c) => c.key),
    example: example || null,
    gloss: gloss || null,
    experiencer: headLower.includes("experiencer"),
    raw: text,
  };
}

/** Hardest to tell from the answer first. Ties keep the order they came in. */
function rankAgainst(keys: readonly CaseKey[], answer: CaseKey): CaseKey[] {
  const target = caseByKey(answer);
  if (!target) return [...keys];
  const score = (key: CaseKey) => {
    const spec = caseByKey(key);
    return spec ? caseNearness(spec, target) : 0;
  };
  return [...keys].sort((a, b) => score(b) - score(a));
}

/**
 * Builds the answer options for one question.
 *
 * The distractors are the cases *other verbs in the learner's own deck*
 * actually govern, not a random sample of the fourteen. Estonian government
 * clusters hard: partitive, allative, elative and comitative account for
 * nearly all of it, so options drawn from the real distribution make the
 * question a genuine discrimination rather than a giveaway.
 *
 * Which three of them get printed is `lib/questions/distractors.ts`, the one
 * table of what makes a wrong answer hard to cross out, shared with the mock
 * exam and the placement check. It puts the cases that answer the same
 * question word first, so osastav is offered against nimetav and omastav, the
 * two other cases an object is ever in, rather than against whichever three
 * the shuffle reached. The top-up list is ordered the same way instead of by
 * the frequency somebody typed it in.
 *
 * **It takes the parsed government rather than a case key, and that is the
 * other half of the fix.** The first version took the answer alone and
 * filtered only that out of the pool, so any *other* case the same word
 * governs could be offered as a wrong answer. Measured over the shipped
 * dictionary, 60 of the 268 governed verbs name more than one: `aitama` is
 * "keda/mida* (partitive) · millest (elative)" and takes both, so a learner
 * who knew `see ei aita millestki` picked the elative and was told they were
 * wrong. Passing the whole `Government` is what makes that unforgettable: the
 * type cannot be satisfied by a caller who has only the answer, so a fifth
 * drill cannot reintroduce the fault by not knowing about it.
 *
 * Returns null rather than padding when there are not enough honest
 * distractors, which is the standard `lib/assessment/items.ts` already holds
 * itself to. The caller drops the question.
 */
export function buildOptions(
  government: Pick<Government, "caseKey" | "alsoGoverned">,
  pool: readonly CaseKey[],
  count = 4,
  random: () => number = Math.random,
): CaseKey[] | null {
  const answer = government.caseKey;
  // Every case this word governs is true of it, so none of them is a wrong
  // answer. Only the primary is the answer; the rest are simply not offered.
  const alsoTrue = new Set<CaseKey>([answer, ...government.alsoGoverned]);

  const distractors = [...new Set(pool)].filter((c) => !alsoTrue.has(c));

  // Shuffled before it is ranked, so cases that are equally near come up in a
  // different order each time. Then top up from the common government cases if
  // the deck is too small to supply enough.
  const chosen = rankAgainst(shuffle(distractors, random), answer);

  for (const c of rankAgainst(FALLBACK, answer)) {
    if (chosen.length >= count - 1) break;
    if (!alsoTrue.has(c) && !chosen.includes(c)) chosen.push(c);
  }
  if (chosen.length < count - 1) return null;

  return shuffle([answer, ...chosen.slice(0, count - 1)], random);
}

/**
 * Where a distractor comes from when the deck cannot supply one.
 *
 * The six commonest governments first, because a distractor drawn from the
 * real distribution is a question rather than a giveaway, then the rest of the
 * fourteen so that a word governing several of the common ones can still be
 * asked. Before that tail existed a word like `alustama`, which takes three of
 * the six, could run the list dry once its own governments were excluded.
 */
const FALLBACK: readonly CaseKey[] = [
  "PARTITIVE", "ALLATIVE", "ELATIVE", "COMITATIVE", "ADESSIVE", "GENITIVE",
  ...CASES.map((c) => c.key).filter(
    (k) => !["PARTITIVE", "ALLATIVE", "ELATIVE", "COMITATIVE", "ADESSIVE", "GENITIVE"].includes(k),
  ),
];

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
