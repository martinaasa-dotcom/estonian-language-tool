import { CASES, type CaseSpec } from "./cases";
import { grammarTerm } from "./terms";
import type { CaseKey } from "./types";

/**
 * The reference layer: what each case is *for*, in English.
 *
 * Every drill in the app can tell a learner they got `toas` wrong. None of them
 * can tell them why the inessive is the case that answers "kus?" and why
 * Estonian uses it where English would reach for a preposition. That gap is
 * where people give up, and a tutor conversation is a poor substitute for a
 * page you can re-read on the bus.
 *
 * Two rules hold this file together:
 *
 * 1. **Nothing here is Estonian.** Not an example, not a form, not a phrase.
 *    The case names and the question words already live in `cases.ts`, taken
 *    from the domain model; everything added here is English prose about
 *    Estonian, which is the one thing the app is allowed to author (ADR-005).
 *    `grammar.test.ts` keeps a tripwire on it — a regex cannot tell prose from
 *    a smuggled form, but Estonian of any length reaches for its own letters.
 * 2. **It is framework-free data.** The page that renders it pairs each note
 *    with real forms out of the learner's own dictionary rows, so the examples
 *    on screen are always attested and always words they are actually studying.
 */
export interface CaseNote {
  readonly key: CaseKey;
  /** One line: what this case does, in the plainest English available. */
  readonly summary: string;
  /** Where it turns up. Each entry is a use, not an example sentence. */
  readonly uses: readonly string[];
  /** The mistake an English speaker actually makes with this case. */
  readonly watchOut: string;
  /** How an English speaker can feel their way to it. Omitted where honest. */
  readonly englishHook?: string;
}

/**
 * Ordered as `CASES` is — the traditional order, which is the order every
 * Estonian classroom and textbook recites them in. Deviating from it to put
 * "useful" cases first would help nobody who is also taking a course.
 */
export const CASE_NOTES: readonly CaseNote[] = [
  {
    key: "NOMINATIVE",
    summary: "The dictionary form. The subject of a sentence, and what you point at.",
    uses: [
      "The subject of a verb",
      "The form you look a word up under",
      "What a whole, countable thing looks like as an object",
    ],
    watchOut:
      "A whole object takes the nominative or the genitive, never the partitive. The choice says whether the action finished, not how polite you are being.",
    englishHook: "Closest to plain English word order: the thing doing the verb.",
  },
  {
    key: "GENITIVE",
    summary: "Possession, and the stem eleven other cases are built on.",
    uses: [
      "Possession, the way English uses ’s or “of”",
      "A completed whole object",
      "Before nearly every postposition, and after a few prepositions",
      "The stem every case below this one attaches to",
    ],
    watchOut:
      "This is the form worth memorising first. Get the genitive wrong and eleven cases are wrong with it, because they are all built from it.",
    englishHook: "“of the book”, “the book’s cover”.",
  },
  {
    key: "PARTITIVE",
    summary: "Part of something, an unfinished action, or a quantity.",
    uses: [
      "Some of a thing rather than all of it",
      "An action still going on, or one that never reached its end",
      "After numbers above one, and after words of quantity",
      "The object of many verbs that simply demand it",
    ],
    watchOut:
      "The hardest case for English speakers, because English marks none of this. The partitive is not a politeness or a plural, it is aspect and quantity, and it has to be stored per word because it is not predictable.",
    englishHook: "“some water”, “I was reading a book” (and had not finished it).",
  },
  {
    key: "ILLATIVE",
    summary: "Movement into something.",
    uses: ["Motion into a place or a container", "Entering a state or a period of time"],
    watchOut:
      "Many common words also have a short illative, which is the form a native speaker actually says. It is stored separately, not derived, and the dictionary entry shows it when it exists.",
    englishHook: "into, into a room, and into a state, a language or a decade.",
  },
  {
    key: "INESSIVE",
    summary: "Being inside something.",
    uses: ["Position inside a place", "Being in a state, a language, or a period of time"],
    watchOut:
      "Estonian draws the inside/outside line where English does not. Cities and rooms take the inside cases; some islands and open places take the outside ones, and the choice is per word rather than per rule.",
    englishHook: "in, in the house, in March, in a good mood.",
  },
  {
    key: "ELATIVE",
    summary: "Movement out of something.",
    uses: [
      "Motion out of a place",
      "The material something is made of",
      "The topic a text or a conversation is about",
    ],
    watchOut:
      "This is also the case for “about”, talking about a subject uses the same ending as coming out of a building.",
    englishHook: "out of, and about, out of the house, or a book about history.",
  },
  {
    key: "ALLATIVE",
    summary: "Movement onto something, or giving to someone.",
    uses: ["Motion onto a surface", "The person something is given, said or sent to"],
    watchOut:
      "English uses “to” for both a destination and a recipient, so this case and the illative both look like “to” from the English side. Estonian is asking whether you end up inside or on top.",
    englishHook: "onto, and to, onto the table, or to the person you gave it to.",
  },
  {
    key: "ADESSIVE",
    summary: "Being on something, and how Estonian says “have”.",
    uses: [
      "Position on a surface",
      "Possession: the owner goes in this case and the thing owned is the subject",
      "A time when something happens",
    ],
    watchOut:
      "There is no verb “to have” in Estonian. Ownership is built with this case plus “is”, which means the owner is not the subject of the sentence, the possession is.",
    englishHook: "on, at, and “I have”, rebuilt as “at me there is”.",
  },
  {
    key: "ABLATIVE",
    summary: "Movement off something, or taking from someone.",
    uses: ["Motion off a surface", "The person something is taken, bought or asked from"],
    watchOut:
      "Pairs with the adessive the way the elative pairs with the inessive: off a surface, not out of a container.",
    englishHook: "off, and from, off the table, or from the person you bought it from.",
  },
  {
    key: "TRANSLATIVE",
    summary: "Becoming something, or the purpose of something.",
    uses: [
      "Turning into a state or a role",
      "The job or purpose a thing is for",
      "A deadline: by when something is done",
    ],
    watchOut:
      "Used far more than English “into” suggests. Becoming a teacher, turning cold and being ready by Friday all take this one ending.",
    englishHook: "into, as, for, by (a time)",
  },
  {
    key: "TERMINATIVE",
    summary: "Up to a limit, in space or in time.",
    uses: ["As far as a place", "Until a moment in time", "Up to an amount"],
    watchOut:
      "Frequently paired with a preposition in speech, but the ending alone already carries “as far as”.",
    englishHook: "up to, until, as far as the church, or right up until Friday.",
  },
  {
    key: "ESSIVE",
    summary: "In the role of something, usually temporarily.",
    uses: ["Acting as, or working as, something", "A temporary state or capacity"],
    watchOut:
      "Answers “as what?” rather than “into what?”, the translative gets you into the role, the essive keeps you there.",
    englishHook: "as, working as a teacher, for as long as that lasts.",
  },
  {
    key: "ABESSIVE",
    summary: "Without something, the opposite of the comitative below it.",
    uses: ["The absence of a thing", "Doing something without a tool, a person or a permission"],
    watchOut:
      "Rare on its own in speech, where it usually comes with the preposition meaning without in front of it, saying the same thing twice. It turns up in writing and on exams, which is exactly why it is worth recognising rather than producing.",
    englishHook: "without, without a coat, without asking.",
  },
  {
    key: "COMITATIVE",
    summary: "With something, company, and the tool you did it with.",
    uses: [
      "Together with someone",
      "The instrument or means used",
      "How you travelled",
    ],
    watchOut:
      "Covers both English “with a friend” and “with a knife”, which are separate constructions in many languages. It is also the friendliest ending in the language to spot: it is the last case in the table and it never changes shape.",
    englishHook: "with, by (a means of transport)",
  },
];

export interface CaseReference extends CaseNote {
  readonly spec: CaseSpec;
}

/** The note and the grammatical spec together, which is what a page wants. */
export function caseReference(key: string): CaseReference | undefined {
  const note = CASE_NOTES.find((n) => n.key === key);
  const spec = CASES.find((c) => c.key === key);
  if (!note || !spec) return undefined;
  return { ...note, spec };
}

export function allCaseReferences(): CaseReference[] {
  // Driven by CASES, not by CASE_NOTES, so the traditional order is the one
  // source of truth for it and a missing note is a build-time type error
  // rather than a silently reordered page.
  return CASES.map((spec) => {
    const note = CASE_NOTES.find((n) => n.key === spec.key)!;
    return { ...note, spec };
  });
}

/**
 * The cases that share an ending pattern, as a learner meets them: the three
 * "inside" cases and the three "outside" ones. Estonian teaching calls these
 * the sise- and väliskohakäänded; the app names them in English because the
 * point of this page is the English side.
 */
export const CASE_GROUPS: readonly { title: string; blurb: string; keys: readonly CaseKey[] }[] = [
  {
    title: "The three principal parts",
    blurb:
      "Unpredictable, so they are memorised and stored rather than worked out. Every other case is built on the second of them.",
    keys: ["NOMINATIVE", "GENITIVE", "PARTITIVE"],
  },
  {
    title: "Inside: into, in, out of",
    blurb: "Containers, buildings, languages and states. Where English would say in.",
    keys: ["ILLATIVE", "INESSIVE", "ELATIVE"],
  },
  {
    title: "Outside: onto, on, off",
    blurb: "Surfaces, people and times, and the way Estonian says that someone has something.",
    keys: ["ALLATIVE", "ADESSIVE", "ABLATIVE"],
  },
  {
    title: "The rest",
    blurb: "Becoming, until, as, without, with. Five endings that each do one job.",
    keys: ["TRANSLATIVE", "TERMINATIVE", "ESSIVE", "ABESSIVE", "COMITATIVE"],
  },
];

/**
 * The grammar the course teaches beyond the cases.
 *
 * Every unit in the syllabus names the grammar it carries, and before this those
 * names pointed at nothing: a B2 unit could say it taught the impersonal and the
 * app had no page that said what the impersonal was. A course that can only
 * mark an answer wrong is a test with a syllabus attached.
 *
 * The same two rules as the case notes above, with one addition. `marker` names
 * an ending, because the quotative cannot be explained in English without
 * naming the ending that makes it, and a learner who has met the word "quotative"
 * has not met the thing. A marker is grammatical terminology, not an example: it
 * is never a word, never drilled as an answer, and the page shows real forms out
 * of the dictionary beside it. `grammar.test.ts` holds it to that, so the field
 * cannot quietly become somewhere to write Estonian.
 */
export interface TopicNote {
  readonly id: string;
  readonly title: string;
  /** One line: what it does, in the plainest English available. */
  readonly summary: string;
  /** The ending that carries it, where one does. Terminology, not an example. */
  readonly marker?: string;
  /** What it is for. Each entry is a use, not an example sentence. */
  readonly points: readonly string[];
  /** The mistake an English speaker actually makes. */
  readonly watchOut: string;
}

export const TOPIC_NOTES: readonly TopicNote[] = [
  // ── The verb, tense and mood ─────────────────────────────────────────────
  {
    id: "olema",
    title: "The verb to be, and having things",
    summary: "Estonian has no verb for to have. Possession is said with a location case instead.",
    points: [
      "The one verb you cannot avoid, and one of the few genuinely irregular ones",
      "Having something is expressed as it being at you, using the adessive",
      "The same pattern carries feelings, needs and obligations",
    ],
    watchOut:
      "There is no verb to have to reach for, so a sentence built on the English shape will not translate word for word. The owner goes into a case and the thing owned stays in the nominative, or in the partitive when it is a quantity or the sentence is negated.",
  },
  {
    id: "present-tense",
    title: "Talking about now",
    summary: "One form doing the work English splits between I write and I am writing, and the future as well.",
    points: [
      "Personal endings for the six persons, attached to a stem",
      "Covers both the simple and the continuous English present",
      "Also does duty for the future, since Estonian has no future tense",
    ],
    watchOut:
      "The present stem is not always readable from the dictionary form, which is why the first person present is one of the parts stored for every verb rather than worked out.",
  },
  {
    id: "negation",
    title: "Negation",
    summary: "A single negating word plus one unchanging verb form, whoever is doing the not-doing.",
    points: [
      "The verb loses its personal ending entirely when negated",
      "One negation word covers every person, unlike English do not and does not",
      "The past is negated differently from the present",
    ],
    watchOut:
      "The temptation is to negate the conjugated form. The verb goes back to a bare stem instead, so the person is carried only by the pronoun.",
  },
  {
    id: "imperfect",
    title: "Saying what happened",
    summary: "The tense for anything that happened and finished, and the backbone of any story.",
    points: [
      "Formed from a past stem that is often unpredictable",
      "Used for completed events, however recent",
      "Distinct from the perfect, which is about present relevance",
    ],
    watchOut:
      "The past stem is not derivable from the present one, which is why the first person past is stored as a principal part. Guessing it is the single most common source of invented verbs.",
  },
  {
    id: "perfect",
    title: "Done, and it still matters",
    summary: "The auxiliary plus a participle, for a past whose result is the point rather than the event.",
    marker: "-nud",
    points: [
      "Built from the verb to be plus the past active participle",
      "Used where the result rather than the event is the point",
      "The participle does not change for person",
    ],
    watchOut:
      "Estonian builds this on to be, not on to have, so the English auxiliary is the wrong model. The choice between this and the simple past is looser than in English.",
  },
  {
    id: "pluperfect",
    title: "Done before something else",
    summary: "The same participle, with the auxiliary itself in the past, for an event that came before another past one.",
    marker: "-nud",
    points: [
      "For an event completed before another past event",
      "Common in narrative and in reported speech",
      "Uses exactly the participle the perfect uses",
    ],
    watchOut:
      "Only the auxiliary moves into the past. Putting the participle into a past form as well is the usual overcorrection.",
  },
  {
    id: "future",
    title: "Talking about the future",
    summary: "There is no future tense. The present plus a time word does the whole job.",
    points: [
      "A time expression is what marks a sentence as future",
      "Verbs of intending and planning carry the rest",
      "A perfective particle can imply completion to come",
    ],
    watchOut:
      "Looking for a future tense to conjugate is looking for something that does not exist. The work is done by vocabulary and context rather than by morphology.",
  },
  {
    id: "conditional",
    title: "Would, could, should",
    summary: "One suffix that makes a sentence hypothetical, or makes a request something a stranger will not find blunt.",
    marker: "-ksi-",
    points: [
      "Hypothetical situations and their consequences",
      "Softening a request into something a stranger will not find blunt",
      "Giving advice without issuing an instruction",
    ],
    watchOut:
      "This is the politeness register, not just the grammar of hypotheticals. An imperative that would be normal between friends can land badly with a stranger, and the conditional is the usual repair.",
  },
  {
    id: "imperative",
    title: "Telling somebody to do it",
    summary: "Instructions and invitations, with a separate form for one person and for several.",
    points: [
      "Distinct singular and plural forms, unlike English",
      "The plural doubles as the polite form for one person",
      "Negated with its own dedicated word",
    ],
    watchOut:
      "Using the singular imperative on somebody you have just met reads as an order. The plural is the safe default with a stranger.",
  },
  {
    id: "quotative",
    title: "Passing on what you heard",
    summary: "A whole mood for information you are passing on rather than vouching for.",
    marker: "-vat",
    points: [
      "Reported speech, rumour and hearsay",
      "Common in news writing, where the source matters",
      "Can carry scepticism, depending on how it is delivered",
    ],
    watchOut:
      "English needs a word like apparently or a whole clause. Estonian does it with a verb ending, so it is easy to read straight past and take a rumour as a statement of fact.",
  },
  {
    id: "impersonal",
    title: "Said without naming who",
    summary: "An action reported with nobody named as doing it. Not the passive, and worth keeping separate from it.",
    marker: "-takse",
    points: [
      "Notices, instructions, official prose and news",
      "Says an action happened without naming or implying an agent",
      "Has its own forms across the tenses",
    ],
    watchOut:
      "The English passive lets you add by whom. The impersonal does not, because it is not demoting an agent, it is declining to have one. Translating it as a passive and then looking for the doer is the standard confusion.",
  },
  {
    id: "participles",
    title: "Participles",
    summary: "Verb forms that behave like adjectives, and the building blocks of the compound tenses.",
    marker: "-nud",
    points: [
      "Active and impersonal, present and past, four in all",
      "Used to describe a noun the way an adjective would",
      "Carry the perfect and pluperfect with the auxiliary",
    ],
    watchOut:
      "These are everywhere in written Estonian and rare in beginner courses, which is why intermediate reading suddenly feels much harder than intermediate speaking.",
  },
  {
    id: "past-participle",
    title: "The past participle",
    summary: "The form the perfect tenses are built from, and an adjective in its own right.",
    marker: "-nud",
    points: [
      "Combines with the auxiliary for have done and had done",
      "Describes a noun as having done something",
      "Has an impersonal counterpart for things done to something",
    ],
    watchOut:
      "It never changes shape: not as part of a tense, and not in front of a noun either, where it is one of the few words in the language that stays the same whatever case the noun is in. The present participles do decline, which is where the two get mixed up.",
  },
  {
    id: "converb",
    title: "The des-form",
    summary: "While doing: one clause folded into another without a conjunction.",
    marker: "-des",
    points: [
      "Two simultaneous actions in one sentence",
      "Strongly preferred in writing over two joined clauses",
      "Its subject is understood to be the main clause's",
    ],
    watchOut:
      "Because the subject is implied rather than stated, giving the two halves different subjects produces a sentence that is grammatical and means something you did not intend.",
  },
  {
    id: "infinitives",
    title: "The two infinitives",
    summary: "Estonian has two, and which one a verb takes is a fact about that verb.",
    marker: "-ma",
    points: [
      "One is the dictionary form and follows verbs of starting and going",
      "The other follows verbs of wanting, being able and having to",
      "Both are stored, because neither is derivable from the other",
    ],
    watchOut:
      "English has one infinitive, so there is no intuition to fall back on. The pairing has to be learned with the verb, which is why both are principal parts.",
  },
  {
    id: "particle-verbs",
    title: "Verbs with a particle",
    summary: "A small word in front of a verb can change its meaning completely.",
    points: [
      "The particle usually adds completion or direction",
      "Often the difference between doing and finishing something",
      "The particle moves around the sentence rather than staying put",
    ],
    watchOut:
      "These are Estonian's phrasal verbs, and like English ones the meaning is frequently not the sum of the parts. Looking up only the verb gives the wrong answer.",
  },
  {
    id: "aspect",
    title: "Finished or not",
    summary: "Whether an action completed is carried by the object's case and by particles, not by tense.",
    points: [
      "A completed action takes a whole object",
      "An ongoing or partial one takes a partitive object",
      "Particles reinforce completion",
    ],
    watchOut:
      "English marks this with tense and Estonian marks it with case, so the two systems do not line up anywhere. This is the single hardest transfer for an English speaker.",
  },

  // ── The noun phrase ──────────────────────────────────────────────────────
  {
    id: "object",
    title: "The object: whole or partial",
    summary: "The choice between a total and a partial object, and the hardest rule in the language.",
    points: [
      "A completed action on a whole thing takes the genitive or nominative",
      "An unfinished action, or part of a thing, takes the partitive",
      "Negation always takes the partitive, whatever else is true",
    ],
    watchOut:
      "This is not about politeness or emphasis and it is not optional. It is the main thing that marks out a B1 speaker from an A2 one, and getting it wrong changes what the sentence means rather than just how it sounds.",
  },
  {
    id: "adjective-agreement",
    title: "Adjectives agree",
    summary: "An adjective takes the case and number of its noun through the first ten cases, and stops at the genitive for the last four.",
    points: [
      "Agreement in case and in number, so an adjective declines exactly like a noun",
      "For the last four cases in the table, up to, as, without and with, the adjective stays in the genitive and only the noun takes the ending",
      "A few borrowed adjectives do not decline at all",
    ],
    watchOut:
      "Every adjective learned is therefore worth a whole set of forms, not one word. Leaving an adjective in the dictionary form beside a declined noun is the commonest beginner tell.",
  },
  {
    id: "comparative",
    title: "Comparing things",
    summary: "One ending makes an adjective comparative, built on the stem the cases use.",
    marker: "-m",
    points: [
      "Formed from the genitive stem, like almost everything else",
      "The thing compared against either follows the word for than, or goes into the elative with no such word at all",
      "A handful of common adjectives are irregular",
    ],
    watchOut:
      "Both shapes are common and both are correct: the word for than with the plain form after it, or no such word and the other thing in the elative. The mistake is mixing them, keeping the word for than and putting the other thing in the elative as well.",
  },
  {
    id: "superlative",
    title: "The most",
    summary: "Two ways of saying it, one analytic and one a single ending.",
    points: [
      "A helper word plus the comparative, which always works",
      "A single-word form, shorter and more literary",
      "Both are common and neither is wrong",
    ],
    watchOut:
      "The single-word form is not derivable for every adjective, so the two-word version is the safe one when you are unsure.",
  },
  {
    id: "numerals",
    title: "Numbers and what follows them",
    summary: "Counting looks simple until you notice what case the counted thing goes into.",
    points: [
      "The counted noun after any number from two upwards is in the partitive singular",
      "Numerals decline like nouns when the phrase itself is in a case",
      "Ordinals are formed regularly and decline too",
    ],
    watchOut:
      "The counted noun stays singular after a number, which reads as wrong to an English speaker for a long time. It is the partitive singular, not a plural.",
  },
  {
    id: "gradation",
    title: "Gradation",
    summary: "The stem itself changes between forms, and only some of that change is written down.",
    points: [
      "The qualitative kind shows in spelling and can be detected",
      "The quantitative kind is a change in length that spelling does not record",
      "Which words gradate is a property of the word",
    ],
    watchOut:
      "Because the app can only see what is written, it reports the qualitative kind and says nothing about the quantitative. A word can alternate audibly while looking identical on the page.",
  },
  {
    id: "derivation",
    title: "Building words from words",
    summary: "A handful of suffixes turn verbs into nouns, nouns into adjectives and back.",
    marker: "-mine",
    points: [
      "An action noun from any verb, entirely regular",
      "A quality noun from an adjective",
      "Adjectives meaning like something, and meaning without it",
    ],
    watchOut:
      "Learning six suffixes makes thousands of words readable without looking them up, which is the fastest single gain available at B2. The trap is assuming a derived word means exactly the sum of its parts.",
  },
  {
    id: "nominalisation",
    title: "Nominalisation",
    summary: "Turning a clause into a noun phrase, which is what makes formal Estonian dense.",
    marker: "-mine",
    points: [
      "An action noun replaces a whole subordinate clause",
      "The doer becomes a genitive in front of it",
      "Standard in academic, legal and official writing",
    ],
    watchOut:
      "This is the biggest single difference between B2 prose and C1 prose. Overdoing it produces the bureaucratic register Estonians complain about as loudly as English speakers do.",
  },

  // ── The sentence ─────────────────────────────────────────────────────────
  {
    id: "government",
    title: "Verbs that demand a case",
    summary: "Many verbs require a particular case of whatever follows, and it is rarely the English one.",
    points: [
      "The required case is a fact about the verb, learned with it",
      "Verbs of helping, calling, liking and thinking are the usual traps",
      "The dictionary records it as the question word the verb answers",
    ],
    watchOut:
      "This is the mistake English speakers keep making for years, because the English preposition suggests the wrong case and nothing about the verb hints at the right one.",
  },
  {
    id: "word-order",
    title: "Word order",
    summary: "Freer than English, but not free: the order is what carries emphasis.",
    points: [
      "Cases mark who did what, so order is available for other work",
      "The verb tends to hold second position in a main clause",
      "New information tends to go last",
    ],
    watchOut:
      "Because almost any order is grammatical, a learner can produce sentences that are correct and subtly wrong-footed. This is a C1 skill rather than a rule to memorise.",
  },
  {
    id: "subordination",
    title: "Subordinate clauses",
    summary: "Joining clauses, and the comma rules that go with it.",
    points: [
      "A conjunction introduces the clause and a comma is compulsory",
      "Word order shifts inside a subordinate clause",
      "Chains of clauses are normal in writing and rare in speech",
    ],
    watchOut:
      "Estonian commas follow grammar rather than the pause you would make reading aloud, so English comma instincts produce errors in both directions.",
  },
  {
    id: "relative-clause",
    title: "Relative clauses",
    summary: "Which and who: the relative pronoun declines to match its job in its own clause.",
    points: [
      "Different pronouns for people and for things",
      "The pronoun takes the case its own clause needs, not the noun's",
      "Always separated by a comma",
    ],
    watchOut:
      "The case of the relative pronoun is decided inside the relative clause. Matching it to the noun it refers back to is the reliable mistake.",
  },
  {
    id: "reported-speech",
    title: "Reporting what somebody said",
    summary: "Either a subordinate clause, or the quotative mood with no clause at all.",
    points: [
      "A conjunction plus a clause, closest to the English shape",
      "Or the quotative, which needs no reporting verb",
      "Tense does not shift back the way English tense does",
    ],
    watchOut:
      "There is no sequence-of-tenses rule to apply. Backshifting the tense the way English does produces a sentence that says something different.",
  },
  {
    id: "concession",
    title: "Concession",
    summary: "Although, nevertheless, even so: granting a point before disagreeing with it.",
    points: [
      "Conjunctions that subordinate a concession",
      "Adverbs that carry it across a sentence boundary",
      "The core move of any argued essay",
    ],
    watchOut:
      "Concessive words look interchangeable in a dictionary and are not: some subordinate a clause and some only join sentences, and mixing them up breaks the punctuation.",
  },
  {
    id: "hedging",
    title: "Hedging",
    summary: "Saying something is probable rather than certain, precisely and without waffling.",
    points: [
      "Adverbs and adjectives of likelihood",
      "The conditional, which softens a claim as well as a request",
      "The quotative, which attributes a claim elsewhere",
    ],
    watchOut:
      "Academic Estonian hedges more than academic English and in different places. Translating an English hedge directly usually lands somewhere between vague and evasive.",
  },
  {
    id: "cohesion",
    title: "Holding a text together",
    summary: "The connectives and pointers that turn a pile of sentences into a text.",
    points: [
      "Ordering and adding: first, in addition, finally",
      "Contrast and consequence",
      "Referring back without simply repeating the noun",
    ],
    watchOut:
      "A text can be correct sentence by sentence and unreadable as a whole. This is what separates a C1 essay from a B2 one far more than vocabulary does.",
  },
  {
    id: "emphasis",
    title: "Emphasis",
    summary: "Where a word sits, and which particle it takes, decides what the sentence insists on.",
    points: [
      "Fronting a word to stress it",
      "Small particles that mark focus",
      "Intonation, which the written language has to encode in word order",
    ],
    watchOut:
      "English stresses with the voice and keeps the order fixed. Estonian moves the words instead, so an English-shaped sentence read aloud with English stress emphasises nothing.",
  },
  {
    id: "rhetorical-questions",
    title: "Questions that are not questions",
    summary: "Asking in order to make a point, and the particles that signal it.",
    points: [
      "A question particle marks a genuine yes or no question",
      "Its absence, with question intonation, reads differently",
      "Common in speeches and opinion writing",
    ],
    watchOut:
      "The question particle is easy to drop, and dropping it turns a plain question into something that can sound incredulous.",
  },
  {
    id: "punctuation",
    title: "Punctuation",
    summary: "Commas are grammatical here, not rhetorical, and the rules are stricter than English ones.",
    points: [
      "A comma before a subordinate clause, whether or not you would pause there",
      "Rules for lists and for parenthetical material",
      "Quotation marks are shaped differently from English ones",
    ],
    watchOut:
      "Placing commas where you would pause is an English habit that produces consistent errors, because Estonian places them where the grammar changes.",
  },

  // ── Register and use ─────────────────────────────────────────────────────
  {
    id: "politeness",
    title: "Politeness",
    summary: "Carried by mood and by which plural you use, rather than by please.",
    points: [
      "The plural as a polite singular with strangers",
      "The conditional to soften a request",
      "Directness is less rude here than an English speaker expects",
    ],
    watchOut:
      "Estonian is more direct than English and adding English-style softeners can read as insincere. The conditional does the work that a pile of qualifiers does in English.",
  },
  {
    id: "register",
    title: "Register",
    summary: "The same thing said formally, neutrally or familiarly, and knowing which the room wants.",
    points: [
      "A written standard that differs noticeably from speech",
      "Officialese, which is its own recognisable and much-mocked style",
      "Colloquial forms that are correct but wrong in an essay",
    ],
    watchOut:
      "This has nothing to do with knowing more words. A C1 speaker knows three ways to say something and picks one; a B2 speaker knows one and uses it everywhere.",
  },
  {
    id: "collocation",
    title: "Words that go together",
    summary: "Which verb goes with which noun, where no rule decides it and usage does.",
    points: [
      "Verb and noun pairings that are fixed by convention",
      "Near-synonyms that are not interchangeable in context",
      "The last thing acquired and the first thing noticed",
    ],
    watchOut:
      "Every word can be correct and the sentence still sound translated. This is what dictionaries are worst at showing, which is why attested example sentences matter more here than anywhere else.",
  },
  {
    id: "idiom",
    title: "Idiom",
    summary: "Fixed expressions whose meaning is not the sum of their words.",
    points: [
      "Sayings and proverbs still in daily use",
      "Fixed verb phrases that resist literal reading",
      "Figurative senses of ordinary words",
    ],
    watchOut:
      "Translating an idiom word by word produces something between baffling and comic. They have to be met whole, in context, which is why they sit at C1 rather than earlier.",
  },
  {
    id: "irony",
    title: "Irony",
    summary: "Meaning the opposite on purpose, and hearing it done to you.",
    points: [
      "Carried by intonation, understatement and context",
      "Understatement is the commonest form of it here",
      "Rarely flagged, so it has to be inferred",
    ],
    watchOut:
      "This is the last thing a learner hears and the easiest to get wrong in production. Attempted irony that is not recognised as irony reads as rudeness or as an error.",
  },
  {
    id: "nuance",
    title: "Nuance",
    summary: "Choosing between two words a dictionary glosses identically.",
    points: [
      "Near-synonyms separated by register, strength or connotation",
      "Shades a bilingual dictionary flattens",
      "Best settled by reading real usage rather than by definition",
    ],
    watchOut:
      "A dictionary that gives two words the same English gloss is telling you about English, not about Estonian. The difference is usually visible in what each one collocates with.",
  },
  {
    id: "variation",
    title: "Variation",
    summary: "The language is not uniform: region, age and setting all show in how people speak.",
    points: [
      "Regional dialects, some quite distant from the standard",
      "The gap between written standard and everyday speech",
      "Older and literary forms still met in reading",
    ],
    watchOut:
      "Textbook Estonian is one variety among several. Hearing a form that is not in the book does not mean somebody has made a mistake.",
  },
  {
    id: "time-expressions",
    title: "Saying when",
    summary: "Time is expressed with cases, and which case depends on the unit of time.",
    points: [
      "Days, parts of the day, seasons and years take the on-case; months take the in-case",
      "Duration is expressed differently again",
      "From and until each have their own case",
    ],
    watchOut:
      "There are no prepositions to lean on, so an English time phrase gives no clue which case to use. These are learned as patterns per unit of time.",
  },
];

/**
 * The grammar beyond the cases, grouped the way a course groups it.
 *
 * A flat list of thirty points headed by English tense names is not how anybody
 * meets this language. Estonian sorts the same material by what kind of word is
 * doing the work, and then, inside the verb, by mood, tense, voice and person as
 * four separate axes rather than as one row of English-shaped tenses. The
 * headings are English because everything in this file is; the Estonian name for
 * each group lives in `terms.ts` beside the terms themselves.
 */
export const TOPIC_GROUPS: readonly { id: string; title: string; blurb: string; ids: readonly string[] }[] = [
  {
    id: "verb",
    title: "The verb",
    blurb:
      "Two inflected tenses, two built with the auxiliary, and mood and voice crossing all four. Estonian keeps those axes apart, so this is four short systems rather than one long list of tenses.",
    ids: [
      "olema", "present-tense", "negation", "imperfect", "perfect", "pluperfect", "future",
      "conditional", "imperative", "quotative", "impersonal", "participles", "past-participle",
      "converb", "infinitives", "particle-verbs", "aspect",
    ],
  },
  {
    id: "noun-phrase",
    title: "Words that decline",
    blurb:
      "What the cases attach to, and the rules about how much of a thing a sentence is talking about.",
    ids: [
      "object", "adjective-agreement", "comparative", "superlative", "numerals", "gradation",
      "derivation", "nominalisation",
    ],
  },
  {
    id: "sentence",
    title: "The sentence",
    blurb: "How clauses join, what a verb demands of what follows it, and where the commas go.",
    ids: [
      "government", "word-order", "subordination", "relative-clause", "reported-speech",
      "concession", "hedging", "cohesion", "emphasis", "rhetorical-questions", "punctuation",
    ],
  },
  {
    id: "use",
    title: "Register and use",
    blurb: "The part that is not a rule: which of three correct ways to say something the room wants.",
    ids: [
      "politeness", "register", "collocation", "idiom", "irony", "nuance", "variation",
      "time-expressions",
    ],
  },
];

const TOPICS_BY_ID = new Map(TOPIC_NOTES.map((t) => [t.id, t]));

export function grammarTopic(id: string): TopicNote | undefined {
  return TOPICS_BY_ID.get(id);
}

/**
 * Everything the course can name as a grammar point, cases included.
 *
 * A unit names its grammar with one flat list of ids, so a case and a mood have
 * to be resolvable the same way. Cases keep their own richer note; this is the
 * shared shape a link and a heading need.
 */
export interface GrammarPoint {
  id: string;
  /** The name a course uses for it: the Estonian term wherever there is one. */
  title: string;
  /** True when `title` is Estonian, so a renderer can mark it up as such. */
  estonian: boolean;
  /** The plain English line that goes under the name. */
  english: string;
  summary: string;
  /** Where the reference page for it lives. */
  href: string;
}

export function grammarPoint(id: string): GrammarPoint | undefined {
  const topic = TOPICS_BY_ID.get(id);
  if (topic) {
    const term = grammarTerm(id);
    return {
      id,
      title: term?.et ?? topic.title,
      estonian: term !== undefined,
      english: topic.title,
      summary: topic.summary,
      href: `/grammar/topic/${id}`,
    };
  }

  const spec = CASES.find((c) => c.key.toLowerCase() === id.toLowerCase());
  const note = spec && CASE_NOTES.find((n) => n.key === spec.key);
  if (spec && note) {
    return {
      id,
      title: spec.et,
      estonian: true,
      english: spec.question,
      summary: note.summary,
      href: `/grammar/${spec.key.toLowerCase()}`,
    };
  }
  return undefined;
}
