/**
 * The prompts more than one word answers, and which of them are a bug.
 *
 * A production card is front `translation`, hint `pos`, back `lemma`. Two
 * entries sharing a gloss and a part of speech are one question with two right
 * answers, and the dictionary ships 372 of them. `lib/srs/cards.ts` fixes the
 * marking by putting the whole set on the back, so none of the 372 can mark a
 * right answer wrong any more.
 *
 * What a card cannot fix is a gloss that does not describe its own word, and
 * there were eleven of those. Ten were a real fault and are corrected: each one
 * now carries the Institute's own definition of its sense, rendered in English
 * in the house style the course already uses for one English word covering two
 * Estonian ones (`leib` "bread (dark)" beside `sai` "bread (white)"). So
 * `iseloom` is "character (a person's)" and `tegelane` is "character (in a
 * story)".
 *
 * The eleventh was the check being wrong. `teravmeelne` and `vaimukas` are
 * defined by naming each other, which is the Institute saying they are
 * synonyms in its own synonym-list style, and comparing the definitions as
 * strings read that as a disagreement. `sharedPrompts` knows the shape now.
 *
 * WHICH IS WHY THERE IS NO DEFECT LIST HERE ANY MORE. There was one, of
 * eleven, on the argument that a list that can only shrink is honest about
 * work outstanding. It shrank to nothing, and an empty exemption list with two
 * tests around it is the parking space every exemption list becomes. The check
 * is now the flat claim: no prompt in the shipped dictionary is one its own
 * gloss cannot answer.
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

describe("prompts more than one word answers", () => {
  it("finds them at the size the dictionary actually has", () => {
    expect(groups.length).toBeGreaterThan(300);
    expect(groups.every((g) => g.lemmas.length > 1)).toBe(true);
  });

  it("has no prompt whose gloss cannot identify its word", () => {
    const ambiguous = groups.filter((g) => g.diagnosis === "ambiguous").map((g) => `${g.key}: ${g.lemmas.join(", ")}`);
    expect(
      ambiguous,
      "two entries share a prompt and Ekilex gives them different definitions, so the card asks a "
      + "question neither of them answers. Read the Institute's definition of each and give one a "
      + "gloss that tells them apart, in the course's own style: character (a person's) beside "
      + "character (in a story). Accepting both is what the card already does and is not the fix.",
    ).toEqual([]);
  });

  it("tells a synonym pair from a gloss that cannot identify its word", () => {
    const one = "seob sisu poolest samaväärseid sõnu";
    const two = "hoopis midagi muud";
    const pair = (noteA: string, noteB: string): SenseWord[] => [
      { lemma: "aa", pos: "ADVERB", gloss: "and", note: noteA, ekilexPos: ["konj"] },
      { lemma: "bb", pos: "ADVERB", gloss: "and", note: noteB, ekilexPos: ["konj"] },
    ];
    expect(sharedPrompts(pair(one, one))[0]?.diagnosis).toBe("synonyms");
    expect(sharedPrompts(pair(one, two))[0]?.diagnosis).toBe("ambiguous");
    expect(sharedPrompts(pair(one, ""))[0]?.diagnosis).toBe("unjudged");
  });

  /*
    The Institute's other way of saying "synonym": where it has nothing to add
    beyond naming the neighbors, the definition is a list of them. Two such
    definitions are two different strings saying one thing.
  */
  it("reads two definitions that name each other as one meaning", () => {
    const mutual: SenseWord[] = [
      { lemma: "teravmeelne", pos: "ADJECTIVE", gloss: "witty", note: "vaimukas, nutikas, leidlik" },
      { lemma: "vaimukas", pos: "ADJECTIVE", gloss: "witty", note: "teravmeelne, ootamatu ja leidlik" },
    ];
    expect(sharedPrompts(mutual)[0]?.diagnosis).toBe("synonyms");
  });

  /*
    And one-way naming is not that, which is the whole reason the rule is
    mutual. Ekilex defines konkurents as a võistlus for supremacy and võistlus
    as an organized event: the first explains itself with the second word and
    is not it. Measured over the shipped dictionary, one-way naming would have
    excused this pair and to justify, both of which are real faults.
  */
  it("does not read one definition mentioning the other word as a synonym", () => {
    const oneWay: SenseWord[] = [
      { lemma: "konkurents", pos: "NOUN", gloss: "competition", note: "osaliste omavaheline võistlus paremuse pärast" },
      { lemma: "võistlus", pos: "NOUN", gloss: "competition", note: "kindlate reeglite järgi korraldatav üritus" },
    ];
    expect(sharedPrompts(oneWay)[0]?.diagnosis).toBe("ambiguous");
  });

  /*
    A word boundary that is not ASCII. `\b` sees a space and an `õ` as two
    non-word characters with no boundary between them, so the naming rule
    written the obvious way misses exactly the words this language is made of.
  */
  it("finds a named word whose first letter is Estonian", () => {
    const mutual: SenseWord[] = [
      { lemma: "õige", pos: "ADJECTIVE", gloss: "right", note: "täpne, õige" },
      { lemma: "täpne", pos: "ADJECTIVE", gloss: "right", note: "õige, korrektne" },
    ];
    expect(sharedPrompts(mutual)[0]?.diagnosis).toBe("synonyms");
  });

  /*
    And a lemma inside a longer word is not a mention of it. `seos` sits in
    `seosed` and in `seostama`, so a substring rule would call any pair whose
    definitions inflect each other synonyms.
  */
  it("does not count a lemma buried inside a longer word", () => {
    // Each note buries the other lemma and names neither: sidemete holds side,
    // seostamine holds seos. A substring rule reads this pair as synonyms.
    const buried: SenseWord[] = [
      { lemma: "seos", pos: "NOUN", gloss: "link", note: "sidemete loomine" },
      { lemma: "side", pos: "NOUN", gloss: "link", note: "seostamine ja ühendamine" },
    ];
    expect(sharedPrompts(buried)[0]?.diagnosis).toBe("ambiguous");
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
    const witty = groups.find((g) => g.key === "witty|ADJECTIVE");
    expect(witty?.lemmas).toEqual(["teravmeelne", "vaimukas"]);
    expect(map.get("teravmeelne|ADJECTIVE")).toEqual(["vaimukas"]);
    expect(map.get("vaimukas|ADJECTIVE")).toEqual(["teravmeelne"]);
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
