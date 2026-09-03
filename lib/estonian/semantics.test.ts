import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";

import { bothLocalSetsOrdinary, isAnimate, semanticGroup } from "./semantics";

/*
  PINNED AGAINST REAL ENTRIES, NOT AGAINST INVENTED CODES.

  Every string below is what the Institute actually records for that word in
  `prisma/data/expanded.json`, which is why this test can fail on a wrong table
  rather than only on a wrong function: a rule that reads the first segment of a
  code classifies `emakeel` as a person, and it took a real word to notice.
*/
const shipped = new Map<string, string | null>(
  (JSON.parse(readFileSync("prisma/data/expanded.json", "utf8")) as
    { lemma: string; pos: string; semanticTypes?: string | null }[])
    .filter((e) => e.pos !== "VERB")
    .map((e) => [e.lemma, e.semanticTypes ?? null]),
);

const codesOf = (lemma: string) => {
  const found = shipped.get(lemma);
  expect(found, `${lemma} should be in the shipped dictionary`).toBeTruthy();
  return found!;
};

describe("who is a kes and what is a mis", () => {
  it.each([
    ["hobune", "an animal"],
    ["koer", "an animal"],
    ["kala", "an animal"],
    ["harakas", "a bird"],
    ["õpetaja", "a profession"],
    ["arst", "a profession behind a title"],
    ["ema", "a relative"],
    ["mees", "a person, plainly"],
    ["eestlane", "the representative of a people"],
    ["sõber", "a role"],
    ["jumal", "a being nobody has met"],
  ])("counts %s as animate: %s", (lemma) => {
    expect(isAnimate(codesOf(lemma))).toBe(true);
  });

  it.each([
    ["tuba", "somewhere you are inside"],
    ["raamat", "something you write in"],
    ["taevas", "not a being"],
    ["kapsas", "a plant, and a mis in Estonian"],
    ["käsi", "part of a person and not one"],
    ["keha", "the whole body, and still not a kes"],
    ["saba", "an animal's, and not the animal"],
    ["emakeel", "a language, whose code opens like a person's"],
    ["aasta", "a stretch of time"],
  ])("counts %s as a thing: %s", (lemma) => {
    expect(isAnimate(codesOf(lemma))).toBe(false);
    expect(semanticGroup(codesOf(lemma))).toBe("THING");
  });
});

describe("a word the Institute called both", () => {
  /*
    These are the ones where `inimene` sits beside a place, a building, a group
    or an object, because Estonian says both: you join `politseisse` and you
    work `politseis`, you are `grupis` and you speak `grupile`. A card cannot
    ask which of two right answers a learner meant, which is the argument
    `bothSetsOrdinary` already makes about `maa`.
  */
  it.each(["politsei", "organisatsioon", "grupp", "rühm", "klubi", "orkester", "müüja"])(
    "leaves %s out of both sets",
    (lemma) => {
      expect(semanticGroup(codesOf(lemma))).toBe("MIXED");
      expect(bothLocalSetsOrdinary(codesOf(lemma))).toBe(true);
      expect(isAnimate(codesOf(lemma))).toBe(false);
    },
  );
});

describe("no classification at all", () => {
  it("is its own answer, not a thing", () => {
    // A word somebody added by hand, confirmed off a photograph or pasted in
    // has never been near Ekilex, and reading that as "it is a thing" would be
    // claiming something the dictionary never said.
    expect(semanticGroup(null)).toBe("UNKNOWN");
    expect(semanticGroup("")).toBe("UNKNOWN");
    expect(semanticGroup("   ")).toBe("UNKNOWN");
    expect(semanticGroup([])).toBe("UNKNOWN");
    expect(isAnimate(null)).toBe(false);
    expect(bothLocalSetsOrdinary(null)).toBe(false);
  });

  it("reads a list and a string the same way", () => {
    expect(semanticGroup(["loom"])).toBe(semanticGroup("loom"));
    expect(semanticGroup(["esitus_tiitel", "in_elukutse"])).toBe(semanticGroup("esitus_tiitel in_elukutse"));
  });
});
