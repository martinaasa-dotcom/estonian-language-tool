import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { bandsAround } from "@/lib/collections/levels";
import { occasionsFor } from "@/lib/copy/almanac";
import { matchesGloss } from "@/lib/dict/gloss";
import type { DayKey } from "@/lib/time/day";
import { wordOfDay } from "./wordOfDay";

/**
 * WHICH WORD, FOR WHOM, CHECKED AGAINST A REAL DICTIONARY.
 *
 * The complaint this suite exists for was one sentence: an account set to
 * learn B1 opened the app and was taught `keskmine`, an A1 adjective meaning
 * "average". That word matches no gloss the almanac can ask for, which is how
 * we know which of the two paths produced it, and the fallback path filtered
 * on nothing at all: it counted every entry with a gloss and took whichever
 * one the day's number landed on.
 *
 * Both halves of the fix need a database to say anything. The band is a
 * `cefr` column, the pool is six thousand rows wide, and the whole claim is
 * about which row a skip lands on, so a fixture of three invented words could
 * not fail here in the way that matters.
 */

const OWNER = "itest-owner-wordofday";

/*
  A day whose occasion asks for three ordinary meanings. Nothing about the
  test depends on which day it is; it is fixed rather than today's so the
  suite gives the same answer in March as in October.
*/
const DAY = "2026-03-17" as DayKey;
const DAY_START = new Date("2026-03-17T00:00:00Z");

/**
 * Two words carrying one meaning, one at each of two bands.
 *
 * Invented rather than borrowed from the seed, for the reason every fixture in
 * this repository is: `Lexeme` is unique on `(lemma, pos)`, so a fixture that
 * writes a word the dictionary already holds sits beside it with no forms
 * behind it, in a dictionary every later suite shares. Spelled so nobody could
 * mistake either for Estonian, because this app writes none (ADR-005) and
 * neither do its fixtures. The same length, so the only thing separating them
 * in the ranking is the band.
 */
const EASY = "itestwodaaaaa";
const HARD = "itestwodbbbbb";

async function wipe() {
  await prisma.starredWord.deleteMany({ where: { ownerId: OWNER } });
  await prisma.lexeme.deleteMany({ where: { lemma: { startsWith: "itestwod" } } });
}

/** Everything the day could otherwise answer with, put out of reach. */
async function starThemed(except: string[] = []) {
  const glosses = [...new Set(occasionsFor(DAY).flatMap((o) => o.glosses))];
  const rows = await prisma.lexeme.findMany({
    where: { OR: glosses.map((gloss) => ({ translation: { contains: gloss, mode: "insensitive" as const } })) },
    select: { id: true, lemma: true, translation: true },
  });
  const matched = rows.filter(
    (row) => !except.includes(row.lemma) && glosses.some((gloss) => matchesGloss(row.translation, gloss)),
  );
  await prisma.starredWord.createMany({
    data: matched.map((row) => ({ ownerId: OWNER, lexemeId: row.id })),
    skipDuplicates: true,
  });
}

beforeEach(wipe);
afterAll(async () => { await wipe(); await prisma.$disconnect(); });

describe("the word of the day and the learner's level", () => {
  it("prefers the band among words carrying the day's meaning equally well", async () => {
    await prisma.lexeme.createMany({
      data: [
        { lemma: EASY, pos: "NOUN", translation: "spring", cefr: "A1" },
        { lemma: HARD, pos: "NOUN", translation: "spring", cefr: "B1" },
      ],
    });
    await starThemed([EASY, HARD]);

    const beginner = await wordOfDay(OWNER, DAY, DAY_START, "A1");
    const middle = await wordOfDay(OWNER, DAY, DAY_START, "B1");

    expect(beginner?.lemma).toBe(EASY);
    expect(middle?.lemma).toBe(HARD);
    // And it arrived with its reason, which is what the themed path is for.
    expect(middle?.occasion).not.toBeNull();
  });

  /**
   * The band is a tie-break under the sense and never over it.
   *
   * Measured over a year of the shipped dictionary before this was written:
   * banding the themed pick outright moved 37 days of 336 off the word whose
   * first sense is the day's meaning and onto one whose fourth sense is. The
   * almanac asks for `snow`, `hand` and `week`, and there is no B1 word for
   * snow. A word chosen for today has to be a word for today first.
   */
  it("never takes a worse sense to reach the band", async () => {
    await prisma.lexeme.createMany({
      data: [
        { lemma: EASY, pos: "NOUN", translation: "spring", cefr: "A1" },
        { lemma: HARD, pos: "NOUN", translation: "coil, hinge, spring", cefr: "B1" },
      ],
    });
    await starThemed([EASY, HARD]);

    expect((await wordOfDay(OWNER, DAY, DAY_START, "B1"))?.lemma).toBe(EASY);
  });

  /**
   * And the path with no meaning to honour bands outright.
   *
   * This is where `keskmine` came from. Two learners on the same morning used
   * to get one word between them, because the pool was every entry with a
   * gloss and the skip was the day: identical query, identical answer. So the
   * sharp half of this is that the levels disagree at all.
   */
  it("bands the fallback, so two levels get two different words", async () => {
    await starThemed();

    const picks = await Promise.all(
      (["A1", "B1", "C1"] as const).map(async (level) => ({
        level,
        word: await wordOfDay(OWNER, DAY, DAY_START, level),
      })),
    );

    for (const { level, word } of picks) {
      expect(word, `${level} was given no word at all`).not.toBeNull();
      // Graded, which is also ADR-024's rule: an entry with no band is the
      // tail of the Wiktionary expansion, and `aberratsioon` is no better a
      // word of the day than it was a suggestion.
      expect(bandsAround(level), `${level} was taught ${word?.lemma} (${word?.cefr})`)
        .toContain(word?.cefr);
      expect(word?.occasion).toBeNull();
    }
    expect(new Set(picks.map((p) => p.word?.lemma)).size).toBeGreaterThan(1);
  });

  it("gives the same learner the same word twice in one day", async () => {
    await starThemed();
    const first = await wordOfDay(OWNER, DAY, DAY_START, "B1");
    const again = await wordOfDay(OWNER, DAY, DAY_START, "B1");
    expect(again?.lemma).toBe(first?.lemma);
  });
});
