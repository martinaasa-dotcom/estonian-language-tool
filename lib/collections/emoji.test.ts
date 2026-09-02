import { describe, expect, it } from "vitest";
import { EMOJI_WORD_COUNT, WORD_EMOJI, emojiFor } from "./emoji";

describe("which words have a picture", () => {
  it("counts what it holds", () => {
    expect(Object.keys(WORD_EMOJI).length).toBe(EMOJI_WORD_COUNT);
  });

  it("answers for a word it has and not for one it does not", () => {
    expect(emojiFor("maja")).toBeTruthy();
    expect(emojiFor("mitte-ükski-selline-sõna")).toBeUndefined();
  });
});

/*
  THE TABLE IS NOT ONE PICTURE PER WORD, AND THE MATCHING BOARD HAS TO KNOW IT.

  Estonian has more than one word for plenty of things a picture can show, and
  Unicode has one picture for each of them: 🏠 is `maja` and `elamu`, 🚌 is
  `buss` and `autobuss`, 👨 is `mees`, `meesisik` and `meesterahvas`. That is
  the table being right rather than wrong, and `scripts/build-emoji.ts` has no
  business choosing between two true words.

  What it costs is downstream. `/review/emoji` is a matching board, so two words
  sharing an emoji put the same tile up twice against two different forms and
  the learner cannot tell which goes with which; getting it wrong then marks a
  card they knew. That page deduplicates on the picture as well as on the word,
  and this test is why that guard is load-bearing rather than theoretical: if
  the table ever became one picture per word, the guard would be dead code and
  this would say so.
*/
describe("one picture, more than one word", () => {
  const byEmoji = new Map<string, string[]>();
  for (const [lemma, emoji] of Object.entries(WORD_EMOJI)) {
    byEmoji.set(emoji, [...(byEmoji.get(emoji) ?? []), lemma]);
  }
  const shared = [...byEmoji.values()].filter((words) => words.length > 1);

  it("happens, and often enough to matter", () => {
    expect(shared.length).toBeGreaterThan(20);
    expect(byEmoji.size).toBeLessThan(Object.keys(WORD_EMOJI).length);
  });

  it("includes the pairs a beginner's deck would actually hold", () => {
    const together = (a: string, b: string) => WORD_EMOJI[a] === WORD_EMOJI[b];
    expect(together("maja", "elamu")).toBe(true);
    expect(together("buss", "autobuss")).toBe(true);
    expect(together("mees", "meesterahvas")).toBe(true);
  });
});
