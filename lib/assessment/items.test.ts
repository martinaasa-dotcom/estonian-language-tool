import { describe, expect, it } from "vitest";
import { CASES } from "@/lib/estonian/cases";
import { assemble, BLUEPRINT, buildPaper, listeningItems, mulberry32, readingItems, speakingItems, writingItems, type WordRow } from "./items";
import { heardIndex, meaningsHeard } from "./heard";
import { BLANK } from "@/lib/estonian/cloze";
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
    id: "tuba", lemma: "tuba", translation: "room, chamber", pos: "NOUN", cefr: "A1", government: null,
    forms: [
      { formType: "NOM_SG", value: "tuba" },
      { formType: "GEN_SG", value: "toa" },
      { formType: "PART_SG", value: "tuba" },
      { formType: "ILL_SG_SHORT", value: "tuppa" },
      { formType: "GEN_PL", value: "tubade" },
      { formType: "PART_PL", value: "tube" },
    ],
    examples: [{ et: "Koristasin toa ära." }, { et: "Ma olen praegu toas.", en: "I am in the room right now." }],
  },
  {
    id: "tramm", lemma: "tramm", translation: "tram", pos: "NOUN", cefr: "A1", government: null,
    forms: [
      { formType: "NOM_SG", value: "tramm" },
      { formType: "GEN_SG", value: "trammi" },
      { formType: "PART_SG", value: "trammi" },
      { formType: "GEN_PL", value: "trammide" },
      { formType: "PART_PL", value: "tramme" },
    ],
    examples: [{ et: "Sõitsin trammiga koju." }, { et: "Nõmmele ei sõida tramm ega troll." }],
  },
  {
    id: "raamat", lemma: "raamat", translation: "book", pos: "NOUN", cefr: "A2", government: null,
    forms: [
      { formType: "NOM_SG", value: "raamat" },
      { formType: "GEN_SG", value: "raamatu" },
      { formType: "PART_SG", value: "raamatut" },
      { formType: "GEN_PL", value: "raamatute" },
      { formType: "PART_PL", value: "raamatuid" },
    ],
    examples: [],
  },
  {
    id: "aken", lemma: "aken", translation: "window", pos: "NOUN", cefr: "A2", government: null,
    forms: [
      { formType: "NOM_SG", value: "aken" },
      { formType: "GEN_SG", value: "akna" },
      { formType: "PART_SG", value: "akent" },
      { formType: "GEN_PL", value: "akende" },
      { formType: "PART_PL", value: "aknaid" },
    ],
    examples: [{ et: "Hotelli aknast on näha vanalinna." }],
  },
  {
    id: "klient", lemma: "klient", translation: "client, customer", pos: "NOUN", cefr: "B1", government: null,
    forms: [
      { formType: "NOM_SG", value: "klient" },
      { formType: "GEN_SG", value: "kliendi" },
      { formType: "PART_SG", value: "klienti" },
      { formType: "GEN_PL", value: "klientide" },
      { formType: "PART_PL", value: "kliente" },
    ],
    examples: [{ et: "Rahulolev klient on iga firma unistus." }],
  },
  {
    id: "aitama", lemma: "aitama", translation: "to help", pos: "VERB", cefr: "A2",
    government: "partitive: aitan sind (I help you)",
    forms: [
      { formType: "INF_MA", value: "aitama" },
      { formType: "INF_DA", value: "aidata" },
      { formType: "PRES_1SG", value: "aitan" },
      { formType: "PAST_1SG", value: "aitasin" },
      { formType: "PART_TUD", value: "aidatud" },
    ],
    examples: [{ et: "Õpetaja aitab õpilast." }],
  },
];

/**
 * Every Estonian string an item puts on screen, one word at a time.
 *
 * A gapped sentence is checked word by word rather than whole, which is the
 * stronger question: what is left standing has to be words of the sentence a
 * lexicographer recorded, and the blank has to be the only thing missing. A
 * whole-string check would have to give up on any prompt carrying a blank,
 * which is now most of them.
 */
function estonianIn(item: Item): string[] {
  const out: string[] = [item.lemma];
  if ("et" in item && item.et) out.push(...words(item.et));
  if (item.kind === "choice" && item.estonianOptions) out.push(...item.options);
  if (item.kind === "write") out.push(...words(item.sentence), ...words(item.full), item.targetForm);
  return out;
}

const words = (text: string) =>
  text.replace(BLANK, " ").split(/[^\p{L}\p{M}'’-]+/u).filter(Boolean);

/** Everything the dictionary rows can vouch for, word by word. */
const ATTESTED = new Set(
  WORDS.flatMap((w) => [
    w.lemma,
    ...w.forms.map((f) => f.value),
    ...w.examples.flatMap((e) => words(e.et)),
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

  it("says which of the dictionary's sources each question came from", () => {
    const items = readingItems(WORDS, mulberry32(3));
    expect(items.find((i) => i.id.startsWith("r-mean-"))?.source).toBe("dictionary");
    // A gap is a sentence somebody recorded, whichever forms the wrong
    // answers were computed from.
    expect(items.find((i) => i.id.startsWith("r-gap-"))?.source).toBe("usage");
  });

  it("never asks about a case by name", () => {
    /*
      The whole point of the rewrite. Nobody sitting a real Estonian placement
      test is asked to name a case, and this module used to spend half of its
      reading section and all of its writing section doing exactly that. The
      Estonian names still appear in the explanation after an answer, which is
      a cross-reference for somebody who is also taking a course; what may not
      happen is a *question* that cannot be answered without them.
    */
    const rng = mulberry32(13);
    const asked = [
      ...readingItems(WORDS, rng),
      ...listeningItems(WORDS, rng),
      ...writingItems(WORDS, rng),
    ].map((i) => i.question);
    expect(asked.length).toBeGreaterThan(5);
    for (const question of asked) {
      for (const spec of CASES) {
        expect(question.toLowerCase(), question).not.toContain(spec.et);
        expect(question.toLowerCase(), question).not.toContain(spec.en.toLowerCase());
      }
      // And no question mark doubled by a template appending one to a case
      // question that already ended in it: "the case that answers kus??".
      expect(question, question).not.toContain("??");
    }
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
  it("never puts a gap at the first band", () => {
    // Reading an A1 word is an A1 question. Choosing between four of its
    // endings is not, whatever the word, so the first band stays what it is
    // supposed to be: can you read this word at all.
    const items = [...readingItems(WORDS, mulberry32(5)), ...writingItems(WORDS, mulberry32(5))];
    const gaps = items.filter((i) => i.id.startsWith("r-gap-") || i.id.startsWith("w-"));
    expect(gaps.length).toBeGreaterThan(0);
    for (const gap of gaps) {
      expect(BANDS.indexOf(gap.band), gap.id).toBeGreaterThanOrEqual(BANDS.indexOf("A2"));
    }
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

describe("BLUEPRINT", () => {
  it("is the size the accuracy was measured at", () => {
    /*
      Asserted rather than described because the numbers are the finding. The
      paper was two per band per skill and placed 43% of simulated learners
      correctly while putting 57% below where they were; at these it places
      between 72% and 98% depending on the level. Lowering one of these is
      lowering how much of somebody's Estonian their level was read off.
    */
    expect(BLUEPRINT.reading).toEqual({ total: 30, perBand: 6 });
    expect(BLUEPRINT.listening).toEqual({ total: 15, perBand: 3 });
    expect(BLUEPRINT.writing).toEqual({ total: 30, perBand: 6 });
    expect(BLUEPRINT.speaking).toEqual({ total: 5, perBand: 1 });

    const total = Object.values(BLUEPRINT).reduce((sum, s) => sum + s.total, 0);
    expect(total).toBe(80);
    // Every section fills every band, or a band is decided by fewer skills
    // than the one below it and the two are not comparable.
    for (const section of Object.values(BLUEPRINT)) {
      expect(section.perBand * BANDS.length).toBe(section.total);
    }
  });

  it("gives every scored skill a band size two thirds is reachable at", () => {
    /*
      `PASS` is two thirds of a band's credit, and a band of n items can only
      score in nths. At two items two thirds means a perfect score, and at four
      it means three quarters, which is a stricter bar rather than a looser
      one. Only a multiple of three lets a learner score exactly the threshold
      they are being marked against, and 4 per band measured worse than 3.
    */
    for (const skill of ["reading", "listening", "writing"] as const) {
      expect(BLUEPRINT[skill].perBand % 3).toBe(0);
    }
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

});

describe("a sentence a learner is asked to read is a sentence", () => {
  /*
    Three shapes of Ekilex usage reached the screen and none of them is a
    sentence. `naturalSentence` in lib/estonian/cloze.ts is the guard and this
    is the placement check's half of it: the same words the app was reported
    on, so a regression here reads as the report rather than as a regex.
  */
  const usage = (id: string, lemma: string, pos: string, et: string): WordRow => ({
    id, lemma, translation: "something", pos, cefr: "A1", government: null,
    forms: [
      { formType: "NOM_SG", value: lemma },
      { formType: "GEN_SG", value: `${lemma}i` },
      { formType: "PART_SG", value: `${lemma}it` },
      { formType: "PART_PL", value: `${lemma}eid` },
    ],
    examples: [{ et, en: "an English rendering" }],
  });

  const sentences = (words: WordRow[]) => {
    const rng = mulberry32(5);
    return [...readingItems(words, rng), ...listeningItems(words, rng), ...writingItems(words, rng)]
      .flatMap((i) => ("et" in i ? [i.et] : []) as string[])
      .concat(
        [...writingItems(words, mulberry32(5))].map((i) => i.full),
      );
  };

  it("drops a headword standing in front of a comma as a label", () => {
    // Filed under kahvel, and about a sailing gaff rather than about a fork.
    const built = sentences([usage("kahvel", "kahvel", "NOUN", "Kahvel, lipp kukub!")]);
    expect(built.filter((t) => t.includes("lipp"))).toHaveLength(0);
  });

  it("keeps a verb standing in front of a comma, which is a main clause", () => {
    const built = sentences([usage("uskuma", "usun", "VERB", "Usun, et ta ei valeta praegu.")]);
    expect(built.some((t) => t.includes("valeta"))).toBe(true);
  });

  it("drops a usage that trails off, or offers two words round a slash", () => {
    expect(sentences([usage("naitama", "uuring", "NOUN", "Uuringud uuringut näitavad, et ..")])).toHaveLength(0);
    expect(sentences([usage("elekter", "elekter", "NOUN", "Elekter elektrit läks ära / kadus.")])).toHaveLength(0);
  });
});

describe("the explanation after a gap", () => {
  it("leads with the sentence and the word, not with the label", () => {
    const items = writingItems(WORDS, mulberry32(3));
    const explained = items.find((i) => i.because.length > 0);
    expect(explained, "no written gap was built").toBeDefined();
    /*
      The version this replaced opened "Here toas is in the seesütlev, the
      inessive.", which is grammar vocabulary at somebody who has just been
      told they were wrong. The sentence comes first, then the gap, then the
      name as the cross-reference it is.
    */
    expect(explained!.because.startsWith(explained!.full)).toBe(true);
    expect(explained!.because).toContain("The gap takes");
  });

  it("names both cases when one spelling is two, and claims neither", () => {
    /*
      `tuba` is the nimetav and the osastav; `kaarti` is the osastav and the
      short sisseütlev. This used to return "a form of kaart", which tells a
      learner what they could already see. Naming both and saying the sentence
      decides is honest and is what a class says about these words.
    */
    // kaart, copied from the seeded dictionary: PART_SG and ILL_SG_SHORT are
    // both `kaarti`, which is why `nameForm` may not pick one of them.
    const kaart: WordRow = {
      id: "kaart", lemma: "kaart", translation: "map, card", pos: "NOUN", cefr: "A2", government: null,
      forms: [
        { formType: "NOM_SG", value: "kaart" },
        { formType: "GEN_SG", value: "kaardi" },
        { formType: "PART_SG", value: "kaarti" },
        { formType: "ILL_SG_SHORT", value: "kaarti" },
        { formType: "PART_PL", value: "kaarte" },
        { formType: "GEN_PL", value: "kaartide" },
      ],
      examples: [{ et: "Õpilased uurisid tunnis Euroopa kaarti." }],
    };
    const both = writingItems([kaart], mulberry32(3))
      .map((i) => i.because)
      .find((b) => b.includes(" or the "));
    expect(both, "no syncretic form turned up").toBeDefined();
    expect(both).toContain("The sentence decides which.");
    // And no summary, because two summaries is the explanation arguing with
    // itself about which case the learner is looking at.
    expect(both!.endsWith("The sentence decides which.")).toBe(true);
  });

  it("names the form in Estonian first and English in brackets", () => {
    // CLAUDE.md's rule, which the plainer wording may not quietly reverse: a
    // learner in a class hears the Estonian name and needs it to lead.
    const withCase = writingItems(WORDS, mulberry32(3))
      .map((i) => i.because)
      .find((b) => /\(inessive\)|\(nominative\)|\(genitive\)|\(partitive\)/.test(b));
    expect(withCase, "no case was named at all").toBeDefined();
    expect(withCase).toMatch(/\b(seesütlev|nimetav|omastav|osastav)\b \(/);
  });
});

describe("a word's other recorded sense is never a wrong answer", () => {
  it("does not offer grey against hall meaning frost", () => {
    const hall: WordRow[] = [
      { id: "hall-n", lemma: "hall", translation: "frost", pos: "NOUN", cefr: "A2", government: null,
        forms: [{ formType: "NOM_SG", value: "hall" }], examples: [] },
      { id: "hall-a", lemma: "hall", translation: "grey", pos: "ADJECTIVE", cefr: "A2", government: null,
        forms: [{ formType: "NOM_SG", value: "hall" }], examples: [] },
      { id: "must", lemma: "must", translation: "black", pos: "ADJECTIVE", cefr: "A1", government: null,
        forms: [{ formType: "NOM_SG", value: "must" }], examples: [] },
      { id: "valge", lemma: "valge", translation: "white", pos: "ADJECTIVE", cefr: "A1", government: null,
        forms: [{ formType: "NOM_SG", value: "valge" }], examples: [] },
      { id: "pruun", lemma: "pruun", translation: "brown", pos: "ADJECTIVE", cefr: "A1", government: null,
        forms: [{ formType: "NOM_SG", value: "pruun" }], examples: [] },
      { id: "sinine", lemma: "sinine", translation: "blue", pos: "ADJECTIVE", cefr: "A1", government: null,
        forms: [{ formType: "NOM_SG", value: "sinine" }], examples: [] },
    ];
    for (let seed = 1; seed < 30; seed++) {
      for (const item of readingItems(hall, mulberry32(seed))) {
        if (!item.id.startsWith("r-mean-hall-")) continue;
        const other = item.options[item.answer] === "frost" ? "grey" : "frost";
        expect(item.options, `${item.id} at seed ${seed}`).not.toContain(other);
      }
    }
  });
});

/**
 * Real rows again. `isa`'s first recorded usage is `Isa ja ema ei olnud
 * kodus.`, and it turned up in the measurement that found this fault: the
 * sentence was played, "father" was the answer, and "mother" stood among the
 * wrong ones. `emakeel` is here because its gloss shares a word with `ema`'s,
 * which is how the rule reaches a word the pool does not hold.
 */
const FAMILY: WordRow[] = [
  { id: "isa", lemma: "isa", translation: "father", pos: "NOUN", cefr: "A1", government: null,
    forms: [{ formType: "NOM_SG", value: "isa" }, { formType: "GEN_SG", value: "isa" }, { formType: "PART_SG", value: "isa" }, { formType: "GEN_PL", value: "isade" }, { formType: "NOM_PL", value: "isad" }, { formType: "PART_PL", value: "isasid" }],
    examples: [{ et: "Isa ja ema ei olnud kodus." }] },
  { id: "ema", lemma: "ema", translation: "mother", pos: "NOUN", cefr: "A1", government: null,
    forms: [{ formType: "NOM_SG", value: "ema" }, { formType: "GEN_SG", value: "ema" }, { formType: "PART_SG", value: "ema" }, { formType: "GEN_PL", value: "emade" }, { formType: "NOM_PL", value: "emad" }, { formType: "PART_PL", value: "emasid" }],
    examples: [{ et: "Kolme lapse ema." }] },
  { id: "emakeel", lemma: "emakeel", translation: "mother tongue", pos: "NOUN", cefr: "A1", government: null,
    forms: [{ formType: "NOM_SG", value: "emakeel" }, { formType: "GEN_SG", value: "emakeele" }, { formType: "PART_SG", value: "emakeelt" }, { formType: "ILL_SG_SHORT", value: "emakeelde" }, { formType: "GEN_PL", value: "emakeelte" }, { formType: "NOM_PL", value: "emakeeled" }, { formType: "PART_PL", value: "emakeeli" }],
    examples: [{ et: "Ta räägib ainult oma emakeelt." }] },
  { id: "kodu", lemma: "kodu", translation: "home", pos: "NOUN", cefr: "A1", government: null,
    forms: [{ formType: "NOM_SG", value: "kodu" }, { formType: "GEN_SG", value: "kodu" }, { formType: "PART_SG", value: "kodu" }, { formType: "ILL_SG_SHORT", value: "koju" }, { formType: "GEN_PL", value: "kodude" }, { formType: "NOM_PL", value: "kodud" }, { formType: "PART_PL", value: "kodusid" }],
    examples: [{ et: "Tule ruttu koju!" }] },
  { id: "vanaema", lemma: "vanaema", translation: "grandmother", pos: "NOUN", cefr: "A1", government: null,
    forms: [{ formType: "NOM_SG", value: "vanaema" }, { formType: "GEN_SG", value: "vanaema" }, { formType: "PART_SG", value: "vanaema" }, { formType: "GEN_PL", value: "vanaemade" }, { formType: "NOM_PL", value: "vanaemad" }, { formType: "PART_PL", value: "vanaemasid" }],
    examples: [{ et: "Minu vanaema ja vanaisa elavad maal." }] },
];

describe("a wrong answer may be tricky and may not be true", () => {
  const sentence = "Isa ja ema ei olnud kodus.";

  it("reads every meaning the recording holds, in whatever form the word took", () => {
    const heard = meaningsHeard(sentence, heardIndex(FAMILY));
    expect(heard).toContain("father");
    expect(heard).toContain("mother");
    // `kodus` is the seesütlev, worked out from the stem, not a stored form.
    expect(heard).toContain("home");
    expect(heard).not.toContain("grandmother");
  });

  it("never offers the meaning of another word that was in the sentence", () => {
    const pool = [...FAMILY, ...NEIGHBOURS];
    for (let seed = 1; seed < 40; seed++) {
      const item = listeningItems(pool, mulberry32(seed)).find((i): i is ChoiceItem => i.id === "l-use-isa");
      expect(item, `seed ${seed} asked nothing about isa`).toBeDefined();
      expect(item!.et).toBe(sentence);
      expect(item!.options).toContain("father");
      expect(item!.options).not.toContain("mother");
      expect(item!.options).not.toContain("home");
      expect(item!.options).not.toContain("mother tongue");
    }
  });

  it("consults the index it is handed for the words the pool does not hold", () => {
    // `ema` is in the recording and not in the pool, so nothing the pool
    // knows says "mother" was heard. The dictionary's own index does.
    const pool = FAMILY.filter((w) => w.id !== "ema").concat(NEIGHBOURS);
    const dictionary = heardIndex(FAMILY);
    let offeredWithout = 0;
    for (let seed = 1; seed < 40; seed++) {
      const bare = listeningItems(pool, mulberry32(seed)).find((i): i is ChoiceItem => i.id === "l-use-isa");
      if (bare?.options.includes("mother tongue")) offeredWithout++;
      const item = listeningItems(pool, mulberry32(seed), dictionary).find((i): i is ChoiceItem => i.id === "l-use-isa");
      expect(item, `seed ${seed} asked nothing about isa`).toBeDefined();
      expect(item!.options).not.toContain("mother tongue");
    }
    // The check has to be able to fail: without the index the option is offered.
    expect(offeredWithout).toBeGreaterThan(0);
  });

  it("reaches the paper the same way", () => {
    for (let seed = 1; seed < 20; seed++) {
      const paper = buildPaper([...FAMILY, ...NEIGHBOURS], seed);
      const item = paper.items.find((i): i is ChoiceItem => i.id === "l-use-isa");
      if (!item) continue;
      expect(item.options).not.toContain("mother");
    }
  });
});
