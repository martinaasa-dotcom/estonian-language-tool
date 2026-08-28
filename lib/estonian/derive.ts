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
}

/**
 * Builds the full case table for a noun.
 *
 * Singular obliques are suffixes on the genitive singular. Plural obliques are
 * suffixes on the genitive *plural*, which is NOT derivable from the singular
 * (`tuba : toa` gives `tubade`, not `toade`), so they appear only when the
 * genitive plural is stored. We show a gap rather than invent a form — ADR-005.
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
      };
    }
    if (spec.key === "GENITIVE") {
      return { spec, singular: genSg, plural: genPl, origin: "STORED" };
    }
    if (spec.key === "PARTITIVE") {
      return { spec, singular: partSg, plural: partPl, origin: "STORED" };
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
