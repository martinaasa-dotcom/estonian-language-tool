/**
 * Every production card whose prompt more than one word answers.
 *
 *   npm run audit:senses
 *   npm run audit:senses -- --all    # the synonym groups too, not only the faults
 *
 * A production card is front `translation`, hint `pos`, back `lemma`, and it is
 * marked by `checkAnswer` against the back. Two entries with one gloss and one
 * part of speech are therefore one question with two right answers, and each of
 * their cards marks the other's answer wrong. The dictionary ships 372 of them.
 *
 * `lib/srs/cards.ts` fixes the marking by putting every answer on the back, the
 * way the illative already does. What it cannot fix is the half of these where
 * the gloss is not describing its own word, and that is what this reports.
 * `iseseisvus` and `suveräänsus` are a synonym pair somebody can leave alone;
 * `iseloom` "character" and `tegelane` "character" are a person's character and
 * a character in a story, and the prompt cannot be answered by anybody.
 *
 * Ekilex's own definition is what tells the two apart, and the course harvest
 * has been storing it all along without anything reading it: where the Institute
 * gives a group one definition they are synonyms, and where it gives them two
 * the gloss is the thing to fix.
 *
 * `lib/collections/senses.ts` is the rule, this is the report, and
 * `senses.test.ts` is the check. No key and no network: every input is a file
 * the app ships.
 */
import { shippedDictionary } from "./lib/dictionary";
import { mislabelled, sharedPrompts, type SenseWord } from "../lib/collections/senses";

const ALL = process.argv.includes("--all");

const words: SenseWord[] = shippedDictionary().map((e) => ({
  lemma: e.lemma, pos: e.pos, gloss: e.gloss, note: e.note, ekilexPos: e.ekilexPos,
}));

const groups = sharedPrompts(words);
const ambiguous = groups.filter((g) => g.diagnosis === "ambiguous");
const synonyms = groups.filter((g) => g.diagnosis === "synonyms");
const unjudged = groups.filter((g) => g.diagnosis === "unjudged");
const wrongLabel = mislabelled(words);

const judged = words.filter((w) => w.note).length;

console.log(`\n${words.length} entries in the shipped dictionary, ${judged} with an Ekilex definition`);
console.log(`  ${groups.length} prompts are answered by more than one word`);
console.log(`  every one of them now marks all its answers right; what follows is which glosses to fix`);

console.log(`\nThe gloss cannot identify its own word: ${ambiguous.length}`);
console.log("  Ekilex gives these words different definitions, so they are not synonyms and the");
console.log("  prompt is unanswerable. A distinct gloss is the fix; accepting both is the stopgap.");
for (const g of ambiguous) {
  console.log(`    "${g.gloss}" (${g.pos.toLowerCase()}): ${g.lemmas.join(", ")}`);
}

console.log(`\nGenuine synonyms, nothing to fix: ${synonyms.length}`);
for (const g of synonyms) {
  console.log(`    "${g.gloss}" (${g.pos.toLowerCase()}): ${g.lemmas.join(", ")}`);
}

console.log(`\nNo Ekilex definition to judge by: ${unjudged.length}`);
console.log("  Entries outside the course carry no definition, so which of these are synonyms and");
console.log("  which are a gloss failing to identify its word is not something this can say.");
if (ALL) {
  for (const g of unjudged) {
    console.log(`    "${g.gloss}" (${g.pos.toLowerCase()}): ${g.lemmas.join(", ")}`);
  }
}

console.log(`\nThe course calls it one thing and Ekilex calls it another: ${wrongLabel.length}`);
for (const w of wrongLabel) {
  console.log(`    ${w.lemma} (${w.pos}) "${w.gloss}" is ${(w.ekilexPos ?? []).join(", ")} to Ekilex`);
}

console.log(
  "\nNothing here fails. The prompts a gloss cannot tell apart are pinned in\n"
  + "lib/collections/senses.test.ts, which does fail on a new one.\n",
);
