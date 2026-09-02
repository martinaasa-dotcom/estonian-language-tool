import type { GradationType } from "./types";

/**
 * ONLY TWO OF THE THREE VALUES ARE EVER ASSIGNED, AND THAT IS THE LANGUAGE
 * RATHER THAN AN OMISSION.
 *
 * `GradationType` allows `QUANTITATIVE` and nothing here returns it, on any of
 * the 5,363 entries the dictionary ships. Estonian's third quantity is not
 * written down: `kooli` the genitive and `kooli` the partitive are the same
 * letters in the same order and differ in how long the vowel is held, so a
 * classifier reading principal parts as strings cannot see it, and neither can
 * a learner reading a page. What is spelled is the consonant centre changing,
 * which is qualitative gradation, and that is what this returns.
 *
 * The value stays in the type because it is a true category a person editing an
 * entry by hand may want, and because `Lexeme.gradation` is a string column a
 * future Ekilex field could fill. What may not happen is a screen or a dataset
 * claiming the app classifies three ways when it classifies two:
 * `lib/research/sections.ts` says which two, out loud, for that reason.
 */
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
  /*
    A NOMINATIVE -S THAT SIMPLY GOES IS AN ENDING, NOT A GRADE.

    `kapsas : kapsa`, `kuningas : kuninga`, `rahvas : rahva`, `kallis : kalli`:
    the consonant centre does not move at all, the nominative just carries an
    -s the other cases do not. EKK calls that lõpuvaheldus and keeps it apart
    from astmevaheldus, which is a change *inside* the centre. The classifier
    counted the -s as part of the centre, so it reported `s : ∅` on 121 of the
    133 words it labelled that way, and the chip on the dictionary entry said
    "Consonant gradation, this is why the stem changes" over a word whose stem
    does not change. `käsi : käe` and `vesi : vee` are the dozen that really
    do alternate, and they are not this shape: their stem loses more than the
    -s.
  */
  if (nom.endsWith("s") && nom.slice(0, -1) === gen) return true;
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

  /*
    THE NOMINATIVE -S COMES OFF BEFORE THE CENTRES ARE COMPARED.

    `hammas : hamba` is mm : mb and `ratas : ratta` is t : tt, which is what a
    class writes on the board. With the -s left on, the skeletons were `hmms`
    against `hmb` and the fallback reported "ms : b" and "s : t", alternations
    that are not patterns in the language, on the entry and on the flashcard
    hint for hundreds of A1 and A2 words: lammas, sammas, puhas, mätas,
    saabas, varvas, kobras, küngas.

    Only where something is left to compare: `uus : uue` peels to `uu`, which
    has no consonant centre at all, so it keeps the reading it had.
  */
  const peeled = nom.slice(0, -1);
  const peelable = nom.endsWith("s") && !gen.endsWith("s") && Boolean(stem(peeled));
  if (peelable) {
    /*
      Try it with the -s off first, and keep that reading only if it finds
      something. `hammas` peeled is `hamma` against `hamba`, which is mm : mb;
      unpeeled it was `hmms` against `hmb` and the fallback invented "ms : b".

      The fallback back to the whole word is what keeps the real ones: `mees :
      mehe` is s : h, `poiss : poisi` is ss : s and `viis : viie` is s : ∅, and
      peeling those leaves nothing for the patterns to match. So the peel adds
      readings and never removes one.
    */
    const withoutS = compareStems(peeled, gen);
    if (withoutS.type !== "NONE") return withoutS;
  }
  return compareStems(nom, gen);
}

/** The comparison itself, over whatever pair of forms it is handed. */
function compareStems(nom: string, gen: string): GradationResult {
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
    /*
      Never the other way with nothing on the weak side. Estonian has no
      grade pair where the weak one is an absence and the strong one a bare
      consonant, so a match here is the arithmetic finding a stem that simply
      grew a letter: `armas : armsa` loses a vowel rather than weakening a
      centre, and read this way it reported "∅ : s", which is not a pattern
      in the language.
    */
    if (!weak) continue;
    const base = genStem.slice(0, genStem.length - strong.length);
    if (base && nomStem === base + weak) {
      return { type: "QUALITATIVE", note: `${weak} : ${strong}` };
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
 * Whether a part of speech can gradate at all.
 *
 * Gradation is an alternation inside a stem, and a pronoun does not have one
 * in that sense: `kes` goes to `kelle` and `mina` to `minu` by suppletion,
 * a different stem rather than a weakened one. Run through the classifier
 * those read as `s : ll` and `n : ∅`, and a chip saying "gradation s : ll"
 * on the entry for `kes` teaches a pattern that is not there. Nouns,
 * adjectives and verbs gradate; nothing else is asked.
 */
export function gradates(pos: string): boolean {
  return pos === "NOUN" || pos === "ADJECTIVE" || pos === "VERB";
}
