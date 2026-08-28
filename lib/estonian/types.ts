export type PartOfSpeech = "NOUN" | "VERB" | "ADJECTIVE" | "ADVERB" | "PHRASE" | "OTHER";

export type GradationType = "NONE" | "QUALITATIVE" | "QUANTITATIVE";

export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export const CEFR_LEVELS: readonly CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

/** Noun principal parts. GEN_PL is optional; it unlocks the plural oblique cases. */
export type NounFormType = "NOM_SG" | "GEN_SG" | "PART_SG" | "ILL_SG_SHORT" | "PART_PL" | "GEN_PL";

/** Verb principal parts — five, because two infinitives cannot generate a conjugation. */
export type VerbFormType = "INF_MA" | "INF_DA" | "PRES_1SG" | "PAST_1SG" | "PART_TUD";

export type FormType = NounFormType | VerbFormType;

export type CaseKey =
  | "NOMINATIVE" | "GENITIVE" | "PARTITIVE" | "ILLATIVE" | "INESSIVE" | "ELATIVE"
  | "ALLATIVE" | "ADESSIVE" | "ABLATIVE" | "TRANSLATIVE" | "TERMINATIVE"
  | "ESSIVE" | "ABESSIVE" | "COMITATIVE";

export interface Forms {
  readonly [key: string]: string | undefined;
}
