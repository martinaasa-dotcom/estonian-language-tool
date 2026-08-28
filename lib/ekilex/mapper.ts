import { classifyGradation, classifyVerbGradation } from "@/lib/estonian/gradation";
import type { EkilexDetails } from "./client";

/**
 * Turns an Ekilex response into our model.
 *
 * This is the only file that knows Ekilex's shape. When the API changes, one file
 * breaks and one contract test fails, instead of the whole app.
 */

/** Ekilex morph codes for the forms a learner must memorise. */
const PRINCIPAL_PARTS: Record<string, string> = {
  // Nouns and adjectives
  SgN: "NOM_SG",
  SgG: "GEN_SG",
  SgP: "PART_SG",
  SgAdt: "ILL_SG_SHORT",
  PlP: "PART_PL",
  PlG: "GEN_PL",
  // Verbs
  Sup: "INF_MA",
  Inf: "INF_DA",
  IndPrSg1: "PRES_1SG",
  IndIpfSg1: "PAST_1SG",
  PtsPtIps: "PART_TUD",
};

/** The order the full paradigm reads in, matching how Estonian tables are printed. */
const PARADIGM_ORDER = [
  "SgN", "SgG", "SgP", "SgAdt", "SgIll", "SgIn", "SgEl", "SgAll", "SgAd", "SgAbl",
  "SgTr", "SgTer", "SgEs", "SgAb", "SgKom",
  "PlN", "PlG", "PlP", "PlIll", "PlIn", "PlEl", "PlAll", "PlAd", "PlAbl",
  "PlTr", "PlTer", "PlEs", "PlAb", "PlKom",
  "Sup", "Inf", "IndPrSg1", "IndPrSg2", "IndPrSg3", "IndPrPl1", "IndPrPl2", "IndPrPl3",
  "IndIpfSg1", "IndIpfSg3", "PtsPtIps", "PtsPtPs", "IndPrIps",
];

/** Estonian question words → the case they signal, for verb government. */
const GOVERNMENT_CASES: Record<string, string> = {
  mida: "partitive", keda: "partitive",
  mille: "genitive", kelle: "genitive",
  millele: "allative", kellele: "allative",
  millel: "adessive", kellel: "adessive",
  millelt: "ablative", kellelt: "ablative",
  milles: "inessive", kelles: "inessive",
  millest: "elative", kellest: "elative",
  millesse: "illative", kellesse: "illative",
  milleks: "translative", kelleks: "translative",
  millega: "comitative", kellega: "comitative",
  kus: "location", kuhu: "direction", kust: "source",
};

export interface MappedForm {
  formType: string;
  value: string;
  isPrincipal: boolean;
  morphCode: string;
  morphName: string;
  orderIndex: number;
}

export interface MappedLexeme {
  lemma: string;
  pos: string;
  ekilexWordId: number;
  cefr: string | null;
  gradation: string;
  gradationNote: string | null;
  government: string | null;
  /** Estonian explanatory definition. Ekilex gives no English on a reader key. */
  notes: string | null;
  forms: MappedForm[];
}

export function mapEkilexDetails(details: EkilexDetails): MappedLexeme | null {
  const paradigm = details.paradigms.find((p) => p.forms.length > 0);
  if (!paradigm) return null;

  const pos =
    paradigm.wordClass === "verb" ? "VERB"
    : paradigm.wordClass === "noomen" ? "NOUN"
    : "OTHER";

  const forms: MappedForm[] = [];
  const seen = new Set<string>();

  for (const f of paradigm.forms) {
    const key = `${f.morphCode}|${f.value}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const principal = PRINCIPAL_PARTS[f.morphCode];
    const order = PARADIGM_ORDER.indexOf(f.morphCode);
    forms.push({
      formType: principal ?? `EKILEX:${f.morphCode}`,
      value: f.value,
      isPrincipal: Boolean(principal),
      morphCode: f.morphCode,
      morphName: f.morphValue,
      orderIndex: order === -1 ? 900 : order,
    });
  }

  const by = (code: string) => forms.find((f) => f.morphCode === code)?.value;
  const gradation =
    pos === "VERB"
      ? verbGradation(by("Sup"), by("IndPrSg1"))
      : nounGradation(by("SgN"), by("SgG"));

  return {
    lemma: details.wordValue,
    pos,
    ekilexWordId: details.wordId,
    cefr: normaliseCefr(details.cefr),
    gradation: gradation.type,
    gradationNote: gradation.note ?? null,
    government: formatGovernment(details.governments),
    notes: details.definitions[0] ?? null,
    forms: forms.sort((a, b) => a.orderIndex - b.orderIndex),
  };
}

function nounGradation(nom: string | undefined, gen: string | undefined) {
  if (!nom || !gen) return { type: "NONE", note: undefined };
  return classifyGradation(nom, gen);
}

function verbGradation(inf: string | undefined, pres: string | undefined) {
  if (!inf || !pres) return { type: "NONE", note: undefined };
  return classifyVerbGradation(inf, pres);
}

/**
 * Ekilex records government as the question word a verb answers — `mida`, `kellele`.
 * Naming the case alongside it is what makes it learnable: "mida" on its own does
 * not tell an English speaker that the object is partitive.
 */
function formatGovernment(governments: string[]): string | null {
  if (governments.length === 0) return null;
  const parts = governments.slice(0, 4).map((g) => {
    const c = GOVERNMENT_CASES[g.toLowerCase().trim()];
    return c ? `${g} (${c})` : g;
  });
  return parts.join(" · ");
}

function normaliseCefr(code: string | null): string | null {
  if (!code) return null;
  const m = /^([ABC][12])/i.exec(code.trim());
  return m?.[1] ? m[1].toUpperCase() : null;
}
