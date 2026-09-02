import { CASES } from "./cases";

/**
 * What each grammar point is *called*, in the language it is taught in.
 *
 * Estonian is not taught anywhere by its Latin case names or by the English
 * names of tenses it does not have. A course in Tallinn, a school textbook and
 * the state examination all name a case by its Estonian name and, more often,
 * by the question it answers: nobody says "the inessive", they ask "kus?".
 * The verb system is named the same way — `olevik` and `lihtminevik`, the two
 * tenses Estonian actually inflects for, and then `kõneviis`, `tegumood` and
 * `pööre` as separate axes rather than a row of English-shaped tenses.
 *
 * This app is written in English for English speakers, so the English name is
 * kept: somebody reading an English reference grammar needs it, and somebody
 * taking a course needs the other one. What changes is which one leads. The
 * Estonian term and the question are the identity; the English name is a
 * cross-reference, and it is labelled as one.
 *
 * Two things hold this file to being terminology rather than a back door into
 * ADR-005:
 *
 * 1. **A term names a category, never a word.** No example, no inflected form,
 *    no sentence. `terms.test.ts` holds it to a short name shaped like one, the
 *    same latitude `cases.ts` already takes for the case names and question
 *    words it has always carried.
 * 2. **The list is deliberately partial.** A point is here only where there is
 *    a settled term a course actually uses. Where there is not, the point keeps
 *    its English description rather than being given an invented Estonian name,
 *    because a term nobody says is worse than an English one everybody
 *    understands. `grammarTerm()` returning `undefined` is the honest answer
 *    and every caller renders it as one.
 */
export interface GrammarTerm {
  /** The Estonian term, as a course says it. */
  readonly et: string;
  /** The question it is taught by, where it is taught by one. */
  readonly question?: string;
  /** The English or Latin name, for anyone reading an English reference. */
  readonly alsoCalled?: string;
}

/**
 * The verb system, named the way Estonian names it.
 *
 * Estonian inflects for two tenses. The other two are built with the auxiliary
 * and a participle, and mood and voice are separate axes crossing all of them,
 * which is why an English-shaped list of six "tenses" misdescribes the system
 * before a learner has conjugated anything. These headings are what a course
 * puts on the board.
 */
export const VERB_AXES: readonly { et: string; en: string; blurb: string }[] = [
  {
    et: "aeg",
    en: "tense",
    blurb:
      "Two that the verb itself carries, and two more built with the auxiliary and a participle. There is no future among them.",
  },
  {
    et: "kõneviis",
    en: "mood",
    blurb:
      "Whether you are stating, supposing, instructing, or passing on something you did not witness. Four in a school grammar, each with its own endings, and a fifth that reference grammars split off from the imperative.",
  },
  {
    et: "tegumood",
    en: "voice",
    blurb:
      "Whether the sentence names who did it. Not the English passive, and worth keeping apart from it.",
  },
  {
    et: "pööre",
    en: "person",
    blurb: "Six persons, marked on the verb, so I and you can be dropped in speech. He, she and they stay.",
  },
];

/**
 * Keyed by the topic ids in `grammar.ts`. Absent where no settled term exists.
 */
const TOPIC_TERMS: Readonly<Record<string, GrammarTerm>> = {
  // ── The verb ─────────────────────────────────────────────────────────────
  olema: { et: "olema-verb", question: "kellel on?" },
  "present-tense": { et: "olevik", alsoCalled: "the present tense" },
  negation: { et: "eitus", alsoCalled: "negation" },
  imperfect: { et: "lihtminevik", alsoCalled: "the imperfect, or simple past" },
  perfect: { et: "täisminevik", alsoCalled: "the perfect" },
  pluperfect: { et: "enneminevik", alsoCalled: "the pluperfect" },
  future: { et: "tulevik", alsoCalled: "the future" },
  conditional: { et: "tingiv kõneviis", alsoCalled: "the conditional" },
  imperative: { et: "käskiv kõneviis", alsoCalled: "the imperative" },
  quotative: { et: "kaudne kõneviis", alsoCalled: "the quotative, or oblique mood" },
  impersonal: { et: "umbisikuline tegumood", alsoCalled: "the impersonal" },
  participles: { et: "kesksõnad", alsoCalled: "participles" },
  "past-participle": { et: "mineviku kesksõna", alsoCalled: "the past participle" },
  converb: { et: "des-vorm", alsoCalled: "the converb, or gerund" },
  infinitives: { et: "tegevusnimed", alsoCalled: "the infinitives" },
  "particle-verbs": { et: "ühendverbid", alsoCalled: "particle verbs" },
  aspect: { et: "aspekt", alsoCalled: "aspect" },

  // ── The noun phrase ──────────────────────────────────────────────────────
  /*
    NO QUESTION HERE ON PURPOSE. This said `keda? mida?`, which is the
    partitive object alone, over a page whose first line is that a whole
    object takes the genitive or the nominative. School grammar lists six
    question words for the object precisely because it can stand in three
    cases, and six do not fit the slot. A point that is a choice between
    cases is not taught by one question word, so the topic teaches it.
  */
  object: { et: "sihitis", alsoCalled: "the object" },
  "adjective-agreement": { et: "ühildumine", alsoCalled: "agreement" },
  comparative: { et: "keskvõrre", alsoCalled: "the comparative" },
  superlative: { et: "ülivõrre", alsoCalled: "the superlative" },
  numerals: { et: "arvsõnad", alsoCalled: "numerals" },
  gradation: { et: "astmevaheldus", alsoCalled: "consonant gradation" },
  derivation: { et: "sõnamoodustus", alsoCalled: "derivation" },

  // ── The sentence ─────────────────────────────────────────────────────────
  government: { et: "rektsioon", alsoCalled: "verb government" },
  "word-order": { et: "sõnajärg", alsoCalled: "word order" },
  subordination: { et: "kõrvallaused", alsoCalled: "subordinate clauses" },
  punctuation: { et: "kirjavahemärgid", alsoCalled: "punctuation" },

  // ── Register and use ─────────────────────────────────────────────────────
  "time-expressions": { et: "ajamäärused", alsoCalled: "time adverbials" },
};

/**
 * The Estonian name for each group in `TOPIC_GROUPS`. Separate from the group
 * itself for the same reason every other term is: `grammar.ts` holds no
 * Estonian, and its test fails if it starts to.
 */
const GROUP_TERMS: Readonly<Record<string, string>> = {
  verb: "pöördsõna",
  "noun-phrase": "käändsõna",
  sentence: "lause",
  use: "keelekasutus",
};

export function grammarGroupTerm(id: string): string | undefined {
  return GROUP_TERMS[id];
}

/**
 * The term for any grammar point the course can name, case or not.
 *
 * One door, because a unit names its grammar in one flat list and a heading
 * cannot care whether it is looking at a case or a mood.
 */
export function grammarTerm(id: string): GrammarTerm | undefined {
  const topic = TOPIC_TERMS[id];
  if (topic) return topic;

  const spec = CASES.find((c) => c.key.toLowerCase() === id.toLowerCase());
  if (spec) return { et: spec.et, question: spec.question, alsoCalled: `the ${spec.en.toLowerCase()}` };

  return undefined;
}

/** Every topic id that carries a term, for the tests and the reference index. */
export const TERMED_TOPIC_IDS: readonly string[] = Object.keys(TOPIC_TERMS);
