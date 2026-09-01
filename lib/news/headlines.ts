/**
 * The Estonian somebody is reading today, before anything believes a word of it.
 *
 * The dictionary's "Try" row used to be twelve rows off the top of an
 * alphabetical list, so every learner on every day was offered `aasialane`,
 * `aatomipomm` and `aberratsioon`. Nobody looks up an aberration. The row is
 * meant to say "here is what this dictionary is for", and it was saying "here
 * is where the table starts".
 *
 * A news feed is the cheapest honest source of words that are actually in the
 * air today, and this is the half of reading one that a machine can do without
 * touching the network: pull the headlines out of the XML, and pull the words
 * out of the headlines.
 *
 * IT DECIDES NOTHING. Every string that leaves here is a *candidate*, exactly
 * as `lib/scan/extract.ts` produces candidates from a photograph, and for the
 * same reason: this is text from outside the app, and outside text does not
 * get to add Estonian to anything. `lib/dict/suggest.ts` hands each one to
 * `matchEstonianForm`, which offers it only if the dictionary recognises the
 * exact spelling, a stored form, or a regular case of the genitive stem. A
 * headline could be about a company nobody has heard of and the worst that can
 * happen is that no word from it is offered.
 *
 * Pure and framework-free, so the parsing can be tested over a fixture rather
 * than over whatever the news happens to be this morning.
 */

/** How much XML is worth reading. A feed is tens of kilobytes; this is a cap on a surprise. */
const MAX_XML = 400_000;

/** Headlines to read. The front page is the topical part; page four is not. */
const MAX_HEADLINES = 60;

/**
 * A sentence boundary, for deciding which capital letters are ordinary.
 *
 * A headline capitalises its first word, and Estonian capitalises proper nouns
 * and very little else, so a capital *inside* a sentence is the one reliable
 * signal that a token is a name. `Politico: Prantsusmaa ja Saksamaa tegid
 * ettepaneku Kallase rolli tugevdada` has to lose four words and keep three,
 * and the colon is what makes `Prantsusmaa` sentence-initial rather than
 * mid-sentence, which is why this splits on one.
 */
const SENTENCE_BREAK = /[.:!?…]+/u;

/** Any run of characters that is not a letter separates two words. */
const WORD_BREAK = /[^\p{L}]+/u;

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/**
 * The headlines in an RSS document.
 *
 * Read out of `<item>` blocks rather than by matching every `<title>` in the
 * file, because the first `<title>` in an RSS feed is the channel's own name
 * and it is the one title in there that is never news.
 *
 * A regex rather than an XML parser: this reads one well-known field out of a
 * document whose only job is to carry it, an entire parser is a dependency,
 * and anything malformed enough to defeat this returns no headlines, which is
 * a case the caller has to handle anyway.
 */
export function parseHeadlines(xml: string): string[] {
  const source = xml.slice(0, MAX_XML);
  const out: string[] = [];

  for (const item of source.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(item[0]);
    if (!title?.[1]) continue;
    const text = decodeEntities(
      title[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"),
    ).trim();
    if (text) out.push(text);
    if (out.length >= MAX_HEADLINES) break;
  }

  return out;
}

/**
 * The words in those headlines worth asking the dictionary about.
 *
 * Two things are dropped and both are about names rather than about quality,
 * because quality is the dictionary's call and not this function's:
 *
 * A token capitalised mid-sentence is a proper noun. Estonian capitalises
 * names and sentence openings and almost nothing else, so this is close to
 * exact, and it is also the difference between offering somebody `kallas`,
 * meaning a shore, because a politician called Kallas was in the news.
 *
 * A token in full capitals is an abbreviation. `ERR` and `EL` are not words
 * anybody looks up, and lower-casing them would hand the matcher something
 * that could collide with a real lemma.
 *
 * Everything else goes through in the order it first appeared, deduplicated,
 * because the first headline is the biggest story and the row can only hold a
 * dozen words.
 */
export function headlineWords(headlines: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const headline of headlines) {
    for (const sentence of headline.split(SENTENCE_BREAK)) {
      const words = sentence.split(WORD_BREAK).filter(Boolean);
      words.forEach((word, index) => {
        if (word.length < 2) return;
        if (word === word.toLocaleUpperCase("et")) return;
        if (index > 0 && word[0] !== word[0]!.toLocaleLowerCase("et")) return;
        const lower = word.toLocaleLowerCase("et");
        if (seen.has(lower)) return;
        seen.add(lower);
        out.push(lower);
      });
    }
  }

  return out;
}

/**
 * A headline split into the runs a reader sees: words, and whatever sits
 * between them. Every character of the headline comes back in order, so a
 * screen can join the pieces and print exactly what the feed said while
 * treating the words as things to look up. `word` is a run of letters; the
 * rest is spaces, digits and punctuation, kept as one piece each.
 */
export interface HeadlineToken {
  text: string;
  word: boolean;
}

export function tokenise(headline: string): HeadlineToken[] {
  const out: HeadlineToken[] = [];
  for (const match of headline.matchAll(/\p{L}+|[^\p{L}]+/gu)) {
    const text = match[0];
    out.push({ text, word: /\p{L}/u.test(text) });
  }
  return out;
}
