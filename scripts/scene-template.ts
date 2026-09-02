#!/usr/bin/env tsx
/**
 * Write the spreadsheet a native speaker fills in.
 *
 * WHY THIS EXISTS AS A SCRIPT AND NOT AS A DOCUMENT. The ask is "write one
 * Estonian sentence for each of these pictures", and the pictures are in
 * `lib/collections/scenes.ts`. A template typed by hand would be a second copy
 * of that table and would go stale the first time a scene changed, so it is
 * generated, the way the recipients list on /privacy is generated from the
 * deployment's own configuration rather than described in the abstract.
 *
 * WHAT THE CONTRIBUTOR SEES. The situation in English, the three emoji as they
 * appear on screen, the three Estonian words with their glosses, and an empty
 * column. Everything they need to write the sentence, and nothing that tells
 * them what to write: the point of the exercise is that many sentences are
 * right, and a template carrying a suggestion would collect that suggestion
 * back sixty times.
 *
 * The row keeps any sentence already contributed, so re-running this after an
 * import gives a spreadsheet of what is left rather than a blank one.
 *
 * Reads the dictionary for the glosses, because a gloss copied into this file
 * would be a second copy of the dictionary and would go stale the first time
 * somebody corrected one, which is the argument `lib/collections/frequency.ts`
 * makes about itself.
 */
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { emojiFor } from "@/lib/collections/emoji";
import { SCENES, SCENE_LEMMAS } from "@/lib/collections/scenes";
import { SCENE_ANSWERS } from "@/lib/collections/sceneAnswers";

const OUT = "scene-sentences.csv";

/** RFC 4180: a field holding a comma, a quote or a newline is quoted, quotes doubled. */
function cell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

async function main() {
  const prisma = new PrismaClient();
  const rows = await prisma.lexeme.findMany({
    where: { lemma: { in: [...SCENE_LEMMAS] }, pos: "NOUN" },
    select: { lemma: true, translation: true },
    orderBy: [{ lemma: "asc" }, { id: "asc" }],
  });
  await prisma.$disconnect();

  const gloss = new Map<string, string>();
  for (const row of rows) if (!gloss.has(row.lemma)) gloss.set(row.lemma, row.translation);

  const lines = [
    ["scene", "situation", "picture", "words", "your Estonian sentence", "credit as"]
      .map(cell).join(","),
  ];

  let missing = 0;
  for (const scene of SCENES) {
    const words = scene.lemmas
      .map((l) => `${l} (${gloss.get(l) ?? "?"})`)
      .join("; ");
    const held = SCENE_ANSWERS[scene.id];
    if (!held) missing += 1;
    lines.push([
      scene.id,
      scene.situation,
      scene.lemmas.map((l) => emojiFor(l) ?? "").join(" "),
      words,
      held?.et ?? "",
      held?.by ?? "",
    ].map(cell).join(","));
  }

  writeFileSync(OUT, `${lines.join("\n")}\n`, "utf8");
  console.log(`Wrote ${OUT}: ${SCENES.length} scenes, ${missing} still without a sentence.`);
  console.log("Fill the last two columns and run `npm run scenes:import`.");
}

void main();
