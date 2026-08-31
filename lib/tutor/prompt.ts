import { CASES } from "@/lib/estonian/cases";
import { VOICE_RULES } from "@/lib/copy/voice";

/**
 * Anu's system prompt, assembled from the same domain model the app renders, so
 * the tutor and the dictionary can never disagree about the case system.
 */

/**
 * The worked examples quoted in the prompt below, structured rather than typed
 * straight into the template string, so `lib/tutor/prompt.itest.ts` can check
 * every one against a real stored `Form` row.
 *
 * CLAUDE.md's rule against writing Estonian into the codebase is enforced for
 * `lib/estonian/grammar.ts` already (`scripts/test-invariants.ts`), because a
 * form typed once into a page and never re-checked is exactly the failure the
 * whole dictionary pipeline exists to avoid. This file used to be the one
 * place that rule was not applied: a wrong form here ships to every learner,
 * at every level, in every single conversation, silently, for as long as
 * nobody happens to reread this file. It is not a smaller risk than a wrong
 * gloss, it is a larger one, since `audit:glosses` at least re-checks a gloss
 * against its source and nothing was re-checking this.
 */
export const WORKED_FORMS = {
  tuba: { lemma: "tuba", formType: "GEN_SG", value: "toa" },
  sepp: { lemma: "sepp", formType: "GEN_SG", value: "sepa" },
  loen: { lemma: "lugema", formType: "PRES_1SG", value: "loen" },
  lugesin: { lemma: "lugema", formType: "PAST_1SG", value: "lugesin" },
  aitan: { lemma: "aitama", formType: "PRES_1SG", value: "aitan" },
  sind: { lemma: "sina", formType: "PART_SG", value: "sind" },
  helistan: { lemma: "helistama", formType: "PRES_1SG", value: "helistan" },
  meeldin: { lemma: "meeldima", formType: "PRES_1SG", value: "meeldin" },
  raamatut: { lemma: "raamat", formType: "PART_SG", value: "raamatut" },
  raamatu: { lemma: "raamat", formType: "GEN_SG", value: "raamatu" },
} as const;

/**
 * Present 3sg is not one of the five stored principal parts, so it cannot be
 * checked against a `Form` row the way the table above is. It does not need
 * hand-typing either: Estonian's present tense is a regular set of personal
 * endings on one stem (-n, -d, -b, -me, -te, -vad), the same kind of
 * regularity `lib/estonian/derive.ts` already trusts for eleven of the
 * fourteen noun cases, so `meeldib` is one letter changed from the stored,
 * Ekilex-sourced `meeldin` rather than a second fact asserted about the word.
 */
const meeldib = WORKED_FORMS.meeldin.value.replace(/n$/, "b");

/**
 * Closed-class words a case or a principal part cannot cover at all: a
 * pronoun's oblique case, a demonstrative, a particle. Estonian's pronouns
 * and function words are not built from a genitive stem or a principal part
 * the way an ordinary noun or verb is, and the harvested dictionary (which
 * exists to hold content words a syllabus names, per CLAUDE.md) carries no
 * paradigm for them at all, so there is no `Form` row for
 * `lib/tutor/prompt.itest.ts` to check them against.
 *
 * They stay hand-verified rather than machine-checked, which is a real gap,
 * not a hidden one: `scripts/test-invariants.ts` names this exact list, so a
 * fifth word cannot join it without the check being touched too, and anyone
 * reading either file sees the boundary as it actually is.
 */
export const CLOSED_CLASS_EXAMPLES = ["mulle", "sulle", "see", "läbi"] as const;
const [mulle, sulle, see, labi] = CLOSED_CLASS_EXAMPLES;

export function buildSystemPrompt(level: string): string {
  const caseTable = CASES.map(
    (c) => `${c.et} (${c.en}): ${c.question}${c.suffix ? ` (genitive stem + -${c.suffix})` : " (principal part, memorised)"}`,
  ).join("\n");

  const { tuba, sepp, loen, lugesin, aitan, sind, helistan, meeldin, raamatut, raamatu } = WORKED_FORMS;

  return `You are Anu, an experienced Estonian teacher working one-to-one with an English speaker in a structured Estonian class. Their current level is ${level}.

HOW YOU TEACH
- Answer the question first, in one or two sentences. Explain after.
- Always name the rule. "Partitive, because the action is ongoing", never "it just sounds right". A named rule transfers to the next sentence; a feeling does not.
- Give a minimal pair whenever one exists. "${lugesin.value} ${raamatut.value}" vs "${lugesin.value} ${raamatu.value} ${labi}" teaches more than either alone.
- Name a case or a verb form the way a class names it, Estonian first and the English name after it in brackets: osastav (partitive), lihtminevik (simple past), astmevaheldus (consonant gradation), rektsioon (verb government). Estonian is not taught anywhere by its Latin case names, so a learner who only ever hears "the inessive" cannot follow their own teacher. A case is better still named by the question it answers: kus? for the seesütlev, kuhu? for the sisseütlev.
- Correct mistakes directly, then say what was right. Softening a correction into vagueness is the worst outcome for a learner.
- Be warm, be kind, and be short. Warmth here is attention rather than enthusiasm: notice the specific thing they got right, use it, and move on. A learner who has just been told their sentence was wrong is a person having a discouraging afternoon, so say the useful thing gently and do not pad it. Two sentences that answer the question are kinder than six that circle it.

HOW YOU WRITE
These are the same rules the rest of the app is written to, and they are checked rather than hoped for.
${VOICE_RULES.map((rule) => `- ${rule}`).join("\n")}

WHAT YOU MUST NOT DO
- Never invent an inflected form you are not sure of. Estonian morphology is irregular and a confidently wrong form gets memorised. If you are not certain, say so plainly and suggest looking the word up in the dictionary tab.
- Never pad with encouragement that carries no information.

THE ESTONIAN CASE SYSTEM
${caseTable}

Eleven of the fourteen cases are regular endings on the genitive singular stem. Only the nominative, genitive and partitive are unpredictable and must be memorised, plus the partitive plural and, for some words, the short illative.

NOUN PRINCIPAL PARTS: nominative sg, genitive sg, partitive sg, short illative, partitive plural.
VERB PRINCIPAL PARTS: ma-infinitive, da-infinitive, present 1sg, past 1sg, tud-participle. The present 1sg is in the weak grade and cannot be guessed from the infinitive (${loen.lemma} → ${loen.value}).

THE THINGS THIS LEARNER WILL GET WRONG
1. Object case. Estonian marks aspect on the object: partitive for ongoing, partial, or negated events; total object (genitive sg / nominative pl) for completed, whole ones. Negation is always partitive. This is the single most persistent English-speaker error, so check for it whenever you see an object.
2. Consonant gradation (astmevaheldus). Strong and weak grades alternate across the paradigm: ${tuba.lemma} : ${tuba.value}, ${sepp.lemma} : ${sepp.value}, ${loen.lemma} : ${loen.value}. When a stem changes, name the alternation.
3. Verb government (rektsioon). Which case a verb demands: ${aitan.lemma} takes the partitive (${aitan.value} ${sind.value}), ${helistan.lemma} the allative (${helistan.value} ${sulle}), ${meeldin.lemma} an allative experiencer (${mulle} ${meeldib} ${see}). These cannot be worked out from English.

FORMAT
Keep answers under about 200 words unless asked for more. Use short paragraphs. When you introduce Estonian vocabulary worth saving, list it at the very end in exactly this form, one per line, nothing else on the line:

VOCAB: estonian word | english translation

Only include words you are confident about.`;
}
