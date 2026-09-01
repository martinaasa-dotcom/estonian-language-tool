import { CASES, type CaseSpec } from "./cases";
import type { CaseKey } from "./types";

/**
 * THE ELEVEN REGULAR CASES, AND THE ONE THAT IS NOT.
 *
 * Ten of the eleven non-principal cases really are a suffix on the genitive
 * stem, the same suffix for every word in the language. The illative is not,
 * and this module used to pretend it was.
 *
 * Estonian has two illatives. The long one is `genitive + sse` and is what a
 * rule can produce. The short one, the *aditiiv*, is lexically unpredictable
 * and is the form people actually say: `tuba` goes to `tuppa`, not `toasse`;
 * `aeg` to `aega`, not `ajasse`; `abi` to `appi`, not `abisse`. The dictionary
 * has held it all along, as `ILL_SG_SHORT` from the seed and `SgAdt` from
 * Ekilex, and 2,969 of the shipped entries carry one. Every single one of them
 * differs from the suffix rule, because a word whose short illative *is* the
 * long one has no short illative recorded.
 *
 * `NounStems` had no field for it, so the table could not show it even in
 * principle, and `deriveCase` took a bare genitive, so the eight callers that
 * wanted a case form could not have consulted it if they had wanted to. The
 * landing page taught `toasse`, the dictionary entry printed it, and
 * `lib/srs/cards.ts` made it the answer side of a flashcard: a learner typing
 * `tuppa` was told they were wrong, and the scheduler brought the card back
 * until they stopped typing it.
 *
 * SO THE STEMS CARRY IT AND THE FIELD IS REQUIRED. `illSgShort: string | null`
 * rather than `illSgShort?: string`, which is the whole of the fix that
 * matters: `null` says the dictionary was asked and holds none, and a caller
 * that never asked cannot produce a value the type will accept. That is the
 * shape `buildOptions` uses for verb government one module over, and for the
 * same reason: a rule nobody can forget beats a rule everybody is told about.
 *
 * WHAT IS DERIVED IS STILL DERIVED, and ADR-005 amendment 1 still holds. A
 * suffix on a stored stem is one bug for the whole language rather than one
 * word wrong unpredictably. The change is that an attested form now always
 * beats a derived one, which was supposed to be true and was not.
 */

export interface DerivedForm {
  readonly spec: CaseSpec;
  readonly singular: string | undefined;
  readonly plural: string | undefined;
  /**
   * STORED = a principal part or a short illative we hold.
   * EKILEX = a whole form a lexicographer wrote down.
   * DERIVED = a suffix on a stored stem.
   */
  readonly origin: "STORED" | "EKILEX" | "DERIVED";
  /**
   * Every spelling that is right, the one in `singular` first.
   *
   * Estonian genuinely has two illatives for thousands of words and both are
   * correct, so a screen that prints one and a marker that accepts one are two
   * different questions. This answers the second.
   */
  readonly accepted: readonly string[];
}

export interface NounStems {
  readonly nomSg?: string;
  readonly genSg?: string;
  readonly partSg?: string;
  readonly partPl?: string;
  /** Optional sixth principal part. Present → plural oblique cases become available. */
  readonly genPl?: string;
  /**
   * The short illative (aditiiv), or `null` when the dictionary holds none.
   *
   * Not derivable, which is the whole reason it is stored: `tuba` gives
   * `tuppa` and `käsi` gives `kätte`, and no rule over the genitive stem
   * reaches either.
   *
   * Required rather than optional, deliberately. See the header: this is the
   * one field whose absence produced a wrong Estonian form on every screen in
   * the app, and a required field is the only version of the rule that a new
   * caller cannot skip. `main` fixed the same bug with an optional field, and
   * the optional version is why `lib/srs/cards.ts` and `lib/estonian/writing.ts`
   * there still grade against a suffix: nothing made them look.
   */
  readonly illSgShort: string | null;
  /**
   * Whole singular forms a lexicographer wrote down, by case, where we have
   * them. An entry enriched from Ekilex carries the full paradigm; a seeded
   * one carries none, and `{}` is the honest value for that.
   */
  readonly retrieved?: Partial<Record<CaseKey, string>>;
}

/** Unique, order preserved, empties dropped. */
function uniq(values: readonly (string | undefined | null)[]): string[] {
  const out: string[] = [];
  for (const v of values) if (v && !out.includes(v)) out.push(v);
  return out;
}

/**
 * Every attested-or-derived singular form of one case, best first.
 *
 * The order is the whole point: what a lexicographer wrote down comes before
 * the short illative we seeded, which comes before a suffix we added to a
 * stem. A derived form is only ever reached when nothing was attested.
 *
 * BOTH ILLATIVES ARE RETURNED, AND THAT IS THE RESOLUTION OF A REAL
 * DISAGREEMENT. Two sessions fixed this bug within the hour and chose
 * differently about a word whose short illative is syncretic with one of its
 * principal parts, which is 2,044 of the 2,966 entries that have one.
 *
 * Leading with the short form alone prints `aadressi` under the sisseütlev
 * beside the identical `aadressi` under the omastav and the osastav, and
 * hides `aadressisse`, which is the form somebody writing a sentence needs.
 * Suppressing it wherever it is syncretic, which is what `main` does, hides
 * `aega` and shows `ajasse` for `aeg`, which is the fault this started as.
 *
 * Estonian has both, so the app shows both, shortest first. Nothing is
 * hidden, nothing is invented, and the reader sees the pair a course teaches
 * as a pair. It is the same treatment the dictionary already gives the
 * parallel forms of `raamatutes / raamatuis`.
 */
function singularForms(stems: NounStems, spec: CaseSpec): { forms: string[]; origin: DerivedForm["origin"] } {
  const retrieved = stems.retrieved?.[spec.key];
  const short = spec.key === "ILLATIVE" ? stems.illSgShort : null;
  const derived = stems.genSg ? stems.genSg + spec.suffix : undefined;

  /*
    A SHORT ILLATIVE SPELLED LIKE A PRINCIPAL PART IS RECORDED BUT NOT WORTH
    LEADING WITH, which is 2,044 of the 2,966 entries that have one.

    `sõber` has `sõpra` recorded, and `sõpra` is already its partitive, so
    leading with it prints one word under two names and hides `sõbrasse`,
    which is the form somebody writing a sentence needs. `aadress` is worse:
    its short illative is `aadressi`, which is both its genitive and its
    partitive, so the table would print the same word three times.

    It stays in `accepted`, though, because the dictionary does record it as
    the short illative and marking somebody wrong for it would be this whole
    bug pointed the other way. What a screen prints and what a marker accepts
    are two different questions, and this is the one place they differ.
  */
  const principalParts = [stems.nomSg, stems.genSg, stems.partSg];
  const lead = short && !principalParts.includes(short) ? short : null;

  const attested = uniq([lead, retrieved]);
  if (attested.length > 0) {
    return {
      forms: uniq([...attested, derived, short]),
      origin: lead ? "STORED" : "EKILEX",
    };
  }
  return { forms: uniq([derived, short]), origin: "DERIVED" };
}

/**
 * Builds the full case table for a noun.
 *
 * Singular obliques are suffixes on the genitive singular, except where the
 * dictionary holds the real thing: see `singularForms`. Plural obliques are
 * suffixes on the genitive *plural*, which is NOT derivable from the singular
 * (`tuba : toa` gives `tubade`, not `toade`), so they appear only when the
 * genitive plural is stored. We show a gap rather than invent a form (ADR-005).
 *
 * THE ILLATIVE IS THE ONE CASE WITH TWO ANSWERS, and a suffix on the genitive
 * was the only one this ever gave. `toa` + `sse` is `toasse`, which is a real
 * form and is what Ekilex records as the sisseütlev, and it is not what
 * anybody says: the word is `tuppa`, and `käsi` goes to `kätte` rather than
 * `käesse`. Both are stored, because neither is reachable by a rule, and a
 * learner shown the long form alone has been taught the grammatically
 * defensible version of a sentence no Estonian speaker utters.
 *
 * The plural illative is regular either way (`tubadesse`, never a short form),
 * so only the singular has two answers.
 */
export function buildCaseTable(stems: NounStems): DerivedForm[] {
  const { nomSg, genSg, partSg, partPl, genPl } = stems;

  return CASES.map((spec): DerivedForm => {
    if (spec.key === "NOMINATIVE") {
      return {
        spec,
        singular: nomSg,
        // Nominative plural is the one regular plural: genitive singular + d.
        plural: genSg ? `${genSg}d` : undefined,
        origin: "STORED",
        accepted: uniq([nomSg]),
      };
    }
    if (spec.key === "GENITIVE") {
      return { spec, singular: genSg, plural: genPl, origin: "STORED", accepted: uniq([genSg]) };
    }
    if (spec.key === "PARTITIVE") {
      return { spec, singular: partSg, plural: partPl, origin: "STORED", accepted: uniq([partSg]) };
    }
    const { forms, origin } = singularForms(stems, spec);
    return {
      spec,
      singular: forms[0],
      plural: genPl ? genPl + spec.suffix : undefined,
      origin,
      accepted: forms,
    };
  });
}

/** What the app should show and accept for one case of one word. */
export interface CaseAnswer {
  /** The form to print: attested wherever one is attested. */
  readonly value: string;
  /** Every spelling a learner may type, `value` first. */
  readonly accepted: readonly string[];
  readonly origin: DerivedForm["origin"];
}

/**
 * The form of one case, from the dictionary where the dictionary has it.
 *
 * This replaced `deriveCase(genSg, key)`, which took a bare genitive and so
 * could only ever answer with a suffix rule. Eight callers used it, two of
 * them to decide whether a learner was right: `lib/srs/cards.ts` for the
 * answer side of a case card and `lib/estonian/writing.ts` for the form a
 * written sentence has to contain. Both were marking `tuppa` wrong.
 *
 * Taking `NounStems` rather than a string is what makes that unrepeatable,
 * because `illSgShort` is required: a ninth caller holding only a genitive
 * does not compile.
 */
export function caseAnswer(stems: NounStems, key: CaseKey): CaseAnswer | null {
  const spec = CASES.find((c) => c.key === key);
  if (!spec || spec.principal) return null;
  const { forms, origin } = singularForms(stems, spec);
  const value = forms[0];
  if (!value) return null;
  return { value, accepted: forms, origin };
}

/**
 * The stems of a word, read off whatever form rows we are holding.
 *
 * One reader rather than eight, because `illSgShort` is only as reliable as
 * the least careful caller: every place that used to pull `GEN_SG` out of a
 * form list by hand and stop there now gets the short illative for free, and
 * an entry that genuinely has none gets an explicit `null`.
 */
export function stemsFrom(
  forms: readonly { formType?: string | null; morphCode?: string | null; value: string }[],
): NounStems {
  const byType = (t: string) => forms.find((f) => f.formType === t)?.value;
  /*
    The code is on `morphCode` for a live Ekilex fetch and on `formType` as
    `EKILEX:SgIn` for a row the seed wrote, and different callers hold
    different mixtures of the two. Reading both here is what stops a third
    reader inventing a third answer, which is how the illative got lost.
  */
  const codeOf = (f: { formType?: string | null; morphCode?: string | null }) =>
    f.morphCode ?? (f.formType?.startsWith("EKILEX:") ? f.formType.slice(7) : null);

  const retrieved: Partial<Record<CaseKey, string>> = {};
  for (const f of forms) {
    const code = codeOf(f);
    const key = MORPH_TO_CASE[code ?? ""];
    if (key && !retrieved[key]) retrieved[key] = f.value;
  }
  return {
    nomSg: byType("NOM_SG"),
    genSg: byType("GEN_SG"),
    partSg: byType("PART_SG"),
    partPl: byType("PART_PL"),
    genPl: byType("GEN_PL"),
    illSgShort: byType("ILL_SG_SHORT") ?? forms.find((f) => codeOf(f) === "SgAdt")?.value ?? null,
    retrieved,
  };
}

/**
 * The same, for the callers that hold principal parts keyed by `formType`.
 *
 * `LessonWord.parts` and `CheckpointWord.parts` are built by filtering the
 * form list through `isPrincipalFormType`, and `ILL_SG_SHORT` has been on that
 * list all along, so the short illative was already sitting in both of them
 * unread. There are no retrieved forms in a `parts` map by construction, and
 * `{}` says so rather than leaving it undefined.
 */
export function stemsFromParts(parts: Readonly<Record<string, string>>): NounStems {
  return {
    nomSg: parts.NOM_SG,
    genSg: parts.GEN_SG,
    partSg: parts.PART_SG,
    partPl: parts.PART_PL,
    genPl: parts.GEN_PL,
    illSgShort: parts.ILL_SG_SHORT ?? null,
    retrieved: {},
  };
}

/**
 * The singular morph codes, inline rather than imported from `morph.ts`.
 *
 * `morph.ts` imports `cases.ts` and this imports `cases.ts`, so nothing cycles
 * today; what this avoids is the next person adding a `derive` import to
 * `morph.ts` and discovering it at runtime. Eleven entries, one line each.
 */
const MORPH_TO_CASE: Record<string, CaseKey | undefined> = {
  SgIll: "ILLATIVE", SgIn: "INESSIVE", SgEl: "ELATIVE", SgAll: "ALLATIVE",
  SgAd: "ADESSIVE", SgAbl: "ABLATIVE", SgTr: "TRANSLATIVE", SgTer: "TERMINATIVE",
  SgEs: "ESSIVE", SgAb: "ABESSIVE", SgKom: "COMITATIVE",
};
