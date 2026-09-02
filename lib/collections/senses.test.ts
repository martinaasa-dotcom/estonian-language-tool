/**
 * The prompts more than one word answers, and which of them are a bug.
 *
 * A production card is front `translation`, hint `pos`, back `lemma`. Two
 * entries sharing a gloss and a part of speech are one question with two right
 * answers, and the dictionary ships 372 of them. `lib/srs/cards.ts` fixes the
 * marking by putting the whole set on the back, so none of the 372 can mark a
 * right answer wrong any more.
 *
 * What it cannot fix is a gloss that does not describe its own word.
 * `iseloom` and `tegelane` are both glossed "character", and one is a person's
 * character while the other is a character in a story: accepting both is fair,
 * because the learner is being punished for a prompt nobody could answer, and
 * the prompt is still wrong. Ekilex's own definition is what tells that case
 * from a real synonym pair, and this pins the ones that are known so the list
 * can only shrink.
 */
import { describe, expect, it } from "vitest";
import { shippedDictionary } from "@/scripts/lib/dictionary";
import {
  COARSENS, alsoAcceptedByLemma, mislabelled, promptKey, sharedPrompts, type SenseWord,
} from "./senses";

const words: SenseWord[] = shippedDictionary().map((e) => ({
  lemma: e.lemma, pos: e.pos, gloss: e.gloss, note: e.note, ekilexPos: e.ekilexPos,
}));
const groups = sharedPrompts(words);

/**
 * Prompts where the two words are not synonyms and the gloss cannot say which
 * is wanted. Ekilex gives each of these pairs two different definitions.
 *
 * A DEFECT LIST, NOT AN EXEMPTION LIST. Each line is a card no learner can
 * answer as asked, waiting for somebody to write a gloss that identifies its
 * word. The value beside it is what the two words actually are, so whoever
 * picks one up does not have to look it up again.
 */
const AMBIGUOUS_PROMPTS = new Map<string, string>([
  ["application|NOUN", "avaldus is a form you submit, rakendus is a piece of software"],
  ["character|NOUN", "iseloom is a person's character, tegelane is a character in a story"],
  ["competition|NOUN", "konkurents is rivalry, võistlus is a contest"],
  ["connection|NOUN", "seos is a relation between things, ühendus is a link or a service"],
  ["equivalent|NOUN", "ekvivalent is the borrowed term, vaste is the everyday one"],
  ["everyday|ADJECTIVE", "argine is humdrum, igapäevane is daily"],
  ["expression|NOUN", "väljend is a phrase, väljendus is the act of expressing"],
  ["on the other hand|ADVERB", "seevastu contrasts, teisalt enumerates a second view"],
  ["to adapt|VERB", "kohandama adapts something, kohanema is adapting oneself"],
  ["to justify|VERB", "põhjendama gives reasons, õigustama defends as right"],
  ["witty|ADJECTIVE", "teravmeelne is sharp, vaimukas is playful"],
]);

describe("prompts more than one word answers", () => {
  it("finds them at the size the dictionary actually has", () => {
    expect(groups.length).toBeGreaterThan(300);
    expect(groups.every((g) => g.lemmas.length > 1)).toBe(true);
  });

  it("has no new prompt whose gloss cannot identify its word", () => {
    const fresh = groups
      .filter((g) => g.diagnosis === "ambiguous")
      .map((g) => g.key)
      .filter((key) => !AMBIGUOUS_PROMPTS.has(key));
    expect(
      fresh,
      "a new pair of entries shares a prompt and Ekilex says they are different words, so the card "
      + "asks a question neither of them answers. Give one a gloss that tells them apart, or add it "
      + "here with what the two words actually are.",
    ).toEqual([]);
  });

  /*
    Keeps the list honest. A prompt that stops being ambiguous, because somebody
    wrote a gloss that identifies its word, has to come off, or the list becomes
    the parking space every exemption list turns into when nobody prunes it.
  */
  it("has no stale entry", () => {
    const ambiguous = new Set(groups.filter((g) => g.diagnosis === "ambiguous").map((g) => g.key));
    const stale = [...AMBIGUOUS_PROMPTS.keys()].filter((key) => !ambiguous.has(key));
    expect(stale, "these are no longer ambiguous and should come off the list").toEqual([]);
  });

  it("tells a synonym pair from a gloss that cannot identify its word", () => {
    const one = "seob sisu poolest samaväärseid sõnu";
    const two = "hoopis midagi muud";
    const pair = (noteA: string, noteB: string): SenseWord[] => [
      { lemma: "a", pos: "ADVERB", gloss: "and", note: noteA, ekilexPos: ["konj"] },
      { lemma: "b", pos: "ADVERB", gloss: "and", note: noteB, ekilexPos: ["konj"] },
    ];
    expect(sharedPrompts(pair(one, one))[0]?.diagnosis).toBe("synonyms");
    expect(sharedPrompts(pair(one, two))[0]?.diagnosis).toBe("ambiguous");
    expect(sharedPrompts(pair(one, ""))[0]?.diagnosis).toBe("unjudged");
  });

  /*
    The part of speech is half the prompt, because it is the card's hint. Two
    entries glossed "help" as a noun and as a verb are not one question, and an
    earlier version of this that grouped on the gloss alone said they were.
  */
  it("does not group two words a learner could tell apart by the hint", () => {
    const apart: SenseWord[] = [
      { lemma: "abi", pos: "NOUN", gloss: "help", note: null },
      { lemma: "aitama", pos: "VERB", gloss: "to help", note: null },
    ];
    expect(sharedPrompts(apart)).toEqual([]);
    expect(promptKey("Help ", "NOUN")).toBe(promptKey("help", "NOUN"));
    expect(promptKey("help", "NOUN")).not.toBe(promptKey("help", "VERB"));
  });

  it("gives every word in a group the others as also accepted", () => {
    const map = alsoAcceptedByLemma(groups);
    const and = groups.find((g) => g.key === "and|ADVERB");
    expect(and?.lemmas).toEqual(["ja", "ning"]);
    expect(map.get("ja|ADVERB")).toEqual(["ning"]);
    expect(map.get("ning|ADVERB")).toEqual(["ja"]);
    // A word nothing shares a prompt with is simply absent, not an empty entry.
    expect(map.has("tuba|NOUN")).toBe(false);
  });
});

describe("the course's part of speech against Ekilex's", () => {
  it("agrees on every word Ekilex has an opinion about", () => {
    const wrong = mislabelled(words).map((w) => `${w.lemma} is ${w.pos} here, ${(w.ekilexPos ?? []).join("/")} there`);
    expect(wrong).toEqual([]);
  });

  it("fires when the two genuinely disagree", () => {
    const noun: SenseWord = { lemma: "x", pos: "NOUN", gloss: "x", note: null, ekilexPos: ["v"] };
    expect(mislabelled([noun])).toHaveLength(1);
  });

  /*
    A word Ekilex has no opinion about is not a disagreement. Asserted because
    the natural way to write the filter treats an empty list as "matches
    nothing" and fails every entry outside the course.
  */
  it("says nothing about a word with no Ekilex label", () => {
    expect(mislabelled([{ lemma: "x", pos: "NOUN", gloss: "x", note: null, ekilexPos: [] }])).toEqual([]);
    expect(mislabelled([{ lemma: "x", pos: "NOUN", gloss: "x", note: null }])).toEqual([]);
  });

  it("covers every label the dictionary actually uses", () => {
    for (const pos of new Set(words.map((w) => w.pos))) {
      expect(COARSENS[pos], `${pos} is a label with no coarsening written down`).toBeDefined();
    }
  });
});
