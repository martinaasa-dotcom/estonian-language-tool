/**
 * THE WORDS THE LANDING PAGE'S CASE EXPLORER OFFERS, AND WHY THEY ARE THE ODD
 * ONES.
 *
 * It offered `tuba` and `raamat`: one stem that changes and one that does not,
 * which is the section's whole claim demonstrated twice. A reader pressing the
 * second chip and getting the same answer again learns that the card is a
 * picture rather than a thing that works.
 *
 * THESE FIVE ARE PICKED FOR WHERE THE STEM GOES STRANGE, because that is the
 * objection this card exists to answer. Nobody doubts that endings stack onto
 * `raamat`. What stops people is the word whose genitive they would never have
 * guessed, and the honest answer is that the endings are regular anyway: learn
 * the forms and the rest follow off the second of them, however little it
 * looks like the first.
 *
 * `raamat` is the baseline and does nothing at all. `tuba` swaps its vowel and
 * comes out `toa`. `sõber` is the one where the two stems disagree with each
 * other, `sõbra` against `sõpra`, so even the ones you memorize are not one
 * stem. `käsi` goes to `käe`, which shares two letters with the word you
 * looked up. `mees` turns its s into an h. Every one of those is a word a
 * beginner meets in their first month, which is the point: these are not
 * curiosities, they are the second week of a course.
 *
 * A LEMMA HERE IS A REQUEST, exactly as one in a syllabus unit is. The forms
 * come from the dictionary at render time and a word it cannot answer for is
 * dropped rather than invented (ADR-005). What is written down here is which
 * words to ask about, and the stems to fall back to when the database behind
 * the page is unreachable, which is the state a fresh deployment builds in.
 *
 * The fallback stems are copied from the seed, character for character, and
 * `scripts/test-invariants.ts` checks that against the built dictionary rather
 * than trusting the copying. Nothing here is a hand-written Estonian form.
 */

export const DEMO_LEMMAS = ["raamat", "tuba", "sõber", "käsi", "mees"] as const;

export interface DemoStems {
  readonly lemma: string;
  readonly nomSg: string;
  readonly genSg: string;
  readonly partSg: string;
  readonly partPl: string;
  readonly genPl: string;
  /**
   * The short illative, or `null` where the seed records none.
   *
   * Required rather than optional, which is `NounStems`'s own rule and is
   * there so a stem written without asking the dictionary does not compile.
   * `sõber` records `sõpra`, which is already its partitive, and
   * `buildCaseTable` is where that is decided rather than here: this table
   * says what the seed holds, not what the card should lead with.
   */
  readonly illSgShort: string | null;
  /**
   * The nominative plural, or `null` where the seed records none.
   *
   * Required for the same reason and read off the same seed. It stopped being
   * `genSg + d` when `scripts/audit-cases.ts` put that ending to Ekilex for
   * every nominal in the dictionary and found it wrong for every pronoun and
   * for thirty-three nouns that have no plural at all.
   */
  readonly nomPl: string | null;
  /**
   * The Institute's semantic type codes, copied from the seed like the forms.
   *
   * Two of these five are people. Without this the card printed
   * `seesütlev · milles? kus?` over `mehes` and `sõbras`, which is the
   * `mis`-series asked about a `kes` on the app's own front page. It names
   * the question only; every row of the table is still shown, because a table
   * of forms is a reference rather than a question. See
   * lib/estonian/caseQuestion.ts.
   */
  readonly semanticTypes: string | null;
}

export const DEMO_STEMS: readonly DemoStems[] = [
  { lemma: "raamat",
    nomSg: "raamat", genSg: "raamatu", partSg: "raamatut", partPl: "raamatuid", genPl: "raamatute",
    illSgShort: null, nomPl: "raamatud", semanticTypes: "esitus" },
  { lemma: "tuba",
    nomSg: "tuba", genSg: "toa", partSg: "tuba", partPl: "tube", genPl: "tubade",
    illSgShort: "tuppa", nomPl: "toad", semanticTypes: "koht_hoone" },
  { lemma: "sõber",
    nomSg: "sõber", genSg: "sõbra", partSg: "sõpra", partPl: "sõpru", genPl: "sõprade",
    illSgShort: "sõpra", nomPl: "sõbrad", semanticTypes: "in_roll" },
  { lemma: "käsi",
    nomSg: "käsi", genSg: "käe", partSg: "kätt", partPl: "käsi", genPl: "käte",
    illSgShort: "kätte", nomPl: "käed", semanticTypes: "kehaosa" },
  { lemma: "mees",
    nomSg: "mees", genSg: "mehe", partSg: "meest", partPl: "mehi", genPl: "meeste",
    illSgShort: null, nomPl: "mehed", semanticTypes: "inimene" },
];
