import { CASES } from "@/lib/estonian/cases";
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
  PlN: "NOM_PL",
  PlP: "PART_PL",
  PlG: "GEN_PL",
  // Verbs
  Sup: "INF_MA",
  Inf: "INF_DA",
  IndPrSg1: "PRES_1SG",
  IndIpfSg1: "PAST_1SG",
  PtsPtIps: "PART_TUD",
};

/** The order the forms read in, matching how Estonian tables are printed. */
const FORM_ORDER = [
  "SgN", "SgG", "SgP", "SgAdt", "SgIll", "SgIn", "SgEl", "SgAll", "SgAd", "SgAbl",
  "SgTr", "SgTer", "SgEs", "SgAb", "SgKom",
  "PlN", "PlG", "PlP", "PlIll", "PlIn", "PlEl", "PlAll", "PlAd", "PlAbl",
  "PlTr", "PlTer", "PlEs", "PlAb", "PlKom",
  "Sup", "Inf", "IndPrSg1", "IndPrSg2", "IndPrSg3", "IndPrPl1", "IndPrPl2", "IndPrPl3",
  "IndIpfSg1", "IndIpfSg3", "PtsPtIps", "PtsPtPs", "IndPrIps",
];

/** Estonian question words → the case they signal, for verb government. */
/**
 * Which case each question word Ekilex writes a government as signals.
 *
 * READ OFF `CASES`, NOT TYPED, because the typed version was missing three.
 * Essive, terminative and abessive had no row, so `caseOf` returned null for
 * `kellena`, `kelleni` and `kelleta`, `formatGovernment` left them unannotated
 * and `parseGovernment` could then read no case out of the entry at all.
 * `töötama kellena`, which is how you say what you do for a living, had no
 * government card; and `esitama` and `käsitama` govern the essive beside the
 * partitive, so the drill could offer it as a wrong answer and mark a learner
 * wrong for knowing it. That is the exact fault `alsoGoverned` exists to
 * prevent, arriving through a gap in a table rather than through the parser.
 *
 * `lib/estonian/cases.ts` already holds the question a case answers, which is
 * the `mille-` word, so nothing here is written down twice. The `kelle-` form
 * is the same word for the other interrogative pronoun: `mis` and `kes`
 * decline alike in every oblique case, which `npm run audit:cases` confirms
 * against the Institute for both of them. So one substitution, on an attested
 * word, rather than an ending joined to a stem.
 *
 * The three adverbial questions are named as what they are. Ekilex writes
 * `kus`, `kuhu` and `kust` where a verb takes a place rather than a case, and
 * each covers several: naming one would be inventing a government, so they are
 * annotated for a reader and left unparseable, which is `parseGovernment`
 * returning null and the drill skipping the verb.
 */
const GOVERNMENT_CASES: Record<string, string> = (() => {
  /*
    The three that name a place rather than a case, and which the loop below
    must not touch. `kus` is the question for the inessive *and* the adessive
    and `kuhu` for the illative *and* the allative, so both appear in two rows
    of `CASES` and a loop that wrote them down would leave whichever it read
    last: `kus` read as adessive, and a verb Ekilex records as taking a place
    would have been drilled as governing one particular case. That is inventing
    a government, which is what the old typed table's comment forbade and what
    reading the table back out of `CASES` nearly undid.
  */
  const table: Record<string, string> = {
    kus: "location", kuhu: "direction", kust: "source",
  };
  for (const spec of CASES) {
    if (spec.key === "NOMINATIVE") continue; // Nothing governs it.
    for (const asked of spec.question.split(/\s+/)) {
      const word = asked.replace(/\?/g, "").trim().toLowerCase();
      if (!word || word in table) continue;
      table[word] = spec.en.toLowerCase();
      // `mille` and `kelle` are the same case of two pronouns. `cases.ts`
      // writes whichever reads better in a heading; a government can use
      // either, and `keda` is the one it uses most.
      if (word.startsWith("mille")) table[`kelle${word.slice("mille".length)}`] = spec.en.toLowerCase();
      if (word === "mida") table.keda = spec.en.toLowerCase();
    }
  }
  return table;
})();

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
  /**
   * Ekilex's Estonian explanation of the word. It gives no English on a reader key.
   *
   * Named for what it is rather than `notes`, which is the column it used to be
   * written to and which holds English. One column with two languages in it is
   * why a live lookup replaced `aadress`'s "email address" with a sentence of
   * Estonian, in a box with no heading and no `lang`.
   */
  definition: string | null;
  /** Attested sentences using the word — the source of every cloze exercise. */
  examples: Example[];
  forms: MappedForm[];
}

export function mapEkilexDetails(details: EkilexDetails): MappedLexeme | null {
  const formSet = details.formSets.find((p) => p.forms.length > 0);
  if (!formSet) return null;

  const pos =
    formSet.wordClass === "verb" ? "VERB"
    : formSet.wordClass === "noomen" ? "NOUN"
    : "OTHER";

  const forms: MappedForm[] = [];
  const seen = new Set<string>();
  /*
    A PRINCIPAL PART IS ONE FORM, AND EKILEX OFTEN GIVES TWO.

    `@@unique([lexemeId, formType, value])` on `Form` puts the value in the key
    deliberately, because Estonian has genuine parallel forms (`raamatutes`
    beside `raamatuis`) and a key without it would drop one. That is right for
    the whole retrieved table and it is wrong for the six principal parts,
    which are the forms a learner memorises: 2,016 of the 5,363 shipped entries
    carried two `PART_PL` rows and 120 carried two `GEN_PL`, and which of the
    pair the app used was decided by whoever read them. `stemsFrom` takes the
    first row it finds, in whatever order the database returns; every caller
    that builds a `Record` with `Object.fromEntries` takes the last. So the
    dictionary entry for `aadress` could show `aadresse` while the flashcard
    behind it asked for `aadressisid`, and neither was a decision anybody made.

    Ekilex lists the primary first, which is the one a course teaches: `asju`
    before `asjasid`, `aegu` before `aegasid`, `rindade` before `rinde`. So the
    first wins for a principal part. The parallel form is not lost where it
    matters, because an enriched entry keeps the whole retrieved table under
    `EKILEX:<morphCode>`, and those stay parallel exactly as before.
  */
  const principalTaken = new Set<string>();

  for (const f of formSet.forms) {
    const key = `${f.morphCode}|${f.value}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const principal = PRINCIPAL_PARTS[f.morphCode];
    if (principal) {
      if (principalTaken.has(principal)) continue;
      principalTaken.add(principal);
    }
    const order = FORM_ORDER.indexOf(f.morphCode);
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
    definition: details.definitions[0] ?? null,
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
 *
 * Exported because the bulk harvest writes the same column. It stored Ekilex's
 * raw question word for a while, which looked like the honest thing to do and
 * was not: `parseGovernment` reads the case out of the annotation, so two
 * hundred harvested verbs had a government string nothing could parse, no
 * government card, and no case shown to the learner. One formatter for both
 * paths means a word's stored shape does not depend on how it arrived.
 */
export function formatGovernment(governments: string[]): string | null {
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
