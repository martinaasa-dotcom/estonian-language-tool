/*
  WHAT TODAY IS, AND WHICH ENGLISH WORD TO GO LOOKING FOR BECAUSE OF IT.

  Today's word of the day is drawn from the dictionary, and which word gets
  drawn is decided here, by the date. The twelfth of the month is a dozen. The
  fourteenth of February is Friend's Day in Estonia rather than Valentine's.
  The night before Lent is Pancake Day in England and a sledging day here, and
  it moves every year because Easter does. A word that arrives with a reason is
  a word somebody remembers, and a word drawn at random is furniture.

  THIS FILE IS ENGLISH AND CONTAINS NO ESTONIAN AT ALL, WHICH IS THE WHOLE
  DESIGN. Writing an Estonian word here would be this app inventing vocabulary,
  which is the one thing it may never do (ADR-005). So a day names an *English*
  gloss to go looking for, `lib/progress/wordOfDay.ts` asks the dictionary which
  Estonian word carries that gloss, and the Estonian on the screen is whatever
  Ekilex and Wiktionary already agreed on. The English gloss is the only
  authored column in the whole pipeline, which is exactly the latitude the
  syllabus already takes.

  A gloss here is a REQUEST, not a promise. A deployment's dictionary decides
  whether it can be met, and a word the learner has already met is skipped, so
  every layer offers several and there are always more layers underneath. The
  card only ever names the occasion that actually produced the word on it: if
  the dictionary cannot answer for Pancake Day the card does not mention
  pancakes, it says what it is instead. A reason nobody can check is worse than
  no reason.

  THE LAYERS, BEST FIRST.

    1. A day with a name. Estonia's own calendar first, because this is an app
       for people learning Estonian, mostly while living here.
    2. A day that moves, worked out from Easter. Pancake Day is the reason this
       arithmetic exists.
    3. The shape of the number. The twelfth is a dozen, the seventh is a week,
       the fifth is a hand.
    4. The weekday, where Estonian has something to say about it. Four of the
       seven are counted, and what is worth saying about the other three is
       different for each of them.
    5. The month, which always answers. This is the floor: every day of the
       year reaches it, so nothing can fall through to nothing.

  Layers three and four are deliberately full of holes. Forcing a reason onto
  the ninth of the month would mean writing one that is not true, and a page
  that tells you something charming every single day has taught you to skim it
  by the end of the first week.

  A CHARMING NOTE THAT IS WRONG COSTS MORE THAN A DULL ONE THAT IS RIGHT, AND
  THE FIRST ONE TO SHIP WAS ABOUT SATURDAY. The card printed the word for a
  sauna under a sentence saying the Estonian name for Saturday means bath day.
  That is true of the Old Norse the name was borrowed from and it is not true
  of the Estonian, where no part of the day's name says anything of the sort,
  and the one reader who can see it is the learner the card is for: somebody a
  fortnight into a course who has just learned the seven weekdays. The little
  connection is the whole reason this panel exists, so the standard has to be
  the same standard the rest of the app holds to about Estonian rather than a
  softer one for the copy round the edges.

  So, three rules for a note, each of them a way the Saturday one went wrong.

  A NOTE IS ABOUT THE DAY, NEVER ABOUT THE WORD BESIDE IT. Which of an
  occasion's glosses the dictionary answers with is the dictionary's choice and
  can differ between two deployments, so a note that explains the word on the
  card is making a promise this file cannot keep. Say what today is and let the
  word arrive next to it.

  NO NOTE SAYS THAT AN ESTONIAN NAME MEANS SOMETHING. "Means" is the word that
  did the damage, because to a learner it says the letters in front of them
  carry that sense, and half the names worth writing about here are loans where
  they do not. What may be said instead is what a name is BUILT OUT OF, which a
  learner can see for themselves in the spelling (Sunday is built out of the
  word for holy, and it is), or where a name was BORROWED FROM, naming the
  language it came from, which is a claim about history rather than about what
  an Estonian word contains. This file holds no Estonian and reads no
  dictionary, so it has nothing to check a meaning against; `wordOfDay.ts` is
  the half with Ekilex and Wiktionary behind it. Asserted in `almanac.test.ts`,
  on the sentence that shipped.

  A CLAIM WITH A NUMBER IN IT IS CHECKED BEFORE IT IS WRITTEN. The same pass
  found World Animal Day saying there were more elk here than people in Tartu,
  which is out by a factor of nine (about eleven thousand elk against ninety
  odd thousand people), and World Book Day resting on a books-per-head ranking
  the sources disagree about. Both say something true about the same day now.
  Prefer a fact that is hard to be wrong about to one that is impressive.

  Pure: a day key in, English out. No React, no Prisma, no clock of its own.
*/

import type { DayKey } from "@/lib/time/day";

export interface Occasion {
  /** Stable name for this rule, for tests and for telling two layers apart. */
  readonly key: string;
  /** What the day is, in a few words. Printed as the card's hint. */
  readonly name: string;
  /** Why this word, today. One sentence, said to the one person reading. */
  readonly note: string;
  /**
   * English glosses to hunt for in the dictionary, best first.
   *
   * Matched against a whole sense of a dictionary entry's English gloss, never
   * as a substring: "dark" has to find the word that means dark, and a
   * substring match on that particular gloss finds a slur four entries down.
   */
  readonly glosses: readonly string[];
}

/* ── 1. Days with names ──────────────────────────────────────────────────── */

/**
 * Keyed `MM-DD`.
 *
 * Estonia's own days, then the international ones that are actually kept
 * rather than invented by a marketing calendar. Two deliberate absences: the
 * fourteenth of June and the twenty-fifth of March are days of mourning for
 * the deportations, and a cheerful word of the day on either would be the app
 * misreading the room. They fall through to the month, which says nothing.
 */
const NAMED: Record<string, Occasion> = {
  "01-01": {
    key: "new-year",
    name: "New Year's Day",
    note: "The first day of the year, so here is a word about starting.",
    glosses: ["beginning", "year", "new"],
  },
  "01-06": {
    key: "epiphany",
    name: "Three Kings' Day",
    note: "Estonia calls the sixth of January Three Kings' Day, and it is when the tree comes down.",
    glosses: ["king", "gift"],
  },
  "02-02": {
    key: "candlemas",
    name: "Candle Day",
    note: "The second of February is Candle Day, the old halfway mark out of winter.",
    glosses: ["candle", "light"],
  },
  "02-14": {
    key: "friends-day",
    name: "Friend's Day",
    note: "Estonia calls the fourteenth of February Friend's Day, and the cards go to friends rather than to one person.",
    glosses: ["friend", "heart", "love"],
  },
  "02-24": {
    key: "independence",
    name: "Independence Day",
    note: "Estonia declared independence on this day in 1918.",
    glosses: ["freedom", "flag", "country"],
  },
  "03-14": {
    key: "mother-tongue",
    name: "Mother Tongue Day",
    note: "The fourteenth of March is Mother Tongue Day here, which makes it a good day to be learning one.",
    glosses: ["mother tongue", "language", "word"],
  },
  "03-20": {
    key: "happiness",
    name: "Day of Happiness",
    note: "The United Nations put the Day of Happiness on the twentieth of March, which is about when the light comes back this far north.",
    glosses: ["joy", "happiness", "spring"],
  },
  "04-01": {
    key: "april-fools",
    name: "April Fools",
    note: "Somebody will try one on you today, so you may as well have the word ready.",
    glosses: ["joke", "lie"],
  },
  "04-23": {
    key: "book-day",
    name: "World Book Day",
    note: "World Book Day. The oldest printed Estonian anybody has is a catechism from 1535, and only fragments of it survive.",
    glosses: ["book", "story", "read"],
  },
  "05-01": {
    key: "spring-day",
    name: "Spring Day",
    note: "The first of May is a public holiday here and it is called Spring Day, which is optimistic.",
    glosses: ["spring", "work", "flower"],
  },
  "06-01": {
    key: "childrens-day",
    name: "Children's Day",
    note: "The first of June is Children's Day, and the parks are full.",
    glosses: ["child", "play", "sweet"],
  },
  "06-04": {
    key: "flag-day",
    name: "Flag Day",
    note: "The blue, black and white flag was consecrated on this day in 1884.",
    glosses: ["flag", "blue", "white"],
  },
  "06-23": {
    key: "victory-day",
    name: "Victory Day",
    note: "Victory Day, and the evening the midsummer fires are lit.",
    glosses: ["victory", "fire", "flame"],
  },
  "06-24": {
    key: "midsummer",
    name: "Midsummer Day",
    note: "Midsummer Day, and the second holiday in a row. The fires were lit last night and half the country is still out by the lake.",
    glosses: ["midsummer", "fire", "summer"],
  },
  "08-08": {
    key: "cat-day",
    name: "International Cat Day",
    note: "International Cat Day, which is not an Estonian invention but is being kept anyway.",
    glosses: ["cat"],
  },
  "08-20": {
    key: "restoration",
    name: "Restoration of Independence",
    note: "Estonia took its independence back on this day in 1991, without a shot fired.",
    glosses: ["freedom", "song", "country"],
  },
  "09-01": {
    key: "knowledge-day",
    name: "Knowledge Day",
    note: "The first of September is Knowledge Day, and the school year opens with flowers for the teacher.",
    glosses: ["school", "flower", "pupil"],
  },
  "10-01": {
    key: "coffee-day",
    name: "International Coffee Day",
    note: "International Coffee Day. Estonians drink a startling amount of it.",
    glosses: ["coffee", "cup"],
  },
  "10-04": {
    key: "animal-day",
    name: "World Animal Day",
    note: "World Animal Day. Wolves, lynx, bears and elk all live in the forests here, and the forest starts where the town stops.",
    glosses: ["animal", "moose", "bear"],
  },
  "10-16": {
    key: "bread-day",
    name: "World Bread Day",
    note: "World Bread Day, and black bread is the thing Estonians abroad ask people to post them.",
    glosses: ["bread", "rye", "cake"],
  },
  "10-31": {
    key: "halloween",
    name: "Halloween",
    note: "Halloween, which arrived here recently and lands ten days before a much older masked night.",
    glosses: ["pumpkin", "dark", "mask"],
  },
  "11-02": {
    key: "all-souls",
    name: "All Souls' Day",
    note: "All Souls' Day. The graveyards are full of candles by five o'clock.",
    glosses: ["candle", "soul", "grave"],
  },
  "11-10": {
    key: "martinmas",
    name: "St Martin's Day",
    note: "Children go door to door in masks tonight, singing for what they can get.",
    glosses: ["mask", "song", "autumn"],
  },
  "11-25": {
    key: "catherines-day",
    name: "St Catherine's Day",
    note: "The other masked night. This one dresses in white and is meant to look after the sheep.",
    glosses: ["sheep", "wool", "white"],
  },
  "12-21": {
    key: "solstice",
    name: "Midwinter",
    note: "The shortest days of the year are about now. It gets lighter from here, which takes some believing.",
    glosses: ["dark", "night", "light"],
  },
  "12-24": {
    key: "christmas-eve",
    name: "Christmas Eve",
    note: "Christmas Eve, which is the evening Estonia keeps rather than the morning after.",
    glosses: ["Christmas", "gift", "candle"],
  },
  "12-25": {
    key: "christmas",
    name: "Christmas Day",
    note: "Christmas Day, and most of the eating was done last night.",
    glosses: ["Christmas", "gift", "peace"],
  },
  "12-31": {
    key: "new-years-eve",
    name: "New Year's Eve",
    note: "The last night of the year.",
    glosses: ["year", "night", "end"],
  },
};

/* ── 2. Days that move ───────────────────────────────────────────────────── */

/**
 * Easter Sunday in the Gregorian calendar, as month and day.
 *
 * The anonymous Gregorian computus, which is arithmetic rather than a table
 * and so has no year it stops working in. It is here for one reason: Pancake
 * Day is the Tuesday before Lent and Lent is counted back from Easter, so
 * without this the date drifts a fortnight a year and the card would announce
 * pancakes in the wrong week.
 */
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return { month: Math.floor(n / 31), day: (n % 31) + 1 };
}

/** Days counted from Easter, and what each one asks the dictionary for. */
const MOVEABLE: readonly { offset: number; occasion: Occasion }[] = [
  {
    // Shrove Tuesday. England eats pancakes, Estonia goes sledging and eats
    // pea soup, and both of them do it on exactly this day.
    offset: -47,
    occasion: {
      key: "shrove-tuesday",
      name: "Pancake Day",
      note: "Shrove Tuesday. England makes pancakes, Estonia takes the sledge out and makes pea soup, and both are right.",
      glosses: ["pancake", "sledge", "soup"],
    },
  },
  {
    offset: -2,
    occasion: {
      key: "good-friday",
      name: "Good Friday",
      note: "Good Friday, and a public holiday here.",
      glosses: ["quiet", "silence", "bread"],
    },
  },
  {
    offset: 0,
    occasion: {
      key: "easter",
      name: "Easter Sunday",
      note: "Easter. The eggs get dyed with onion skins and then knocked together to see whose survives.",
      glosses: ["egg", "spring", "grass"],
    },
  },
  {
    offset: 49,
    occasion: {
      key: "whitsun",
      name: "Whitsun",
      note: "Whitsun, seven weeks after Easter and usually the first properly warm weekend.",
      glosses: ["birch", "green", "summer"],
    },
  },
];

/** Nth occurrence of a weekday in a month, as a day of the month. */
function nthWeekday(year: number, month: number, weekday: number, n: number): number {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return 1 + ((weekday - firstDow + 7) % 7) + (n - 1) * 7;
}

/** Days pinned to a weekday of a month rather than to a number. */
const NTH_WEEKDAY: readonly {
  month: number; weekday: number; n: number; occasion: Occasion;
}[] = [
  {
    month: 5, weekday: 0, n: 2,
    occasion: {
      key: "mothers-day",
      name: "Mother's Day",
      note: "The second Sunday in May, and the flag goes up for it.",
      glosses: ["mother", "flower", "thank"],
    },
  },
  {
    month: 11, weekday: 0, n: 2,
    occasion: {
      key: "fathers-day",
      name: "Father's Day",
      note: "The second Sunday in November. Estonia keeps this one in the dark half of the year.",
      glosses: ["father", "son", "home"],
    },
  },
];

/* ── 3. The shape of the number ──────────────────────────────────────────── */

/**
 * Deliberately partial.
 *
 * There is something true to say about the twelfth and nothing true to say
 * about the ninth, and inventing one for the ninth is how a page that surprises
 * you becomes a page you skim. A number with nothing to say falls through.
 */
const BY_NUMBER: Record<number, Occasion> = {
  1: {
    key: "day-1",
    name: "The first",
    note: "The first of the month, which is as good a place as any to start something.",
    glosses: ["first", "beginning"],
  },
  4: {
    key: "day-4",
    name: "The fourth",
    note: "Four, and Estonia has four genuinely different seasons to spend them on.",
    glosses: ["season", "year"],
  },
  5: {
    key: "day-5",
    name: "The fifth",
    note: "Five. One for each finger, so here is the word for what they are attached to.",
    glosses: ["hand", "five"],
  },
  7: {
    key: "day-7",
    name: "The seventh",
    note: "Seven, which is a week exactly.",
    glosses: ["week", "day"],
  },
  10: {
    key: "day-10",
    name: "The tenth",
    note: "Ten. The reason we count in tens is sitting on the end of your arms.",
    glosses: ["finger", "hand"],
  },
  12: {
    key: "day-12",
    name: "The twelfth",
    note: "The twelfth, which is a dozen of anything.",
    glosses: ["dozen", "egg"],
  },
  13: {
    key: "day-13",
    name: "The thirteenth",
    note: "The thirteenth. Take the word for luck and see how the day goes.",
    glosses: ["luck", "happiness"],
  },
  24: {
    key: "day-24",
    name: "The twenty-fourth",
    note: "Twenty-four, one for every hour you have got.",
    glosses: ["hour", "time"],
  },
  30: {
    key: "day-30",
    name: "The thirtieth",
    note: "Thirty days is roughly one turn of the moon, and Estonian uses one word for the moon and for a month.",
    glosses: ["moon", "sky"],
  },
  31: {
    key: "day-31",
    name: "The thirty-first",
    note: "The last day of the month.",
    glosses: ["last", "end"],
  },
};

/* ── 4. The weekday, where there is something to say ─────────────────────── */

/**
 * Estonian numbers four of its weekdays and borrows or builds the other three.
 *
 * Monday is the first day counted, Tuesday the second, Wednesday the third and
 * Thursday the fourth, so Tuesday and Thursday are arithmetic and nothing else
 * and they fall through. Of the three that are not counted, only Sunday's name
 * is transparent to somebody who speaks Estonian: it is built out of the word
 * for holy. Friday and Saturday are old loans, so what is true about them is
 * where the name came from rather than what it says, and the note has to be
 * written that way round. See the correctness rule in this file's header: the
 * card printed the word for a sauna beside a sentence saying the Estonian for
 * Saturday means bath day, and a learner who knows the day's name could see
 * that no part of it says any such thing.
 *
 * Keyed by `Date.getUTCDay()`, so Sunday is 0.
 */
const BY_WEEKDAY: Record<number, Occasion> = {
  0: {
    key: "sunday",
    name: "Sunday",
    note: "Estonian numbers four of its weekdays. Sunday is not one of them: its name is built out of the word for holy.",
    glosses: ["holy", "rest", "quiet"],
  },
  1: {
    key: "monday",
    name: "Monday",
    note: "Estonian counts four of its weekdays, and Monday is the first one it counts.",
    glosses: ["first", "morning", "beginning"],
  },
  3: {
    key: "wednesday",
    name: "Wednesday",
    note: "Wednesday is the third day counted in Estonian, and the middle of the week by everything else.",
    glosses: ["middle", "week"],
  },
  5: {
    key: "friday",
    name: "Friday",
    note: "Estonian counts its weekdays as far as Thursday and then stops. Friday has a borrowed name, and for most people the evening starts early.",
    glosses: ["free", "evening", "joy"],
  },
  6: {
    key: "saturday",
    name: "Saturday",
    note: "Saturday is sauna evening in a great many houses here, and the day's name came from Old Norse, where it meant washing day.",
    glosses: ["sauna", "bath", "steam"],
  },
};

/* ── 5. The month, which always answers ──────────────────────────────────── */

/** The floor. Every day of the year reaches this, so nothing falls through. */
const BY_MONTH: Record<number, Occasion> = {
  1: {
    key: "january",
    name: "January",
    note: "January here is snow if you are lucky and grey if you are not.",
    glosses: ["snow", "winter", "cold"],
  },
  2: {
    key: "february",
    name: "February",
    note: "February is the hard month. Some years the sea freezes solid enough to drive on.",
    glosses: ["ice", "frost", "sea"],
  },
  3: {
    key: "march",
    name: "March",
    note: "March, when the snow goes and everything that was under it turns out to be brown.",
    glosses: ["spring", "mud", "bird"],
  },
  4: {
    key: "april",
    name: "April",
    note: "April, and the rain that comes with it.",
    glosses: ["rain", "puddle", "wind"],
  },
  5: {
    key: "may",
    name: "May",
    note: "May, when the birches come out over about four days and the whole country notices.",
    glosses: ["birch", "flower", "leaf"],
  },
  6: {
    key: "june",
    name: "June",
    note: "June, when the light barely goes at all this far north.",
    glosses: ["sun", "light", "summer"],
  },
  7: {
    key: "july",
    name: "July",
    note: "July, which is lakes and berries and very little else.",
    glosses: ["berry", "lake", "swim"],
  },
  8: {
    key: "august",
    name: "August",
    note: "August, and the forests fill up with quiet people carrying baskets.",
    glosses: ["mushroom", "harvest", "forest"],
  },
  9: {
    key: "september",
    name: "September",
    note: "September, when school starts and the mornings turn over in about a week.",
    glosses: ["autumn", "school", "apple"],
  },
  10: {
    key: "october",
    name: "October",
    note: "October, and the leaves are worth going out for.",
    glosses: ["leaf", "forest", "wind"],
  },
  11: {
    key: "november",
    name: "November",
    note: "November is dark by four in the afternoon here. Candles help, and so does the sauna.",
    glosses: ["dark", "fog", "candle"],
  },
  12: {
    key: "december",
    name: "December",
    note: "December, and there is a candle in every window whether anyone is religious or not.",
    glosses: ["candle", "snow", "gift"],
  },
};

/**
 * Every occasion today could be about, best first.
 *
 * A list rather than one answer, because a gloss is a request the dictionary
 * may not be able to meet. The resolver walks down until one of them produces
 * a word the learner has not met, and the card names the one that worked. The
 * last entry is always a month, so this never comes back empty.
 */
export function occasionsFor(day: DayKey): Occasion[] {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return [];

  const out: Occasion[] = [];
  const push = (occasion: Occasion | undefined) => {
    if (occasion && !out.some((o) => o.key === occasion.key)) out.push(occasion);
  };

  push(NAMED[`${pad(month)}-${pad(date)}`]);

  const easter = easterSunday(year);
  const easterDay = Date.UTC(year, easter.month - 1, easter.day);
  const today = Date.UTC(year, month - 1, date);
  const fromEaster = Math.round((today - easterDay) / 86_400_000);
  push(MOVEABLE.find((m) => m.offset === fromEaster)?.occasion);

  for (const pinned of NTH_WEEKDAY) {
    if (pinned.month !== month) continue;
    if (nthWeekday(year, month, pinned.weekday, pinned.n) === date) push(pinned.occasion);
  }

  push(BY_NUMBER[date]);
  push(BY_WEEKDAY[new Date(today).getUTCDay()]);
  push(BY_MONTH[month]);

  return out;
}

/** Every gloss any day of the year could ask for. Read by the test that checks them. */
export function allGlosses(): string[] {
  const sources: Occasion[] = [
    ...Object.values(NAMED),
    ...MOVEABLE.map((m) => m.occasion),
    ...NTH_WEEKDAY.map((n) => n.occasion),
    ...Object.values(BY_NUMBER),
    ...Object.values(BY_WEEKDAY),
    ...Object.values(BY_MONTH),
  ];
  return [...new Set(sources.flatMap((o) => o.glosses))];
}

/** Every occasion in the table, for the tests that sweep them. */
export function allOccasions(): Occasion[] {
  return [
    ...Object.values(NAMED),
    ...MOVEABLE.map((m) => m.occasion),
    ...NTH_WEEKDAY.map((n) => n.occasion),
    ...Object.values(BY_NUMBER),
    ...Object.values(BY_WEEKDAY),
    ...Object.values(BY_MONTH),
  ];
}

const pad = (n: number) => String(n).padStart(2, "0");
