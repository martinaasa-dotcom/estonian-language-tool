/**
 * Checks the course's authored English against the Ekilex sense it was written
 * for, using evidence the harvest already stores.
 *
 *   npm run audit:senses
 *   npm run audit:senses -- --all    # every shared sense, not only the faults
 *
 * THE GAP THIS FILLS. `audit:glosses` re-reads every built entry's Wiktionary
 * page and `audit:pos` does the same for its part of speech, and both of them
 * point at `prisma/data/expanded.json`. Nothing had ever looked at
 * `prisma/data/harvested.ts`, which is the course: 1,404 words whose English is
 * the one authored column in the whole pipeline, and therefore the one column
 * no upstream source can be blamed for. Two of the thirty glosses written for
 * the connective units were wrong, and both were caught by a person reading
 * Ekilex definitions one at a time, which is not a method.
 *
 * It needs no key and no network, because the evidence came back with the
 * harvest and was sitting unread: `note` is Ekilex's own definition of the
 * sense whose forms, level and sentences an entry carries, and `ekilexPos` is
 * what Ekilex calls the word.
 *
 * `lib/collections/senses.ts` is the rule. This file is the report and
 * `senses.test.ts` is the check; a copy of the rule in either is how the two
 * start disagreeing about what a collision is.
 *
 * Reports, and does not fail. A shared sense is evidence for a person rather
 * than a verdict, and the test is the half that holds a line.
 */
import { HARVESTED } from "../prisma/data/harvested";
import { mislabelled, sharedSenses, type SenseWord } from "../lib/collections/senses";

const ALL = process.argv.includes("--all");

const words: SenseWord[] = HARVESTED.map((w) => ({
  lemma: w.lemma, pos: w.pos, gloss: w.gloss, note: w.note, ekilexPos: w.ekilexPos,
}));

const { collisions, disagreements } = sharedSenses(words);
const wrongLabel = mislabelled(words);

const label = (w: SenseWord) => `${w.lemma} (${w.pos})`;
const withSense = words.filter((w) => w.note).length;
const withPos = words.filter((w) => w.ekilexPos.length > 0).length;
const senses = new Set(words.filter((w) => w.note).map((w) => w.note!.trim().toLowerCase()));

console.log(`\n${words.length} course words`);
console.log(`  ${withSense} carry an Ekilex definition, across ${senses.size} distinct senses`);
console.log(`  ${withPos} carry an Ekilex part of speech`);

console.log(`\nOne meaning, two right answers: ${collisions.length}`);
if (collisions.length > 0) {
  console.log("  A production card asks English to Estonian. Each pair below shares an Ekilex");
  console.log("  sense and an English gloss, so the card has two right answers and marks one wrong.");
  for (const { a, b } of collisions) {
    console.log(`    ${label(a)} "${a.gloss}"  =  ${label(b)} "${b.gloss}"`);
  }
}

console.log(`\nOne Ekilex sense, two different glosses: ${disagreements.length}`);
if (disagreements.length > 0) {
  console.log("  The Institute gives these one definition and the course gives them two meanings.");
  console.log("  Usually a synonym pair worth keeping apart, sometimes a gloss written for a sense");
  console.log("  the entry does not carry, which is the fault that put \"but rather\" on vaid.");
  for (const { a, b, sense } of disagreements) {
    console.log(`    ${label(a)} "${a.gloss}"  vs  ${label(b)} "${b.gloss}"`);
    console.log(`      ${sense.slice(0, 96)}`);
  }
}

console.log(`\nThe course calls it one thing and Ekilex calls it another: ${wrongLabel.length}`);
for (const w of wrongLabel) {
  console.log(`    ${label(w)} "${w.gloss}" is ${w.ekilexPos.join(", ")} to Ekilex`);
}

if (ALL) {
  const bySense = new Map<string, SenseWord[]>();
  for (const w of words) {
    if (!w.note) continue;
    const k = w.note.trim().toLowerCase();
    bySense.set(k, [...(bySense.get(k) ?? []), w]);
  }
  console.log("\nEvery shared sense");
  for (const [sense, group] of bySense) {
    if (group.length < 2) continue;
    console.log(`  ${group.map(label).join(", ")}`);
    console.log(`    ${sense.slice(0, 110)}`);
  }
}

console.log(
  "\nNothing here fails. The collisions that are known are pinned with a reason in\n"
  + "lib/collections/senses.test.ts, which does fail on a new one.\n",
);
