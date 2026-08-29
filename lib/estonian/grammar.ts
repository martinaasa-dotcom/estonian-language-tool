import { CASES, type CaseSpec } from "./cases";
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
      "A whole object takes the nominative or the genitive, never the partitive, the choice says whether the action finished, not how polite you are being.",
    englishHook: "Closest to plain English word order: the thing doing the verb.",
  },
  {
    key: "GENITIVE",
    summary: "Possession, and the stem eleven other cases are built on.",
    uses: [
      "Possession, the way English uses ’s or “of”",
      "A completed whole object",
      "After most prepositions and postpositions",
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
      "Rare in speech, where a preposition usually does the job instead, but it turns up in writing and on exams, which is exactly why it is worth recognising rather than producing.",
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
