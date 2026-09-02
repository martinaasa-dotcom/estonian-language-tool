import { requireUserId } from "@/lib/auth/session";
import { courseLevelFor } from "@/lib/progress/level";
import { learnerDayClock } from "@/lib/progress/dayClock";
import { crosswordFor } from "@/lib/progress/crossword";
import { Empty, Page } from "@/components/ui";
import { ButtonLink } from "@/components/Button";
import { CrosswordSession } from "./CrosswordSession";

export const metadata = { title: "Ristsõna" };

export const dynamic = "force-dynamic";

/**
 * RISTSÕNA: THE DAILY CROSSWORD, ENGLISH CLUES AND ESTONIAN ANSWERS.
 *
 * Named in Estonian for the reason Sõnad is, and the English name is kept
 * beside it rather than dropped: the lead says "a crossword" in the first two
 * words, so nobody has to know the word before they can decide whether to
 * press. That is the shape every grammar screen here takes with a case, the
 * name a class uses leading and the one an English reference grammar uses as
 * the cross-reference.
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
    <Page
      title="Ristsõna"
      lead="A crossword. English clues, Estonian answers, and a new grid every morning."
    >
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
