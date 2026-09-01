import { CASES, type CaseSpec } from "./cases";
import type { CaseKey } from "./types";

export interface DerivedForm {
  readonly spec: CaseSpec;
  readonly singular: string | undefined;
  readonly plural: string | undefined;
  /** STORED = a principal part we hold. DERIVED = suffix on a stored stem. */
  readonly origin: "STORED" | "DERIVED";
}

export interface NounStems {
  readonly nomSg?: string;
  readonly genSg?: string;
  readonly partSg?: string;
  readonly partPl?: string;
  /** Optional sixth principal part. Present → plural oblique cases become available. */
  readonly genPl?: string;
  /**
   * The short illative, where the dictionary holds one. Not derivable, which
   * is the whole reason it is stored: `tuba` gives `tuppa` and `käsi` gives
   * `kätte`, and no rule over the genitive stem reaches either.
   */
  readonly illSgShort?: string;
}

/**
 * Builds the full case table for a noun.
 *
 * Singular obliques are suffixes on the genitive singular. Plural obliques are
 * suffixes on the genitive *plural*, which is NOT derivable from the singular
 * (`tuba : toa` gives `tubade`, not `toade`), so they appear only when the
 * genitive plural is stored. We show a gap rather than invent a form (ADR-005).
 *
 * THE ILLATIVE IS THE ONE CASE WITH TWO ANSWERS, and the derived one was the
 * only one this ever gave. `toa` + `sse` is `toasse`, which is a real form and
 * is what Ekilex records as the sisseütlev, and it is not what anybody says:
 * the word is `tuppa`, and `käsi` goes to `kätte` rather than `käesse`. Both
 * of those are stored, because neither can be reached by a rule over the
 * genitive stem, and a learner shown the long form alone has been taught the
 * grammatically defensible version of a sentence no Estonian speaker utters.
 *
 * So a stored short illative wins, and it is reported as STORED, which is the
 * true statement about it: this one is memorised like the three above it
 * rather than worked out. It has to *differ* from those three to be worth
 * saying, though. `sõber` has `sõpra` recorded as its short illative and
 * `sõpra` is already its partitive, so promoting it would print one word
 * twice under two names and hide `sõbrasse`, which is the form somebody
 * writing a sentence actually needs.
 */
export function buildCaseTable(stems: NounStems): DerivedForm[] {
  const { nomSg, genSg, partSg, partPl, genPl, illSgShort } = stems;
  const learnt = illSgShort && ![nomSg, genSg, partSg].includes(illSgShort)
    ? illSgShort
    : undefined;

  return CASES.map((spec): DerivedForm => {
    if (spec.key === "NOMINATIVE") {
      return {
        spec,
        singular: nomSg,
        // Nominative plural is the one regular plural: genitive singular + d.
        plural: genSg ? `${genSg}d` : undefined,
        origin: "STORED",
      };
    }
    if (spec.key === "GENITIVE") {
      return { spec, singular: genSg, plural: genPl, origin: "STORED" };
    }
    if (spec.key === "PARTITIVE") {
      return { spec, singular: partSg, plural: partPl, origin: "STORED" };
    }
    if (spec.key === "ILLATIVE" && learnt) {
      // The plural illative is regular either way: `tubadesse`, never a short
      // form. Only the singular has two answers.
      return {
        spec,
        singular: learnt,
        plural: genPl ? genPl + spec.suffix : undefined,
        origin: "STORED",
      };
    }
    return {
      spec,
      singular: genSg ? genSg + spec.suffix : undefined,
      plural: genPl ? genPl + spec.suffix : undefined,
      origin: "DERIVED",
    };
  });
}

/** A single derived case form, or undefined when the stem is missing. */
export function deriveCase(genSg: string | undefined, key: CaseKey): string | undefined {
  if (!genSg) return undefined;
  const spec = CASES.find((c) => c.key === key);
  if (!spec || spec.principal) return undefined;
  return genSg + spec.suffix;
}
