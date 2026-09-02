import { requireUserId } from "@/lib/auth/session";
import { targetRound } from "@/lib/progress/target";
import { ButtonLink } from "@/components/Button";
import { Empty, Page } from "@/components/ui";
import { TargetSession } from "./TargetSession";

export const metadata = { title: "Target" };

export const dynamic = "force-dynamic";

/**
 * TARGET: FAST, AND ABOUT ENDINGS RATHER THAN ONLY MEANINGS.
 *
 * The aim-and-hit round. A prompt at the top, four targets, hit the right one
 * before the clock runs out, and the round gets harder as it goes.
 *
 * Two thirds of the questions are about a case ending rather than a meaning,
 * and that is what makes it worth building rather than a fourth vocabulary
 * quiz. `lib/progress/target.ts` says why, and the short version is that a case
 * question offers four forms of one word, so nothing can be eliminated by
 * meaning and the only way through is to read the ending.
 *
 * Grades through `gradeCard` like every other mode (ADR-016).
 */
export default async function TargetPage() {
  const ownerId = await requireUserId();
  const questions = await targetRound(ownerId);

  if (questions.length === 0) {
    return (
      <Page title="Target" lead="Hit the right form before the clock does.">
        <Empty
          title="Nothing to aim at yet"
          body="This round draws on words already in your deck."
          action={<ButtonLink href="/learn" variant="primary">Open the course</ButtonLink>}
        />
      </Page>
    );
  }

  return <TargetSession questions={questions} />;
}
