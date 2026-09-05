#!/usr/bin/env tsx
/**
 * Build the list of the words a learner will actually meet, by counting a
 * corpus and writing nothing.
 *
 * The course teaches in a sensible order and the dictionary holds six thousand
 * words, and neither of those answers the question somebody asks in their first
 * week: which words do I get the most out of learning first. That is a question
 * about the language rather than about the syllabus, so it is answered by
 * counting the language.
 *
 * WHERE THE COUNTS COME FROM, AND WHY THIS ONE. `hermitdave/FrequencyWords`
 * publishes word counts over the OpenSubtitles corpus: MIT for the code, and
 * **CC BY-SA 4.0 for the content**, which is attribution plus share-alike and
 * is exactly the license English Wiktionary already puts on the glosses in the
 * built dictionary. So it may be used commercially, it has to be credited, and
 * what is built on it carries the same terms, which `LICENSE` and /terms
 * already say about `prisma/data/expanded.json` and now say about this too.
 * The University of Tartu's own frequency dictionary is the better corpus and
 * is CC BY-NC: no charge today is not a promise of no charge ever, and a
 * non-commercial clause is the one license a project cannot walk back out of.
 *
 * WHAT SUBTITLES ARE AND ARE NOT. They are dialogue, so this is the frequency
 * of the spoken language: `tere`, `aitäh` and `kurat` rank high and the
 * vocabulary of a newspaper leader does not. That is the right corpus for
 * somebody learning to talk to people and the wrong one for somebody sitting
 * C1 reading, and the page says which it is rather than calling it "the most
 * common words in Estonian".
 *
 * THE CORPUS PROPOSES AND THE DICTIONARY DECIDES, which is the rule a scanned
 * page (ADR-021) and a news headline already follow. A frequency list is a
 * million surface strings including names, English, typos and numbers, and
 * nothing here trusts one: a form counts only where a dictionary entry vouches
 * for that exact spelling, and what the page shows is the dictionary's own
 * headword. Nothing this script writes is Estonian it chose.
 *
 * TWO RULES DECIDE WHAT A FORM COUNTS TOWARD, AND BOTH WERE MEASURED RATHER
 * THAN REASONED OUT.
 *
 * **Exact spelling only, never a folded one.** `matchEstonianForm` accepts a
 * lemma with its diacritics folded away, which is right for a search box where
 * somebody typed `room` meaning `rõõm`, and wrong here, where the corpus is
 * spelled correctly. Folding put `õli` ("oil") at the top of the nouns, on the
 * 294,452 occurrences of `oli`, which is the past of `olema`; `ära` landed on
 * `arg`, `veel` on `väli`, `siia` on `siga`. Every one of the first ten nouns
 * was a collision of that shape.
 *
 * **A nominal is counted by its dictionary form and a verb by its persons.**
 * Summing every case of every noun looks more accurate and is worse: the
 * commonest words in Estonian are function words the dictionary does not hold
 * as entries, so `välja` ("out") was credited to `väli` ("field"), `ees` to
 * `esi`, `sea` to `siga`. A verb is the exception because its personal forms
 * are only ever that verb: `saan`, `tean`, `tahan`, `pean` collide with
 * nothing, and without them `olema` ranks nowhere, since nobody says the
 * infinitive. Counting nominals on the headword alone under-counts them all
 * equally, and the page ranks within a class rather than across classes.
 *
 * And a spelling more than one entry can claim counts toward none of them,
 * which is the same discipline as a comparator that must not return 0: `hall`
 * is a noun meaning frost and an adjective meaning gray, and there is no
 * honest way to split 30,000 occurrences between them.
 *
 * WHAT IS LEFT OVER, SO NOBODY FIXES IT WITH A THIRD RULE. `meil` ("email")
 * and `sai` ("white bread") sit higher among the nouns than they deserve,
 * because their headwords are spelled like the adessive of `meie` and the past
 * of `saama`, and neither of those is a stored form of anything, so nothing
 * can see the collision. Two entries in a hundred, both real Estonian words a
 * learner is glad to have, and the honest cost of counting exact spellings.
 * The rule that would catch them is a guess about which word a form belongs
 * to, which is the thing this whole pipeline exists to avoid.
 *
 * Reads `prisma/data/expanded.json` and `prisma/data/harvested.ts`, which is
 * what the seed writes, rather than the database, so a re-run is reproducible
 * from what is checked in. The corpus file is cached under `.frequency-cache/`.
 *
 *   tsx scripts/build-frequency.ts
 *   tsx scripts/build-frequency.ts --refresh
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CASES } from "../lib/estonian/cases";
import { derivedVerbForms } from "../lib/estonian/conjugate";
import { caseAnswer, shownForms, stemsFrom } from "../lib/estonian/derive";
import { HARVESTED } from "../prisma/data/harvested";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, ".frequency-cache");
const SOURCE = "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/et/et_full.txt";
const OUT = path.join(ROOT, "lib/collections/frequency.ts");

/**
 * How far down the corpus to read.
 *
 * The list is a million rows and its tail is names, typos and hapaxes. Twenty
 * thousand reaches a count of about 450 occurrences, which is far below
 * anything that can reach a top hundred, and the run costs a second.
 */
const CORPUS_DEPTH = 20_000;

/** How many of each kind the page shows. */
const PER_GROUP = 100;

/** Estonian letters only: no digits, no punctuation, no Latin abbreviations. */
const WORD = /^[a-zäöüõšž]+$/;

interface SeedEntry {
  lemma: string;
  pos: string;
  cefr: string | null;
  forms: { formType: string; value: string }[];
}

async function corpus(): Promise<Map<string, number>> {
  await mkdir(CACHE, { recursive: true });
  const file = path.join(CACHE, "et_full.txt");
  if (!existsSync(file) || process.argv.includes("--refresh")) {
    process.stdout.write(`fetching ${SOURCE}\n`);
    const response = await fetch(SOURCE);
    if (!response.ok) throw new Error(`frequency list: ${response.status}`);
    await writeFile(file, await response.text(), "utf8");
  }
  const counts = new Map<string, number>();
  for (const line of (await readFile(file, "utf8")).split("\n")) {
    const [form, count] = line.split(" ");
    if (!form || !count || !WORD.test(form)) continue;
    counts.set(form, Number(count));
    if (counts.size >= CORPUS_DEPTH) break;
  }
  return counts;
}

/** Everything the seed writes, read the way the seed reads it. */
async function seeded(): Promise<SeedEntry[]> {
  const expanded = JSON.parse(
    await readFile(path.join(ROOT, "prisma/data/expanded.json"), "utf8"),
  ) as { lemma: string; pos: string; cefr: string | null; forms: { formType: string; value: string }[] }[];

  const entries: SeedEntry[] = expanded.map((e) => ({
    lemma: e.lemma, pos: e.pos, cefr: e.cefr, forms: e.forms ?? [],
  }));
  /*
    The harvest supersedes the expansion on `(lemma, pos)`, which is the key
    the seed conflicts on, so it is applied over the top rather than appended.
    Reading them the other way round would count a course word's principal
    parts twice under one key and rank it against itself.
  */
  const byKey = new Map(entries.map((e) => [`${e.lemma}|${e.pos}`, e]));
  for (const h of HARVESTED) {
    byKey.set(`${h.lemma}|${h.pos}`, {
      lemma: h.lemma, pos: h.pos, cefr: h.cefr,
      forms: Object.entries(h.parts).map(([formType, value]) => ({ formType, value })),
    });
  }
  return [...byKey.values()];
}

/**
 * The spellings that are only ever this word.
 *
 * A nominal is its headword. A verb is its headword plus the persons of the
 * present, the negative, the conditional and the singular imperative, all of
 * which `lib/estonian/conjugate.ts` derives from the stored first person, plus
 * the two stored parts that are distinctive on their own. The simple past
 * third person is deliberately absent, because this app may not derive it.
 */
function spellings(entry: SeedEntry): string[] {
  const out = [entry.lemma];
  if (entry.pos === "VERB") {
    const pres = entry.forms.find((f) => f.formType === "PRES_1SG")?.value;
    if (pres) for (const d of derivedVerbForms({ lemma: entry.lemma, pres1sg: pres })) out.push(d.value);
    for (const type of ["INF_DA", "PAST_1SG"]) {
      const value = entry.forms.find((f) => f.formType === type)?.value;
      if (value) out.push(value);
    }
  }
  return [...new Set(out.map((v) => v.toLocaleLowerCase("et")).filter((v) => WORD.test(v)))];
}

/**
 * Every spelling the dictionary would recognize, for the coverage report only.
 *
 * This is the wider set `matchEstonianForm` reaches minus the folding, and it
 * answers "how much of the corpus does the dictionary know at all", which is
 * the number worth watching over time. It is deliberately not what the ranking
 * counts, for the reason in this file's header.
 */
function recognised(entry: SeedEntry): string[] {
  const out = new Set(spellings(entry));
  for (const f of entry.forms) out.add(f.value.toLocaleLowerCase("et"));
  const stems = stemsFrom(entry.forms);
  if (stems.genSg) {
    for (const { key } of CASES) {
      const answer = caseAnswer(stems, key);
      if (!answer) continue;
      for (const s of shownForms({ singular: answer.value, alsoRight: answer.alsoRight })) {
        out.add(s.toLocaleLowerCase("et"));
      }
    }
  }
  return [...out].filter((v) => WORD.test(v));
}

/**
 * Which list a word goes in.
 *
 * Four rather than one, because a hundred nouns and a hundred verbs are two
 * different things to sit down with, and because a nominal and a verb are
 * counted differently and ranking them against each other would compare two
 * measurements. `PHRASE` has no group: a frequency list of single words has
 * nothing to say about `Tere hommikust!`, and putting one in on a count of
 * zero would be inventing an order.
 */
const GROUP: Readonly<Record<string, string | undefined>> = {
  VERB: "VERB",
  NOUN: "NOUN",
  ADJECTIVE: "ADJECTIVE",
  ADVERB: "SMALL",
  PRONOUN: "SMALL",
};

async function main() {
  const counts = await corpus();
  const entries = await seeded();

  const owners = new Map<string, SeedEntry[]>();
  for (const entry of entries) {
    if (!GROUP[entry.pos]) continue;
    for (const spelling of spellings(entry)) {
      const list = owners.get(spelling) ?? [];
      list.push(entry);
      owners.set(spelling, list);
    }
  }

  const totals = new Map<SeedEntry, number>();
  let attributed = 0;
  let ambiguous = 0;
  for (const [form, n] of counts) {
    const claim = owners.get(form);
    if (!claim) continue;
    if (claim.length > 1) { ambiguous += 1; continue; }
    attributed += 1;
    const entry = claim[0]!;
    totals.set(entry, (totals.get(entry) ?? 0) + n);
  }

  const ranked = [...totals.entries()]
    .map(([entry, n]) => ({ entry, n }))
    /*
      A word carries a CEFR level, which is the record that the course or the
      graded seed vouched for it rather than the tail of the Wiktionary
      expansion. The same filter the dictionary's suggestion row takes
      (ADR-024), and here it is what removes `mulle`, `aru`, `enda`, `härra`
      and `söör` from the top of the nouns: entries whose headword happens to
      be spelled like a very common form of something else.
    */
    .filter((r) => r.entry.cefr)
    .sort((a, b) => b.n - a.n || a.entry.lemma.localeCompare(b.entry.lemma));

  const out: { lemma: string; pos: string; group: string }[] = [];
  const perGroup = new Map<string, number>();
  for (const { entry } of ranked) {
    const group = GROUP[entry.pos]!;
    const taken = perGroup.get(group) ?? 0;
    if (taken >= PER_GROUP) continue;
    perGroup.set(group, taken + 1);
    out.push({ lemma: entry.lemma, pos: entry.pos, group });
  }

  // How much of the corpus the dictionary knows at all, which is the number to
  // watch: it is what says whether the next gap is worth a syllabus unit.
  const known = new Set(entries.flatMap(recognised));
  const seen = [...counts.keys()];
  const covered = seen.filter((f) => known.has(f)).length;
  const top400 = seen.slice(0, 400).filter((f) => known.has(f)).length;

  const summary = [...perGroup.entries()].map(([g, n]) => `${g}:${n}`).join(" ");
  await writeFile(OUT, render(out, summary), "utf8");
  process.stdout.write(
    `corpus rows read ${counts.size}, attributed ${attributed}, dropped as ambiguous ${ambiguous}\n`
    + `dictionary recognizes ${covered} of the ${counts.size} (${Math.round(100 * covered / counts.size)}%), `
    + `and ${top400} of the commonest 400\n`
    + `wrote ${out.length} words to lib/collections/frequency.ts (${summary})\n`,
  );
}

function render(words: { lemma: string; pos: string; group: string }[], summary: string): string {
  const rows = words
    .map((w) => `  { lemma: ${JSON.stringify(w.lemma)}, pos: "${w.pos}", group: "${w.group}" },`)
    .join("\n");
  return `/**
 * THE WORDS A LEARNER WILL ACTUALLY MEET, IN ORDER. Generated by
 * \`scripts/build-frequency.ts\`.
 *
 * Do not edit by hand: re-run the script. It counts a published frequency list
 * over the OpenSubtitles corpus and keeps only what a dictionary entry vouches
 * for by exact spelling, so the order is measured and the words are the
 * dictionary's own. See that script's header for the two rules that decide
 * what a form counts toward, and for the license, which is CC BY-SA 4.0 and
 * is credited in the running app.
 *
 * ${words.length} words (${summary}), most used first within each group.
 */

/** The four kinds the page separates. See \`GROUP\` in the build script. */
export const FREQUENCY_GROUPS = ["SMALL", "VERB", "NOUN", "ADJECTIVE"] as const;
export type FrequencyGroup = (typeof FREQUENCY_GROUPS)[number];

export interface CommonWord {
  lemma: string;
  /** The dictionary's own label, which with the lemma is the entry's key. */
  pos: string;
  group: FrequencyGroup;
}

export const COMMON_WORDS: readonly CommonWord[] = [
${rows}
];

/** Those of one kind, most used first. */
export function commonWords(group: FrequencyGroup): CommonWord[] {
  return COMMON_WORDS.filter((w) => w.group === group);
}
`;
}

main();
