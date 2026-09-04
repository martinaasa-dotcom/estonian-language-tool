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
 * pronoun's short oblique form, a particle. The pronoun units harvest `mina`
 * and `see` with their principal parts now, so `see` could be checked against
 * a `Form` row; `mulle` and `sulle` are the short allatives, which no rule
 * over the genitive reaches and the seed does not store, and `läbi` is a
 * particle with no forms at all. They stay listed together because the check
 * that names them is one list.
 *
 * They stay hand-verified rather than machine-checked, which is a real gap,
 * not a hidden one: `scripts/test-invariants.ts` names this exact list, so a
 * fifth word cannot join it without the check being touched too, and anyone
 * reading either file sees the boundary as it actually is.
 */
export const CLOSED_CLASS_EXAMPLES = ["mulle", "sulle", "see", "läbi"] as const;
const [mulle, sulle, see, labi] = CLOSED_CLASS_EXAMPLES;

export function buildSystemPrompt(level: string): string {
  /*
    THE ILLATIVE IS NOT DESCRIBED AS REGULAR, BECAUSE IT IS NOT.

    This handed Anu "sisseütlev: kuhu? (genitive stem + -sse)" alongside the
    ten that really are regular, which is the same false rule the case table
    itself used to apply: `tuba` goes to `tuppa`, not `toasse`. A tutor told
    the ending is predictable will predict it, and `lib/tutor/verify.ts` only
    withholds a form she was not given rather than one she reasoned her way to
    inside an explanation.

    So the one irregular case says so, and says where the real form comes from.
    The forms she is handed for the word in question are the answer, and the
    honest thing when she has not been handed one is to say she is not sure.
  */
  const caseTable = CASES.map((c) => {
    const ending = c.suffix ? ` (genitive stem + -${c.suffix})` : " (principal part, memorised)";
    const irregular = c.key === "ILLATIVE"
      ? ". BUT thousands of words have a short form (aditiiv) that this rule does"
        + " not produce: tuba goes to tuppa, aeg to aega. Use the form you were"
        + " given for the word being asked about, and say you are not sure rather"
        + " than applying -sse to a word whose short form you were not given."
      : "";
    return `${c.et} (${c.en}): ${c.question}${ending}${irregular}`;
  }).join("\n");

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

Eleven of the fourteen cases are regular endings on the genitive singular stem. The nominative, genitive and partitive are unpredictable and must be memorised, plus the partitive plural. The sisseütlev is the one of the eleven with a second form the rule cannot give: the short one, which is what people say (tuppa, not toasse), and a place name in -maa takes the outside cases rather than the inside ones (Saksamaal, not Saksamaas).

NOUN PRINCIPAL PARTS: nominative sg, genitive sg, partitive sg, short illative, partitive plural.
VERB PRINCIPAL PARTS: ma-infinitive, da-infinitive, present 1sg, past 1sg, tud-participle. The present stem cannot be read off the -ma form: some verbs weaken it (${loen.lemma} → ${loen.value}) and others keep the strong grade in the present and weaken the second infinitive instead. Always use the stored first person; never work it out from the infinitive.

THE THINGS THIS LEARNER WILL GET WRONG
1. Object case. Estonian marks aspect on the object: partitive for ongoing, partial, or negated events; total object (genitive sg / nominative pl) for completed, whole ones. Negation is always partitive. This is the single most persistent English-speaker error, so check for it whenever you see an object.
2. Consonant gradation (astmevaheldus). Strong and weak grades alternate across a word's forms: ${tuba.lemma} : ${tuba.value}, ${sepp.lemma} : ${sepp.value}, ${loen.lemma} : ${loen.value}. When a stem changes, name the alternation.
3. Verb government (rektsioon). Which case a verb demands: ${aitan.lemma} takes the partitive (${aitan.value} ${sind.value}), ${helistan.lemma} the allative (${helistan.value} ${sulle}), ${meeldin.lemma} an allative experiencer (${mulle} ${meeldib} ${see}). These cannot be worked out from English.

FORMAT
Keep answers under about 200 words unless asked for more. Use short paragraphs. When you introduce Estonian vocabulary worth saving, list it at the very end in exactly this form, one per line, nothing else on the line:

VOCAB: estonian word | english translation

Only include words you are confident about.`;
}

/**
 * What is true of this learner today, in a block sent after the static prompt.
 *
 * ANU USED TO KNOW ONE THING ABOUT THE PERSON SHE WAS TEACHING, AND IT WAS
 * WRONG. The chat posted `level: "B1"` for everybody, typed into the client,
 * so a beginner on their first evening and a C1 speaker were both taught as
 * B1, and nothing the app had measured reached her: not the level check, not
 * the six months of case answers on the Progress page, not which unit was open.
 * A teacher who has been looking is what "warm is attention" means, and she
 * had not been given anything to look at.
 *
 * Three facts, and the wording keeps them from becoming a tic. The weakest
 * case is offered as something to use when a question touches it, not to
 * raise in every answer, because a learner who hears about their partitive
 * every time they ask about the weather stops asking. Everything here is
 * derived on the server from the learner's own log (`lib/progress/tutorContext.ts`);
 * nothing the client sends reaches this block.
 */
export interface LearnerNote {
  level: string;
  /** A case key from `CASES`, with how often it was answered right and out of how many. */
  weakestCase: { grammCase: string; accuracy: number; total: number } | null;
  /** The course unit currently open: its Estonian title, the English under it, and its band. */
  unit: { title: string; subtitle: string; level: string } | null;
  /**
   * How the level is known. A paper measured it, with the skills it found, or
   * the learner ticked it themselves. A tutor told "B1" and nothing else
   * treats a guess and a measurement alike, and pitches listening at a level
   * a check has already said the learner has not reached.
   */
  standing?: {
    source: "measured" | "estimated";
    skills?: Partial<Record<"reading" | "listening" | "writing", string>>;
  };
  /**
   * What Estonian the learner already lives in, as a clause after "they":
   * "live in Estonia and have Estonian at home". From the reasons table, the
   * same phrase the plan prints. Null when their week holds none.
   */
  situation?: string | null;
}

export function learnerNote(note: LearnerNote): string {
  const lines: string[] = [];
  if (note.standing) {
    const skills = Object.entries(note.standing.skills ?? {}).filter(([, l]) => l);
    if (note.standing.source === "measured") {
      const detail = skills.length > 0 ? ` (${skills.map(([k, l]) => `${k} ${l}`).join(", ")})` : "";
      const uneven = new Set(skills.map(([, l]) => l)).size > 1;
      lines.push(
        `- That level was measured by the level check${detail}.${uneven ? " The skills are uneven, so pitch what they read and what they hear to the skill it lands on rather than to the average." : ""}`,
      );
    } else {
      lines.push("- That level is their own estimate rather than a measurement, so check it against what they write rather than assuming it.");
    }
  }
  if (note.situation) {
    lines.push(
      `- They ${note.situation}, so real Estonian is within their reach every day. Where it fits, point them at using it rather than at more cards.`,
    );
  }
  const weak = note.weakestCase && CASES.find((c) => c.key === note.weakestCase?.grammCase);
  if (weak && note.weakestCase) {
    lines.push(
      `- Over the last six months their weakest case is the ${weak.et} (${weak.en}), right ${note.weakestCase.accuracy}% of ${note.weakestCase.total} times. When a question touches it, say so and build the example around it. Do not raise it unprompted in every answer.`,
    );
  }
  if (note.unit) {
    lines.push(
      `- They are working through the unit "${note.unit.title}" (${note.unit.subtitle}) at ${note.unit.level}. Prefer everyday words from around that level in examples.`,
    );
  }
  if (lines.length === 0) return "";
  return `ABOUT THIS LEARNER\n- Their level is ${note.level}.\n${lines.join("\n")}`;
}
