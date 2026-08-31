import { describe, expect, it } from "vitest";
import { CASES } from "@/lib/estonian/cases";
import { assemble, buildPaper, listeningItems, mulberry32, readingItems, speakingItems, writingItems, type WordRow } from "./items";
import { BANDS, type ChoiceItem, type Item } from "./types";

/**
 * The dictionary rows a test can lean on.
 *
 * Real seeded entries, copied from prisma/data: an invented word would let a
 * builder pass a test on Estonian that does not exist, which is the exact
 * failure this whole module is arranged to prevent.
 */
const WORDS: WordRow[] = [
  {
    id: "tuba", lemma: "tuba", translation: "room", pos: "NOUN", cefr: "A1", government: null,
    forms: [
      { formType: "NOM_SG", value: "tuba" },
      { formType: "GEN_SG", value: "toa" },
      { formType: "PART_SG", value: "tuba" },
    ],
    examples: [{ et: "Ma olen praegu toas.", en: "I am in the room right now." }],
  },
  {
    id: "raamat", lemma: "raamat", translation: "book", pos: "NOUN", cefr: "A1", government: null,
    forms: [
      { formType: "NOM_SG", value: "raamat" },
      { formType: "GEN_SG", value: "raamatu" },
      { formType: "PART_SG", value: "raamatut" },
    ],
    examples: [],
  },
  {
    id: "aken", lemma: "aken", translation: "window", pos: "NOUN", cefr: "A2", government: null,
    forms: [
      { formType: "NOM_SG", value: "aken" },
      { formType: "GEN_SG", value: "akna" },
      { formType: "PART_SG", value: "akent" },
    ],
    examples: [],
  },
  {
    id: "klient", lemma: "klient", translation: "client, customer", pos: "NOUN", cefr: "B1", government: null,
    forms: [
      { formType: "NOM_SG", value: "klient" },
      { formType: "GEN_SG", value: "kliendi" },
      { formType: "PART_SG", value: "klienti" },
    ],
    examples: [],
  },
  {
    id: "aitama", lemma: "aitama", translation: "to help", pos: "VERB", cefr: "A2",
    government: "partitive: aitan sind (I help you)",
    forms: [{ formType: "INF_MA", value: "aitama" }],
    examples: [],
  },
];

/** Every Estonian string an item puts on screen. */
function estonianIn(item: Item): string[] {
  const out: string[] = [item.lemma];
  if ("et" in item && item.et) out.push(item.et);
  if (item.kind === "choice" && item.estonianOptions) out.push(...item.options);
  if (item.kind === "write") out.push(item.targetForm);
  return out;
}

/** Everything the dictionary rows can vouch for, spelled out. */
const ATTESTED = new Set(
  WORDS.flatMap((w) => [
    w.lemma,
    ...w.forms.map((f) => f.value),
    ...w.examples.map((e) => e.et),
  ].map((s) => s.toLowerCase())),
);

/** Regular case endings the app derives from the genitive stem. */
const DERIVABLE = /(sse|s|st|le|l|lt|ks|ni|na|ta|ga)$/;

describe("items are built out of the dictionary, never written", () => {
  it("shows no Estonian that the dictionary cannot account for", () => {
    const rng = mulberry32(7);
    const items = [
      ...readingItems(WORDS, rng),
      ...listeningItems(WORDS, rng),
      ...writingItems(WORDS, rng),
      ...speakingItems(WORDS, rng),
    ];
    expect(items.length).toBeGreaterThan(10);

    for (const item of items) {
      for (const et of estonianIn(item)) {
        const lower = et.toLowerCase();
        if (ATTESTED.has(lower)) continue;
        // Anything else has to be a stored stem plus a regular ending.
        const stem = [...ATTESTED].some((known) => lower.startsWith(known.slice(0, -1)));
        expect(stem && DERIVABLE.test(lower), `${et} in ${item.id} has no source`).toBe(true);
      }
    }
  });

  it("marks derived forms as derived and stored ones as dictionary", () => {
    const items = readingItems(WORDS, mulberry32(3));
    const meaning = items.find((i) => i.id.startsWith("r-mean-"));
    expect(meaning?.source).toBe("dictionary");
    const identify = items.find((i) => i.id.startsWith("r-ident-"));
    expect(identify?.source).toBe("derived");
  });
});

describe("a question always has exactly one right answer", () => {
  it("never repeats an option and always contains the answer", () => {
    const rng = mulberry32(11);
    const items = [...readingItems(WORDS, rng), ...listeningItems(WORDS, rng)]
      .filter((i): i is ChoiceItem => i.kind === "choice");
    expect(items.length).toBeGreaterThan(5);

    for (const item of items) {
      expect(item.options).toHaveLength(4);
      expect(new Set(item.options.map((o) => o.toLowerCase())).size).toBe(4);
      expect(item.options[item.answer]).toBeDefined();
    }
  });

  it("drops a question whose distractors would be as right as the answer", () => {
    // Two words, one meaning: there is no honest fourth option, so no item.
    const twins: WordRow[] = [
      { ...WORDS[0]!, id: "a", lemma: "auto", translation: "car", forms: [], examples: [] },
      { ...WORDS[0]!, id: "b", lemma: "masin", translation: "car, machine", forms: [], examples: [] },
    ];
    expect(readingItems(twins, mulberry32(1))).toHaveLength(0);
  });
});

describe("bands", () => {
  it("raises a question to the harder of its word and its grammar", () => {
    const items = readingItems(WORDS, mulberry32(5));
    const terminative = items.find((i) => i.id === "r-case-tuba-TRANSLATIVE" || i.id.endsWith("-TRANSLATIVE"));
    if (terminative) expect(BANDS.indexOf(terminative.band)).toBeGreaterThanOrEqual(BANDS.indexOf("B1"));

    const government = items.find((i) => i.id.startsWith("r-gov-"));
    // aitama is an A2 verb, but which case it governs is not an A2 question.
    expect(government?.band).toBe("B1");
  });

  it("never asks a listening question about a word with no audio to play", () => {
    for (const item of listeningItems(WORDS, mulberry32(2))) {
      const et = "et" in item ? item.et : "";
      expect(et.length).toBeGreaterThan(0);
    }
  });
});

describe("assemble", () => {
  it("climbs the bands and asks about a word only once", () => {
    const items = assemble(readingItems(WORDS, mulberry32(9)), { total: 8, perBand: 2 });
    const lemmas = items.map((i) => i.lemma);
    expect(new Set(lemmas).size).toBe(lemmas.length);
    const indexes = items.map((i) => BANDS.indexOf(i.band));
    expect([...indexes].sort((a, b) => a - b)).toEqual(indexes);
  });

  it("respects the per band cap", () => {
    const items = assemble(readingItems(WORDS, mulberry32(4)), { total: 20, perBand: 1 });
    const perBand = new Map<string, number>();
    for (const item of items) perBand.set(item.band, (perBand.get(item.band) ?? 0) + 1);
    for (const count of perBand.values()) expect(count).toBe(1);
  });
});

describe("buildPaper", () => {
  it("orders the sections and reports what it could not fill", () => {
    const paper = buildPaper(WORDS, 42);
    const skills = [...new Set(paper.items.map((i) => i.skill))];
    expect(skills).toEqual(["reading", "listening", "writing", "speaking"]);
    expect(paper.missing).toEqual([]);
  });

  it("says which sections it could not build rather than inventing them", () => {
    // A dictionary of verbs alone: nothing to inflect, nothing to write about.
    const verbs = WORDS.filter((w) => w.pos === "VERB");
    const paper = buildPaper(verbs, 1);
    expect(paper.missing).toContain("writing");
    expect(paper.items.every((i) => i.skill !== "writing")).toBe(true);
  });

  it("is deterministic for a seed and different across seeds", () => {
    expect(buildPaper(WORDS, 3).items.map((i) => i.id)).toEqual(buildPaper(WORDS, 3).items.map((i) => i.id));
    const a = buildPaper(WORDS, 3).items.map((i) => i.id).join();
    const b = buildPaper(WORDS, 99).items.map((i) => i.id).join();
    expect(a === b).toBe(false);
  });
});

/**
 * The question from the report, with the pool it was drawn out of.
 *
 * Real rows again: the six colours the course teaches in one unit, the noun
 * that shares `hall` with the grey one, and the three far entries that turned
 * up beside "black" in the version that shipped. A learner who has never seen
 * an Estonian word can cross out a plastic bag and a C1 abstract noun from an
 * A1 question, so the answer was the only option left worth reading.
 */
const NEIGHBOURS: WordRow[] = [
  { id: "must", lemma: "must", translation: "black", pos: "ADJECTIVE", cefr: "A1", government: null,
    forms: [{ formType: "NOM_SG", value: "must" }, { formType: "GEN_SG", value: "musta" }, { formType: "PART_SG", value: "musta" }], examples: [] },
  { id: "valge", lemma: "valge", translation: "white", pos: "ADJECTIVE", cefr: "A1", government: null,
    forms: [{ formType: "NOM_SG", value: "valge" }, { formType: "GEN_SG", value: "valge" }, { formType: "PART_SG", value: "valget" }], examples: [] },
  { id: "punane", lemma: "punane", translation: "red", pos: "ADJECTIVE", cefr: "A1", government: null,
    forms: [{ formType: "NOM_SG", value: "punane" }, { formType: "GEN_SG", value: "punase" }, { formType: "PART_SG", value: "punast" }], examples: [] },
  { id: "sinine", lemma: "sinine", translation: "blue", pos: "ADJECTIVE", cefr: "A1", government: null,
    forms: [{ formType: "NOM_SG", value: "sinine" }, { formType: "GEN_SG", value: "sinise" }, { formType: "PART_SG", value: "sinist" }], examples: [] },
  { id: "roheline", lemma: "roheline", translation: "green", pos: "ADJECTIVE", cefr: "A1", government: null,
    forms: [{ formType: "NOM_SG", value: "roheline" }, { formType: "GEN_SG", value: "rohelise" }, { formType: "PART_SG", value: "rohelist" }], examples: [] },
  { id: "kollane", lemma: "kollane", translation: "yellow", pos: "ADJECTIVE", cefr: "A1", government: null,
    forms: [{ formType: "NOM_SG", value: "kollane" }, { formType: "GEN_SG", value: "kollase" }, { formType: "PART_SG", value: "kollast" }], examples: [] },
  { id: "hall", lemma: "hall", translation: "frost", pos: "NOUN", cefr: "A1", government: null,
    forms: [{ formType: "NOM_SG", value: "hall" }, { formType: "GEN_SG", value: "halli" }, { formType: "PART_SG", value: "halli" }], examples: [] },
  { id: "kilekott", lemma: "kilekott", translation: "plastic bag", pos: "NOUN", cefr: "A2", government: null,
    forms: [{ formType: "NOM_SG", value: "kilekott" }, { formType: "GEN_SG", value: "kilekoti" }, { formType: "PART_SG", value: "kilekotti" }], examples: [] },
  { id: "narkomaania", lemma: "narkomaania", translation: "narcomania, drug addiction, substance abuse", pos: "NOUN", cefr: "B2", government: null,
    forms: [{ formType: "NOM_SG", value: "narkomaania" }, { formType: "GEN_SG", value: "narkomaania" }, { formType: "PART_SG", value: "narkomaaniat" }], examples: [] },
  { id: "asula", lemma: "asula", translation: "settlement, city, town, village", pos: "NOUN", cefr: "B2", government: null,
    forms: [{ formType: "NOM_SG", value: "asula" }, { formType: "GEN_SG", value: "asula" }, { formType: "PART_SG", value: "asulat" }], examples: [] },
];

const FAR_GLOSSES = ["plastic bag", "narcomania, drug addiction, substance abuse", "settlement, city, town, village"];

describe("the wrong answers are worth reading", () => {
  it("asks what a colour means among colours, at every seed", () => {
    for (let seed = 1; seed < 30; seed++) {
      const heard = listeningItems(NEIGHBOURS, mulberry32(seed))
        .find((i): i is ChoiceItem => i.id === "l-word-must");
      expect(heard, `seed ${seed} asked nothing about must`).toBeDefined();
      for (const gloss of FAR_GLOSSES) expect(heard!.options).not.toContain(gloss);
      expect(heard!.options).toContain("black");
    }
  });

  it("does not hand a beginner three C1 nouns to cross out", () => {
    for (let seed = 1; seed < 30; seed++) {
      for (const item of readingItems(NEIGHBOURS, mulberry32(seed))) {
        if (!item.id.startsWith("r-mean-") || item.band !== "A1") continue;
        const far = item.options.filter((o) => FAR_GLOSSES.includes(o));
        expect(far, `${item.id} at seed ${seed}`).toHaveLength(0);
      }
    }
  });

  it("offers a case against the cases it is confused with", () => {
    // Every case a beginner has not met, which is what an option must not be
    // when the answer is one they have.
    const unreached = ["rajav", "olev", "ilmaütlev"];
    for (let seed = 1; seed < 20; seed++) {
      const items = readingItems(NEIGHBOURS, mulberry32(seed)).filter((i) => i.id.startsWith("r-ident-"));
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        const answer = item.options[item.answer]!;
        if (unreached.some((name) => answer.startsWith(name))) continue;
        for (const option of item.options) {
          expect(unreached.some((name) => option.startsWith(name)), `${option} beside ${answer}`).toBe(false);
        }

        // And where a second case answers the same question word, that is the
        // one the learner has to tell it from, so it is always in the four.
        const asked = answer.split("· ")[1]!.split(" ");
        const partners = CASES.filter(
          (c) => !answer.startsWith(c.et) && c.question.split(" ").some((q) => asked.includes(q)),
        );
        for (const partner of partners) {
          expect(item.options.some((o) => o.startsWith(partner.et)), `${partner.et} missing beside ${answer}`).toBe(true);
        }
      }
    }
  });
});
