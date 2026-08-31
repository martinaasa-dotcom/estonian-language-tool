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
 *   - where am I in the course
 *   - what does this word mean
 *   - how am I doing
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
   *
   * The value is where it is reached from, so this file says so rather than
   * leaving the next reader to find out.
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
    blurb: "What is due, and the five minutes after it.",
    items: [
      {
        href: "/", label: "Today", blurb: "Due cards, your goal, the streak", icon: "Sun", tone: "butter",
        keywords: "home dashboard streak quests goal xp", bar: true,
      },
      {
        href: "/review", label: "Review", blurb: "Everything due, timed to when you are about to forget", icon: "GraduationCap",
        tone: "accent", keywords: "flashcards srs study due", bar: true,
      },
      {
        href: "/practice", label: "Practice", blurb: "Sprint, match, sentences, speaking, listening",
        icon: "Swords", tone: "peach", keywords: "games modes drill weakest case",
      },
    ],
  },
  {
    id: "course",
    title: "Your course",
    blurb: "The path through the levels, and how far along it you are.",
    items: [
      {
        href: "/learn", label: "Learn", blurb: "Units from A1 to C1", icon: "Map", tone: "mint",
        keywords: "course units path lessons syllabus", bar: true,
      },
      {
        href: "/tasks", label: "Tasks", blurb: "Homework, and the week you are in", icon: "CalendarCheck",
        tone: "peach", keywords: "homework todo class due week current",
        within: "Today, which lists what is outstanding",
      },
      {
        href: "/week", label: "This week", blurb: "The words and work filed under this week",
        icon: "CalendarRange", tone: "butter", keywords: "week class lesson current",
        within: "/tasks",
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
        href: "/scan", label: "Scan a page", blurb: "Photograph a word list and study what is on it",
        icon: "Camera", tone: "sky", within: "/dictionary",
        keywords: "camera photo picture ocr homework textbook handout import paper digitise digitize",
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
    blurb: "Your settings, your reports, and an honest account of what this cannot do.",
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
      {
        href: "/guide", label: "What this app is", blurb: "Every screen, and what this app cannot do",
        icon: "CircleHelp", tone: "ink", keywords: "tour help onboarding walkthrough limits honest",
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
 * subtree, so a unit page lights Learn and a sprint lights Review.
 */
export function isUnder(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
