import { describe, expect, it } from "vitest";
import { MAX_ITEMS, guessPos, looksTranscribed, parseScanReply } from "./extract";

const reply = (words: unknown) => JSON.stringify({ words });

describe("parseScanReply", () => {
  it("reads the shape the prompt asks for", () => {
    expect(parseScanReply(reply([{ et: "tuba", en: "room" }]))).toEqual([
      { et: "tuba", en: "room" },
    ]);
  });

  it("survives a code fence, which is what half of them send", () => {
    const fenced = "```json\n" + reply([{ et: "raamat", en: "book" }]) + "\n```";
    expect(parseScanReply(fenced)).toEqual([{ et: "raamat", en: "book" }]);
  });

  it("survives a sentence in front of the JSON", () => {
    const chatty = "Here is what I can see on the page:\n" + reply([{ et: "koer", en: "dog" }]);
    expect(parseScanReply(chatty)).toEqual([{ et: "koer", en: "dog" }]);
  });

  it("is an empty list when the model answered in prose", () => {
    expect(parseScanReply("I could not read that photograph, sorry.")).toEqual([]);
  });

  it("is an empty list when the reply is not JSON at all", () => {
    expect(parseScanReply("")).toEqual([]);
    expect(parseScanReply("{{{")).toEqual([]);
  });

  it("keeps the diacritics, which are the whole point", () => {
    expect(parseScanReply(reply([{ et: "sõber", en: "friend" }]))[0]?.et).toBe("sõber");
  });

  it("drops a word in a script the page cannot have printed", () => {
    // A model that has drifted from transcription into generation drifts into
    // a language it knows better. This is the cheapest signal that happened.
    expect(parseScanReply(reply([{ et: "книга", en: "book" }, { et: "tuba", en: "room" }])))
      .toEqual([{ et: "tuba", en: "room" }]);
  });

  it("keeps the Estonian when only the gloss went foreign", () => {
    // The word is still printed on the page and the dictionary may well know
    // it; losing it because the English half was wrong helps nobody.
    expect(parseScanReply(reply([{ et: "tuba", en: "комната" }]))).toEqual([
      { et: "tuba", en: "" },
    ]);
  });

  it("drops a sentence the model wrote instead of a word", () => {
    const long = "See on väga pikk lause mida keegi ei kirjutanud ühelegi paberile kunagi";
    expect(parseScanReply(reply([{ et: long, en: "" }]))).toEqual([]);
  });

  it("drops a row with no Estonian in it", () => {
    expect(parseScanReply(reply([{ en: "book" }, { et: "", en: "x" }, { et: "42" }]))).toEqual([]);
  });

  it("keeps the first spelling of a word repeated down a page", () => {
    const twice = reply([{ et: "Tuba", en: "room" }, { et: "tuba", en: "chamber" }]);
    expect(parseScanReply(twice)).toEqual([{ et: "Tuba", en: "room" }]);
  });

  it("stops at the page limit rather than at whatever the model felt like sending", () => {
    const many = Array.from({ length: MAX_ITEMS + 20 }, (_, i) => ({ et: `sona${i}`, en: "" }));
    expect(parseScanReply(reply(many))).toHaveLength(MAX_ITEMS);
  });

  it("collapses a line break inside a cell rather than making two words of it", () => {
    expect(parseScanReply(reply([{ et: "eesti  keel", en: " the\nEstonian language " }]))).toEqual([
      { et: "eesti keel", en: "the Estonian language" },
    ]);
  });

  it("accepts `items` as well, because models rename the key", () => {
    expect(parseScanReply(JSON.stringify({ items: [{ et: "kass", en: "cat" }] }))).toEqual([
      { et: "kass", en: "cat" },
    ]);
  });
});

describe("looksTranscribed", () => {
  it.each([["tuba", true], ["eesti keel", true], ["ma ei tea", true], ["Head aega!", true]])(
    "accepts %s",
    (word, expected) => expect(looksTranscribed(word)).toBe(expected),
  );

  it.each(["", "   ", "42", "***", "<script>", "книга"])("rejects %s", (word) => {
    expect(looksTranscribed(word)).toBe(false);
  });
});

describe("guessPos", () => {
  it("reads a citation form as a verb", () => {
    expect(guessPos("lugema")).toBe("VERB");
  });

  it("treats anything with a space as a phrase", () => {
    expect(guessPos("Head aega!")).toBe("PHRASE");
  });

  it("guesses nothing it cannot tell", () => {
    // A wrong part of speech is a wrong unique key in a shared dictionary, and
    // it outlives the scan that created it.
    expect(guessPos("raamat")).toBe("OTHER");
  });
});
