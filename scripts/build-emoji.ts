#!/usr/bin/env tsx
/**
 * Build the word-to-emoji table, by joining two sources and writing neither.
 *
 * The emoji round needs a picture for a word, and the picture has to come from
 * somewhere defensible. It comes from Unicode's own `emoji-test.txt`, which
 * pairs a codepoint with its English name ("house", "watermelon"), and from the
 * English glosses already in `prisma/data/expanded.json`. This script only
 * *joins* them, exactly as `scripts/expand-seed.ts` joins Ekilex forms to
 * Wiktionary glosses: no model writes a character of it and nothing here
 * invents a meaning.
 *
 * WHY NO ARTWORK IS SHIPPED. What the table holds is the emoji *character*,
 * rendered by whatever font the reader's own device has. A codepoint is not
 * copyrightable; a vendor's artwork is, and Apple's in particular is licensed
 * and enforced. So there is no image file in this repository and no licence to
 * carry: a learner on a Mac sees Apple's picture, one on Android sees Google's,
 * and Kodukeel ships neither. Unicode's data file is under the Unicode licence,
 * which is permissive and asks for attribution; the README credits it.
 *
 * TWO RULES KEEP A PICTURE FROM TEACHING THE WRONG WORD.
 *
 * **Nouns only.** An emoji is a picture of a thing. The first run of this join
 * matched `helistama`, which means to telephone, against 💍 by way of the sense
 * "to ring", and a learner shown that would have learned the wrong word from a
 * picture, which is worse than not being shown one. Verbs and adjectives are
 * dropped wholesale rather than filtered case by case, because the failure is
 * silent and the win is small: 316 nouns match against 332 of everything.
 *
 * **The first two senses only.** A gloss is a comma-separated list in rough
 * order of how central a sense is, so a match on the seventh sense is a match
 * on a corner of the word. That costs three words out of 316 and removes the
 * shape of fault that is hardest to notice.
 *
 * The response is cached under `.emoji-cache/`, so a re-run costs Unicode
 * nothing and the generated file is reproducible.
 *
 *   tsx scripts/build-emoji.ts
 *   tsx scripts/build-emoji.ts --refresh
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, ".emoji-cache");
const SOURCE = "https://unicode.org/Public/emoji/16.0/emoji-test.txt";
const OUT = path.join(ROOT, "lib/collections/emoji.ts");

/** How far into a gloss a match still counts. See the header. */
const MAX_SENSE = 2;

interface Entry { lemma: string; pos: string; translation: string; cefr: string | null }

async function source(refresh: boolean): Promise<string> {
  await mkdir(CACHE, { recursive: true });
  const file = path.join(CACHE, "emoji-test.txt");
  if (!refresh && existsSync(file)) return readFile(file, "utf8");

  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`Unicode returned ${res.status} for ${SOURCE}`);
  const text = await res.text();
  await writeFile(file, text);
  return text;
}

/**
 * One codepoint per emoji, which is what keeps the table safe to render.
 *
 * A sequence (a flag, a family, anything with a skin tone or a zero-width
 * joiner) renders as its parts on a device whose font is missing the whole, so
 * 👨‍👩‍👧 becomes three people standing in a row inside one tile. A single
 * codepoint either draws or falls back to one box.
 */
function emojiByName(text: string): Map<string, string> {
  const byName = new Map<string, string>();
  for (const line of text.split("\n")) {
    if (!line.includes("fully-qualified")) continue;
    const m = /^([0-9A-F ]+?)\s*;\s*fully-qualified\s*#\s*(\S+)\s+E[\d.]+\s+(.+)$/.exec(line);
    if (!m || m[1]!.trim().split(/\s+/).length !== 1) continue;
    const key = normalise(m[3]!);
    if (key && !byName.has(key)) byName.set(key, m[2]!);
  }
  return byName;
}

/** An English phrase, reduced to what two sources can be compared on. */
function normalise(text: string): string {
  return text.toLowerCase().trim()
    .replace(/^(to|a|an|the)\s+/, "")
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const refresh = process.argv.includes("--refresh");
  const byName = emojiByName(await source(refresh));

  const entries: Entry[] = JSON.parse(
    await readFile(path.join(ROOT, "prisma/data/expanded.json"), "utf8"),
  );

  const pairs: { lemma: string; emoji: string; gloss: string; cefr: string | null }[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.pos !== "NOUN" || !entry.translation) continue;
    if (seen.has(entry.lemma)) continue;

    const senses = entry.translation.split(/[,;]/).slice(0, MAX_SENSE);
    for (const sense of senses) {
      const found = byName.get(normalise(sense));
      if (!found) continue;
      seen.add(entry.lemma);
      pairs.push({ lemma: entry.lemma, emoji: found, gloss: sense.trim(), cefr: entry.cefr });
      break;
    }
  }

  pairs.sort((a, b) => a.lemma.localeCompare(b.lemma, "et"));

  const body = pairs.map((p) =>
    `  ${JSON.stringify(p.lemma)}: ${JSON.stringify(p.emoji)},`).join("\n");

  const levels = pairs.reduce<Record<string, number>>((acc, p) => {
    acc[p.cefr ?? "none"] = (acc[p.cefr ?? "none"] ?? 0) + 1;
    return acc;
  }, {});

  await writeFile(OUT, `/**
 * WHICH WORDS HAVE A PICTURE. Generated by \`scripts/build-emoji.ts\`.
 *
 * Do not edit by hand: re-run the script. It joins Unicode's own
 * \`emoji-test.txt\` (a codepoint and its English name) against the English
 * glosses already in the dictionary, and writes neither side. See that script's
 * header for the two rules that keep a picture from teaching the wrong word,
 * and for why no artwork is shipped: these are characters, drawn by the
 * reader's own font.
 *
 * ${pairs.length} words. By level: ${JSON.stringify(levels)}.
 */
export const WORD_EMOJI: Readonly<Record<string, string>> = {
${body}
};

/** The picture for a word, where the dictionary's gloss matched one. */
export function emojiFor(lemma: string): string | undefined {
  return WORD_EMOJI[lemma];
}

/** How many words carry a picture, for a screen that has to say when it cannot fill a round. */
export const EMOJI_WORD_COUNT = ${pairs.length};
`);

  console.log(`Wrote ${pairs.length} word/emoji pairs to lib/collections/emoji.ts`);
  console.log(`By level: ${JSON.stringify(levels)}`);
}

void main();
