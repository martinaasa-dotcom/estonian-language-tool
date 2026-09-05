import { describe, expect, it } from "vitest";

import { extractEstonianEntries, extractEstonianSenses } from "./wiktionary";

/**
 * Every case here is markup that was live on Wiktionary during the A1 to B1
 * gloss review, quoted as it stood. The seed builder takes sense one as the
 * flashcard answer, so a fault in this parser is not a display problem: the
 * scheduler repeats the wrong answer until the learner has learned it.
 */
const page = (body: string) => `==Estonian==\n\n===Noun===\n{{et-noun}}\n\n${body}\n\n==Finnish==\n`;

describe("extractEstonianSenses", () => {
  it("reads a plain wikilinked definition", () => {
    expect(extractEstonianSenses(page("# [[harbor]]"))).toEqual(["harbor"]);
  });

  it("keeps the order the page gives", () => {
    expect(extractEstonianSenses(page("# [[road]], [[way]]\n# [[tea]]"))).toEqual([
      "road, way",
      "tea",
    ]);
  });

  describe("templates whose output is the gloss", () => {
    /*
      The fault that cost the most. `{{l|en|lamp}}` renders as "lamp"; deleting
      it left an empty line and the picker moved to the next sense, which on a
      page with two etymologies is a different word. `lamp` was drilled as
      "random", `oktoober` as "hard hat", `ooper` as "opera house".
    */
    it("unwraps {{l|en|...}} rather than deleting it", () => {
      expect(extractEstonianSenses(page("# {{l|en|lamp}}"))).toEqual(["lamp"]);
    });

    it("does not fall through to the next sense when the first is a link template", () => {
      const wikitext =
        "==Estonian==\n\n===Etymology 1===\n\n====Noun====\n\n# {{l|en|lamp}}\n\n" +
        "===Etymology 2===\n\n====Adjective====\n\n# {{lb|et|colloquial}} [[random]]\n";
      expect(extractEstonianSenses(wikitext)[0]).toBe("lamp");
    });

    it("prefers a link template's display parameter to its target", () => {
      expect(extractEstonianSenses(page("# {{l|en|dressing#Noun|dressing}}"))).toEqual(["dressing"]);
    });

    it("unwraps {{tcl}} and {{vern}}", () => {
      expect(extractEstonianSenses(page("# {{tcl|et|October|id=Q124}}"))).toEqual(["October"]);
      expect(extractEstonianSenses(page("# {{vern|common magpie}}"))).toEqual(["common magpie"]);
    });

    it("keeps a link template that is only part of the line", () => {
      // `segama` shipped as "to , to , to".
      expect(extractEstonianSenses(page("# to {{l|en|mix}}, to {{l|en|stir}}"))).toEqual([
        "to mix, to stir",
      ]);
      // `vana` shipped as "an person".
      expect(extractEstonianSenses(page("# an {{l|en|old}} person"))).toEqual(["an old person"]);
    });

    /*
      ADR-005. `{{m|et|kohta}}` is an Estonian word quoted inside an English
      note, and unwrapping it by language-blind rule would write Estonian into
      a gloss. The language tag is checked, and anything that is not English is
      removed exactly as before.
    */
    it("never unwraps an Estonian-tagged link into an English gloss", () => {
      // Mid-line on purpose: in a trailing parenthetical the qualifier strip
      // removes it either way, and the test passes with the guard deleted.
      expect(extractEstonianSenses(page("# to [[depend]] on {{m|et|kõrb}}"))).toEqual([
        "to depend on",
      ]);
      expect(extractEstonianSenses(page("# {{l|et|talgud}}"))).toEqual([]);
    });
  });

  describe("the gap a removed template leaves", () => {
    it("closes a hole in the middle of a list", () => {
      // `sort` shipped as "kind, , brand"; `esimees` as "chairman, , president".
      expect(extractEstonianSenses(page("# [[kind]], {{taxfmt|x|y}}, [[brand]]"))).toEqual([
        "kind, brand",
      ]);
    });

    it("closes a gap before punctuation", () => {
      // `kartma` shipped as "to be afraid , to fear".
      expect(extractEstonianSenses(page("# to be afraid {{gl|of}}, to fear"))).toEqual([
        "to be afraid, to fear",
      ]);
    });

    it("removes parentheses left empty", () => {
      expect(extractEstonianSenses(page("# icterine warbler ({{taxfmt|H. icterina|species}})"))).toEqual([
        "icterine warbler",
      ]);
    });

    it("leaves a scientific name off the answer side", () => {
      // Unwrapping {{taxfmt}} turned "sprat" into "sprat, Sprattus sprattus".
      expect(extractEstonianSenses(page("# [[sprat]], {{taxfmt|Sprattus sprattus|species}}"))).toEqual([
        "sprat",
      ]);
    });
  });

  describe("lines that are not definitions", () => {
    it("skips a sense Wiktionary has asked somebody to define", () => {
      // `müristama` shipped as "to make a certain noise.", which is the shape
      // of a request for a definition with the request stripped out.
      const wikitext = page(
        "# {{lb|et|transitive}} to make a certain noise. {{rfdef|et}}\n# to [[thunder]]",
      );
      expect(extractEstonianSenses(wikitext)).toEqual(["to thunder"]);
    });

    it("returns nothing when every sense is a request for a definition", () => {
      expect(extractEstonianSenses(page("# {{rfdef|et}}"))).toEqual([]);
    });

    it("still skips a form-of pointer, and keeps one that carries a gloss", () => {
      expect(extractEstonianSenses(page("# {{noun form of|et|ilu||ine|s}}\n# [[beautiful]]"))).toEqual([
        "beautiful",
      ]);
      expect(extractEstonianSenses(page("# {{comparative of|et|hea}}: [[better]]"))).toEqual([
        "better",
      ]);
    });
  });

  describe("markup that was already handled, and must stay handled", () => {
    it("drops an unterminated template", () => {
      // `diktofon` shipped with the opening brace and everything after it.
      expect(extractEstonianSenses(page("# [[dictaphone]] {{gl|a small portable device"))).toEqual([
        "dictaphone",
      ]);
    });

    it("removes nested templates innermost-first", () => {
      expect(extractEstonianSenses(page("# {{lb|et|{{q|rare}}}} [[forest]]"))).toEqual(["forest"]);
    });

    it("ignores a page with no Estonian section", () => {
      expect(extractEstonianSenses("==Finnish==\n\n===Noun===\n\n# [[harbor]]")).toEqual([]);
    });

    it("does not read past the end of the Estonian section", () => {
      expect(extractEstonianSenses(page("# [[harbor]]"))).toEqual(["harbor"]);
    });
  });
});

/**
 * Every page quoted here was live on Wiktionary when the part-of-speech audit
 * ran, and each one is a shape that produced a wrong label before it.
 *
 * The gloss and the part of speech are two facts about one definition line, so
 * they are read in one pass. A label read from anywhere else can contradict the
 * gloss shipped beside it, which is exactly what the categories used to do.
 */
describe("extractEstonianEntries", () => {
  it("reports the heading each sense sits under", () => {
    const wikitext =
      "==Estonian==\n\n===Noun===\n{{et-noun}}\n\n# [[head]]\n\n" +
      "===Adverb===\n{{et-adv}}\n\n# [[almost]]\n\n==Finnish==\n";
    expect(extractEstonianEntries(wikitext).map((s) => [s.gloss, s.pos])).toEqual([
      ["head", "NOUN"],
      ["almost", "ADVERB"],
    ]);
  });

  it("reads the headword template beside the heading", () => {
    // `kallis`: the adjective block comes first, and its gloss is the one shipped.
    const wikitext =
      "==Estonian==\n\n===Adjective===\n{{et-adj|kalli|kallist}}\n\n# [[expensive]]\n\n==Finnish==\n";
    expect(extractEstonianEntries(wikitext)[0]).toEqual({
      gloss: "expensive",
      pos: "ADJECTIVE",
      headword: "ADJECTIVE",
      // The two principal parts the same template declares, which is the
      // second opinion `scripts/audit-homonyms.ts` checks the join against:
      // the gloss and the forms both have to be about one word.
      stems: ["kalli", "kallist"],
    });
  });

  it("reads a template that declares no stems as silence, not disagreement", () => {
    const wikitext = "==Estonian==\n\n===Noun===\n{{et-noun}}\n\n# [[harbor]]\n\n==Finnish==\n";
    expect(extractEstonianEntries(wikitext)[0]?.stems).toBe(null);
  });

  it("keeps only the positional arguments, so a superlative is not a principal part", () => {
    // `{{et-adj|ilusa|ilusat|s=ilusaim}}`: `s=` is the superlative.
    const wikitext =
      "==Estonian==\n\n===Adjective===\n{{et-adj|ilusa|ilusat|s=ilusaim}}\n\n# [[beautiful]]\n\n==Finnish==\n";
    expect(extractEstonianEntries(wikitext)[0]?.stems).toEqual(["ilusa", "ilusat"]);
  });

  it("does not carry a headword across into the next block", () => {
    // `oma`: an adjective block, then a noun block. The noun's sense must not
    // inherit the adjective's headword template.
    const wikitext =
      "==Estonian==\n\n===Adjective===\n{{et-adj|oma}}\n\n# [[own]]\n\n" +
      "===Noun===\n{{et-noun|oma}}\n\n# [[property]]\n\n==Finnish==\n";
    expect(extractEstonianEntries(wikitext).map((s) => [s.pos, s.headword])).toEqual([
      ["ADJECTIVE", "ADJECTIVE"],
      ["NOUN", "NOUN"],
    ]);
  });

  it("reads a heading nested under an etymology", () => {
    // Multi-etymology pages are the ones where the answer changes, so the
    // four-equals depth has to be read as well as the three.
    const wikitext =
      "==Estonian==\n\n===Etymology 1===\n\n====Adjective====\n{{et-adj}}\n\n# [[cool]]\n\n==Finnish==\n";
    expect(extractEstonianEntries(wikitext)[0]?.pos).toBe("ADJECTIVE");
  });

  it("leaves a heading this app has no label for as null", () => {
    // `saav` opens under `===Participle===`. Guessing NOUN because the word
    // declines would invent the fact the heading exists to supply.
    const wikitext = "==Estonian==\n\n===Participle===\n\n# [[becoming]]\n\n==Finnish==\n";
    expect(extractEstonianEntries(wikitext)[0]?.pos).toBeNull();
  });

  it("never reads Proper noun as Noun", () => {
    const wikitext = "==Estonian==\n\n===Proper noun===\n\n# [[Estonia]]\n\n==Finnish==\n";
    expect(extractEstonianEntries(wikitext)[0]?.pos).toBeNull();
  });

  it("ignores the declension table further down the block", () => {
    // `{{et-decl-...}}` is inflection, not a headword, and `====Declension====`
    // is a heading with no part of speech in it.
    const wikitext =
      "==Estonian==\n\n===Adjective===\n{{et-adj|üksiku}}\n\n# [[lonely]]\n\n" +
      "====Declension====\n{{et-decl-õnnelik|üksik}}\n\n==Finnish==\n";
    expect(extractEstonianEntries(wikitext)[0]?.headword).toBe("ADJECTIVE");
  });
});
