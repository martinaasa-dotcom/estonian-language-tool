/**
 * The production cards that have two right answers, pinned so a thirteenth
 * cannot arrive quietly.
 *
 * A production card asks "English to Estonian" and accepts what is on its back.
 * Two course words that Ekilex gives one definition and the course gives one
 * gloss are therefore one question with two right answers, and a learner who
 * types the other one is marked wrong and shown the card again until they stop.
 * That is the fault the illative taught this project, arriving through the
 * vocabulary instead of through the morphology.
 *
 * THIS LIST IS A DEFECT LIST, NOT AN EXEMPTION LIST. Every entry is a card that
 * marks a right answer wrong today. The right fix is in the card pipeline: a
 * production card whose answer is one of a synonym set should accept the set,
 * exactly as a case card already puts every accepted spelling on its back and
 * `acceptedAnswers` splits them. That needs Ekilex's definition seeded into
 * `Lexeme.notes`, which is a column that exists and is written for phrases
 * only, so it is its own change rather than a rider on a syllabus unit. What
 * this test does is stop the list growing while that is true.
 *
 * Nine of the twelve predate the connective units and none of them was noticed
 * until the audit existed, which is the argument for the audit. Three arrived
 * with those units and were briefly deleted instead: `ning`, `vaid` and `enam`
 * were left out of the course for a day to avoid colliding with `ja`, `ainult`
 * and `rohkem`, which would have made one unit pay for a course-wide fault by
 * dropping three of the commonest words in Estonian. They are in, and reported.
 */
import { describe, expect, it } from "vitest";
import { HARVESTED } from "@/prisma/data/harvested";
import { COARSENS, mislabelled, pairKey, sharedSenses, type SenseWord } from "./senses";

const words: SenseWord[] = HARVESTED.map((w) => ({
  lemma: w.lemma, pos: w.pos, gloss: w.gloss, note: w.note, ekilexPos: w.ekilexPos,
}));

/**
 * Every pair whose production card is known to have two right answers.
 *
 * Keyed the way `pairKey` names them, with what the shared gloss is, so a
 * reader can see at a glance whether the pair is worth a distinct gloss or
 * whether both words genuinely mean the one thing.
 */
const KNOWN_COLLISIONS = new Map<string, string>([
  ["ainult = vaid", "both 'only'; Ekilex gives them one definition"],
  ["avalikkus = üldsus", "'the public sphere' and 'the public'"],
  ["defineerima = määratlema", "both 'to define'"],
  ["enam = rohkem", "both 'more'"],
  ["ja = ning", "both 'and'"],
  ["kalambuur = sõnamäng", "'pun' and 'wordplay, pun'"],
  ["nüüd = praegu", "'now' and 'right now, at the moment'"],
  ["oskussõna = termin", "'technical term' and 'term'"],
  ["sageli = tihti", "'often, frequently' and 'often'"],
  ["struktuur = ülesehitus", "both 'structure'"],
  ["söök = toit", "'food, a meal' and 'food'"],
  ["tähenduslik = tähendusrikas", "both 'meaningful'"],
]);

describe("one Ekilex sense, two right answers", () => {
  const { collisions } = sharedSenses(words);

  it("has not grown", () => {
    const found = collisions.map((p) => pairKey(p.a, p.b));
    const fresh = found.filter((k) => !KNOWN_COLLISIONS.has(k));
    expect(
      fresh,
      "a new pair of course words shares an Ekilex sense and an English gloss, so one production "
      + "card now marks a right answer wrong. Give one of them a gloss that tells them apart, or "
      + "add it here with the reason it has to stay.",
    ).toEqual([]);
  });

  /*
    Keeps the list honest. A pair that stops colliding, because somebody gave
    one of them a distinct gloss or the card pipeline learned to accept a set,
    has to come out, or the list becomes the parking space every exemption list
    turns into when nobody prunes it.
  */
  it("has no stale entry", () => {
    const found = new Set(collisions.map((p) => pairKey(p.a, p.b)));
    const stale = [...KNOWN_COLLISIONS.keys()].filter((k) => !found.has(k));
    expect(stale, "these no longer collide and should come off the list").toEqual([]);
  });

  /*
    The rule has to be able to fire. Written the way it was actually proved:
    the same two words with one gloss changed stop being a collision, so the
    check is reading the glosses rather than the lemmas.
  */
  it("fires on a collision and not on a distinguished pair", () => {
    const sense = "seob sisu poolest samaväärseid sõnu";
    const pair = (glossA: string, glossB: string): SenseWord[] => [
      { lemma: "a", pos: "ADVERB", gloss: glossA, note: sense, ekilexPos: ["konj"] },
      { lemma: "b", pos: "ADVERB", gloss: glossB, note: sense, ekilexPos: ["konj"] },
    ];
    expect(sharedSenses(pair("and", "and")).collisions).toHaveLength(1);
    expect(sharedSenses(pair("and", "and also")).collisions).toHaveLength(1);
    expect(sharedSenses(pair("and", "until")).collisions).toHaveLength(0);
    expect(sharedSenses(pair("and", "until")).disagreements).toHaveLength(1);
  });

  it("says nothing about words that do not share a sense", () => {
    const apart: SenseWord[] = [
      { lemma: "a", pos: "NOUN", gloss: "one", note: "üks asi", ekilexPos: ["s"] },
      { lemma: "b", pos: "NOUN", gloss: "one", note: "teine asi", ekilexPos: ["s"] },
    ];
    expect(sharedSenses(apart).collisions).toEqual([]);
  });
});

describe("the course's part of speech against Ekilex's", () => {
  /*
    Every course label has to be one Ekilex's own could reasonably coarsen to.
    This passed at zero the moment `num` was allowed on the two nominal labels,
    which is what a numeral needs to be here in order to have a case table at
    all, and it is the only widening the table has.
  */
  it("agrees on every word Ekilex has an opinion about", () => {
    const wrong = mislabelled(words).map((w) => `${w.lemma} is ${w.pos} here, ${w.ekilexPos.join("/")} there`);
    expect(wrong).toEqual([]);
  });

  it("fires when the two genuinely disagree", () => {
    const noun: SenseWord = { lemma: "x", pos: "NOUN", gloss: "x", note: null, ekilexPos: ["v"] };
    expect(mislabelled([noun])).toHaveLength(1);
  });

  /*
    A word Ekilex has no opinion about is not a disagreement. Asserted because
    the natural way to write the filter treats an empty list as "matches
    nothing" and fails every entry harvested before the field existed.
  */
  it("says nothing about a word with no Ekilex label", () => {
    const silent: SenseWord = { lemma: "x", pos: "NOUN", gloss: "x", note: null, ekilexPos: [] };
    expect(mislabelled([silent])).toEqual([]);
  });

  it("covers every label the course actually uses", () => {
    const used = new Set(words.map((w) => w.pos));
    for (const pos of used) {
      expect(COARSENS[pos], `${pos} is a course label with no coarsening written down`).toBeDefined();
    }
  });
});
