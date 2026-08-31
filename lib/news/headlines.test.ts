import { describe, expect, it } from "vitest";

import { headlineWords, parseHeadlines } from "./headlines";

const FEED = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel>
  <title>uudised | ERR</title>
  <description>uudised</description>
  <item><title><![CDATA[Maardu linnajooksu võitsid Karel ja Liis Grete Hussar]]></title></item>
  <item><title><![CDATA[Politico: Prantsusmaa ja Saksamaa tegid ettepaneku Kallase rolli tugevdada]]></title></item>
  <item><title>Rong j&#228;i Tartus seisma &amp; reisijad ootasid</title></item>
</channel></rss>`;

describe("reading a feed", () => {
  it("takes the headlines and never the channel's own name", () => {
    const headlines = parseHeadlines(FEED);
    expect(headlines).toHaveLength(3);
    expect(headlines.join(" ")).not.toContain("uudised | ERR");
  });

  it("unwraps CDATA and decodes entities", () => {
    expect(parseHeadlines(FEED)[2]).toBe("Rong jäi Tartus seisma & reisijad ootasid");
  });

  it("returns nothing rather than throwing on something that is not a feed", () => {
    expect(parseHeadlines("")).toEqual([]);
    expect(parseHeadlines("<html><title>Not a feed</title></html>")).toEqual([]);
    expect(parseHeadlines("<item><title>unclosed")).toEqual([]);
  });
});

describe("the words in a headline", () => {
  const words = headlineWords(parseHeadlines(FEED));

  it("keeps the ordinary Estonian", () => {
    expect(words).toContain("linnajooksu");
    expect(words).toContain("ettepaneku");
    expect(words).toContain("reisijad");
  });

  /*
    The one that matters. `Kallase` is a surname here and `kallas` is a real
    word meaning a shore, so without this the dictionary would vouch for it and
    the row would offer a beginner a word off the back of a politician's name.
  */
  it("drops a name capitalised inside a sentence", () => {
    for (const name of ["karel", "liis", "grete", "hussar", "kallase", "saksamaa", "tartus"]) {
      expect(words, `kept ${name}`).not.toContain(name);
    }
  });

  it("keeps a word capitalised because it opens a sentence", () => {
    expect(words).toContain("maardu");
    expect(words).toContain("rong");
    expect(words).toContain("prantsusmaa");
  });

  it("drops an abbreviation in full capitals", () => {
    expect(headlineWords(["ERR küsis EL-i käest"])).toEqual(["küsis", "käest"]);
  });

  it("lower-cases, deduplicates and keeps the biggest story first", () => {
    expect(headlineWords(["Kohv on kohv", "Tee on tee"])).toEqual(["kohv", "on", "tee"]);
  });

  it("counts a colon as a sentence break, so the word after one is not a name", () => {
    expect(headlineWords(["Politico: Prantsusmaa otsustas"])).toContain("prantsusmaa");
    expect(headlineWords(["Politico ütles Prantsusmaa kohta"])).not.toContain("prantsusmaa");
  });
});
