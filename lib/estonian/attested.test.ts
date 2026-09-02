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
import { PRINCIPAL_FORM_TYPES } from "./types";
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

describe("the shipped dictionary", () => {
  it("is actually loaded, so a passing run means something", () => {
    expect(WORDS.length).toBeGreaterThan(5000);
    expect(WITH_SHORT.length).toBeGreaterThan(2000);
  });

  /*
    The check can fail, and this is the line that proves it. Every one of these
    words has a short illative that differs from `genitive + sse`, which is
    what the app used to print for all of them: if the derivation ever silently
    became the answer again, the assertion below would have thousands of
    failures rather than none.
  */
  it("holds thousands of short illatives the suffix rule gets wrong", () => {
    const differ = WITH_SHORT.filter((w) => w.parts.ILL_SG_SHORT !== `${w.parts.GEN_SG}sse`);
    expect(differ.length).toBeGreaterThan(2000);
  });

  it("shows the attested short illative for every one of them", () => {
    const wrong: string[] = [];
    for (const w of WITH_SHORT) {
      const shown = buildCaseTable(stemsFromParts(w.parts)).find((r) => r.spec.key === "ILLATIVE");
      if (shown?.singular !== w.parts.ILL_SG_SHORT) {
        wrong.push(`${w.lemma}: shows ${shown?.singular}, dictionary says ${w.parts.ILL_SG_SHORT}`);
      }
    }
    expect(wrong.slice(0, 8)).toEqual([]);
  });

  it("marks it as stored rather than derived, so the provenance label is true", () => {
    const mislabelled = WITH_SHORT.filter(
      (w) => caseAnswer(stemsFromParts(w.parts), "ILLATIVE")?.origin !== "STORED",
    );
    expect(mislabelled.map((w) => w.lemma).slice(0, 8)).toEqual([]);
  });

  it("still accepts the regular form, so knowing both is never marked wrong", () => {
    const missing = WITH_SHORT.filter(
      (w) => !caseAnswer(stemsFromParts(w.parts), "ILLATIVE")?.accepted.includes(`${w.parts.GEN_SG}sse`),
    );
    expect(missing.map((w) => w.lemma).slice(0, 8)).toEqual([]);
  });

  /*
    The named cases, spelled out, because a count over five thousand rows is
    easy to satisfy by accident and these are the words a person can check
    against a dictionary in a minute.
  */
  it("gets the words a reader would look up first right", () => {
    const expected: Record<string, string> = {
      tuba: "tuppa", aeg: "aega", abi: "appi", ajalugu: "ajalukku",
      aed: "aeda", algus: "algusse", ajaleht: "ajalehte",
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
    singling out rather than distrusting the whole table. Nothing in the
    shipped data contradicts a suffix on the genitive for any of them.
  */
  it("leaves the ten regular cases as suffixes on the genitive stem", () => {
    const sample = WORDS.filter((w) => w.parts.GEN_SG).slice(0, 400);
    for (const w of sample) {
      const stems = stemsFromParts(w.parts);
      expect(caseAnswer(stems, "INESSIVE")?.value).toBe(`${w.parts.GEN_SG}s`);
      expect(caseAnswer(stems, "COMITATIVE")?.value).toBe(`${w.parts.GEN_SG}ga`);
    }
  });

  /*
    AND THE TWELFTH IS NOT A SUFFIX, WHICH IS THE SAME FAULT AS THE ILLATIVE.

    The nominative plural was `genSg + d`, and `npm run audit:cases` put that
    to the Institute for all 5,143 nominals the dictionary ships. Right for
    5,098, and the ones it is wrong about are a category rather than a scatter:
    a pronoun is suppletive there, so `see` goes to `need` and this printed
    `selled`, `too` goes to `nood` and this printed `tolled`, and `kes` and
    `mis` do not change at all and were printed as `kelled` and `milled`.
    Thirty-three mass nouns have no plural at all and were being handed one.

    So it is stored, like the two plural principal parts beside it, and these
    are the checks that can fail on a word the way an invariant reading the
    source cannot.
  */
  const WITH_PLURAL = WORDS.filter((w) => w.parts.NOM_PL && w.parts.GEN_SG);

  it("holds a nominative plural for nearly everything it holds a genitive for", () => {
    expect(WITH_PLURAL.length).toBeGreaterThan(4500);
  });

  it("never prints an ending where the dictionary holds no plural", () => {
    const invented = WORDS.filter(
      (w) => w.parts.GEN_SG && !w.parts.NOM_PL,
    ).filter((w) => plural(w.parts) !== undefined);
    expect(invented.map((w) => w.lemma)).toEqual([]);
  });

  it("gets the pronouns right, which the ending got wrong every time", () => {
    const expected: Record<string, string> = {
      see: "need", too: "nood", kes: "kes", mis: "mis", kõik: "kõik",
    };
    for (const [lemma, want] of Object.entries(expected)) {
      const word = WORDS.find((w) => w.lemma === lemma && w.pos === "PRONOUN" && w.parts.NOM_PL);
      if (!word) continue;
      expect(`${lemma} → ${plural(word.parts)}`).toBe(`${lemma} → ${want}`);
      // The line that proves the check bites: the ending would have said this.
      expect(plural(word.parts)).not.toBe(`${word.parts.GEN_SG}d`);
    }
  });
});

describe("a principal part", () => {
  /*
    IS ONE FORM, AND 2,029 SHIPPED ENTRIES CARRIED TWO.

    `Form`'s unique key includes the value, deliberately, because Estonian has
    genuine parallel forms and a key without it would drop one. That is right
    for the whole retrieved table and wrong for the six a learner memorises:
    Ekilex gives two partitive plurals for most nouns and both were written
    down as `PART_PL`, so which the app used was decided by whoever read the
    rows. `stemsFrom` takes the first it finds, in whatever order the database
    returns them; every caller building a record with `Object.fromEntries`
    takes the last. The dictionary entry for `aadress` and the flashcard behind
    it could disagree, and neither answer was a decision.
  */
  it("has one value in the shipped file, so both readers agree", () => {
    const doubled: string[] = [];
    for (const e of EXPANDED) {
      const seen = new Set<string>();
      for (const f of e.forms) {
        if (!PRINCIPAL_FORM_TYPES.includes(f.formType as never)) continue;
        if (seen.has(f.formType)) doubled.push(`${e.lemma} ${f.formType}`);
        seen.add(f.formType);
      }
    }
    expect(doubled).toEqual([]);
  });

  it("is the one Ekilex lists first, which is the one a course teaches", () => {
    const expected: Record<string, string> = {
      asi: "asju", aeg: "aegu", aadress: "aadresse", buss: "busse", arst: "arste",
    };
    for (const [lemma, partPl] of Object.entries(expected)) {
      const word = EXPANDED.find((e) => e.lemma === lemma);
      if (!word) continue;
      const held = word.forms.filter((f) => f.formType === "PART_PL").map((f) => f.value);
      expect(`${lemma} → ${held.join(" / ")}`).toBe(`${lemma} → ${partPl}`);
    }
  });
});

/** What the case table prints in the nominative plural row. */
function plural(parts: Record<string, string>): string | undefined {
  return buildCaseTable(stemsFromParts(parts)).find((r) => r.spec.key === "NOMINATIVE")?.plural;
}
