import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { courseWords } from "@/lib/collections/syllabus";
import { buildPlacement, type PlacementWord } from "@/lib/collections/placement";
import { readSetting, SETTING_KEYS } from "@/lib/settings/store";
import { PlacementSession } from "./PlacementSession";

export const dynamic = "force-dynamic";

/**
 * The placement test.
 *
 * Its questions come from the words the course actually teaches, checked against
 * the dictionary so a level whose words have not been seeded cannot produce a
 * rung of unanswerable questions. Everything is planned here and handed down, so
 * the session is a pure walk over a frozen list.
 */
export default async function PlacementPage() {
  const ownerId = await requireUserId();

  const [known, current] = await Promise.all([
    prisma.lexeme.findMany({ select: { lemma: true, pos: true } }),
    readSetting(ownerId, SETTING_KEYS.cefrPlacement),
  ]);

  const inDictionary = new Set(known.map((l) => `${l.lemma}|${l.pos}`));
  const words: PlacementWord[] = courseWords()
    .filter((w) => inDictionary.has(`${w.lemma}|${w.pos}`))
    .map((w) => ({ lemma: w.lemma, gloss: w.gloss, level: w.level }));

  // A different ladder each time it is taken, so retaking it is a fresh test
  // rather than a memory of the last one.
  const stages = buildPlacement(words, Date.now() % 100_000);

  return <PlacementSession stages={stages} current={current} />;
}
