import { glossLanguageFrom } from "@/lib/collections/glossLanguage";
import { requireUserId } from "@/lib/auth/session";
import { courseLevelFor } from "@/lib/progress/level";
import { learnBatch, learnCounts } from "@/lib/progress/learn";
import { readSettings, SETTING_KEYS } from "@/lib/settings/store";
import { LearnSession } from "./LearnSession";

export const metadata = { title: "Learn new words" };

export const dynamic = "force-dynamic";

/**
 * A round of the Learn ladder.
 *
 * Five words, read once, and everything the session needs to ask them assembled
 * here rather than in the browser: the sentence out of a column that holds up
 * to eight of them, the gap made from that sentence, and the four options
 * ranked against the whole dictionary. See `lib/progress/learn.ts`.
 *
 * A static segment under `/learn`, so the course path stays where every unit
 * link and every bookmark already points. Next resolves a static segment ahead
 * of the `[unitId]` beside it, and no unit in the syllabus is called `new`.
 */
export default async function LearnNewPage() {
  const ownerId = await requireUserId();

  /*
    Which language a first meeting gives the meaning in, beside the level and
    the counts rather than in front of them: none of the four needs another's
    answer, and on a hosted database each `await` in a row is a round trip.
  */
  const [settings, level, counts] = await Promise.all([
    readSettings(ownerId, [SETTING_KEYS.glossLanguage]),
    courseLevelFor(ownerId),
    learnCounts(ownerId),
  ]);

  const words = await learnBatch(ownerId, level, glossLanguageFrom(settings[SETTING_KEYS.glossLanguage]));

  return <LearnSession words={words} waiting={counts.waiting} started={counts.started} />;
}
