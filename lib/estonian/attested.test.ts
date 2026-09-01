/*
  EVERY FORM THE SHIPPED DICTIONARY ATTESTS IS THE FORM THE APP SHOWS.

  This exists because the app taught `toasse` for a year. The illative is the
  one case of the eleven with a lexically unpredictable form, the dictionary
  held it for 2,969 entries under `ILL_SG_SHORT`, and `NounStems` had no field
  to put it in, so every screen printed a suffix on the genitive instead: the
  landing page's own demonstration, the dictionary entry, the grammar
  reference, and the back of a flashcard the scheduler then drilled.

  A unit test rather than an invariant, because the question is about 5,363
  rows of data rather than about the shape of the source, and because it has to
  be able to fail on a word: an invariant that reads the code cannot tell
  whether `tuppa` is what comes out the other end.

  Hermetic. It reads the two files `npm run db:seed` loads and nothing else.
*/
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildCaseTable, caseAnswer, stemsFromParts } from "./derive";
import { HARVESTED } from "../../prisma/data/harvested";

interface SeedEntry {
  lemma: string;
  pos: string;
  forms: { formType: string; value: string }[];
}

const EXPANDED: SeedEntry[] = JSON.parse(readFileSync("prisma/data/expanded.json", "utf8"));

/** Every shipped entry as a `formType` → value map, which is what `parts` is. */
function shippedWords(): { lemma: string; pos: string; parts: Record<string, string> }[] {
  const out = EXPANDED.map((e) => ({
    lemma: e.lemma,
    pos: e.pos,
    parts: Object.fromEntries(e.forms.map((f) => [f.formType, f.value])),
  }));
  for (const w of HARVESTED) out.push({ lemma: w.lemma, pos: w.pos, parts: { ...w.parts } });
  return out;
}

const WORDS = shippedWords();
const WITH_SHORT = WORDS.filter((w) => w.parts.ILL_SG_SHORT && w.parts.GEN_SG);

/**
 * A short illative worth leading with: one that is not already the spelling of
 * a principal part.
 *
 * 2,044 of the 2,966 recorded short illatives are syncretic with one, and for
 * those the illative reading is the rare one: `aega` is overwhelmingly the
 * partitive of `aeg`, and `aadressi` is the genitive and the partitive of
 * `aadress` as well. Leading with them prints one word under two or three
 * names and hides the form somebody writing a sentence needs.
 */
const DISTINCT = WITH_SHORT.filter(
  (w) => ![w.parts.NOM_SG, w.parts.GEN_SG, w.parts.PART_SG].includes(w.parts.ILL_SG_SHORT),
);

describe("the shipped dictionary", () => {
  it("is actually loaded, so a passing run means something", () => {
    expect(WORDS.length).toBeGreaterThan(5000);
    expect(WITH_SHORT.length).toBeGreaterThan(2000);
    expect(DISTINCT.length).toBeGreaterThan(500);
  });

  /*
    The check can fail, and this is the line that proves it. Every one of these
    has a short illative that no ending on the genitive stem produces, which is
    what the app used to print for all of them.
  */
  it("holds hundreds of short illatives the suffix rule gets wrong", () => {
    const differ = DISTINCT.filter((w) => w.parts.ILL_SG_SHORT !== `${w.parts.GEN_SG}sse`);
    expect(differ.length).toBe(DISTINCT.length);
  });

  it("leads with the attested short illative wherever it is a word of its own", () => {
    const wrong: string[] = [];
    for (const w of DISTINCT) {
      const shown = buildCaseTable(stemsFromParts(w.parts)).find((r) => r.spec.key === "ILLATIVE");
      if (shown?.singular !== w.parts.ILL_SG_SHORT) {
        wrong.push(`${w.lemma}: shows ${shown?.singular}, dictionary says ${w.parts.ILL_SG_SHORT}`);
      }
    }
    expect(wrong.slice(0, 8)).toEqual([]);
  });

  it("marks those as stored rather than derived, so the provenance label is true", () => {
    const mislabelled = DISTINCT.filter(
      (w) => caseAnswer(stemsFromParts(w.parts), "ILLATIVE")?.origin !== "STORED",
    );
    expect(mislabelled.map((w) => w.lemma).slice(0, 8)).toEqual([]);
  });

  /*
    The other side of the guard. Declining to lead with a syncretic form is a
    decision about the screen; a marker has no business inheriting it, because
    the dictionary does record the form under that case.
  */
  it("does not lead with one that is already a principal part, but still accepts it", () => {
    const syncretic = WITH_SHORT.filter((w) => !DISTINCT.includes(w));
    expect(syncretic.length).toBeGreaterThan(1000);

    const led: string[] = [];
    const unaccepted: string[] = [];
    for (const w of syncretic) {
      const answer = caseAnswer(stemsFromParts(w.parts), "ILLATIVE");
      if (answer?.value === w.parts.ILL_SG_SHORT) led.push(w.lemma);
      if (!answer?.accepted.includes(w.parts.ILL_SG_SHORT!)) unaccepted.push(w.lemma);
    }
    expect(led.slice(0, 8)).toEqual([]);
    expect(unaccepted.slice(0, 8)).toEqual([]);
  });

  it("still accepts the regular form everywhere, so knowing both is never marked wrong", () => {
    const missing = WITH_SHORT.filter(
      (w) => !caseAnswer(stemsFromParts(w.parts), "ILLATIVE")?.accepted.includes(`${w.parts.GEN_SG}sse`),
    );
    expect(missing.map((w) => w.lemma).slice(0, 8)).toEqual([]);
  });

  /*
    Named and spelled out, because a count over five thousand rows is easy to
    satisfy by accident and these are the words a person can check against a
    dictionary in a minute. Every one was read out of the shipped data rather
    than remembered.
  */
  it("gets the words a reader would look up first right", () => {
    const expected: Record<string, string> = {
      tuba: "tuppa", abi: "appi", ajalugu: "ajalukku", käsi: "kätte",
      maja: "majja", pea: "pähe", suu: "suhu", töö: "töhe",
    };
    for (const [lemma, illative] of Object.entries(expected)) {
      const word = WORDS.find((w) => w.lemma === lemma && w.parts.ILL_SG_SHORT);
      if (!word) continue;
      expect(`${lemma} → ${caseAnswer(stemsFromParts(word.parts), "ILLATIVE")?.value}`)
        .toBe(`${lemma} → ${illative}`);
    }
  });

  /*
    The other ten really are regular, which is what makes the illative worth
    singling out rather than distrusting the whole table.
  */
  it("leaves the ten regular cases as suffixes on the genitive stem", () => {
    const sample = WORDS.filter((w) => w.parts.GEN_SG).slice(0, 400);
    for (const w of sample) {
      const stems = stemsFromParts(w.parts);
      expect(caseAnswer(stems, "INESSIVE")?.value).toBe(`${w.parts.GEN_SG}s`);
      expect(caseAnswer(stems, "COMITATIVE")?.value).toBe(`${w.parts.GEN_SG}ga`);
    }
  });
});
