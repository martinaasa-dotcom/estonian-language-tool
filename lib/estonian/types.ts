export type GradationType = "NONE" | "QUALITATIVE" | "QUANTITATIVE";

export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export const CEFR_LEVELS: readonly CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

export type CaseKey =
  | "NOMINATIVE" | "GENITIVE" | "PARTITIVE" | "ILLATIVE" | "INESSIVE" | "ELATIVE"
  | "ALLATIVE" | "ADESSIVE" | "ABLATIVE" | "TRANSLATIVE" | "TERMINATIVE"
  | "ESSIVE" | "ABESSIVE" | "COMITATIVE";

export interface Forms {
  readonly [key: string]: string | undefined;
}


/**
 * The forms a person enters by hand: the unpredictable parts they must memorise.
 *
 * Named as a set because it is the boundary between *user-managed* and
 * *authoritative* data on a Lexeme. Everything else in `Form` is a row Ekilex
 * supplied, and an edit made through the add/correct form must never touch
 * those — see ADR-009, and `createLexemeWithForms`, which used to delete the
 * whole set of forms and rebuild it from whatever one person typed.
 */
export const PRINCIPAL_FORM_TYPES = [
  "NOM_SG", "GEN_SG", "PART_SG", "ILL_SG_SHORT", "NOM_PL", "PART_PL", "GEN_PL",
  "INF_MA", "INF_DA", "PRES_1SG", "PAST_1SG", "PART_TUD",
] as const;

export type PrincipalFormType = (typeof PRINCIPAL_FORM_TYPES)[number];

export function isPrincipalFormType(formType: string): formType is PrincipalFormType {
  return (PRINCIPAL_FORM_TYPES as readonly string[]).includes(formType);
}
