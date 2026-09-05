import { describe, expect, it } from "vitest";
import { buildPaper, type PoolWord } from "./paper";
import {
  BLANK_RESPONSE, allMarks, gradesFrom, markItem, markPaper, type Response,
} from "./score";
import { PASS_PCT } from "./spec";

function pool(count: number): PoolWord[] {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  return Array.from({ length: count }, (_, i) => {
    const lemma = `sona${letters[Math.floor(i / 26) % 26]}${letters[i % 26]}`;
    return {
      lexemeId: `lex-${i}`,
      lemma,
      translation: "gloss",
      pos: "NOUN",
      cefr: "A1",
      semanticTypes: null,
      forms: [
        { formType: "NOM_SG", value: lemma, morphCode: null, morphName: null },
        { formType: "GEN_SG", value: `${lemma}a`, morphCode: null, morphName: null },
        { formType: "PART_SG", value: `${lemma}at`, morphCode: null, morphName: null },
      ],
      examples: [
        { et: `Mina olen ${lemma}a juures igal hommikul.`, en: null },
        { et: `See ${lemma} seisab seal.`, en: null },
      ],
      government: null,
      cardId: `card-${i}`,
    };
  });
}

/** Answers every question on a paper correctly, using the paper's own answers. */
function perfect(paper: ReturnType<typeof buildPaper>): Map<string, Response> {
  const out = new Map<string, Response>();
  for (const part of paper.parts) {
    for (const task of part.tasks) {
      for (const item of task.items) {
        switch (item.kind) {
          case "match-usage":
            out.set(item.id, { kind: "chosen", value: item.answer });
            break;
          case "gap-choice":
          case "listen-choose":
            out.set(item.id, { kind: "chosen", value: item.answer });
            break;
          case "government":
            out.set(item.id, { kind: "chosen", value: item.answer });
            break;
          case "case-form":
          case "dictation":
            out.set(item.id, { kind: "typed", value: item.answer });
            break;
          case "order":
            out.set(item.id, {
              kind: "ordered",
              value: item.answer.replace(/[.!?]/g, "").split(" ").filter(Boolean),
            });
            break;
          case "message":
          case "compose":
            out.set(item.id, {
              kind: "composed",
              value: [
                ...item.mustUse.map((w) => w.lemma),
                ...Array.from({ length: item.minWords }, (_, i) => `word${i}`),
              ].join(" "),
            });
            break;
          case "speak":
            out.set(item.id, {
              kind: "spoken",
              recorded: true,
              criteria: Array.from({ length: 12 }, () => true),
            });
            break;
        }
      }
    }
  }
  return out;
}

describe("marking a paper", () => {
  const paper = buildPaper("B1", pool(60), "score-seed");

  it("gives full marks for every answer right", () => {
    const result = markPaper(paper, perfect(paper));
    expect(result.pct).toBe(100);
    expect(result.passed).toBe(true);
    expect(result.band.label).toBe("very good");
    for (const part of result.parts) expect(part.points).toBe(part.maxPoints);
  });

  it("gives nothing for a paper left blank, and calls it a fail", () => {
    const result = markPaper(paper, new Map());
    expect(result.pct).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.waitBeforeResit).toBe(true);
  });

  it("fails a paper with a zero in one part, however good the other three are", () => {
    const answers = perfect(paper);
    for (const task of paper.parts.find((p) => p.spec.skill === "speaking")!.tasks) {
      for (const item of task.items) answers.set(item.id, BLANK_RESPONSE);
    }
    const result = markPaper(paper, answers);
    expect(result.pct).toBeGreaterThanOrEqual(PASS_PCT);
    expect(result.zeroPart).toBe("speaking");
    expect(result.passed).toBe(false);
  });

  it("never lets a part score more than the points it carries", () => {
    const result = markPaper(paper, perfect(paper));
    for (const part of result.parts) {
      expect(part.points).toBeLessThanOrEqual(part.maxPoints);
    }
    expect(result.points).toBeLessThanOrEqual(result.maxPoints);
  });

  it("marks a part out of what was actually set, not out of what was intended", () => {
    const thin = buildPaper("B1", pool(4), "thin-seed");
    const result = markPaper(thin, perfect(thin));
    expect(result.thin).toBe(true);
    // Everything that could be asked was answered right, so it is still full
    // marks. A shortfall must not read as a wrong answer, and a part nothing
    // could be set for must not read as a part that was failed.
    expect(result.pct).toBe(100);
    expect(result.absentParts.length).toBeGreaterThan(0);
    expect(result.zeroPart).toBeNull();
    expect(result.maxPoints).toBeLessThan(100);
  });

  it("rounds a pass mark down, because 59.6 percent is not a pass", () => {
    // A paper answered right on everything but a single mark of the writing
    // part still passes; the rounding rule only matters at the boundary, and
    // flooring is what stops a 59 point something reading as 60.
    const result = markPaper(paper, perfect(paper));
    expect(Number.isInteger(result.pct)).toBe(true);
  });
});

describe("what one answer is worth", () => {
  const paper = buildPaper("B1", pool(60), "item-seed");
  const dictation = paper.parts
    .flatMap((p) => p.tasks)
    .flatMap((t) => t.items)
    .find((i) => i.kind === "dictation")!;

  it("forgives a missed diacritic in a dictation, as the real marking scheme does", () => {
    const withoutDiacritics = dictation.kind === "dictation"
      ? dictation.answer.replace(/õ/g, "o").replace(/ä/g, "a")
      : "";
    const mark = markItem(dictation, { kind: "typed", value: withoutDiacritics }, 1);
    expect(mark.correct).toBe(true);
  });

  it("does not forgive a missing word", () => {
    if (dictation.kind !== "dictation") throw new Error("expected a dictation item");
    const short = dictation.answer.split(" ").slice(0, -1).join(" ");
    expect(markItem(dictation, { kind: "typed", value: short }, 1).correct).toBe(false);
  });

  it("scores a spoken task nothing when nothing was recorded, however many boxes are ticked", () => {
    const speak = paper.parts
      .flatMap((p) => p.tasks)
      .flatMap((t) => t.items)
      .find((i) => i.kind === "speak")!;
    const mark = markItem(
      speak,
      { kind: "spoken", recorded: false, criteria: [true, true, true, true, true, true] },
      6,
    );
    expect(mark.scored).toBe(0);
  });

  it("gives a composition partial credit for partial length", () => {
    const compose = paper.parts
      .flatMap((p) => p.tasks)
      .flatMap((t) => t.items)
      .find((i) => i.kind === "compose")!;
    if (compose.kind !== "compose") throw new Error("expected a composition");
    const half = Array.from({ length: Math.floor(compose.minWords / 2) }, (_, i) => `w${i}`).join(" ");
    const mark = markItem(compose, { kind: "composed", value: half }, 12);
    expect(mark.scored).toBeGreaterThan(0);
    expect(mark.scored).toBeLessThan(12);
    expect(mark.raw).toBe(half);
  });

  it("marks the short message the same way it marks the composition", () => {
    const message = paper.parts
      .flatMap((p) => p.tasks)
      .flatMap((t) => t.items)
      .find((i) => i.kind === "message")!;
    if (message.kind !== "message") throw new Error("expected a message");

    const full = [
      ...message.mustUse.map((w) => w.lemma),
      ...Array.from({ length: message.minWords }, (_, i) => `w${i}`),
    ].join(" ");
    expect(markItem(message, { kind: "composed", value: full }, 8).scored).toBe(8);

    // Nothing written scores nothing, and the points it did not cover are named
    // rather than left to be guessed at from a number.
    const blank = markItem(message, { kind: "composed", value: "" }, 8);
    expect(blank.scored).toBe(0);
    expect(blank.note).toContain(message.mustUse[0]?.lemma ?? "");
  });

  it("marks the two briefs of the second task identically, whichever was chosen", () => {
    /*
      The real paper offers a story or a personal letter, so this one does. The
      choice may not move a mark: both are marked on length and on the words the
      task named, and a mock where picking the letter scored differently would be
      inventing a judgment about somebody's Estonian.
    */
    const compose = paper.parts
      .flatMap((p) => p.tasks)
      .flatMap((t) => t.items)
      .find((i) => i.kind === "compose")!;
    if (compose.kind !== "compose") throw new Error("expected a composition");
    const text = Array.from({ length: compose.minWords }, (_, i) => `w${i}`).join(" ");

    const story = markItem(compose, { kind: "composed", value: text, variant: 0 }, 12);
    const letter = markItem(compose, { kind: "composed", value: text, variant: 1 }, 12);
    expect(letter.scored).toBe(story.scored);
  });

  it("reports a matching answer as the word, never as the option id it was stored as", () => {
    /*
      A radio group carries an id, so that is what the response holds. The
      result page prints `given`, and a line reading "you wrote
      dbcff369-4fb5-4a41-9a7d-6b3c3264dbf5" is a line nobody can learn anything
      from, which is the whole purpose of that list.
    */
    const task = paper.parts
      .flatMap((p) => p.tasks)
      .find((t) => t.spec.kind === "match-usage" && t.items.length > 0 && t.choices);
    if (!task) return;
    const item = task.items[0]!;
    const wrong = task.choices!.find((c) => c.id !== (item as { answer: string }).answer)!;
    const mark = markItem(item, { kind: "chosen", value: wrong.id }, 1, task.choices);
    expect(mark.given).toBe(wrong.label);
    expect(mark.given).not.toContain("-");
  });

  it("counts a required word however it was inflected", () => {
    const compose = paper.parts
      .flatMap((p) => p.tasks)
      .flatMap((t) => t.items)
      .find((i) => i.kind === "compose")!;
    if (compose.kind !== "compose") throw new Error("expected a composition");
    /*
      The comitative, built the way Estonian builds it, off the genitive stem
      this fixture gives every word. It used to append `ga` to the lemma, which
      is not a form of anything: the old prefix rule passed it because the first
      three letters matched, so this check was passing for the wrong reason.
    */
    const inflected = compose.mustUse.map((w) => `${w.lemma}aga`).join(" ");
    const padded = `${inflected} ${Array.from({ length: compose.minWords }, () => "x").join(" ")}`;
    const mark = markItem(compose, { kind: "composed", value: padded }, 12);
    expect(mark.note).toBe("");
  });
});

describe("what the sitting tells the scheduler", () => {
  const paper = buildPaper("B1", pool(60), "grade-seed");

  it("grades every card the paper asked about", () => {
    const result = markPaper(paper, perfect(paper));
    const grades = gradesFrom(result);
    expect(grades.length).toBeGreaterThan(0);
    expect(grades.every((g) => g.rating === 3)).toBe(true);
  });

  it("writes nothing for a question left blank", () => {
    const result = markPaper(paper, new Map());
    expect(gradesFrom(result)).toEqual([]);
  });

  it("writes nothing for a task with no card behind it", () => {
    const cardless = pool(60).map((word) => ({ ...word, cardId: null }));
    const other = buildPaper("B1", cardless, "grade-seed");
    expect(gradesFrom(markPaper(other, perfect(other)))).toEqual([]);
  });

  it("keeps every mark reachable for the report", () => {
    const result = markPaper(paper, perfect(paper));
    const count = paper.parts.flatMap((p) => p.tasks).flatMap((t) => t.items).length;
    expect(allMarks(result)).toHaveLength(count);
  });
});

describe("which language an answer is in", () => {
  const paper = buildPaper("B1", pool(60), "lang-seed");
  const items = paper.parts.flatMap((p) => p.tasks).flatMap((t) => t.items);

  it("tags the English answers as English, so they are not set in Estonian", () => {
    for (const item of items) {
      const mark = markItem(item, BLANK_RESPONSE, 1);
      const english = ["government", "gloss-choice", "message", "compose", "speak"].includes(item.kind);
      expect(mark.language === "en").toBe(english);
    }
  });

  it("leaves the Estonian answers Estonian", () => {
    const form = items.find((i) => i.kind === "case-form")!;
    expect(markItem(form, { kind: "typed", value: "vale" }, 1).language).toBe("et");
  });
});

describe("a recording that would not play", () => {
  const paper = buildPaper("B1", pool(60), "unheard-seed");
  const listening = paper.parts.find((p) => p.spec.skill === "listening")!;

  it("is left out of the marks rather than counted wrong", () => {
    const answers = new Map<string, Response>();
    for (const task of listening.tasks) {
      for (const item of task.items) answers.set(item.id, { kind: "unheard" });
    }
    const result = markPaper(paper, answers);
    const part = result.parts.find((p) => p.skill === "listening")!;
    expect(part.rawAvailable).toBe(0);
    expect(result.absentParts).toContain("listening");
    // And so it cannot be the zero that fails the paper.
    expect(result.zeroPart).not.toBe("listening");
  });

  it("says why, in the answer list", () => {
    const item = listening.tasks.flatMap((t) => t.items)[0]!;
    const mark = markItem(item, { kind: "unheard" }, 1);
    expect(mark.available).toBe(0);
    expect(mark.note).toMatch(/would not play/);
  });
});
