import { classifyGradation, classifyVerbGradation } from "@/lib/estonian/gradation";
import { usableExamples, type Example } from "@/lib/dict/examples";
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
  /** Attested sentences using the word — the source of every cloze exercise. */
  examples: Example[];
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
    examples: usableExamples(details.usages.map((et) => ({ et, source: "EKILEX" as const }))),
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
 * The case a single Ekilex government pattern signals, or null when it does not
 * signal one cleanly.
 *
 * Ekilex records government as the question word a verb answers, and it very
 * rarely writes a bare one. `tänama` comes back as `keda/mida*`, `hoolima` as
 * `millest/kellest`: alternatives separated by a slash, sometimes with a
 * trailing asterisk. An exact lookup missed every one of those, so the case
 * went unnamed, the drill could not parse the entry, and the verb was dropped
 * silently. That is why verb government stood at the twenty-five verbs somebody
 * had typed by hand while Ekilex knew thousands.
 *
 * The rule is deliberately conservative, because the alternative to a missing
 * question is a wrong one:
 *
 *   `keda/mida*`        both alternatives are partitive, so partitive.
 *   `millest/kellest`   both elative, so elative.
 *   `mille eest`        genitive, but governed by a postposition rather than by
 *                       the verb. A different phenomenon, so it is left alone.
 *   `mida tegemast`     an infinitive complement, not a case. Left alone.
 *   `kellel + mida teha`  two complements at once. Left alone.
 *
 * So: only a pattern that is one question word, or a slash-separated set of
 * question words that all agree, names a case. Anything with another word in
 * it is shown as Ekilex wrote it and named as nothing.
 */
function caseOf(pattern: string): string | null {
  const cleaned = pattern.toLowerCase().replace(/\*/g, "").trim();
  if (!cleaned || /\s/.test(cleaned)) return null;

  const alternatives = cleaned.split("/").map((a) => a.trim()).filter(Boolean);
  if (alternatives.length === 0) return null;

  const cases = alternatives.map((a) => GOVERNMENT_CASES[a]);
  const first = cases[0];
  if (!first) return null;
  return cases.every((c) => c === first) ? first : null;
}

/**
 * Ekilex records government as the question word a verb answers — `mida`, `kellele`.
 * Naming the case alongside it is what makes it learnable: "mida" on its own does
 * not tell an English speaker that the object is partitive.
 *
 * Ordered as Ekilex ordered it, primary government first, because that is the
 * order the drill reads the case out of.
 */
function formatGovernment(governments: string[]): string | null {
  if (governments.length === 0) return null;
  const parts = governments.slice(0, 4).map((g) => {
    const c = caseOf(g);
    return c ? `${g} (${c})` : g;
  });
  return parts.join(" · ");
}

function normaliseCefr(code: string | null): string | null {
  if (!code) return null;
  const m = /^([ABC][12])/i.exec(code.trim());
  return m?.[1] ? m[1].toUpperCase() : null;
}
