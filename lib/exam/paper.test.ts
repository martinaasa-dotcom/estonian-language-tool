import { describe, expect, it } from "vitest";
import {
  BLANK, buildPaper, cardsInPaper, eligibleWords, fillRate, formsOf, maskForms, partOf, rng,
  seedFrom, type PoolWord,
} from "./paper";

/*
  The rule this module exists to keep is that nothing in a paper is written by
  this app, so the tests that matter are the ones that would fail if a builder
  started inventing. Every assertion about a sentence checks it against the
  material that went in.
*/

function word(over: Partial<PoolWord> & { lemma: string }): PoolWord {
  return {
    lexemeId: `id-${over.lemma}`,
    translation: "gloss",
    pos: "NOUN",
    cefr: "A1",
    forms: [],
    examples: [],
    government: null,
    cardId: null,
    ...over,
  };
}

/**
 * A distinct lemma made only of letters.
 *
 * Digits would be simpler and are wrong: the word pattern these modules share
 * matches letters and combining marks only, so `sona7` tokenises as `sona` and
 * every builder that looks a form up in a sentence quietly finds nothing. A
 * fixture that cannot be found is a fixture that tests the empty path.
 */
function nth(i: number, stem = "sona"): string {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  return `${stem}${letters[Math.floor(i / 26) % 26]}${letters[i % 26]}`;
}

/** A pool big enough that the builders are not starved, built out of one shape. */
function pool(count: number): PoolWord[] {
  return Array.from({ length: count }, (_, i) => {
    const lemma = nth(i);
    return word({
      lemma,
      lexemeId: `lex-${i}`,
      /*
        A meaning of its own for every word, because they are answers to each
        other. With one gloss shared across the pool the meaning question can
        offer nothing: every candidate reads as the same answer as the right
        one, which is the guard working and is also a fixture that tests the
        empty path, the same fault the digits in `nth` once caused.
      */
      translation: nth(i, "mean"),
      cefr: i % 3 === 0 ? "A1" : i % 3 === 1 ? "A2" : "B1",
      forms: [
        { formType: "NOM_SG", value: lemma, morphCode: null, morphName: null },
        { formType: "GEN_SG", value: `${lemma}a`, morphCode: null, morphName: null },
        { formType: "PART_SG", value: `${lemma}at`, morphCode: null, morphName: null },
      ],
      examples: [
        { et: `Mina olen ${lemma}a juures igal hommikul.`, en: null },
        { et: `See ${lemma} seisab seal.`, en: null },
      ],
      cardId: i % 2 === 0 ? `card-${i}` : null,
    });
  });
}

describe("the seeded generator", () => {
  it("gives the same stream for the same seed", () => {
    const a = rng(seedFrom("hello"));
    const b = rng(seedFrom("hello"));
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("gives a different stream for a different seed", () => {
    const a = rng(seedFrom("hello"));
    const b = rng(seedFrom("hellp"));
    expect(a()).not.toEqual(b());
  });
});

describe("choosing what a level may be examined on", () => {
  it("admits everything up to the level and nothing above it", () => {
    const words = [
      word({ lemma: "a", lexemeId: "1", cefr: "A1" }),
      word({ lemma: "b", lexemeId: "2", cefr: "B1" }),
      word({ lemma: "c", lexemeId: "3", cefr: "C1" }),
    ];
    expect(eligibleWords(words, "B1").map((w) => w.lemma).sort()).toEqual(["a", "b"]);
  });

  it("puts the words at the level first, so a C1 paper is not made of A1 nouns", () => {
    const words = [
      word({ lemma: "easy", lexemeId: "1", cefr: "A1" }),
      word({ lemma: "hard", lexemeId: "2", cefr: "C1" }),
    ];
    expect(eligibleWords(words, "C1")[0]?.lemma).toBe("hard");
  });

  it("keeps untagged entries out of the two lowest papers and lets them into B1", () => {
    const untagged = [word({ lemma: "x", lexemeId: "1", cefr: null })];
    expect(eligibleWords(untagged, "A2")).toHaveLength(0);
    expect(eligibleWords(untagged, "B1")).toHaveLength(1);
  });
});

describe("hiding a word in its own sentence", () => {
  it("blanks every form of it", () => {
    const masked = maskForms("Toas on toa aken.", ["toas", "toa"]);
    expect(masked).toBe(`${BLANK} on ${BLANK} aken.`);
  });

  it("prefers the longer form, so a blank never leaves a stray ending", () => {
    expect(maskForms("Ma olen toas.", ["toa", "toas"])).toBe(`Ma olen ${BLANK}.`);
  });

  it("leaves a sentence alone when it names none of them", () => {
    expect(maskForms("Ma olen kodus.", ["toa"])).toBe("Ma olen kodus.");
  });

  it("does nothing with an empty form list", () => {
    expect(maskForms("Ma olen kodus.", [])).toBe("Ma olen kodus.");
  });
});

describe("building a paper", () => {
  const paper = buildPaper("B1", pool(40), "seed-one");

  it("is reproducible from its seed, which is what makes a reload safe", () => {
    const again = buildPaper("B1", pool(40), "seed-one");
    expect(JSON.stringify(again)).toEqual(JSON.stringify(paper));
  });

  it("is a different paper under a different seed", () => {
    const other = buildPaper("B1", pool(40), "seed-two");
    expect(JSON.stringify(other)).not.toEqual(JSON.stringify(paper));
  });

  it("has all four parts", () => {
    expect(paper.parts.map((p) => p.spec.skill))
      .toEqual(["writing", "listening", "reading", "speaking"]);
    expect(partOf(paper, "reading")).toBeDefined();
  });

  it("never asks about the same word twice", () => {
    const asked = paper.parts
      .flatMap((p) => p.tasks)
      .flatMap((t) => t.items)
      .map((i) => i.lexemeId)
      .filter((id) => id !== "");
    // The two written tasks and the spoken tasks anchor to a word without asking
    // about it, so they are allowed to reuse one; every real question is unique.
    const questions = paper.parts
      .flatMap((p) => p.tasks)
      .filter((t) => !["message", "compose", "speak"].includes(t.spec.kind))
      .flatMap((t) => t.items)
      .map((i) => i.lexemeId);
    expect(new Set(questions).size).toBe(questions.length);
    expect(asked.length).toBeGreaterThan(0);
  });

  it("writes no Estonian of its own: every sentence came out of the pool", () => {
    const attested = new Set(pool(40).flatMap((w) => w.examples.map((e) => e.et)));
    for (const part of paper.parts) {
      for (const task of part.tasks) {
        for (const item of task.items) {
          if (item.kind === "dictation" || item.kind === "order") {
            expect(attested.has(item.answer)).toBe(true);
          }
          if (item.kind === "listen-choose") {
            expect(attested.has(item.answer)).toBe(true);
            for (const option of item.options) expect(attested.has(option)).toBe(true);
          }
        }
      }
    }
  });

  it("offers a gap question only real forms to choose between", () => {
    const known = new Set(pool(40).flatMap(formsOf).map((f) => f.toLowerCase()));
    const gaps = paper.parts
      .flatMap((p) => p.tasks)
      .flatMap((t) => t.items)
      .filter((i): i is Extract<typeof i, { kind: "gap-choice" }> => i.kind === "gap-choice");
    expect(gaps.length).toBeGreaterThan(0);
    for (const gap of gaps) {
      expect(gap.options).toContain(gap.answer);
      expect(new Set(gap.options).size).toBe(gap.options.length);
      for (const option of gap.options) expect(known.has(option.toLowerCase())).toBe(true);
      // None of the options may already be standing in the sentence, or two of
      // them look right at once.
      const words = gap.sentence.toLowerCase().split(/\s+/);
      for (const option of gap.options) {
        if (option === gap.answer) continue;
        expect(words).not.toContain(option.toLowerCase());
      }
    }
  });

  it("scrambles a sentence into an order that is not the original", () => {
    const orders = paper.parts
      .flatMap((p) => p.tasks)
      .flatMap((t) => t.items)
      .filter((i): i is Extract<typeof i, { kind: "order" }> => i.kind === "order");
    for (const item of orders) {
      expect(item.tiles.join(" ")).not.toEqual(item.answer);
      expect([...item.tiles].sort()).toEqual([...item.answer.replace(/[.!?]/g, "").split(" ")].sort());
    }
  });

  it("names the learner's own cards, so the sitting reaches the scheduler", () => {
    expect(cardsInPaper(paper).length).toBeGreaterThan(0);
    expect(cardsInPaper(paper).every((id) => id.startsWith("card-"))).toBe(true);
  });
});

describe("the two written tasks", () => {
  const paper = buildPaper("B1", pool(40), "written-seed");
  const writing = partOf(paper, "writing");
  const message = writing?.tasks.find((t) => t.spec.kind === "message")?.items[0];
  const compose = writing?.tasks.find((t) => t.spec.kind === "compose")?.items[0];

  it("sets the short message with a situation and the points it has to cover", () => {
    expect(message?.kind).toBe("message");
    if (message?.kind !== "message") return;
    expect(message.scenario.length).toBeGreaterThan(0);
    expect(message.cover.length).toBeGreaterThan(1);
    expect(message.minWords).toBeGreaterThan(0);
  });

  it("offers the second task the two briefs the real paper offers", () => {
    expect(compose?.kind).toBe("compose");
    if (compose?.kind !== "compose") return;
    expect(compose.variants).toHaveLength(2);
    // Both have to be answerable from the same topic, since the choice may not
    // change what the answer is worth: it is marked on length and on the words.
    expect(compose.variants[0]?.prompt).toContain(compose.topic);
    expect(compose.variants[1]?.prompt).toContain(compose.topic);
  });

  it("writes no Estonian into either brief: every word asked for came from the pool", () => {
    const lemmas = new Set(pool(40).map((w) => w.lemma));
    for (const item of [message, compose]) {
      if (item?.kind !== "message" && item?.kind !== "compose") continue;
      for (const word of item.mustUse) expect(lemmas.has(word.lemma)).toBe(true);
    }
  });

  it("does not ask the same word of both texts", () => {
    if (message?.kind !== "message" || compose?.kind !== "compose") return;
    const asked = [...message.mustUse, ...compose.mustUse].map((w) => w.lexemeId);
    expect(new Set(asked).size).toBe(asked.length);
  });

  it("asks the message for fewer words than the composition, being a message", () => {
    if (message?.kind !== "message" || compose?.kind !== "compose") return;
    expect(message.mustUse.length).toBeLessThan(compose.mustUse.length);
    expect(message.minWords).toBeLessThan(compose.minWords);
  });
});

describe("a dictionary too thin to fill the paper", () => {
  const paper = buildPaper("B1", pool(3), "thin");

  it("says so rather than quietly setting a shorter paper", () => {
    expect(paper.thin).toBe(true);
    const short = paper.parts.flatMap((p) => p.tasks).filter((t) => t.shortfall > 0);
    expect(short.length).toBeGreaterThan(0);
    for (const task of short) {
      expect(task.shortfallReason).toBeTruthy();
      expect(task.rawAvailable).toBeLessThan(task.spec.raw);
    }
  });

  it("reports how much of the paper it managed", () => {
    expect(fillRate(paper)).toBeLessThan(100);
    expect(fillRate(paper)).toBeGreaterThanOrEqual(0);
  });

  it("still builds a paper rather than throwing", () => {
    expect(paper.parts).toHaveLength(4);
  });
});

describe("an empty dictionary", () => {
  it("produces a paper with no questions rather than a crash", () => {
    const paper = buildPaper("A2", [], "empty");
    expect(paper.thin).toBe(true);
    // Not zero: the two written tasks and the two spoken ones need a topic and a
    // microphone rather than a dictionary, so they survive an empty one. Every
    // task that needs a sentence is empty, which is most of the paper.
    expect(fillRate(paper)).toBeLessThan(50);
    expect(cardsInPaper(paper)).toEqual([]);
    const needingWords = paper.parts
      .flatMap((p) => p.tasks)
      .filter((t) => !["message", "compose", "speak"].includes(t.spec.kind));
    expect(needingWords.every((t) => t.items.length === 0)).toBe(true);
  });
});

describe("a dictionary with no recorded sentences, which is what a keyless install has", () => {
  /*
    The built-in 360 word set carries no examples at all: they arrive from
    Ekilex `usages`. Without the fallback shapes this state produced an empty
    reading part and an empty listening part, which is half the paper, on the
    install a stranger gets by default.
  */
  const wordsOnly = pool(40).map((word) => ({ ...word, examples: [] }));
  const paper = buildPaper("B1", wordsOnly, "no-sentences");

  it("still sets a listening part, out of single words", () => {
    const listening = paper.parts.find((p) => p.spec.skill === "listening")!;
    const items = listening.tasks.flatMap((t) => t.items);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      if (item.kind === "dictation" || item.kind === "listen-choose") {
        expect(item.unit).toBe("word");
      }
    }
  });

  it("plays a form rather than the headword, because an ending is what it tests", () => {
    const spoken = paper.parts
      .flatMap((p) => p.tasks)
      .flatMap((t) => t.items)
      .filter((i) => i.kind === "dictation" || i.kind === "listen-choose");
    expect(spoken.some((i) => "answer" in i && i.answer !== i.lemma)).toBe(true);
  });

  it("still sets a reading part, out of glosses and forms", () => {
    const reading = paper.parts.find((p) => p.spec.skill === "reading")!;
    expect(reading.tasks.flatMap((t) => t.items).length).toBeGreaterThan(0);
  });

  it("records the substitution rather than hiding it", () => {
    expect(paper.substituted).toBe(true);
    const swapped = paper.parts.flatMap((p) => p.tasks).filter((t) => t.fallbackFrom !== null);
    expect(swapped.length).toBeGreaterThan(0);
    for (const task of swapped) {
      // The task now describes what it actually set, not what it wanted to.
      expect(task.spec.kind).not.toEqual(task.fallbackFrom);
      expect(task.spec.raw).toBeGreaterThan(0);
    }
  });

  it("offers only real glosses and real forms as the wrong answers", () => {
    const glosses = new Set(wordsOnly.map((w) => w.translation));
    const forms = new Set(wordsOnly.flatMap(formsOf).map((f) => f.toLowerCase()));
    for (const item of paper.parts.flatMap((p) => p.tasks).flatMap((t) => t.items)) {
      if (item.kind === "gloss-choice") {
        expect(item.options).toContain(item.answer);
        for (const option of item.options) expect(glosses.has(option)).toBe(true);
      }
      if (item.kind === "form-choice") {
        expect(item.options).toContain(item.answer);
        // A derived case form is not a row in the pool, so the answer itself is
        // checked against the derivation rather than against the stored forms.
        for (const option of item.options) {
          expect(option.length).toBeGreaterThan(0);
          expect(/^[\p{L}\p{M}]+$/u.test(option)).toBe(true);
        }
        expect(forms.has(item.lemma.toLowerCase())).toBe(true);
      }
    }
  });

  it("offers a meaning among meanings of the same kind, not whatever came first", () => {
    /*
      The fault this shares with the placement check: the wrong answers were
      three glosses out of a deck spanning four levels, in shuffle order, so a
      B1 candidate asked what a noun meant chose between it, a verb and a
      three-sense abstract noun and could cross two out without reading the
      Estonian. A deck is the learner's own, so the levels are closer together
      than the dictionary's, and the part of speech is what carries it here.
    */
    const mixed = [
      ...Array.from({ length: 20 }, (_, i) => word({
        lemma: nth(i), lexemeId: `n-${i}`, translation: nth(i, "mean"), pos: "NOUN", cefr: "B1",
        forms: [{ formType: "GEN_SG", value: `${nth(i)}a`, morphCode: null, morphName: null }],
      })),
      ...Array.from({ length: 20 }, (_, i) => word({
        lemma: nth(i, "tege"), lexemeId: `v-${i}`, translation: `to ${nth(i, "do")}`, pos: "VERB", cefr: "B1",
      })),
    ];
    const paper = buildPaper("B1", mixed, "mixed-pos");
    const glossItems = paper.parts
      .flatMap((p) => p.tasks)
      .flatMap((t) => t.items)
      .filter((i): i is Extract<typeof i, { kind: "gloss-choice" }> => i.kind === "gloss-choice");
    expect(glossItems.length).toBeGreaterThan(0);

    const posOf = new Map(mixed.map((w) => [w.translation, w.pos]));
    for (const item of glossItems) {
      for (const option of item.options) {
        expect(posOf.get(option), `${option} beside ${item.answer}`).toBe(posOf.get(item.answer));
      }
    }
  });

  it("never offers a meaning that is also the right answer", () => {
    /*
      Twenty meanings, each held by two words and worded two ways, which is the
      shape the dictionary really has: "car" and "a car" are one answer, and a
      candidate who picks the other one is right and is marked wrong. The exam
      had no test of what counts as the same answer at all, because it had no
      such rule: it took whatever the shuffle handed back.

      The pairs matter. A fixture where every word means the same thing proves
      nothing, since a pool with two glosses in it cannot fill four options
      either way, and the test would pass on a builder with no rule at all.
    */
    const paired = Array.from({ length: 40 }, (_, i) => word({
      lemma: nth(i),
      lexemeId: `p-${i}`,
      // Two words for one meaning, worded two ways, and identical in shape to
      // every other gloss in the pool, so nothing but the rule keeps a pair
      // out of one question.
      translation: `${nth(Math.floor(i / 2), "mean")}, ${nth(i, "sense")}`,
      cefr: "B1",
      forms: [
        { formType: "NOM_SG", value: nth(i), morphCode: null, morphName: null },
        { formType: "GEN_SG", value: `${nth(i)}a`, morphCode: null, morphName: null },
        { formType: "PART_SG", value: `${nth(i)}at`, morphCode: null, morphName: null },
      ],
    }));
    // Ten papers rather than one. Which words a paper asks about is the
    // shuffle's business, so a single paper can miss a pair by luck and pass a
    // builder with no rule at all.
    const items = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]
      .flatMap((seed) => buildPaper("B1", paired, `paired-${seed}`).parts)
      .flatMap((p) => p.tasks)
      .flatMap((t) => t.items)
      .filter((i): i is Extract<typeof i, { kind: "gloss-choice" }> => i.kind === "gloss-choice");
    expect(items.length).toBeGreaterThan(40);

    for (const item of items) {
      const seen = new Set<string>();
      for (const option of item.options) {
        for (const sense of option.split(", ")) {
          expect(seen.has(sense), `${item.options.join(" / ")}`).toBe(false);
          seen.add(sense);
        }
      }
    }
  });

  it("hides a spoken word among words spelled like it", () => {
    /*
      A recording is only a listening question while the four spellings are
      close enough that hearing is the only way to tell them apart. These were
      three words drawn at random out of the deck, so the answer could be found
      by reading rather than by listening.

      Two families of lemmas, one of them small: with the near family only six
      words wide, filling a question out of it cannot happen by chance.
    */
    const families = [
      ...Array.from({ length: 6 }, (_, i) => word({
        lemma: nth(i, "kirjut"), lexemeId: `k-${i}`, translation: nth(i, "mean"), cefr: "B1",
        forms: [{ formType: "GEN_SG", value: `${nth(i, "kirjut")}a`, morphCode: null, morphName: null }],
      })),
      ...Array.from({ length: 30 }, (_, i) => word({
        lemma: nth(i, "veeren"), lexemeId: `v-${i}`, translation: nth(i + 6, "mean"), cefr: "B1",
        forms: [{ formType: "GEN_SG", value: `${nth(i, "veeren")}a`, morphCode: null, morphName: null }],
      })),
    ];
    const spoken = buildPaper("B1", families, "families").parts
      .flatMap((p) => p.tasks)
      .flatMap((t) => t.items)
      .filter((i): i is Extract<typeof i, { kind: "listen-choose" }> => i.kind === "listen-choose")
      .filter((i) => i.unit === "word" && i.answer.startsWith("kirjut"));
    expect(spoken.length).toBeGreaterThan(0);
    for (const item of spoken) {
      const near = item.options.filter((o) => o.startsWith("kirjut"));
      expect(near.length, `${item.answer}: ${item.options.join(" / ")}`).toBeGreaterThan(2);
    }
  });

  it("keeps the word-order task honestly empty, because it genuinely needs a sentence", () => {
    const order = paper.parts
      .flatMap((p) => p.tasks)
      .find((t) => t.spec.kind === "order" || t.fallbackFrom === "order");
    expect(order?.items).toEqual([]);
    expect(order?.shortfallReason).toBeTruthy();
  });

  it("prefers a half filled real task to a full substitute", () => {
    /*
      A task in the shape the paper actually sets, half filled, is closer to the
      examination than a full one built out of word cards. So a fallback is only
      reached when the intended shape produced nothing at all, and a task that
      managed some of its items keeps them and reports the shortfall.

      Twenty sentences rather than one, because the parts are built in the order
      they are sat and each marks the words it used as spent: a single sentence
      is claimed by the listening part long before the reading part asks.
    */
    const some = wordsOnly.map((word, i) =>
      i < 20 ? { ...word, examples: [{ et: `See ${word.lemma} seisab seal.`, en: null }] } : word);
    const mixed = buildPaper("B1", some, "some-sentences");
    const partial = mixed.parts
      .flatMap((p) => p.tasks)
      .filter((t) => t.fallbackFrom === null && t.items.length > 0 && t.shortfall > 0);
    expect(partial.length).toBeGreaterThan(0);
    for (const task of partial) {
      expect(task.rawAvailable).toBeLessThan(task.spec.raw);
      expect(task.rawAvailable).toBeGreaterThan(0);
    }
  });
});
