import { describe, expect, it } from "vitest";
import {
  answerableCount, isAnswerable, planLesson, splitIntoLessons,
  type LessonWord, type LessonStep,
} from "./lesson";

const unit = {
  id: "kodu",
  title: "Kodu",
  canDo: "Describe your home and say where things are in it.",
  blurb: "Things you can point at.",
  grammar: ["inessive"],
};

const noun = (lemma: string, gloss: string, extra: Partial<LessonWord> = {}): LessonWord => ({
  lemma,
  gloss,
  pos: "NOUN",
  examples: [],
  parts: { NOM_SG: lemma, GEN_SG: `${lemma}i`, PART_SG: `${lemma}it` },
  government: null,
  ...extra,
});

const WORDS: LessonWord[] = [
  noun("maja", "house", { examples: ["Maja on suur ja valge."], parts: { NOM_SG: "maja", GEN_SG: "maja", PART_SG: "maja" } }),
  noun("tuba", "room", { parts: { NOM_SG: "tuba", GEN_SG: "toa", PART_SG: "tuba" } }),
  noun("uks", "door", { parts: { NOM_SG: "uks", GEN_SG: "ukse", PART_SG: "ust" } }),
  noun("aken", "window", { parts: { NOM_SG: "aken", GEN_SG: "akna", PART_SG: "akent" } }),
  noun("laud", "table", { parts: { NOM_SG: "laud", GEN_SG: "laua", PART_SG: "lauda" } }),
  noun("tool", "chair", { parts: { NOM_SG: "tool", GEN_SG: "tooli", PART_SG: "tooli" } }),
];

const DISTRACTORS: LessonWord[] = [
  noun("koer", "dog"), noun("kass", "cat"), noun("lind", "bird"), noun("puu", "tree"),
];

const plan = (words = WORDS, seed = 7) =>
  planLesson({ unit, words, distractors: DISTRACTORS, seed });

describe("planLesson", () => {
  it("opens with the teaching step and closes with the recap", () => {
    const steps = plan();
    expect(steps[0]?.kind).toBe("intro");
    expect(steps.at(-1)?.kind).toBe("recap");
  });

  it("is deterministic, so a refresh cannot change the question mid-answer", () => {
    // gradeCard is a Server Action and Next re-runs the page after every one. A
    // plan that re-shuffled would swap the question out from under the answer.
    const a = plan().map((s) => `${s.kind}:${s.lemma ?? ""}`);
    const b = plan().map((s) => `${s.kind}:${s.lemma ?? ""}`);
    expect(a).toEqual(b);
  });

  it("gives a different lesson for a different seed", () => {
    // The ladder's shape is fixed by design, so what a seed varies is the
    // content of the questions: which options a multiple choice offers and in
    // what order, and which case a word gets asked for.
    const content = (seed: number) =>
      plan(WORDS, seed).flatMap((s) =>
        s.kind === "choose" || s.kind === "produce" || s.kind === "listen" ? [s.options.join("/")] : []);
    expect(content(1)).not.toEqual(content(2));
  });

  it("teaches a word before it asks anything about it", () => {
    // The rule that stops production becoming a guessing game.
    const steps = plan();
    const met = new Set<string>();
    for (const step of steps) {
      if (step.kind === "meet") { met.add(step.lemma); continue; }
      if (!isAnswerable(step) || !step.lemma) continue;
      expect(met.has(step.lemma), `${step.kind} asked about ${step.lemma} before it was met`).toBe(true);
    }
  });

  it("asks for recognition before it asks for production", () => {
    const steps = plan();
    const recognised = new Set<string>();
    for (const step of steps) {
      if (step.kind === "choose") recognised.add(step.lemma);
      if (step.kind === "type") {
        expect(recognised.has(step.lemma), `${step.lemma} was typed before it was recognised`).toBe(true);
      }
    }
  });

  it("never asks two questions of the same kind in a row", () => {
    // Six multiple-choice questions back to back is the exact texture of tedium.
    // Teaching cards are exempt: meeting three new words in a row is a
    // presentation, not a grind.
    for (const seed of [1, 2, 3, 7, 42, 99]) {
      const asked = plan(WORDS, seed).filter(isAnswerable);
      const clashes = asked
        .map((s, i) => (i > 0 && asked[i - 1]!.kind === s.kind ? `${i}:${s.kind}` : null))
        .filter(Boolean);
      expect(clashes, `seed ${seed}`).toEqual([]);
    }
  });

  it("brings words back inside the lesson rather than leaving it all to tomorrow", () => {
    const steps = plan();
    const asked = new Map<string, number>();
    for (const step of steps) {
      if (!isAnswerable(step) || !step.lemma) continue;
      asked.set(step.lemma, (asked.get(step.lemma) ?? 0) + 1);
    }
    for (const word of WORDS) {
      expect(asked.get(word.lemma) ?? 0, `${word.lemma} was asked only once`).toBeGreaterThanOrEqual(2);
    }
  });

  it("every word ends up produced, not just recognised", () => {
    const typed = new Set(plan().filter((s) => s.kind === "type").map((s) => s.lemma));
    for (const word of WORDS) expect(typed.has(word.lemma), word.lemma).toBe(true);
  });

  it("stays one sitting however big the unit is", () => {
    // A 24-word unit is several lessons, not one long one: splitIntoLessons is
    // what keeps every word getting the full ladder instead of the last few
    // silently losing a rung when the step budget runs out.
    const many = Array.from({ length: 24 }, (_, i) => noun(`s\u00f5na${i}`, `word ${i}`));
    const lessons = splitIntoLessons(many);
    expect(lessons.length).toBeGreaterThan(1);
    for (const words of lessons) {
      const steps = planLesson({ unit, words, distractors: DISTRACTORS, seed: 3 });
      expect(steps.length).toBeLessThanOrEqual(40);
      expect(steps.at(-1)?.kind).toBe("recap");
    }
  });

  it("never leaves a lesson of one or two words dangling at the end", () => {
    const lessons = splitIntoLessons(Array.from({ length: 13 }, (_, i) => noun(`s\u00f5na${i}`, `w${i}`)));
    for (const l of lessons) expect(l.length).toBeGreaterThan(2);
  });

  it("has nothing to plan for an empty unit, and says so by returning nothing", () => {
    expect(planLesson({ unit, words: [], seed: 1 })).toEqual([]);
  });
});

describe("what a step is built from", () => {
  it("only builds a gap-fill from an attested sentence", () => {
    const gaps = plan().filter((s): s is Extract<LessonStep, { kind: "gap" }> => s.kind === "gap");
    for (const gap of gaps) {
      const source = WORDS.find((w) => w.lemma === gap.lemma);
      expect(source?.examples).toContain(gap.full);
      // The blank really removed something, and the answer really was in it.
      expect(gap.text).not.toEqual(gap.full);
      expect(gap.full).toContain(gap.answer);
    }
  });

  it("has no gap-fill at all when the unit carries no sentences", () => {
    // An honest absence. The alternative is inventing a sentence to blank.
    const bare = WORDS.map((w) => ({ ...w, examples: [] }));
    const steps = planLesson({ unit, words: bare, distractors: DISTRACTORS, seed: 5 });
    expect(steps.some((s) => s.kind === "gap")).toBe(false);
  });

  it("offers real words as wrong answers, never invented ones", () => {
    const real = new Set([...WORDS, ...DISTRACTORS].flatMap((w) => [w.lemma, w.gloss]));
    for (const step of plan()) {
      if (step.kind === "choose" || step.kind === "produce" || step.kind === "listen") {
        for (const option of step.options) expect(real.has(option), option).toBe(true);
      }
    }
  });

  it("always marks exactly one option correct", () => {
    for (const seed of [1, 4, 11]) {
      for (const step of plan(WORDS, seed)) {
        if (step.kind !== "choose" && step.kind !== "produce" && step.kind !== "listen") continue;
        expect(step.options.length).toBe(4);
        expect(new Set(step.options).size).toBe(4);
        expect(step.answer).toBeGreaterThanOrEqual(0);
        expect(step.answer).toBeLessThan(step.options.length);
      }
    }
  });

  it("derives a case question from the genitive, never from thin air", () => {
    const cases = plan().filter((s): s is Extract<LessonStep, { kind: "case" }> => s.kind === "case");
    for (const step of cases) {
      const source = WORDS.find((w) => w.lemma === step.lemma)!;
      expect(step.answer.startsWith(source.parts.GEN_SG!)).toBe(true);
    }
  });

  it("reaches for the same part of speech before any other wrong answer", () => {
    // A phrase like "Tere!" mixed with a noun's bare "salt" or a verb's "to
    // put" is not a real question: the phrase is the only option shaped like
    // an answer to "What does this mean?" and it gives itself away before a
    // learner reads a word of it. With enough phrases in the pool, the wrong
    // options should be other phrases, not the noun distractors sitting
    // right beside them.
    const greeting: LessonWord = {
      lemma: "tere", gloss: "Hello!", pos: "PHRASE", examples: [], parts: {}, government: null,
    };
    const otherPhrases: LessonWord[] = [
      { lemma: "aitäh", gloss: "Thank you!", pos: "PHRASE", examples: [], parts: {}, government: null },
      { lemma: "palun", gloss: "Please!", pos: "PHRASE", examples: [], parts: {}, government: null },
      { lemma: "vabandust", gloss: "Sorry!", pos: "PHRASE", examples: [], parts: {}, government: null },
    ];
    const steps = planLesson({
      unit, words: [greeting], distractors: [...otherPhrases, ...DISTRACTORS], seed: 9,
    });
    const asked = steps.filter(
      (s): s is Extract<LessonStep, { kind: "choose" | "listen" }> =>
        (s.kind === "choose" || s.kind === "listen") && s.lemma === "tere",
    );
    expect(asked.length).toBeGreaterThan(0);
    const phraseGlosses = new Set(otherPhrases.map((w) => w.gloss));
    for (const step of asked) {
      for (const option of step.options) {
        if (option === greeting.gloss) continue;
        expect(phraseGlosses.has(option), option).toBe(true);
      }
    }
  });

  it("asks about government only where Ekilex recorded one", () => {
    const verbs: LessonWord[] = [
      { lemma: "aitama", gloss: "to help", pos: "VERB", examples: [], parts: { INF_MA: "aitama", GEN_SG: "" }, government: "keda" },
      { lemma: "jooksma", gloss: "to run", pos: "VERB", examples: [], parts: { INF_MA: "jooksma" }, government: null },
    ];
    const steps = planLesson({ unit, words: verbs, distractors: DISTRACTORS, seed: 2 });
    const govern = steps.filter((s) => s.kind === "govern");
    for (const step of govern) expect(step.lemma).toBe("aitama");
  });
});

describe("answerableCount", () => {
  it("counts the questions, not the reading", () => {
    const steps = plan();
    const total = answerableCount(steps);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(steps.length);
    expect(steps.filter((s) => s.kind === "intro" || s.kind === "recap" || s.kind === "meet")
      .every((s) => !isAnswerable(s))).toBe(true);
  });
});
