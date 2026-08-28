import type { GradationType } from "./types";

export interface GradationResult {
  readonly type: GradationType;
  /** Human-readable alternation, e.g. "b : ∅". Undefined when there is none. */
  readonly note: string | undefined;
}

const VOWELS = "aeiouõäöüy";

/**
 * Strong-grade → weak-grade alternations.
 *
 * Order matters twice over: geminates before singles so `kk : k` beats `k : g`,
 * and consonant-changing patterns before consonant-dropping ones so `sada : saja`
 * reads as `d : j` rather than `d : ∅`.
 */
const PATTERNS: readonly (readonly [strong: string, weak: string])[] = [
  // Geminates first, so `kk : k` wins over `k : g`.
  ["kk", "k"], ["pp", "p"], ["tt", "t"],
  ["ss", "s"], ["ll", "l"], ["mm", "m"], ["nn", "n"], ["rr", "r"],
  // Clusters, so `tund : tunni` reads as `nd : nn` rather than `d : ∅`.
  ["nd", "nn"], ["nt", "nn"], ["ld", "ll"], ["lt", "ll"],
  ["rd", "rr"], ["rt", "rr"], ["mb", "mm"], ["mp", "mm"],
  // Single consonants weakening.
  ["k", "g"], ["p", "b"], ["t", "d"],
  // Consonant-changing before consonant-dropping, so `sada : saja` is `d : j`.
  ["b", "v"], ["d", "j"], ["g", "j"],
  ["b", ""], ["d", ""], ["g", ""], ["s", ""],
];

/**
 * Regular declension types that look like gradation but are not.
 *
 * `inimene : inimese` and `aeglane : aeglase` alternate because of how -ne words
 * decline, not because the stem gradates. Reporting them as gradation would teach
 * a learner to look for a pattern that is not there.
 */
function isDeclensionTypeNotGradation(nom: string, gen: string): boolean {
  if (nom.endsWith("ne") && gen.endsWith("se")) {
    return nom.slice(0, -2) === gen.slice(0, -2);
  }
  return false;
}

/** Drops trailing vowels, so the alternating consonant sits at the end. */
function stem(word: string): string {
  let end = word.length;
  while (end > 0 && VOWELS.includes(word[end - 1]!)) end--;
  return word.slice(0, end);
}

function consonantSkeleton(word: string): string {
  return [...word].filter((ch) => !VOWELS.includes(ch)).join("");
}

function commonPrefixLength(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/**
 * Classifies consonant gradation by comparing the two stems a learner is given.
 *
 * This *describes* an alternation between stored, authoritative forms — it never
 * generates one. Estonian gradation is too irregular to predict, which is exactly
 * why the genitive is memorised rather than computed (ADR-005).
 */
export function classifyGradation(nomSg: string, genSg: string): GradationResult {
  const nom = nomSg.trim().toLowerCase();
  const gen = genSg.trim().toLowerCase();
  if (!nom || !gen) return { type: "NONE", note: undefined };

  // The genitive merely adds an ending: no visible alternation. The word may still
  // alternate in quantity (vältevaheldus), which orthography does not record —
  // see docs/02-estonian-domain.md §1.4.
  if (gen.startsWith(nom)) return { type: "NONE", note: undefined };

  if (isDeclensionTypeNotGradation(nom, gen)) return { type: "NONE", note: undefined };

  const nomStem = stem(nom);
  const genStem = stem(gen);

  for (const [strong, weak] of PATTERNS) {
    if (!nomStem.endsWith(strong)) continue;
    const expected = nomStem.slice(0, nomStem.length - strong.length) + weak;
    if (!expected || !gen.startsWith(expected)) continue;
    // The genitive must not carry *more* consonant than the weak grade predicts.
    // Without this, `toode : toote` matches `d : ∅` on the prefix "too" and hides
    // the real alternation, which runs the other way (`d : t`).
    if (genStem === expected || expected.startsWith(genStem)) {
      return { type: "QUALITATIVE", note: `${strong} : ${weak || "∅"}` };
    }
  }

  // Reverse gradation: the nominative is the *weak* grade and the genitive the
  // strong one (`toode : toote`, `mõte : mõtte`). Same alternation, other way round.
  for (const [strong, weak] of PATTERNS) {
    if (!genStem.endsWith(strong)) continue;
    const base = genStem.slice(0, genStem.length - strong.length);
    if (base && nomStem === base + weak) {
      return { type: "QUALITATIVE", note: `${weak || "∅"} : ${strong}` };
    }
  }

  // The stems diverge in a way the table does not name — typically a vowel change
  // alongside the consonant (tuba : toa). Compare consonant skeletons so we still
  // report the real alternation instead of guessing at a category.
  const nomCons = consonantSkeleton(nomStem);
  const genCons = consonantSkeleton(genStem);
  if (nomCons !== genCons) {
    const shared = commonPrefixLength(nomCons, genCons);
    const from = nomCons.slice(shared);
    const to = genCons.slice(shared);
    if (from) return { type: "QUALITATIVE", note: `${from} : ${to || "∅"}` };
  }

  return { type: "NONE", note: undefined };
}

/**
 * Verb gradation, comparing the ma-infinitive with the present 1sg.
 *
 * The endings must come off first: `lugema : loen` is a `g : ∅` alternation, and
 * comparing the raw forms would report the `-ma`/`-n` endings as part of it.
 */
export function classifyVerbGradation(infMa: string, pres1sg: string): GradationResult {
  const a = infMa.trim().toLowerCase().replace(/ma$/, "");
  const b = pres1sg.trim().toLowerCase().replace(/n$/, "");
  if (!a || !b) return { type: "NONE", note: undefined };
  return classifyGradation(a, b);
}

/**
 * Quantitative gradation (vältevaheldus) is a change in duration that Estonian
 * orthography does not record — `linna` (Q3) and `linna` (Q2) are spelled alike.
 * It is therefore undetectable from text, and this module only ever reports the
 * qualitative kind. The UI says so rather than implying a word has no alternation.
 */
export const DETECTS_ONLY_QUALITATIVE = true;
