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
 * What a screen is *called* is not here. This file used to carry a title and
 * an icon beside each entry, which made it a second navigation table: nine
 * screens named twice, and nothing to stop the two from disagreeing. It holds
 * the prose now and joins it to `lib/ux/nav.ts` for the rest, so the guide
 * calls Anu what the rail calls her.
 *
 * Data only, and pure like the rest of lib/copy.
 */
import { DESTINATIONS, SECTIONS, type Tone } from "../ux/nav";

export interface TourStop {
  /** Which destination this is about. Its name and icon come from the rail. */
  href: string;
  /** What the screen is. */
  what: string;
  /** When a learner should actually open it. */
  when: string;
}

export const TOUR: readonly TourStop[] = [
  {
    href: "/",
    what: "What is due, what you have done, and the one word most worth a minute right now.",
    when: "Open this first, every day. If you only ever use one screen, use this one.",
  },
  {
    href: "/review",
    what:
      "The daily loop. Cards come back right when you are about to forget them, not before, not " +
      "after. It works with no internet too: anything you grade offline is saved and sent later, " +
      "with the real time you answered.",
    when: "Every day, before anything else. Fifteen minutes here beats an hour on Sunday.",
  },
  {
    href: "/learn",
    what: "Units of words grouped by topic and level, from A1 to C1. Adding a unit turns it into cards.",
    when: "When your deck is running dry, or you want a new topic rather than a new word.",
  },
  {
    href: "/practice",
    what:
      "Writing, dictation, listening, minimal pairs, verb government, speaking, a sixty second sprint. " +
      "Every one of them grades the same cards the daily loop does, so practice is never a side game " +
      "with a score of its own.",
    when: "When the daily loop is done and you want to work a specific weakness.",
  },
  {
    href: "/dictionary",
    what:
      "Any word, with every form it takes. Type an inflected form and it tells you which word it is and " +
      "which case you found. Forms come from Ekilex or from the stored principal parts, never from a model.",
    when: "The moment you meet a word anywhere else. Add it to your deck from here.",
  },
  {
    href: "/grammar",
    what:
      "What each of the fourteen cases is for, with real examples pulled from the dictionary and labelled " +
      "with where they came from.",
    when: "When a case keeps catching you out and you want the rule rather than another drill.",
  },
  {
    href: "/tutor",
    what:
      "An AI that explains Estonian grammar in English. It is allowed to explain and to translate into " +
      "English. It is never allowed to supply an Estonian form, and anything Estonian it does write is " +
      "boxed, tagged and checked against the dictionary before you see it.",
    when: "When you want the why behind a rule. Not when you want a form: use the dictionary for that.",
  },
  {
    href: "/progress",
    what:
      "Charts built fresh from your reviews every time you open this page. Nothing is stored as a " +
      "score, so the numbers can never end up wrong.",
    when: "Weekly. It is the honest mirror, including the weeks you did nothing.",
  },
  {
    href: "/assess",
    what:
      "Reading, listening, writing and speaking, measured rather than guessed, from the same " +
      "dictionary the rest of the app uses. Take it whenever you want to know where you stand.",
    when: "Now, and then every couple of months. Sooner than that and the result will not mean much.",
  },
];

/** A tour stop with the name, icon and hue the rail gives it. */
export interface TourRoom extends TourStop {
  title: string;
  icon: string;
  tone: Tone;
}

/**
 * The tour, room by room, grouped the way the rail groups the app.
 *
 * The guide used to be nine cards in a flat grid, which teaches a learner
 * nine screens and no map. Under the rail's own headings it teaches the map
 * as well, and the two surfaces cannot drift apart because there is one table
 * behind both.
 *
 * A stop naming a destination the rail does not have is dropped rather than
 * guessed at, and `tour.test.ts` fails on one, so this cannot quietly lose a
 * room.
 */
export function tourBySection(): { title: string; rooms: TourRoom[] }[] {
  const rooms = TOUR.flatMap((stop) => {
    const place = DESTINATIONS.find((d) => d.href === stop.href);
    return place ? [{ ...stop, title: place.label, icon: place.icon, tone: place.tone }] : [];
  });
  return SECTIONS.flatMap((section) => {
    const hrefs = new Set(section.items.map((i) => i.href));
    const mine = rooms.filter((r) => hrefs.has(r.href));
    return mine.length > 0 ? [{ title: section.title, rooms: mine }] : [];
  });
}

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
      "Give you real, checked forms. Every one of them comes from Ekilex or from principal parts " +
      "checked by hand, and the eleven regular cases are worked out from the genitive stem each " +
      "time, never stored.",
  },
  {
    icon: "PenLine",
    text:
      "Mark whether you got the form right. That check compares your answer straight against the " +
      "dictionary, before any AI is involved, so it works even when the AI is switched off.",
  },
  {
    icon: "Headphones",
    text: "Give you a native Estonian voice for any word or sentence, and hold it for dictation and listening.",
  },
  {
    icon: "WifiOff",
    text: "Work with no internet. Review offline, and your answers are saved and sent in order once you are back.",
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
      "Score your pronunciation. Nothing we could find recognises spoken Estonian reliably enough, " +
      "so speaking practice plays your recording next to a native one and leaves the judging to " +
      "you. A made-up confidence score on top of a tool that cannot really hear Estonian would be " +
      "worse than nothing, because you would believe it.",
  },
  {
    icon: "MessagesSquare",
    text:
      "Teach you to hold a conversation. Nothing here talks back at speed, interrupts you, or " +
      "misunderstands you the way a real person does. That part of learning a language only " +
      "happens with people, and this app cannot do it for you.",
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
      "Write Estonian for you. The AI may explain grammar and translate into English. It may never " +
      "invent an Estonian form: a model asked for an example once made up a sentence that is not " +
      "real Estonian. An unverified form does not just sit there being wrong. You get asked it " +
      "again and again until it sticks.",
  },
  {
    icon: "Stamp",
    text:
      "Certify anything. The level check here is an estimate from a few questions, not a state exam. The " +
      "exams that count are run by the authority that sets them.",
  },
];

/**
 * First run gets a line, the walkthrough gets the paragraph.
 *
 * They are two different jobs and one string was doing both. The screen at
 * /guide is read by somebody who came looking for an explanation, so a
 * paragraph is what they asked for. The first screen of setup is read by
 * somebody who has not decided to read anything yet, and three sentences of
 * what the app is before the first question is a wall to get past rather than
 * a welcome.
 *
 * The line is the name, because the name is the promise and almost nobody
 * arriving knows what it means. Once somebody has been told that kodukeel is
 * the language of a home, what this app is for needs no further explaining,
 * and every screen after it reads as part of that rather than as a feature.
 * The README has opened this way since the first commit; this is the same
 * sentence reaching the first screen anybody actually sees.
 */
export const WHAT_IT_IS_SHORT =
  "Kodukeel means home language. This is how Estonian becomes yours.";

/** The one paragraph version, for the top of the walkthrough. */
export const WHAT_IT_IS =
  "Kodukeel is a memory and a reference, not a course. It holds an Estonian dictionary with every " +
  "form a word takes, turns the words you choose into flashcards, and asks you for them at the moment you are " +
  "about to forget. Everything else here exists to make that fifteen minutes a day worth more.";
