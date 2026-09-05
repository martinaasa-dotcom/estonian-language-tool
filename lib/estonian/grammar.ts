import { CASES, type CaseSpec } from "./cases";
import { grammarTerm } from "./terms";
import type { CaseKey } from "./types";

/**
 * The reference layer: what each ending is *for*, in English.
 *
 * Every drill in the app can tell a learner they got `toas` wrong. None of them
 * can tell them that -s is the ending that means "in", and that Estonian glues
 * it on where English would reach for a preposition. That gap is where people
 * give up, and a tutor conversation is a poor substitute for a page you can
 * re-read on the bus.
 *
 * WHAT LEADS IS THE ENDING AND WHAT IT MEANS. Not the Latin name, and not the
 * Estonian one either. Nobody working out how to say "in the room" is looking
 * for the inessive; they are looking for -s. The names are on the page, because
 * a learner in a class hears `seesütlev` and a learner with an English grammar
 * reads "inessive", and both have to be able to find their way in. They are the
 * cross-reference. The ending and the plain English word are the identity.
 *
 * Three rules hold this file together:
 *
 * 1. **Nothing here is Estonian.** Not an example, not a form, not a phrase.
 *    The case names and the question words already live in `cases.ts`, taken
 *    from the domain model; everything added here is English prose about
 *    Estonian, which is the one thing the app is allowed to author (ADR-005).
 *    `grammar.test.ts` keeps a tripwire on it: a regex cannot tell prose from a
 *    smuggled form, but Estonian of any length reaches for its own letters.
 * 2. **It is framework-free data.** The page that renders it pairs each note
 *    with real forms out of the learner's own dictionary rows, so the examples
 *    on screen are always attested and always words they are actually studying.
 * 3. **One line per field.** A reference nobody finishes reading has taught
 *    nobody anything, and the version before this one ran to four paragraphs a
 *    case. `summary` is a sentence, `uses` are three short phrases, `watchOut`
 *    is the single mistake worth naming. Anything longer belongs in a lesson.
 */
export interface CaseNote {
  readonly key: CaseKey;
  /**
   * What the ending means, in the fewest English words that are true.
   *
   * This is what the screen leads with. "in", "out of", "with": the word a
   * learner is actually hunting for when they open this page mid-sentence.
   */
  readonly plain: string;
  /** One line: what this case does, in the plainest English available. */
  readonly summary: string;
  /** Where it turns up. Each entry is a use, not an example sentence. */
  readonly uses: readonly string[];
  /** The one mistake an English speaker actually makes with this case. */
  readonly watchOut: string;
  /** How an English speaker can feel their way to it. Omitted where honest. */
  readonly englishHook?: string;
}

/**
 * Ordered as `CASES` is, which is the order every Estonian classroom recites
 * them in. Deviating from it to put "useful" cases first would help nobody who
 * is also taking a course.
 */
export const CASE_NOTES: readonly CaseNote[] = [
  {
    key: "NOMINATIVE",
    plain: "the plain word",
    summary: "The word as the dictionary lists it, and whoever is doing the verb.",
    uses: [
      "Who or what is doing the verb",
      "The form you look a word up under",
      "A whole object, in the plural or after a command",
    ],
    watchOut:
      "It is also a whole object, but only in the plural or after a command. Singular whole objects take the genitive instead.",
    englishHook: "The subject, sitting exactly where English puts it.",
  },
  {
    key: "GENITIVE",
    plain: "of, and whose",
    summary: "Whose something is. Also the stem eleven other endings are glued onto.",
    uses: [
      "Saying whose something is",
      "A finished, whole object",
      "The stem every ending below needs",
    ],
    watchOut:
      "Learn this one form and eleven cases fall out of it. Get it wrong and eleven go wrong with it, which is why the app drills it so hard.",
    englishHook: "of the book, the book's cover.",
  },
  {
    key: "PARTITIVE",
    plain: "some of it",
    summary: "Part of a thing, an action that has not finished, or a count.",
    uses: [
      "Some of a thing rather than all of it",
      "An action still going on",
      "After any number above one",
    ],
    watchOut:
      "English marks none of this, so there is nothing to carry over. It is stored per word because it is not predictable.",
    englishHook: "some water. I was reading a book, and had not finished it.",
  },
  {
    key: "ILLATIVE",
    plain: "into",
    summary: "Going into something: a room, a language, a decade, a mood.",
    uses: ["Going into a place or a container", "Going into a state or a stretch of time"],
    watchOut:
      "Plenty of everyday words have a short form instead, and the short one is what people say. The dictionary shows it wherever it exists.",
    englishHook: "into.",
  },
  {
    key: "INESSIVE",
    plain: "in",
    summary: "Being inside something, and being in a month or a mood.",
    uses: ["Position inside a place", "Being in a state, a language, or a month"],
    watchOut:
      "Estonian draws the inside line where English does not. Cities and rooms are inside; some islands and open places are not, and it is per word.",
    englishHook: "in the house, in March, in a good mood.",
  },
  {
    key: "ELATIVE",
    plain: "out of",
    summary: "Coming out of something. Also what a book or a conversation is about.",
    uses: [
      "Coming out of a place",
      "What something is made of",
      "What a text or a conversation is about",
    ],
    watchOut:
      "About is the surprise. Talking about a subject takes the same ending as walking out of a building.",
    englishHook: "out of the house. A book about history.",
  },
  {
    key: "ALLATIVE",
    plain: "onto, and to a person",
    summary: "Going onto a surface, and whoever you gave it to.",
    uses: ["Going onto a surface", "The person something is given, said or sent to"],
    watchOut:
      "English says to for a place and for a person alike, so this ending and -sse both look like to from the English side. Estonian is asking: inside, or on top?",
    englishHook: "onto the table. To the person you gave it to.",
  },
  {
    key: "ADESSIVE",
    plain: "on, at, and have",
    summary: "Being on something, and the way Estonian says somebody has something.",
    uses: [
      "Position on a surface",
      "Having something: the owner takes this ending",
      "When something happens",
    ],
    watchOut:
      "There is no verb for have. The owner takes this ending and the thing owned becomes the subject, so the sentence comes out inside out.",
    englishHook: "on the table. I have becomes at me there is.",
  },
  {
    key: "ABLATIVE",
    plain: "off, and from a person",
    summary: "Coming off a surface, and whoever you took it from.",
    uses: ["Coming off a surface", "The person something is taken, bought or asked from"],
    watchOut:
      "Off a surface, not out of a container. That one difference is the whole of what separates this ending from -st.",
    englishHook: "off the table. From the person you bought it from.",
  },
  {
    key: "TRANSLATIVE",
    plain: "becoming",
    summary: "Turning into something, what a thing is for, and by when.",
    uses: ["Turning into a state or a role", "What something is for", "A deadline: by when"],
    watchOut:
      "It does far more work than English into suggests. Becoming a teacher, turning cold and being ready by Friday are all this one ending.",
    englishHook: "into, as, for, by Friday.",
  },
  {
    key: "TERMINATIVE",
    plain: "up to",
    summary: "As far as a point, in space, in time or in amount.",
    uses: ["As far as a place", "Until a moment", "Up to an amount"],
    watchOut:
      "The ending already carries as far as, so the preposition people add in speech is saying it twice.",
    englishHook: "as far as the church. Right up until Friday.",
  },
  {
    key: "ESSIVE",
    plain: "as",
    summary: "In the role of something, usually for now rather than for good.",
    uses: ["Working as something", "A role or a capacity you are in for now"],
    watchOut:
      "The -ks ending gets you into the role. This one keeps you there. That is the only thing to hold apart.",
    englishHook: "working as a teacher, for as long as that lasts.",
  },
  {
    key: "ABESSIVE",
    plain: "without",
    summary: "Not having something. The exact opposite of the ending under it.",
    uses: ["The absence of a thing", "Doing something without a tool, a person or permission"],
    watchOut:
      "Rare on its own in speech, where people put the word for without in front of it anyway. Worth recognizing more than producing.",
    englishHook: "without a coat. Without asking.",
  },
  {
    key: "COMITATIVE",
    plain: "with",
    summary: "With a person, with a tool, and how you traveled.",
    uses: ["Together with somebody", "The tool you did it with", "How you got there"],
    watchOut:
      "It covers with a friend and with a knife, which many languages keep apart. It also never changes shape, so it is the easiest ending in the language to spot.",
    englishHook: "with, and by bus.",
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
 * The four groups, headed by the endings rather than by the names.
 *
 * "Inside: -sse, -s, -st" is a heading somebody can use. "The inside local
 * cases" is a heading somebody has to decode first, and the version of this
 * page that led with the Latin names asked a beginner to hold fourteen of them
 * in their head before a single ending had been explained.
 */
export const CASE_GROUPS: readonly { title: string; blurb: string; keys: readonly CaseKey[] }[] = [
  {
    title: "Three to memorize",
    blurb: "No endings on these three. They are stored per word, and the second one is what everything else is built on.",
    keys: ["NOMINATIVE", "GENITIVE", "PARTITIVE"],
  },
  {
    title: "Inside",
    blurb: "Into, in, out of. Containers, buildings, languages, months and moods.",
    keys: ["ILLATIVE", "INESSIVE", "ELATIVE"],
  },
  {
    title: "On top",
    blurb: "Onto, on, off. Surfaces, people, times, and the way Estonian says somebody has something.",
    keys: ["ALLATIVE", "ADESSIVE", "ABLATIVE"],
  },
  {
    title: "Five more, one job each",
    blurb: "Becoming, up to, as, without, with. Nothing to work out: each ending does its one job.",
    keys: ["TRANSLATIVE", "TERMINATIVE", "ESSIVE", "ABESSIVE", "COMITATIVE"],
  },
];

/**
 * The endings a group covers, for the heading over it.
 *
 * Read off the group's own keys rather than typed into the title beside them,
 * which is where they started: a heading is set in `label-xs` and that
 * uppercases, so "Inside: -sse, -s, -st" reached the screen as "-SSE, -S, -ST",
 * which is not what any of those endings is. Deriving them also means the
 * heading cannot come apart from the cards under it.
 */
export function groupEndings(group: { keys: readonly CaseKey[] }): string[] {
  return group.keys.flatMap((key) => {
    const spec = CASES.find((c) => c.key === key);
    return spec && !spec.principal ? [`-${spec.suffix}`] : [];
  });
}

/**
 * The grammar the course teaches beyond the endings.
 *
 * Every unit in the syllabus names the grammar it carries, and before this
 * those names pointed at nothing: a B2 unit could say it taught the impersonal
 * and the app had no page saying what the impersonal was. A course that can
 * only mark an answer wrong is a test with a syllabus attached.
 *
 * Same rules as the case notes, with one addition. `marker` names an ending,
 * because the quotative cannot be explained in English without naming the
 * ending that makes it, and a learner who has met the word "quotative" has not
 * met the thing. A marker is grammatical terminology, not an example: it is
 * never a word, never drilled as an answer, and the page shows real forms out
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
  /** The one mistake an English speaker actually makes. */
  readonly watchOut: string;
}

export const TOPIC_NOTES: readonly TopicNote[] = [
  // ── The verb, tense and mood ─────────────────────────────────────────────
  {
    id: "olema",
    title: "To be, and having things",
    summary: "There is no verb for have. You say the thing is at you instead.",
    points: [
      "The one verb you cannot avoid, and one of the few irregular ones",
      "Having something is said as it being at you, with -l",
      "Feelings, needs and obligations run on the same pattern",
    ],
    watchOut:
      "There is no have to reach for, so an English-shaped sentence will not translate word for word. The owner takes the ending and the thing owned stays plain.",
  },
  {
    id: "present-tense",
    title: "Talking about now",
    summary: "One form doing the work of I write, I am writing and I will write.",
    points: [
      "Six person endings on a stem",
      "Covers both English presents at once",
      "Does the future as well, since there is no future tense",
    ],
    watchOut:
      "The present stem is not always readable from the dictionary form, which is why the first person is stored per verb rather than worked out.",
  },
  {
    id: "negation",
    title: "Saying no",
    summary: "One negating word, and the verb drops its ending entirely.",
    points: [
      "The verb goes back to a bare stem",
      "One word covers every person, unlike do not and does not",
      "The past is negated differently from the present",
    ],
    watchOut:
      "The temptation is to negate the conjugated form. Estonian strips the ending off instead, so the person is carried by the pronoun alone.",
  },
  {
    id: "imperfect",
    title: "Saying what happened",
    summary: "The past for anything that happened and finished. The backbone of any story.",
    points: [
      "Built on the second infinitive's stem, with -si- after it",
      "A short list of common verbs takes -i- instead",
      "Used for completed events, however recent",
    ],
    watchOut:
      "The past stem comes from the second infinitive, not from the present. Which verbs take -i-, and what the third person does to the stem, are learned per verb.",
  },
  {
    id: "perfect",
    title: "Done, and it still matters",
    summary: "To be plus a participle, for a past whose result is the point.",
    marker: "-nud",
    points: [
      "Built from to be, never from to have",
      "Used where the result matters more than the event",
      "The participle never changes for person",
    ],
    watchOut:
      "Estonian builds this on to be, so the English auxiliary is the wrong model to copy.",
  },
  {
    id: "pluperfect",
    title: "Done before something else",
    summary: "The same participle, with to be itself in the past.",
    marker: "-nud",
    points: [
      "An event finished before another past event",
      "Common in stories and in reported speech",
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
      "A time expression is what makes a sentence future",
      "Verbs of planning and intending carry the rest",
      "A particle can imply something is going to finish",
    ],
    watchOut:
      "Looking for a future tense to conjugate is looking for something that does not exist. Vocabulary does the work here, not endings.",
  },
  {
    id: "conditional",
    title: "Would, could, should",
    summary: "One ending that makes a sentence hypothetical, or a request polite.",
    marker: "-ksi-",
    points: [
      "Hypotheticals and their consequences",
      "Softening a request so a stranger does not find it blunt",
      "Giving advice without issuing an order",
    ],
    watchOut:
      "This is the politeness register as much as the grammar of hypotheticals. What is normal between friends can land badly with a stranger, and this is the repair.",
  },
  {
    id: "imperative",
    title: "Telling somebody to do it",
    summary: "Instructions and invitations, with one form for one person and one for several.",
    points: [
      "Separate singular and plural forms, unlike English",
      "The plural doubles as the polite form for one person",
      "Negated with its own word",
    ],
    watchOut:
      "Using the singular on somebody you have just met reads as an order. The plural is the safe default with a stranger.",
  },
  {
    id: "quotative",
    title: "Passing on what you heard",
    summary: "A whole mood for what you are repeating rather than vouching for.",
    marker: "-vat",
    points: [
      "Reported speech, rumor and hearsay",
      "Common in news writing, where the source matters",
      "Can carry doubt, depending on delivery",
    ],
    watchOut:
      "English needs a word like apparently. Estonian does it with a verb ending, so it is easy to read straight past and take a rumor as fact.",
  },
  {
    id: "impersonal",
    title: "Said without naming who",
    summary: "Somebody did it and the sentence does not say who. Not the passive.",
    marker: "-takse",
    points: [
      "Notices, instructions, official prose and news",
      "Says people did something, without saying which people",
      "Has its own forms across the tenses",
    ],
    watchOut:
      "The English passive lets you add by whom, and lets the wind blow a door open. This has no slot for a doer and always assumes a person.",
  },
  {
    id: "participles",
    title: "Participles",
    summary: "Verb forms that behave like adjectives, and the parts the compound tenses are built from.",
    marker: "-nud",
    points: [
      "Four of them: active and impersonal, present and past",
      "Used to describe a noun the way an adjective would",
      "Carry the perfect and pluperfect with the auxiliary",
    ],
    watchOut:
      "Everywhere in written Estonian and rare in beginner courses, which is why intermediate reading feels harder than intermediate speaking.",
  },
  {
    id: "past-participle",
    title: "The -nud form",
    summary: "What the perfect tenses are built from, and an adjective in its own right.",
    marker: "-nud",
    points: [
      "Combines with to be for have done and had done",
      "Describes a noun as having done something",
      "Has an impersonal twin for things done to something",
    ],
    watchOut:
      "It never changes shape, not even in front of a noun, which makes it one of the few words in the language that ignores case. The present participles do change, which is where the two get mixed up.",
  },
  {
    id: "converb",
    title: "The -des form",
    summary: "While doing: two things at once, folded into one sentence.",
    marker: "-des",
    points: [
      "Two simultaneous actions without a conjunction",
      "Strongly preferred in writing over two joined clauses",
      "Its subject is understood to be the main clause's",
    ],
    watchOut:
      "The subject is implied, not stated, so giving the two halves different subjects produces a sentence that is correct and means something you did not intend.",
  },
  {
    id: "infinitives",
    title: "The two infinitives",
    summary: "There are two, and which one a verb takes is a fact about that verb.",
    marker: "-ma",
    points: [
      "The -ma one follows starting, going and having to",
      "The -da one follows wanting and being able",
      "Both are stored, because neither predicts the other",
    ],
    watchOut:
      "The everyday verb for must takes the -ma one. English has a single infinitive, so there is no intuition to fall back on and the pairing is learned with the verb.",
  },
  {
    id: "particle-verbs",
    title: "Verbs with a small word in front",
    summary: "Estonian's phrasal verbs. A little word can change the meaning completely.",
    points: [
      "The particle usually adds completion or direction",
      "Often the difference between doing and finishing",
      "It moves around the sentence rather than staying put",
    ],
    watchOut:
      "Like English phrasal verbs, the meaning is often not the sum of the parts, so looking up the verb alone gives the wrong answer.",
  },
  {
    id: "aspect",
    title: "Finished or not",
    summary: "Whether an action completed is carried by the object's ending, not by tense.",
    points: [
      "A finished action takes a whole object",
      "An unfinished or partial one takes the partitive",
      "Particles reinforce completion",
    ],
    watchOut:
      "English marks this with tense and Estonian marks it with case, so the two systems line up nowhere. This is the single hardest thing to carry over.",
  },

  // ── The noun phrase ──────────────────────────────────────────────────────
  {
    id: "object",
    title: "Whole thing, or part of it",
    summary: "Whether the object is all of it and finished, or some of it and ongoing.",
    points: [
      "A finished action on a whole thing: genitive or plain form",
      "Unfinished, or only part of it: partitive",
      "Anything negated: partitive, always",
    ],
    watchOut:
      "This is not politeness or emphasis, and it is not optional. It changes what the sentence means, and it is the main thing separating a B1 speaker from an A2 one.",
  },
  {
    id: "adjective-agreement",
    title: "Adjectives copy their noun",
    summary: "The adjective takes the same ending as its noun, for ten of the fourteen.",
    points: [
      "Same case and same number as the noun",
      "For -ni, -na, -ta and -ga the adjective stops at the genitive",
      "A few borrowed adjectives never change at all",
    ],
    watchOut:
      "Every adjective you learn is a whole set of forms rather than one word. Leaving it in the dictionary form beside a declined noun is the commonest beginner tell.",
  },
  {
    id: "comparative",
    title: "Comparing things",
    summary: "One ending on the genitive stem turns an adjective into more of it.",
    marker: "-m",
    points: [
      "Built on the genitive stem, like nearly everything",
      "Say than and use the plain form, or drop than and use -st",
      "A handful of common adjectives are irregular",
    ],
    watchOut:
      "Both shapes are correct. The mistake is mixing them: keeping the word for than and putting the other thing in -st as well.",
  },
  {
    id: "superlative",
    title: "The most",
    summary: "Two ways of saying it: a helper word, or a single ending.",
    points: [
      "A helper word plus the comparative, which always works",
      "A one-word form, shorter and more literary",
      "Both are common and neither is wrong",
    ],
    watchOut:
      "The one-word form is not derivable for every adjective, so the two-word version is the safe one when you are unsure.",
  },
  {
    id: "numerals",
    title: "Numbers and what follows them",
    summary: "Counting is easy until you notice the counted thing stays singular.",
    points: [
      "After two and up, the counted noun is partitive singular",
      "Numbers themselves decline when the phrase is in a case",
      "Ordinals are regular and decline too",
    ],
    watchOut:
      "The counted noun stays singular after a number, which reads as wrong to an English speaker for a long time. It is a partitive singular, not a plural.",
  },
  {
    id: "gradation",
    title: "Stems that change under you",
    summary: "The stem itself shifts between forms, and only some of that is written down.",
    points: [
      "The written kind changes consonants and can be spotted",
      "The other kind is a change in length that spelling hides",
      "Which words do it is a property of the word",
    ],
    watchOut:
      "The app can only see what is written, so it reports the written kind and says nothing about the other. A word can alternate audibly and look identical on the page.",
  },
  {
    id: "derivation",
    title: "Building words from words",
    summary: "A handful of endings turn verbs into nouns, nouns into adjectives and back.",
    marker: "-mine",
    points: [
      "An action noun from any verb, entirely regular",
      "A quality noun from an adjective",
      "Adjectives meaning like it, and meaning without it",
    ],
    watchOut:
      "Six endings make thousands of words readable without a dictionary, which is the fastest single gain at B2. The trap is assuming the meaning is the sum of the parts.",
  },
  {
    id: "nominalisation",
    title: "Turning a clause into a thing",
    summary: "A whole clause packed into one noun. This is what makes formal Estonian dense.",
    marker: "-mine",
    points: [
      "An action noun replaces a subordinate clause",
      "The doer becomes a genitive in front of it",
      "Standard in academic, legal and official writing",
    ],
    watchOut:
      "This is the biggest single difference between B2 prose and C1 prose. Overdoing it produces the officialese Estonians complain about as loudly as anybody.",
  },

  // ── The sentence ─────────────────────────────────────────────────────────
  {
    id: "government",
    title: "Verbs that demand an ending",
    summary: "Many verbs insist on a particular case, and it is rarely the English one.",
    points: [
      "The required case is a fact about the verb",
      "Helping, calling, liking and thinking are the traps",
      "The dictionary records it as the question the verb answers",
    ],
    watchOut:
      "The English preposition suggests the wrong case and nothing about the verb hints at the right one, which is why people keep getting this wrong for years.",
  },
  {
    id: "word-order",
    title: "Word order",
    summary: "Freer than English, but not free. The order is what carries the emphasis.",
    points: [
      "Endings mark who did what, so order is free for other work",
      "The verb tends to sit second in a main clause",
      "New information tends to go last",
    ],
    watchOut:
      "Because almost any order is grammatical, you can write sentences that are correct and subtly wrong-footed. This is a C1 skill rather than a rule.",
  },
  {
    id: "subordination",
    title: "Joining clauses",
    summary: "A conjunction, a clause, and a comma that is not optional.",
    points: [
      "The comma before a subordinate clause is compulsory",
      "Word order shifts inside the clause",
      "Chains of clauses are normal in writing, rare in speech",
    ],
    watchOut:
      "Estonian commas follow the grammar rather than where you would pause reading aloud, so English instincts go wrong in both directions.",
  },
  {
    id: "relative-clause",
    title: "Which and who",
    summary: "The relative pronoun takes the ending its own clause needs, not the noun's.",
    points: [
      "Different pronouns for people and for things",
      "Its case is decided inside the relative clause",
      "Always separated by a comma",
    ],
    watchOut:
      "Matching the pronoun to the noun it refers back to is the reliable mistake. Ask what job it does in its own clause.",
  },
  {
    id: "reported-speech",
    title: "Reporting what somebody said",
    summary: "Either a clause with a conjunction, or the -vat mood with no clause at all.",
    points: [
      "A conjunction plus a clause, closest to English",
      "Or the quotative, which needs no reporting verb",
      "The tense does not shift back the way English does",
    ],
    watchOut:
      "There is no sequence of tenses to apply. Backshifting the way English does produces a sentence that says something different.",
  },
  {
    id: "concession",
    title: "Granting a point",
    summary: "Although, nevertheless, even so. Agreeing with half of it before disagreeing.",
    points: [
      "Conjunctions that subordinate a concession",
      "Adverbs that carry it across a full stop",
      "The core move of any argued essay",
    ],
    watchOut:
      "They look interchangeable in a dictionary and are not: some take a clause and some only join sentences, and swapping them breaks the punctuation.",
  },
  {
    id: "hedging",
    title: "Probably, rather than definitely",
    summary: "Saying something is likely without waffling about it.",
    points: [
      "Adverbs and adjectives of likelihood",
      "The conditional, which softens a claim as well as a request",
      "The quotative, which puts the claim on somebody else",
    ],
    watchOut:
      "Academic Estonian hedges more than academic English, and in different places. Translating an English hedge directly lands between vague and evasive.",
  },
  {
    id: "cohesion",
    title: "Holding a text together",
    summary: "The connectives that turn a pile of sentences into something readable.",
    points: [
      "Ordering and adding: first, also, finally",
      "Contrast and consequence",
      "Referring back without repeating the noun",
    ],
    watchOut:
      "A text can be correct sentence by sentence and unreadable as a whole. This separates a C1 essay from a B2 one far more than vocabulary does.",
  },
  {
    id: "emphasis",
    title: "Emphasis",
    summary: "Where a word sits decides what the sentence insists on.",
    points: [
      "Move a word to the front to stress it",
      "Small particles that mark the focus",
      "Word order stands in for the stress English puts in the voice",
    ],
    watchOut:
      "English stresses with the voice and keeps the order fixed. An English-shaped sentence read with English stress emphasizes nothing here.",
  },
  {
    id: "rhetorical-questions",
    title: "Questions that are not questions",
    summary: "Asking in order to make a point, and the particle that signals a real question.",
    points: [
      "A particle marks a genuine yes or no question",
      "Leaving it out, with question intonation, reads differently",
      "Common in speeches and opinion writing",
    ],
    watchOut:
      "The question particle is easy to drop, and dropping it turns a plain question into something that can sound incredulous.",
  },
  {
    id: "punctuation",
    title: "Where the commas go",
    summary: "Commas here follow the grammar, not the pause. The rules are stricter than English.",
    points: [
      "A comma before a subordinate clause, pause or no pause",
      "Rules for lists and for asides",
      "Quotation marks are shaped differently from English ones",
    ],
    watchOut:
      "Putting a comma where you would pause is an English habit, and it produces consistent errors here because Estonian puts them where the grammar changes.",
  },

  // ── Register and use ─────────────────────────────────────────────────────
  {
    id: "politeness",
    title: "Politeness",
    summary: "Carried by mood and by which you you use, not by piling on please.",
    points: [
      "The plural as a polite singular with strangers",
      "The conditional to soften a request",
      "Directness is less rude here than English speakers expect",
    ],
    watchOut:
      "Estonian is more direct than English, and English-style softeners can read as insincere. The conditional does the work a pile of qualifiers does in English.",
  },
  {
    id: "register",
    title: "Reading the room",
    summary: "The same thing said formally, neutrally or among friends.",
    points: [
      "A written standard noticeably unlike speech",
      "Officialese, which is its own much-mocked style",
      "Spoken forms that are correct and wrong in an essay",
    ],
    watchOut:
      "This has nothing to do with knowing more words. A C1 speaker knows three ways to say something and picks one; a B2 speaker knows one and uses it everywhere.",
  },
  {
    id: "collocation",
    title: "Words that go together",
    summary: "Which verb goes with which noun, where no rule decides and usage does.",
    points: [
      "Pairings fixed by convention rather than by grammar",
      "Near-synonyms that do not swap in context",
      "The last thing learned, the first thing noticed",
    ],
    watchOut:
      "Every word can be right and the sentence still sound translated. Dictionaries are worst at this, which is why real example sentences matter here most.",
  },
  {
    id: "idiom",
    title: "Idiom",
    summary: "Fixed expressions that do not mean the sum of their words.",
    points: [
      "Sayings still in daily use",
      "Fixed verb phrases that resist a literal reading",
      "Figurative senses of ordinary words",
    ],
    watchOut:
      "Translating an idiom word by word lands somewhere between baffling and comic. They have to be met whole, in context.",
  },
  {
    id: "irony",
    title: "Irony",
    summary: "Meaning the opposite on purpose, and hearing it done to you.",
    points: [
      "Carried by intonation, understatement and context",
      "Understatement is the commonest form here",
      "Rarely flagged, so it has to be inferred",
    ],
    watchOut:
      "The last thing a learner hears and the easiest to get wrong. Irony nobody recognizes as irony reads as rudeness or as a mistake.",
  },
  {
    id: "nuance",
    title: "Choosing between near-synonyms",
    summary: "Two words a dictionary glosses identically, and which one the sentence wants.",
    points: [
      "Separated by register, strength or connotation",
      "Shades a bilingual dictionary flattens",
      "Settled by reading real usage, not definitions",
    ],
    watchOut:
      "A dictionary giving two words the same English gloss is telling you about English. The difference usually shows in what each one goes with.",
  },
  {
    id: "variation",
    title: "Nobody speaks the textbook",
    summary: "Region, age and setting all show in how people actually talk.",
    points: [
      "Regional dialects, some quite far from the standard",
      "The gap between the written standard and speech",
      "Older and literary forms you still meet reading",
    ],
    watchOut:
      "Textbook Estonian is one variety among several. Hearing a form that is not in the book does not mean somebody made a mistake.",
  },
  {
    id: "time-expressions",
    title: "Saying when",
    summary: "Time runs on endings, and which ending depends on the unit of time.",
    points: [
      "Days, seasons and years take -l; months take -s",
      "Duration is expressed differently again",
      "From and until each have their own ending",
    ],
    watchOut:
      "There are no prepositions to lean on, so an English time phrase gives no clue which ending to use. These are learned per unit of time.",
  },
];

/**
 * The grammar beyond the endings, grouped the way a course groups it.
 *
 * A flat list of forty points headed by English tense names is not how anybody
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
    blurb: "Two tenses the verb carries itself, two built with a helper, and mood and voice crossing all four.",
    ids: [
      "olema", "present-tense", "negation", "imperfect", "perfect", "pluperfect", "future",
      "conditional", "imperative", "quotative", "impersonal", "participles", "past-participle",
      "converb", "infinitives", "particle-verbs", "aspect",
    ],
  },
  {
    id: "noun-phrase",
    title: "Words that take endings",
    blurb: "What the endings attach to, and how much of a thing a sentence is talking about.",
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
    title: "Sounding like a person",
    blurb: "The part that is not a rule: which of three correct ways to say it the room wants.",
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
