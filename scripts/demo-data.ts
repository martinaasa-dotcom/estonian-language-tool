/** Populates a few cards, reviews and tasks so the UI can be reviewed with real content. */
import { PrismaClient } from "@prisma/client";
// @ts-expect-error - plain JS helper, shared with the .mjs end-to-end scripts.
import { requireLocalDatabase } from "./lib/local-db.mjs";
import { generateCards, type LexemeForCards } from "../lib/srs/cards";
import { emptyScheduling, grade } from "../lib/srs/scheduler";
import { LOCAL_USER_ID, supabaseConfigured } from "../lib/auth/mode";

const prisma = new PrismaClient({
  datasourceUrl: requireLocalDatabase("replace this learner's cards, tasks and review history with invented data"),
});

/** A spread of plausible review histories — some clean, some with a lapse. */
/**
 * The shapes a real deck contains, so every screen has something to show.
 *
 * The last one is the point of the list: a word learned, forgotten, relearned
 * and forgotten again — four lapses by the end, which is what the
 * sticking-points section on /progress exists to name. It has to graduate back
 * to Review between failures, because FSRS only counts a lapse against a card
 * it believed was learned. Without one, that section renders as nothing and
 * looks broken rather than empty.
 */
const HISTORIES: number[][] = [
  [3, 3, 2, 3, 4, 3],
  [3, 1, 3, 3, 2],
  [],
  [4, 4, 3],
  [2, 3, 1, 3, 3, 3],
  [3],
  [3, 3, 1, 3, 3, 1, 3, 3, 1, 3, 3, 1],
];

/**
 * HOW LONG EACH SLOT TAKES, AND WHICH TWO GET SWAPPED.
 *
 * The fixture wrote `durationMs: 4200` on every row and no slot at all, so the
 * two columns `lib/stats/pace.ts` and `lib/stats/confusions.ts` read were
 * constant and empty here. That is not a thin panel, it is a panel no browser
 * suite can reach: the section only renders where there is something to say,
 * so every check behind it would have waived itself for ever without saying
 * so. `letterBar` and the class week are in this file for the same reason.
 *
 * The numbers make one learner rather than noise. The translative is the slot
 * they get right and have to work out, at better than twice their own pace,
 * which is what "not automatic yet" is for. It has to be *right* to qualify,
 * above `FLUENT_ACCURACY`, and the shared histories below average under that,
 * so its cards take a clean history of their own: the scheduling is computed
 * from the same ratings, so the log and the card still agree. The inessive and
 * the elative are the pair that get swapped, and a swap is a miss, so they
 * cannot also be the accurate one. Everything else sits near the middle,
 * because a fixture where every slot is interesting teaches nothing about
 * which ones are.
 */
const SLOW_SLOT = "TRANSLATIVE";
/** How many words the demo deck holds, and how many of them get every card type. */
const DECK_WORDS = 30;
const RICH_WORDS = 5;
/**
 * The case slots this fixture has to be able to demonstrate.
 *
 * A browser suite cannot conjure a card, so a slot a suite drills has to be in
 * the deck the fixture lays down. `INESSIVE` is what `test-teaching.mjs` opens
 * at `/review?case=INESSIVE`; `SLOW_SLOT` is the one the answer-time panel
 * needs to be slow before it draws at all; `IndPrSg3` is a conjugation card, so
 * every suite that walks the deck meets a verb asked in a sentence.
 */
const DEMO_SLOTS = ["INESSIVE", SLOW_SLOT, "IndPrSg3"] as const;
const SLOW_HISTORY = [3, 3, 4, 3, 3, 3];
/**
 * THE VERB THE FLASH ROUND HAS TO REACH IS THE HARDEST WORD IN THE DECK.
 *
 * `test-flash.mjs` asserts that a verb form is recorded as itself, which it can
 * only see if the round asks a verb, and the round asks the ten hardest words
 * with ties broken by lemma. Whether a verb fell inside those ten was luck: the
 * first was `elama` at position ten, one place out, after two nouns lost their
 * comitative cards to the sentence rule and slotted in ahead of it. A suite
 * covered by luck is a suite that fails the day the dictionary shifts under it,
 * so the verb this fixture names for its conjugation slot is given a history
 * that makes it `struggling`, which sorts first, and the round opens on it.
 */
const STRUGGLE_HISTORY = [3, 1, 3, 1, 3, 1];
const SLOT_MS: Record<string, number> = {
  TRANSLATIVE: 9_400,
  ILLATIVE: 5_100,
  ELATIVE: 3_800,
  INESSIVE: 2_600,
  ADESSIVE: 2_900,
  ABLATIVE: 4_400,
  ALLATIVE: 3_100,
  COMITATIVE: 3_400,
};

/** What a learner reaches for when they miss one of these. Both are real pairs. */
const SWAPPED_FOR: Record<string, string> = {
  ELATIVE: "INESSIVE",
  INESSIVE: "ELATIVE",
  ABLATIVE: "ADESSIVE",
  ADESSIVE: "ABLATIVE",
};

/** The pace of an answer that is not about a case. Near the middle on purpose. */
const MEANING_MS = 4_200;

/** Fixed, so re-running the fixture reuses the one class rather than adding another. */
const DEMO_CLASS_CODE = "DEMOAA";
const DEMO_WORKPLACE_CODE = "DEMOWK";

async function main() {
  // Cards/tasks are per-user now (docs/03-architecture.md ADR-012), so this script
  // only ever touches one account's data — find your user id in the Supabase
  // dashboard (Authentication → Users) and pass it explicitly.
  // Running locally there is only one learner (lib/auth/mode.ts), so the id is
  // known; with Supabase configured it has to be named explicitly, because
  // guessing which account to wipe is not a decision a script should make.
  const ownerId = process.env.DEMO_OWNER_ID ?? (supabaseConfigured() ? undefined : LOCAL_USER_ID);
  if (!ownerId) {
    console.error("Set DEMO_OWNER_ID to your Supabase user id before running this script.");
    await prisma.$disconnect();
    process.exit(1);
  }

  // This script wipes that user's cards, reviews and tasks. The review log is the
  // one thing in this app that cannot be reconstructed, so it refuses to run
  // against a deck that looks real unless you say so explicitly.
  const existingReviews = await prisma.review.count({ where: { ownerId } });
  if (existingReviews > 20 && !process.argv.includes("--force")) {
    console.error(
      `Refusing to run: this account has ${existingReviews} reviews in it.\n` +
      `That history cannot be recreated. Take a backup from Settings first, then\n` +
      `re-run with --force if you really want to replace it with demo data.`,
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  await prisma.review.deleteMany({ where: { ownerId } });
  await prisma.card.deleteMany({ where: { ownerId } });
  await prisma.task.deleteMany({ where: { ownerId } });

  /*
    A DECK A BEGINNER COULD PLAUSIBLY HAVE, WHICH THIS HAD QUIETLY STOPPED BEING.

    It took the alphabetically first thirty nouns and verbs in the dictionary,
    and that was a fair sample of a 360-word seed. The harvest and the built
    expansion took the dictionary past five thousand words and nobody re-read
    what "alphabetically first" now meant: `aabe`, `aadressiraamat`, `aamissepp`,
    `aardelaegas`, `aatomipomm`, `aberratsioon`, `abieluvaraleping`. A treasure
    chest, an atom bomb, an aberration and a prenuptial agreement, in the deck
    of somebody eight weeks into A1.

    That is not only untidy. This fixture is what every screenshot shows, what
    every browser suite reviews, and what the grammar reference draws its "in
    real words" table from, so the app demonstrated itself in vocabulary that
    argued against it.

    The course's own A1 nouns and verbs instead, which is 244 words to draw
    thirty from and gives `aitama`, `algama`, `alustama`, `andma`, `armastama`,
    `armastus`, `arst`, `auto`, `buss`, `elama`, `ema`, `hommik`. Still
    alphabetical, so the deck is the same deck on every run, which is what the
    suites need. Which four of them get the whole card range is decided below
    by what they can carry, not by where they sort.

    The query cannot silently widen again: a word is in this deck because the
    syllabus put it there and marked it A1, rather than because of where it
    happens to sort.
  */
  const pool = await prisma.lexeme.findMany({
    where: { pos: { in: ["NOUN", "VERB"] }, cefr: "A1", provenance: "SEED" },
    include: { forms: true },
    orderBy: { lemma: "asc" },
  });
  const first30 = pool.slice(0, DECK_WORDS);
  if (first30.length < DECK_WORDS) {
    console.error(
      `Only ${first30.length} A1 course words are seeded, so this deck would be thin.\n` +
      `Run \`npm run db:seed\` first: the demo is built from the course vocabulary.`,
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  /*
    THE RICH WORDS ARE FOUR THAT CAN DEMONSTRATE WHAT THE SUITES READ.

    This gave the whole card range to `i < 4`, the first four alphabetically,
    and then to the first four carrying a genitive singular, because a genitive
    stem was what a case card needed. Both were a stand-in for the question
    `availableCardTypes` asks, and both went stale the moment the answer moved:
    the first version laid down a deck with **no case-form cards at all**, since
    the first five words this query returns are verbs and a verb has no genitive
    singular.

    A genitive stem is no longer the answer either. A case is drilled in a
    sentence that uses it, so `detsember` builds a seesütlev card and `aadress`
    builds nothing, and reading a stem would put this fixture back exactly where
    it was. The builder is asked instead, which is the only version of this that
    cannot go stale again: whatever decides a case card tomorrow decides this.

    AND IT NAMES THE SLOTS THE SUITES NEED RATHER THAN HOPING FOR THEM. Two
    checks read a specific case off this deck and neither can say so for itself:
    `test-teaching.mjs` drills `/review?case=INESSIVE`, and the answer-time
    panel on Progress only draws where one slot is slow, which is `SLOW_SLOT`.
    Picking the first four case-capable words gives arvuti, auto, buss and
    detsember, which covers the first by luck and misses the second, and a
    fixture that covers a suite by luck is a suite that fails the day the
    dictionary shifts under it. Each named slot gets a word chosen for it, the
    rest fill up to four, and a slot nothing can demonstrate stops the run and
    says which.
  */
  const caseCards = new Map(
    pool.map((lex) => [lex.id, generateCards(lex as LexemeForCards, ["CASE_FORM", "CONJUGATION"])] as const),
  );
  const caseCapable = pool.filter((lex) => (caseCards.get(lex.id)?.length ?? 0) > 0);

  const rich = new Map<string, (typeof pool)[number]>();
  for (const slot of DEMO_SLOTS) {
    const found = caseCapable.find((lex) =>
      caseCards.get(lex.id)!.some((c) => c.targetCase === slot || c.slot === slot));
    if (!found) {
      console.error(
        `No A1 course word builds a ${slot} card, so the suites that read one would have ` +
        "nothing to look at and would report it as an app fault.\n" +
        "Run `npm run db:seed` first: the demo is built from the course vocabulary.",
      );
      await prisma.$disconnect();
      process.exit(1);
    }
    rich.set(found.id, found);
  }
  const struggling = [...rich.values()].find((lex) => lex.pos === "VERB")?.id ?? null;
  for (const lex of caseCapable) {
    if (rich.size >= RICH_WORDS) break;
    rich.set(lex.id, lex);
  }
  if (rich.size < RICH_WORDS) {
    console.error(
      `Only ${rich.size} A1 course words can build a case-form card, so this deck would ` +
      "have too few and the drills built on them would have nothing to ask.\n" +
      "Run `npm run db:seed` first: the demo is built from the course vocabulary.",
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  /*
    The thirty alphabetically first, in their own order so each keeps the review
    history its index picks, plus any rich word that did not fall inside them.
    Appending rather than substituting is what keeps the deck the same deck on
    every run and the same deck it was before this.
  */
  const lexemes = [
    ...first30,
    ...[...rich.values()].filter((lex) => !first30.some((other) => other.id === lex.id)),
  ];

  for (const [i, lex] of lexemes.entries()) {
    const types = rich.has(lex.id)
      ? (["RECOGNITION", "PRODUCTION", "CASE_FORM", "CONJUGATION", "GRADATION", "GOVERNMENT"] as const)
      : (["RECOGNITION", "PRODUCTION"] as const);
    const cards = generateCards(lex as LexemeForCards, [...types]);
    for (const c of cards) {
      // Eight weeks of history rather than two, so the heatmap, the forecast and
      // the accuracy trend on /progress all have something real to draw.
      let s = emptyScheduling(new Date(Date.now() - 56 * 86400000));
      const history = c.targetCase === SLOW_SLOT
        ? SLOW_HISTORY
        : lex.id === struggling
          ? STRUGGLE_HISTORY
          : HISTORIES[i % HISTORIES.length]!;
      const reviews: { rating: number; at: Date; stateBefore: number }[] = [];
      history.forEach((r, n) => {
        const daysAgo = Math.max(0, 54 - n * 6 - (i % 5));
        const at = new Date(Date.now() - daysAgo * 86400000 + n * 3600000);
        // The FSRS state the card was in when the question was asked, exactly as
        // gradeCard records it. Without it the demo's retention reading has
        // nothing mature to measure and the chart it feeds looks broken.
        reviews.push({ rating: r, at, stateBefore: s.state });
        s = grade(s, r as 1 | 2 | 3 | 4, at);
      });
      const card = await prisma.card.create({
        data: {
          ownerId, lexemeId: lex.id, cardType: c.cardType, front: c.front, back: c.back,
          hint: c.hint, targetCase: c.targetCase, slot: c.slot, source: "DICTIONARY",
          due: history.length ? s.due : new Date(Date.now() - 3600000),
          stability: s.stability, difficulty: s.difficulty, reps: s.reps,
          lapses: s.lapses, state: s.state, learningSteps: s.learningSteps,
          lastReview: s.lastReview, elapsedDays: s.elapsedDays, scheduledDays: s.scheduledDays,
        },
      });
      for (const r of reviews) {
        /*
          Written the way `writeGrade` writes them, because a fixture that
          fills a column differently from the app is a fixture that tests a
          different app. The slot is the card's own facet, which is exactly
          `slotOfCard`; the reached form is recorded only on a missed answer
          of a case that has a partner, and only where the two differ, which
          is the rule `reachedFor` applies on the way in.
        */
        const slot = c.targetCase ?? c.cardType;
        const swapped = r.rating < 3 ? SWAPPED_FOR[slot] : undefined;
        await prisma.review.create({
          data: {
            ownerId, cardId: card.id, lexemeId: card.lexemeId,
            rating: r.rating, reviewedAt: r.at,
            durationMs: SLOT_MS[slot] ?? MEANING_MS,
            stateBefore: r.stateBefore, targetCase: c.targetCase,
            slot,
            reachedSlot: swapped && swapped !== slot ? swapped : null,
          },
        });
      }
    }
  }

  await prisma.task.createMany({
    data: [
      /*
        The two tags a deployment can actually write, from `TASK_TAGS`.

        This wrote GRAMMAR and LISTENING as well, which no action in the app
        produces: they are the remains of the cut `/tasks` page, and the fixture
        was showing every screenshot and every browser suite a kind of task
        nobody can create. A fixture that draws a feature the app does not have
        is worse than a thin one, because it is the state everything is measured
        in.
      */
      { ownerId, title: "Exercise 4B, partitive plural", tag: "HOMEWORK", dueAt: new Date(Date.now() + 2 * 86400000) },
      { ownerId, title: "Learn week 6 vocabulary (24 words)", tag: "VOCABULARY", dueAt: new Date(Date.now() - 86400000) },
      { ownerId, title: "Listen to Vikerraadio for 20 minutes", tag: "HOMEWORK" },
      { ownerId, title: "Write 5 sentences using the comitative", tag: "HOMEWORK", completed: true, completedAt: new Date() },
    ],
  });

  /*
    A class, with this learner in it as its teacher.

    Not decoration. In local mode `/class` deliberately replaces the create and
    join forms with the reason there is nobody to share with, so
    `/class/[classroomId]` is a screen no browser suite can reach by driving
    the app: it needs a row to exist first. Without one,
    `scripts/test-containment.mjs` waives twenty checks on a real screen for
    want of a fixture, which is the sort of hole a waiver is supposed to
    report rather than create.
  */
  const classroom = await prisma.classroom.upsert({
    where: { code: DEMO_CLASS_CODE },
    update: {},
    create: { name: "Eesti keel A2, teisipäev", code: DEMO_CLASS_CODE, ownerId },
  });
  await prisma.classroomMember.upsert({
    where: { classroomId_ownerId: { classroomId: classroom.id, ownerId } },
    update: {},
    create: { classroomId: classroom.id, ownerId, role: "TEACHER", displayName: "You" },
  });

  /*
    And a workplace group, for exactly the reason the class above exists.

    `/class/[classroomId]` renders two different screens depending on
    `Classroom.kind`, and only one of them had a row. So the sponsor's view was
    unreachable by every browser suite: never measured for containment at 360,
    never measured for contrast in either theme, never walked by axe. A screen
    no fixture can reach is a screen whose rules are enforced on paper only,
    which is the fault the comment above this one describes, one variant along.

    Three members, because the interesting states are plural: this learner has
    two months of history behind them and can be banded, and the two colleagues
    have none, which is what most of a real cohort looks like in its first
    fortnight and is the row the band deliberately refuses to place.
  */
  const workplace = await prisma.classroom.upsert({
    where: { code: DEMO_WORKPLACE_CODE },
    update: {},
    create: {
      name: "Estonian at work, autumn",
      code: DEMO_WORKPLACE_CODE,
      ownerId,
      kind: "WORKPLACE",
      targetLevel: "B1",
    },
  });
  for (const member of [
    { ownerId, role: "TEACHER", displayName: "You" },
    { ownerId: `${ownerId}-demo-colleague-1`, role: "STUDENT", displayName: "Kadri" },
    { ownerId: `${ownerId}-demo-colleague-2`, role: "STUDENT", displayName: "Jaan" },
  ]) {
    await prisma.classroomMember.upsert({
      where: { classroomId_ownerId: { classroomId: workplace.id, ownerId: member.ownerId } },
      update: {},
      create: { classroomId: workplace.id, ...member },
    });
  }

  /*
    The week this learner says they are in, and a level they are aiming at.

    Both are preconditions rather than decoration, and both were missing. The
    week decides whether `/week` renders its picker at all, so the two contrast
    faults sitting on that screen were invisible to every suite: a pass can only
    measure a state it can reach, and nothing here had ever set one. The target
    and the deadline are what Today's countdown needs before it draws anything,
    for the same reason.
  */
  for (const [key, value] of [
    ["goalTarget", "B1"],
    ["goalDeadline", new Date(Date.now() + 47 * 86_400_000).toISOString()],
  ] as const) {
    await prisma.setting.upsert({
      where: { ownerId_key: { ownerId, key } },
      update: { value },
      create: { ownerId, key, value },
    });
  }

  console.log("cards:", await prisma.card.count({ where: { ownerId } }), "reviews:", await prisma.review.count({ where: { ownerId } }));
  await prisma.$disconnect();
}
main();
