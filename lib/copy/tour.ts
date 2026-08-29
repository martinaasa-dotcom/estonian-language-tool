/**
 * What this app is, what it is not, and where everything lives.
 *
 * Written down once, here, because it is said in three places: the first-run
 * walkthrough, the guide page anybody can reopen, and the honesty section under
 * a placement result. Three copies of a claim about what the app can do is how
 * two of them end up wrong.
 *
 * The tone is deliberate. Every honest thing this app can say about itself is
 * more persuasive than the things it cannot: it holds an authoritative
 * dictionary, it schedules retrieval properly, and it never invents Estonian.
 * It does not teach you to speak, it cannot score your pronunciation, and it is
 * not a course. A learner who knows both lists uses it well. A learner who
 * finds out the second list in month three feels lied to, and stops.
 *
 * Data only: a lucide icon *name*, never a component (components/icons.tsx is
 * the only place that resolves one). Pure, like the rest of lib/copy.
 */

export interface TourStop {
  href: string;
  /** A lucide icon name. */
  icon: string;
  title: string;
  /** What the screen is. */
  what: string;
  /** When a learner should actually open it. */
  when: string;
}

export const TOUR: readonly TourStop[] = [
  {
    href: "/",
    icon: "Sun",
    title: "Today",
    what: "What is due, what you have done, and the one word most worth a minute right now.",
    when: "Open this first, every day. If you only ever use one screen, use this one.",
  },
  {
    href: "/review",
    icon: "GraduationCap",
    title: "Review",
    what:
      "The daily loop. Cards scheduled by FSRS, which decides when you are about to forget something " +
      "and asks you then. It works with the network off, and grades made offline are replayed with the " +
      "time you actually answered them.",
    when: "Every day, before anything else. Fifteen minutes here beats an hour on Sunday.",
  },
  {
    href: "/learn",
    icon: "Map",
    title: "Learn",
    what: "Units of words grouped by topic and level, from A1 to C1. Adding a unit turns it into cards.",
    when: "When your deck is running dry, or you want a new topic rather than a new word.",
  },
  {
    href: "/practice",
    icon: "Swords",
    title: "Practice",
    what:
      "Writing, dictation, listening, minimal pairs, verb government, speaking, a sixty second sprint. " +
      "Every one of them grades the same cards the daily loop does, so practice is never a side game " +
      "with a score of its own.",
    when: "When the daily loop is done and you want to work a specific weakness.",
  },
  {
    href: "/dictionary",
    icon: "BookOpen",
    title: "Dictionary",
    what:
      "Any word, with its full paradigm. Type an inflected form and it tells you which word it is and " +
      "which case you found. Forms come from Ekilex or from the stored principal parts, never from a model.",
    when: "The moment you meet a word anywhere else. Add it to your deck from here.",
  },
  {
    href: "/grammar",
    icon: "Languages",
    title: "Grammar",
    what:
      "What each of the fourteen cases is for, with real examples pulled from the dictionary and labelled " +
      "with where they came from.",
    when: "When a case keeps catching you out and you want the rule rather than another drill.",
  },
  {
    href: "/tutor",
    icon: "MessageCircleQuestion",
    title: "Anu",
    what:
      "An AI that explains Estonian grammar in English. It is allowed to explain and to translate into " +
      "English. It is never allowed to supply an Estonian form, and anything Estonian it does write is " +
      "boxed, tagged and checked against the dictionary before you see it.",
    when: "When you want the why behind a rule. Not when you want a form: use the dictionary for that.",
  },
  {
    href: "/progress",
    icon: "ChartNoAxesColumn",
    title: "Progress",
    what:
      "Charts computed from your review log every time you load them. Nothing is stored as a score, so " +
      "nothing can drift out of step with what you actually did.",
    when: "Weekly. It is the honest mirror, including the weeks you did nothing.",
  },
  {
    href: "/assess",
    icon: "Compass",
    title: "Level check",
    what:
      "Reading, listening, writing and speaking, measured rather than guessed, out of the dictionary the " +
      "rest of the app runs on. Take it whenever you want to know where you are.",
    when: "Now, and then every couple of months. Sooner and you are measuring noise.",
  },
];

export interface Claim {
  /** A lucide icon name. */
  icon: string;
  text: string;
}

/** What the app genuinely does, and why each one is true rather than claimed. */
export const CAN: readonly Claim[] = [
  {
    icon: "Repeat",
    text:
      "Make words stick. Spaced retrieval is the best studied thing in learning research and it is what " +
      "this app is built around.",
  },
  {
    icon: "BookOpen",
    text:
      "Give you authoritative forms. Every paradigm comes from Ekilex or from hand checked principal " +
      "parts, and the eleven regular cases are computed from the genitive stem rather than stored.",
  },
  {
    icon: "PenLine",
    text:
      "Mark whether you produced the right form. That check is a string comparison against the " +
      "dictionary, made before any AI is involved, so it is right even when the AI is switched off.",
  },
  {
    icon: "Headphones",
    text: "Give you a native Estonian voice for any word or sentence, and hold it for dictation and listening.",
  },
  {
    icon: "WifiOff",
    text: "Work with no network. Review offline and the grades queue up and replay in order when you return.",
  },
  {
    icon: "Compass",
    text: "Tell you where you are, and how far it is to where you want to be, in hours rather than in badges.",
  },
];

/** What it does not do. Said first, not buried. */
export const CANNOT: readonly Claim[] = [
  {
    icon: "Mic",
    text:
      "Score your pronunciation. There is no verified Estonian speech recogniser available to this app, " +
      "so speaking practice plays your recording next to a native one and leaves the judgement to you. A " +
      "confidence number invented on top of a recogniser that does not handle Estonian would be worse " +
      "than silence, because you would believe it.",
  },
  {
    icon: "MessagesSquare",
    text:
      "Teach you to hold a conversation. Nothing here talks back at speed, interrupts you, or misunderstands " +
      "you. That happens with people, and it is the part of the hours a level takes that this app cannot " +
      "take on for you.",
  },
  {
    icon: "School",
    text:
      "Replace a course or a teacher. There is no syllabus here and nobody marking your work. It is a very " +
      "good memory for the words and forms a course gives you.",
  },
  {
    icon: "Sparkles",
    text:
      "Write Estonian for you. The AI may explain grammar and translate into English. It may never invent " +
      "an Estonian form, because a model asked for an example once produced a sentence that is not Estonian, " +
      "and an unverified form does not sit there being wrong, the scheduler drills it in.",
  },
  {
    icon: "Stamp",
    text:
      "Certify anything. The level check here is an estimate from a few questions, not a state exam. The " +
      "exams that count are run by the authority that sets them.",
  },
];

/** The one paragraph version, for the top of the walkthrough. */
export const WHAT_IT_IS =
  "Kodukeel is a memory and a reference, not a course. It holds an Estonian dictionary with real " +
  "paradigms, turns the words you choose into flashcards, and asks you for them at the moment you are " +
  "about to forget. Everything else here exists to make that fifteen minutes a day worth more.";
