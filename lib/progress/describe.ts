import { prisma } from "@/lib/db";
import { emojiFor } from "@/lib/collections/emoji";
import { bandsAround } from "@/lib/collections/levels";
import { SCENES, SCENE_LEMMAS, sceneLevel } from "@/lib/collections/scenes";
import type { Level } from "@/lib/collections/syllabus/types";
import { ASKABLE_CASES, taskFor, type DescribeTask, type SceneWord } from "@/lib/games/describe";
import { parseExamples, sentenceContaining, sentenceWords, type Example } from "@/lib/dict/examples";
import { naturalSentence } from "@/lib/estonian/cloze";
import { looksLikeSentence } from "@/lib/estonian/writing";
import { sceneAnswerFor } from "@/lib/collections/sceneAnswers";
import { oneEntryPerLemma } from "@/lib/dict/search";
import { caseReviewsFor } from "@/lib/progress/cases";
import { shuffle } from "@/lib/random/shuffle";
import { caseAccuracy } from "@/lib/stats/history";

/**
 * WHICH SCENES THIS LEARNER IS ASKED ABOUT, AND WHICH CASE EACH ONE ASKS FOR.
 *
 * `lib/collections/scenes.ts` is the table of situations; this is the half
 * that needs a database, which is the split every other pair in this app has.
 *
 * A SCENE IS AS HARD AS ITS HARDEST WORD, read off the entries rather than
 * declared, so a reseed that re-bands a word moves the scene with it and there
 * is no second answer to go stale. Within one band either side of the learner,
 * which is `bandsAround`, the table every other screen bands by.
 *
 * THE CASE COMES FROM THEIR OWN LOG. `caseReviewsFor` and `caseAccuracy` are
 * the one query and the one calculation behind "your weakest cases" everywhere
 * in this app, and reaching for them here rather than writing a fourth
 * `groupBy` is the whole point of their existing: a learner told on Progress
 * that their seesütlev is the weak one should be asked for the seesütlev.
 * Where the log is too thin to say, the case is drawn at random from the
 * eleven, which is honest rather than pretending to a diagnosis.
 *
 * IT GRADES REAL CARDS WHERE IT CAN (ADR-016). A scene whose word is already
 * in the deck carries that card's id and the round writes to the same review
 * log as everything else. A scene whose words are all new carries none, and
 * nothing is graded for it, which is the same answer `/review/emoji` gives:
 * a row about a card that does not exist would be worse than no row.
 */

/** A task with the card it practises, where the learner has one. */
export interface DescribePrompt {
  readonly task: DescribeTask;
  /** The card the named word already has in this deck, or null. */
  readonly cardId: string | null;
}

/** Five, which is about six minutes of writing. */
const ROUND = 5;

/** Below this many reviews of a case, the log is not saying anything. */
const MIN_CASE_REVIEWS = 6;

export async function describeRound(
  ownerId: string, level: Level, size = ROUND,
): Promise<DescribePrompt[]> {
  /*
    One read of every word any scene names, which is 180 lemmas and one `IN`.

    A lemma can hold two entries, by design and by accident: `hall` is a noun
    and an adjective, and a word somebody confirmed off a photograph sits
    beside the seeded one with no forms behind it. Keeping the first row back
    would be the query plan choosing which `tuba` a scene is about, so
    `oneEntryPerLemma` decides, which is `bySubstance`, the rule the dictionary
    itself leads with. A scene disagreeing with the search box about which
    entry a word is would be worse than either answer alone.
  */
  const rows = await prisma.lexeme.findMany({
    where: { lemma: { in: [...SCENE_LEMMAS] }, pos: "NOUN" },
    select: {
      id: true, lemma: true, translation: true, cefr: true, pos: true, provenance: true,
      // Which local cases the word takes: see lib/estonian/caseQuestion.ts.
      semanticTypes: true,
      forms: { select: { formType: true, value: true } },
    },
    orderBy: [{ lemma: "asc" }, { id: "asc" }],
  });

  const entry = new Map<string, (typeof rows)[number]>();
  for (const row of oneEntryPerLemma(rows, SCENE_LEMMAS)) entry.set(row.lemma, row);

  const bands = new Set(bandsAround(level));
  const [reviews, deck] = await Promise.all([
    caseReviewsFor(ownerId),
    prisma.card.findMany({
      where: { ownerId, suspended: false, lexemeId: { in: rows.map((r) => r.id) } },
      select: { id: true, lexemeId: true, cardType: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);

  /*
    The card a scene's word is practised through. A case-form card is the
    closest match to what this round actually asks, and production is the
    fallback, which is the ranking `/review/write` already settled on.
  */
  const cardFor = new Map<string, string>();
  for (const card of deck) {
    if (!card.lexemeId) continue;
    const better = card.cardType === "CASE_FORM" || card.cardType === "PRODUCTION";
    if (!cardFor.has(card.lexemeId) || better) cardFor.set(card.lexemeId, card.id);
  }

  const weak = caseAccuracy(reviews, MIN_CASE_REVIEWS)
    .map((c) => c.grammCase)
    .filter((c): c is (typeof ASKABLE_CASES)[number] =>
      (ASKABLE_CASES as readonly string[]).includes(c));

  /*
    Every scene the dictionary can fill at this level, in a random order with
    the ones this deck can grade brought to the front. `sort` is stable, so the
    shuffle survives inside each group: a learner meets a different five each
    time, and the ones that write to their review log come first (ADR-016).
  */
  interface Candidate { scene: (typeof SCENES)[number]; words: SceneWord[]; askIndex: number; cardId: string | null }
  const candidates: Candidate[] = [];

  for (const scene of shuffle(SCENES)) {
    const words: SceneWord[] = [];
    for (const lemma of scene.lemmas) {
      const row = entry.get(lemma);
      const emoji = emojiFor(lemma);
      if (!row || !emoji) break;
      words.push({
        lemma: row.lemma,
        pos: "NOUN",
        translation: row.translation,
        semanticTypes: row.semanticTypes,
        emoji,
        forms: row.forms,
      });
    }
    if (words.length !== scene.lemmas.length) continue;

    const band = sceneLevel(scene.lemmas.map((l) => (entry.get(l)?.cefr ?? null) as Level | null));
    if (!band || !bands.has(band)) continue;

    /*
      The word to ask about is one the learner already has a card for wherever
      the scene holds one, because that is what makes this a practice mode
      rather than a side game with a score of its own.
    */
    const order = shuffle(words.map((_, i) => i));
    const withCard = order.find((i) => cardFor.has(entry.get(words[i]!.lemma)!.id));
    const askIndex = withCard ?? order[0]!;
    candidates.push({
      scene, words, askIndex,
      cardId: cardFor.get(entry.get(words[askIndex]!.lemma)!.id) ?? null,
    });
  }
  candidates.sort((a, b) => Number(b.cardId !== null) - Number(a.cardId !== null));

  /*
    A ROUND IS FIVE DIFFERENT CASES, NOT THE WEAKEST ONE FIVE TIMES.

    The first draft asked the weakest case of every scene, and on a real log
    that is one case for the whole round: the demo learner's elative came back
    five times out of five, which is a drill wearing a round's clothes. The
    feedback that asked for this mode asked for case variety by name.

    So the priority list is walked rather than read: the weakest case leads,
    the next scene takes the next weakest, and the cursor only moves past a
    case an entry could actually build. A learner still meets their worst case
    first, and meets four others in the same five minutes.
  */
  const priority = [...weak, ...shuffle(ASKABLE_CASES.filter((c) => !weak.includes(c)))];
  const prompts: DescribePrompt[] = [];
  let cursor = 0;

  for (const candidate of candidates) {
    if (prompts.length >= size) break;

    let task: DescribeTask | null = null;
    for (let step = 0; step < priority.length; step++) {
      const caseKey = priority[(cursor + step) % priority.length]!;
      task = taskFor(candidate.scene, candidate.words, candidate.askIndex, caseKey);
      if (task) { cursor = (cursor + step + 1) % priority.length; break; }
    }
    if (!task) continue;

    prompts.push({ task, cardId: candidate.cardId });
  }

  return prompts;
}

/**
 * One scene rebuilt on the server, for marking.
 *
 * The browser posts a scene id, a case and a sentence, and never a mark, which
 * is the mock examination's rule (ADR-022) and the reason this exists beside
 * the round builder: what is marked has to be assembled from the dictionary
 * again rather than from anything the client sent.
 */
/**
 * A sentence to read after answering, and what it is evidence of.
 *
 * Three sources and three different claims, which is why this is a labelled
 * union rather than a string: "a native speaker wrote this about this
 * picture", "a lexicographer wrote this with the very form you were asked
 * for", and "a lexicographer wrote this with this word in it" are worth
 * different amounts, and printing the third under the second's heading is the
 * kind of small dishonesty a learner catches once and then stops trusting.
 */
export interface ModelAnswer {
  readonly et: string;
  readonly source: "contributed" | "this-form" | "this-word";
}

export interface RebuiltTask {
  readonly task: DescribeTask;
  /**
   * A sentence to show once the answer has been marked, and where it came from.
   *
   * Two sources and the better one wins. A native speaker's sentence about
   * this picture is what a learner most wants to see and is the one thing the
   * dictionary cannot supply, because a usage is recorded to illustrate a word
   * rather than to describe a situation. Where none has been contributed, an
   * attested Ekilex usage carrying the very form the task asked for is the
   * honest second, and it is what makes this feature complete with nothing
   * contributed at all.
   *
   * Null where neither exists. A model is never asked for one: a sentence a
   * learner is invited to copy is exactly the Estonian this project does not
   * write (ADR-005).
   */
  readonly answer: ModelAnswer | null;
}

export async function taskById(
  sceneId: string, caseKey: string, askLemma: string,
): Promise<RebuiltTask | null> {
  const scene = SCENES.find((s) => s.id === sceneId);
  if (!scene) return null;
  if (!(ASKABLE_CASES as readonly string[]).includes(caseKey)) return null;

  const askIndex = scene.lemmas.indexOf(askLemma);
  if (askIndex < 0) return null;

  const rows = await prisma.lexeme.findMany({
    where: { lemma: { in: [...scene.lemmas] }, pos: "NOUN" },
    select: {
      id: true, lemma: true, translation: true, examples: true, pos: true, provenance: true,
      semanticTypes: true,
      forms: { select: { formType: true, value: true } },
    },
    orderBy: [{ lemma: "asc" }, { id: "asc" }],
  });

  // The same rule as the round builder, and it matters more here: this is what
  // the marking is built from, so two entries for one lemma would mean a
  // learner marked against a paradigm the screen never showed them.
  const chosen = oneEntryPerLemma(rows, scene.lemmas);

  const words: SceneWord[] = [];
  for (const lemma of scene.lemmas) {
    const row = chosen.find((r) => r.lemma === lemma);
    const emoji = emojiFor(lemma);
    if (!row || !emoji) return null;
    words.push({
      lemma: row.lemma, pos: "NOUN", translation: row.translation, emoji,
      semanticTypes: row.semanticTypes, forms: row.forms,
    });
  }

  const task = taskFor(scene, words, askIndex, caseKey as (typeof ASKABLE_CASES)[number]);
  if (!task) return null;

  const contributed = sceneAnswerFor(scene.id);
  if (contributed) return { task, answer: { et: contributed.et, source: "contributed" } };

  const asked = chosen.find((r) => r.lemma === askLemma);
  return { task, answer: modelSentence(parseExamples(asked?.examples), task.shown, askLemma) };
}

/**
 * The dictionary's own sentence to put beside a learner's, or nothing.
 *
 * TWO FILTERS, AND NEITHER IS THE ONE `usableExamples` ALREADY APPLIES. That
 * one keeps what is worth showing on a dictionary entry, where a two-word
 * phrase illustrating a sense is exactly right. This panel makes a stronger
 * claim: it sits under a sentence somebody has just written and is read as
 * what they were reaching for. `Bussiaken.` and `Toores muna.` both came back
 * on the first run and neither is a sentence, so `naturalSentence` (the rule
 * the mock exam and the level check already share about what a usage can be
 * asked about) and a three-word floor both have to pass.
 *
 * THE FORM DECIDES WHICH ONE, not the order they were recorded in: a learner
 * asked for the seesütlev learns nothing from a usage carrying the nominative,
 * so a sentence containing the very form the task asked for wins outright.
 *
 * AND THE LABEL CHANGES RATHER THAN THE PANEL DISAPPEARING. Requiring the
 * asked form was the first draft and it was measured: 131 of the 1,980 tasks
 * the dictionary can set, which is 6.6%, so the panel was absent from
 * ninety-three rounds in a hundred. Ekilex records a handful of usages per
 * word and this asks for eleven different cases, so most pairings simply have
 * no sentence and never will. What is not honest is showing a sentence in the
 * wrong case under a label claiming the right one, so there are two labels for
 * two claims and the screen prints whichever is true.
 */
function modelSentence(
  examples: Example[], wanted: readonly string[], lemma: string,
): ModelAnswer | null {
  const usable = examples.filter((e) => naturalSentence(e.et) && looksLikeSentence(e.et));
  for (const form of wanted) {
    const found = sentenceContaining(usable, form);
    if (found) return { et: found.et, source: "this-form" };
  }
  const any = usable.find((e) => sentenceWords(e.et).includes(lemma.toLocaleLowerCase("et")))
    ?? usable[0];
  return any ? { et: any.et, source: "this-word" } : null;
}
