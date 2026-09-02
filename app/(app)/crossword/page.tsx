import { requireUserId } from "@/lib/auth/session";
import { courseLevelFor } from "@/lib/progress/level";
import { learnerDayClock } from "@/lib/progress/dayClock";
import { crosswordFor } from "@/lib/progress/crossword";
import { Empty, Page } from "@/components/ui";
import { ButtonLink } from "@/components/Button";
import { CrosswordSession } from "./CrosswordSession";

export const metadata = { title: "Crossword" };

export const dynamic = "force-dynamic";

/**
 * THE DAILY CROSSWORD: ENGLISH CLUES, ESTONIAN ANSWERS.
 *
 * One direction and one direction only, because it is the one that teaches:
 * you know what you mean and you are looking for the word, which is where a
 * learner is every time they open their mouth. A grid the other way round is a
 * reading exercise with extra steps.
 *
 * `lib/games/crossword.ts` compiles it and says what of a crossword is anybody
 * else's, which is the name and the grids and not the format;
 * `lib/progress/crossword.ts` decides which words, from the learner's own band.
 */
export default async function CrosswordPage() {
  const ownerId = await requireUserId();
  const [level, clock] = await Promise.all([courseLevelFor(ownerId), learnerDayClock(ownerId)]);
  const day = clock.dayKey(new Date());
  const puzzle = await crosswordFor(ownerId, day, level);

  return (
    <Page title="Crossword" lead="English clues, Estonian answers. A new grid every morning.">
      {puzzle ? (
        <CrosswordSession puzzle={puzzle} day={day} />
      ) : (
        <Empty
          title="No grid for today"
          body="The dictionary has too few words at your level to build one yet."
          action={<ButtonLink href="/dictionary">Look something up</ButtonLink>}
        />
      )}
    </Page>
  );
}
