/**
 * The gate, which is four checks and not one.
 *
 * A composed line is withheld whole when it fails any of them, the way
 * `lib/tutor/verify.ts` withholds a grader's note, and never shown with a
 * caveat: a caveat still puts a wrong form in front of somebody trying to
 * learn one (design §2).
 *
 *   1. Shape. One sentence, inside the word count, punctuated, no markdown,
 *      and a question exactly where the move asks for one.
 *   2. Vouching. Every token resolves against the scene's own word list, not
 *      the whole dictionary. That is the whole constraint: against the
 *      dictionary any Estonian word passes; against a few hundred lemmas the
 *      model is choosing inside a box.
 *   3. Register. A scene in `teie` may not come back with a `sina` form.
 *   4. Government. A line holding a governed verb has to hold at least one
 *      nominal in a case that verb governs. Measured at withholding 48.9% of
 *      real errors and 8.1% of good lines (design §29), and drawn as weakly
 *      as it is because there is no parser here.
 *
 * `scripts/eval-scene.ts` carried the first copy of this and measured it.
 * The data the government check needs, every governed verb's forms and every
 * nominal's case forms, is built once from the dictionary by `buildGateData`
 * and handed in, so the check itself is pure and the script and the route
 * read one answer.
 */
import { CASES } from "@/lib/estonian/cases";
import { caseAnswer, stemsFromParts } from "@/lib/estonian/derive";
import { parseGovernment } from "@/lib/estonian/government";
import type { CaseKey } from "@/lib/estonian/types";
import { formsOf, words, type DictEntry } from "./lexicon";
import { MAX_WORDS, isQuestion } from "./retrieval";
import { QUESTION_SHAPE, type MoveKind } from "./types";

export type GateCheck = "shape" | "vouching" | "register" | "government";

export interface Governed {
  readonly lemma: string;
  readonly forms: ReadonlySet<string>;
  readonly cases: ReadonlySet<CaseKey>;
}

export interface GateData {
  /** Every governed verb the dictionary knows, with every form of it. */
  readonly governed: readonly Governed[];
  /** Every case form of every nominal, to the cases it could be. */
  readonly caseOf: ReadonlyMap<string, ReadonlySet<CaseKey>>;
}

/** An entry as the gate needs to see it: a `DictEntry` plus its government. */
export interface GateEntry extends DictEntry {
  readonly government?: string | null;
}

function principalPart(key: CaseKey): string {
  return key === "NOMINATIVE" ? "NOM_SG" : key === "GENITIVE" ? "GEN_SG" : "PART_SG";
}

/** Built once over the whole dictionary. Slow enough to cache, pure enough to test. */
export function buildGateData(entries: readonly GateEntry[]): GateData {
  const governed: Governed[] = [];
  const caseOf = new Map<string, Set<CaseKey>>();
  for (const entry of entries) {
    if (entry.pos === "VERB") {
      const government = parseGovernment(entry.government ?? null);
      if (!government) continue;
      governed.push({
        lemma: entry.lemma,
        forms: new Set(formsOf(entry)),
        cases: new Set([government.caseKey, ...government.alsoGoverned]),
      });
      continue;
    }
    if (entry.pos !== "NOUN" && entry.pos !== "ADJECTIVE" && entry.pos !== "PRONOUN") continue;
    if (!entry.parts.GEN_SG) continue;
    const stems = stemsFromParts(entry.parts);
    for (const spec of CASES) {
      const answer = spec.principal ? null : caseAnswer(stems, spec.key);
      const forms = answer ? answer.accepted : [entry.parts[principalPart(spec.key)] ?? ""];
      for (const form of forms) {
        if (!form) continue;
        const key = form.toLowerCase();
        const seen = caseOf.get(key) ?? new Set<CaseKey>();
        seen.add(spec.key);
        caseOf.set(key, seen);
      }
    }
  }
  return { governed, caseOf };
}

/** The forms of the pronoun a register forbids. */
export function wrongRegisterForms(register: "teie" | "sina", pronouns: readonly DictEntry[]): Set<string> {
  const forbidden = register === "teie" ? "sina" : "teie";
  const out = new Set<string>();
  for (const entry of pronouns) {
    if (entry.lemma !== forbidden) continue;
    for (const form of formsOf(entry)) out.add(form);
  }
  return out;
}

export function governmentSuspect(tokens: readonly string[], data: GateData): boolean {
  const lower = tokens.map((t) => t.toLowerCase());
  const verb = data.governed.find((g) => lower.some((t) => g.forms.has(t)));
  if (!verb) return false;
  const nominals = lower.filter((t) => data.caseOf.has(t) && !verb.forms.has(t));
  if (nominals.length === 0) return false;
  return !nominals.some((t) => [...(data.caseOf.get(t) ?? [])].some((c) => verb.cases.has(c)));
}

export interface GateVerdict {
  readonly failed: readonly GateCheck[];
  /** The tokens the scene's own list could not vouch for. */
  readonly unknown: readonly string[];
}

export function runGate(input: {
  text: string;
  move: MoveKind;
  forms: ReadonlySet<string>;
  wrongRegister: ReadonlySet<string>;
  data: GateData;
}): GateVerdict {
  const { text, move, forms, wrongRegister, data } = input;
  const failed: GateCheck[] = [];
  const tokens = words(text);

  const shape = QUESTION_SHAPE[move];
  const sentences = text.trim().split(/[.!?]+\s+/).filter(Boolean).length;
  const punctuated = /[.!?]"?$/.test(text.trim());
  const markdown = /[*_`#[\]]/.test(text);
  if (
    sentences !== 1 || !punctuated || markdown ||
    tokens.length > MAX_WORDS || tokens.length === 0 ||
    (shape === "required" && !isQuestion(text)) ||
    (shape === "forbidden" && isQuestion(text))
  ) failed.push("shape");

  const unknown = tokens.filter((t) => !forms.has(t.toLowerCase()));
  if (unknown.length > 0) failed.push("vouching");

  if (tokens.some((t) => wrongRegister.has(t.toLowerCase()))) failed.push("register");
  if (governmentSuspect(tokens, data)) failed.push("government");

  return { failed, unknown };
}
