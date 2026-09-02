import { describe, expect, it } from "vitest";
import {
  DEFAULT_GLOSS_LANGUAGE, GLOSS_LANGUAGES, equivalentIn, glossLanguageFrom,
} from "./glossLanguage";

describe("glossLanguageFrom", () => {
  it("takes a language it knows", () => {
    for (const l of GLOSS_LANGUAGES) expect(glossLanguageFrom(l.id)).toBe(l.id);
  });

  /*
    A missing row has to read as the behaviour everybody already had, and a
    stored value can be anything: this is a `Setting` row, and a row is a
    string until something checks it.
  */
  it("falls back to English on anything else", () => {
    for (const value of [null, undefined, "", "de", "EN", "ru;drop"]) {
      expect(glossLanguageFrom(value)).toBe(DEFAULT_GLOSS_LANGUAGE);
    }
  });
});

describe("equivalentIn", () => {
  const tuba = { translation: "room", translationRu: "комната, жилище", translationUk: "кімната" };

  it("gives the Institute's own equivalent", () => {
    expect(equivalentIn(tuba, "ru")).toBe("комната, жилище");
    expect(equivalentIn(tuba, "uk")).toBe("кімната");
  });

  /*
    English is what the entry already prints, so there is nothing to print
    beside it. Returning the gloss again would draw it twice.
  */
  it("says nothing for English", () => {
    expect(equivalentIn(tuba, "en")).toBeNull();
  });

  /*
    Most of the built expansion has no equivalent: the course harvest carries
    them and the words drawn from Wiktionary do not. A screen with none prints
    the English alone, because "we have no Russian for this word" is not worth
    a line of somebody's card.
  */
  it("says nothing where Ekilex recorded none", () => {
    expect(equivalentIn({ translation: "moose" }, "ru")).toBeNull();
    expect(equivalentIn({ translation: "moose", translationRu: null }, "ru")).toBeNull();
    expect(equivalentIn({ translation: "moose", translationRu: "   " }, "ru")).toBeNull();
  });
});
