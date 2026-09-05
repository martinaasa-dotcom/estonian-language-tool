/**
 * Every destination in the app, and which section it belongs to.
 *
 * There used to be one flat list of sixteen links with four of them promoted
 * and the other twelve behind a button marked "More". That is not a fix for a
 * cluttered rail, it is the clutter moved somewhere a learner has to remember.
 * Worse, it had a bug that only showed up once you used it: the group opened
 * itself whenever the current page was inside it, so on Practice or Progress
 * or Grammar the button read "Less" and pressing it did nothing at all. The
 * flag went false, the derived value stayed true, and the rail never moved.
 *
 * So the sections are the fix and hiding is not. Sixteen links in one column
 * are a list to read; the same sixteen under four headings are four short
 * answers to "where do I go for this", and every one of them is on the screen
 * the whole time. The groups are the questions a learner actually asks:
 *
 *   - what do I do now
 *   - what does this word mean
 *   - how am I doing
 *
 * Three rather than the four it opened with. "Where am I in the course" turned
 * out to be the same question as "what do I do now": Learn is the ladder the
 * next five words climb and the map they come off, and a learner standing on
 * one wants the other in the same breath.
 *
 * Nothing here decides *whether* to show a destination. That question is
 * `lib/ux/disclosure.ts`, it is about what a screen leads with, and it is a
 * different question from where a thing lives. A destination this module names
 * is always in the navigation, at every stage, from the first minute.
 *
 * One table, read by three surfaces: the desktop rail, the phone sheet and the
 * command palette. Three copies of a list of screens is how a screen ends up
 * reachable from two of them and missing from the third.
 *
 * Pure: strings in, strings out. The icon is a lucide *name* and
 * `components/icons.tsx` is the only place that turns one into a component,
 * which is what keeps this file importable by a unit test.
 */

/** A hue from the palette. Five of them, and each one means something. */
export type Tone = "accent" | "mint" | "sky" | "butter" | "peach" | "blush" | "ink";

export interface Destination {
  /** Where it goes. The rail matches the current path against this. */
  href: string;
  /** What it is called, everywhere it appears. */
  label: string;
  /** One line saying what it is for. The sheet and the palette show it. */
  blurb: string;
  /** A lucide icon name. See components/icons.tsx. */
  icon: string;
  /** The dot behind the icon when the destination is current. */
  tone: Tone;
  /** Words somebody might type when looking for it. */
  keywords: string;
  /**
   * In the phone bar, which holds four destinations and a button for the rest.
   * Four rather than five because a thumb needs 44px and the fifth cell is how
   * you reach everything else.
   */
  bar?: boolean;
  /**
   * Reached from somewhere else, so the rail does not carry a row for it.
   *
   * Never "hidden": each of these is on the screen it belongs to, in the place
   * a learner is already standing when they want it, and all of them stay in
   * the command palette. The rail is a list of *places*; this is for the ones
   * that are really a part of another place.
   *
   *   - `/tutor` — Anu sits in the bottom right corner of every signed-in
   *     screen (`components/anu/AnuFab.tsx`, mounted in the layout), so a row
   *     marked "Ask Anu" was a second door onto a room whose door is always
   *     open. The page stays a destination because the grammar pages, the leech
   *     clinic and a review card all link to it with a question already written.
   *   - `/week` — the week you are in leads the Tasks page now, which is where
   *     the homework filed under it already was.
   *   - `/scan` — a way of getting words *in*, which is what the dictionary is
   *     for. It sat under "Look it up", which is not what it does.
   *   - `/dictionary/common` — the commonest words are a way *into* the
   *     dictionary rather than a place beside it, and the screen somebody is
   *     standing on when they want a list of words to learn is the one with a
   *     search box on it.
   *   - `/review` — the schedule working, which is one of the ways Practice
   *     asks a word you have already learned rather than a place beside it.
   *     It leads that page, because on a day with cards due it is the thing to
   *     press.
   *
   * The value is where it is reached from, so this file says so rather than
   * leaving the next reader to find out, and it names a place the rail lists.
   * One level in is a signpost on the screen you are standing on; two is
   * nowhere, which is what `/words/mastery` was for a while by pointing at
   * `/words`, itself reached from `/progress`. Asserted in `nav.test.ts`.
   */
  within?: string;
}

export interface NavSection {
  id: string;
  /** The heading over the group. */
  title: string;
  /** Why these belong together. Shown in the phone sheet, under the heading. */
  blurb: string;
  items: Destination[];
}

/**
 * The four questions, in the order a day asks them, and then the app itself.
 *
 * `app` is last and is the only group the rail pins to the bottom, because
 * settings and the honest description of what this thing cannot do are not
 * somewhere you go, they are somewhere you end up.
 */
export const SECTIONS: NavSection[] = [
  {
    id: "daily",
    title: "Every day",
    blurb: "The new words, the ones you have met, and somewhere to use them.",
    items: [
      {
        href: "/", label: "Today", blurb: "Due cards, your goal, the streak", icon: "Sun", tone: "butter",
        keywords: "home dashboard streak quests goal xp", bar: true,
      },
      /*
        WHERE THE "REVIEW" ROW USED TO BE, AND WHY IT IS NOT THAT ANY MORE.

        The daily row said Review, and what it opened was everything at once:
        the cards that were due, and a trickle of words the learner had never
        seen, taught in among them. That is one screen answering two questions.
        Reviewing is keeping a memory alive and needs a schedule; learning a
        word is building one and needs to be walked up, met, then picked out of
        four, then produced in a sentence.

        So the daily row is Learn, and it goes to the ladder and to the course
        the words come out of. What is due is Practice's, which is where every
        other way of asking a word you already know already lived.
      */
      {
        href: "/learn", label: "Learn", blurb: "New words, five at a time, and the course they come from",
        icon: "Sparkles", tone: "mint",
        keywords: "new words learn course units path lessons syllabus vocabulary teach",
        bar: true,
      },
      {
        href: "/practice", label: "Practice", blurb: "What is due, plus sprint, match, sentences and games",
        icon: "Swords", tone: "peach", keywords: "games modes drill weakest case review due srs flashcards",
        bar: true,
      },
      /*
        Reached from Practice rather than standing beside it, and this is the
        one row that moved rather than being renamed. `/review` is the schedule
        working: it asks the words a learner has already produced once, at the
        moment they are about to forget them. Every other way of asking those
        same words is already on Practice, so a row of its own put the daily
        loop in two places and left the learner to work out which was which.
      */
      {
        href: "/review", label: "Review", blurb: "Everything due, timed to when you are about to forget",
        icon: "GraduationCap", tone: "accent", keywords: "flashcards srs study due schedule",
        within: "/practice",
      },
      /*
        A row of its own rather than a tile inside Practice, because the rail
        answers four questions and none of them is "what do I do with this". It
        is in this section rather than a fourth one because the three above are
        building a memory, keeping one alive and asking it again, and this is
        the fourth thing you do with a word: use it on somebody who wants
        something from you.

        No cell in the phone bar either: the bar holds four, a fifth breaks the
        44px floor, and its four are the daily loop. A conversation is a five to
        eight minute sitting rather than a daily obligation.
      */
      {
        href: "/situations", label: "Situations", blurb: "Book an appointment, hand in a form, ring a landlord",
        icon: "MessagesSquare", tone: "mint",
        keywords: "conversation scene role play speaking doctor counter landlord",
      },
    ],
  },
  {
    id: "course",
    title: "How it is going",
    blurb: "The weeks ahead, and how far along you are.",
    items: [
      /*
        A row of its own rather than a `within`, because a calendar is not
        reached from the thing it is about: you open it to decide when to study,
        which is before you have opened anything else.
      */
      {
        href: "/calendar", label: "Calendar", blurb: "Your classes, study slots and what is due",
        icon: "CalendarDays", tone: "sky",
        keywords: "calendar week class schedule timetable homework reminder due plan tasks",
      },
      {
        href: "/class", label: "Classes", blurb: "Teach a class, or join one", icon: "School", tone: "sky",
        keywords: "classroom teacher students join code school",
        within: "/progress",
      },

      {
        href: "/progress", label: "Progress", blurb: "Heatmap, forecast, weak cases", icon: "ChartNoAxesColumn",
        tone: "accent", keywords: "stats charts history retention leaderboard",
      },
      /*
        These four are all readings of the same question and Progress is where
        it is asked, so they are reached from there rather than standing beside
        it as four more rows. Each was already linked from that page or is now:
        the deck under what has stuck, the level check under the CEFR reach it
        reports, the mock exam under both, and a class beside the leaderboard
        that only a class makes sense of.
      */
      {
        href: "/words", label: "My words", blurb: "Your deck, card by card", icon: "Layers", tone: "mint",
        keywords: "deck cards suspend delete lapses",
        within: "/progress",
      },
      {
        /*
          A ROW OF ITS OWN, AND IT TOOK THREE GOES TO GET THERE.

          Which words are known, which are nearly, and which keep going wrong.
          The first version was a panel three cards down `/words` and the
          learner reported that they could not find it anywhere. The second
          gave it a page and a `within: "/words"`, on the argument every other
          entry here makes: it is reached from the deck it counts and from
          Practice, which is the screen somebody is standing on when they want
          it. The learner reported the same thing again.

          The argument was sound and the placement was not, because `/words` is
          itself `within: "/progress"`. A place inside a place inside a place
          has no row anywhere and no signpost either: the rail says Progress,
          Progress links to the deck, and the deck carries a button. Three
          steps to a list somebody asked for by name twice. `nav.test.ts` holds
          the general rule now, that a `within` points at somewhere the rail
          actually lists, and this was the only entry breaking it.

          It sits here rather than under the deck because it answers this
          section's own question, "how is it going", in the one unit a learner
          thinks in: words they have, words they nearly have, words that keep
          going wrong. The in-page links stay, since a signpost on the screen
          you are already on is worth more than a row you have to go and find.
        */
        href: "/words/mastery", label: "Word mastery",
        blurb: "Your favorites, and what is mastered or needs work", icon: "Trophy", tone: "mint",
        // The starred words are on this page too, and a learner looking for
        // them types "favorites" rather than "mastery".
        keywords: "mastered known struggling almost progress words list stuck weak "
          + "favorites favorites starred star saved bookmarks kept",
      },
      {
        /*
          Which of the course's situations you could follow, take part in or
          lead. A reading of "how am I doing" in the terms somebody outside
          the app asks it, so it lives under Progress with the other three.
        */
        href: "/progress/readiness", label: "In real life",
        blurb: "Which situations you could follow, take part in or lead", icon: "Footprints", tone: "mint",
        keywords: "readiness situations conversation real life ready lead follow take part speak counter shop doctor",
        within: "/progress",
      },
      {
        href: "/assess", label: "Level check", blurb: "Reading, listening, writing and speaking, measured",
        icon: "Compass", tone: "blush",
        keywords: "assessment placement cefr level a1 a2 b1 b2 c1 goal plan timeline",
        within: "/progress",
      },
      {
        href: "/exam", label: "Mock exam", blurb: "An imitation of the state language exam",
        icon: "ClipboardCheck", tone: "blush",
        keywords: "tasemeeksam a2 b1 b2 c1 citizenship certificate ready confidence",
        within: "/progress",
      },
    ],
  },
  {
    id: "lookup",
    title: "Look it up",
    blurb: "Any word, any case, and the rule behind it.",
    items: [
      {
        href: "/dictionary", label: "Dictionary", blurb: "Search any word or inflected form", icon: "BookOpen",
        tone: "sky", keywords: "search lookup declension cases forms", bar: true,
      },
      {
        href: "/grammar", label: "Grammar", blurb: "What each of the fourteen cases is for", icon: "Languages",
        tone: "butter", keywords: "cases reference partitive genitive inessive endings rules seesutlev",
      },
      {
        /*
          Where the endings stop being predictable. A part of the grammar
          reference rather than a place beside it: the whole point of the area
          is what it says about the pattern that page teaches, and it is linked
          from the top of it. See `lib/estonian/exceptions.ts`.
        */
        href: "/grammar/exceptions", label: "Exceptions",
        blurb: "The words the endings do not reach", icon: "TriangleAlert",
        tone: "butter", within: "/grammar",
        keywords: "irregular exception gradation stem change tuppa illative unpredictable memorize astmevaheldus",
      },
      {
        href: "/dictionary/common", label: "Commonest words",
        blurb: "The hundred of each kind you will meet most", icon: "TrendingUp",
        tone: "sky", within: "/dictionary",
        keywords: "frequency common most used top 100 hundred subtitles corpus first learn order",
      },
      {
        href: "/scan", label: "Scan a page", blurb: "Photograph a word list and study what is on it",
        icon: "Camera", tone: "sky", within: "/dictionary",
        keywords: "camera photo picture ocr homework textbook handout import paper digitize digitize",
      },
      {
        href: "/tutor", label: "Ask Anu", blurb: "Grammar questions, explained", icon: "MessageCircleQuestion",
        tone: "blush", keywords: "ai chat grammar help tutor explain",
        within: "the button in the corner of every screen",
      },
    ],
  },
  {
    id: "app",
    title: "This app",
    blurb: "Your settings, your reports, and the honest list of what this cannot do.",
    items: [
      {
        href: "/settings", label: "Settings", blurb: "Goal, review mode, backup", icon: "Settings", tone: "ink",
        keywords: "backup export import goal preferences delete account theme",
      },
      /*
        The learner's own reports, and the door to the review queue for whoever
        reviews them. Everybody gets this entry rather than only admins, and
        that is a decision about cost as much as about design: `isAdmin` asks
        Supabase who is signed in, and gating a rail link on it would spend
        that call on every page in the app to decide whether to draw one link.
        The queue is one click from here, and the page is worth having for
        everybody anyway, since "what happened to the thing I reported" is the
        question that decides whether anybody reports a second one.
      */
      {
        href: "/suggestions", label: "Suggested fixes",
        blurb: "What you have reported, and what happened to it",
        icon: "MessageSquareWarning", tone: "peach",
        keywords: "report wrong mistake feedback correction missing word fix suggest admin review",
      },
    ],
  },
];

/**
 * The sections the rail draws: the places, minus the ones that live inside a
 * place.
 *
 * `app` is the footer rather than somewhere you go, and a `within` destination
 * is reached from the screen it belongs to. Both stay in `SECTIONS`, so the
 * command palette finds them; neither earns a row in a column somebody reads
 * top to bottom.
 */
export const PLACES = SECTIONS
  .filter((s) => s.id !== "app")
  .map((s) => ({ ...s, items: s.items.filter((i) => !i.within) }))
  .filter((s) => s.items.length > 0);

/** Every destination, flat, in the order the sections put them in. */
export const DESTINATIONS: Destination[] = SECTIONS.flatMap((s) => s.items);

/** Everything the rail and the phone sheet list, as opposed to everything there is. */
export const LISTED: Destination[] = DESTINATIONS.filter((d) => !d.within);

/** The four in the phone bar. Everything else is one press away in the sheet. */
export const BAR = DESTINATIONS.filter((d) => d.bar);

/**
 * Whether a path is inside a destination.
 *
 * Root is exact or every page would be "Today"; everything else matches its
 * subtree, so a unit page lights Course and a sprint lights Review.
 */
export function isUnder(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
