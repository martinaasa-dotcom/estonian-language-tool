import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentLearner, requireUserId } from "@/lib/auth/session";
import { LEVELS, unitsAtLevel } from "@/lib/collections/syllabus";
import { starterUnitsFor } from "@/lib/collections/starter";
import { readSettings, SETTING_KEYS } from "@/lib/settings/store";
import { paperFor } from "@/lib/progress/assessment";
import { previewUnits } from "@/lib/srs/deck";
import { WelcomeWizard, type StarterDeck } from "./WelcomeWizard";

export const metadata = { title: "Getting set up" };

export const dynamic = "force-dynamic";

/**
 * First run.
 *
 * Anyone who has already been through it — or who has a deck and a review
 * history from before this screen existed — is sent straight to Today. An
 * onboarding wizard that reappears for an established learner is worse than no
 * wizard at all.
 */
export default async function WelcomePage() {
  const ownerId = await requireUserId();
  const [settings, cards, learner] = await Promise.all([
    readSettings(ownerId, [SETTING_KEYS.onboardedAt, SETTING_KEYS.displayName]),
    prisma.card.count({ where: { ownerId } }),
    currentLearner(),
  ]);

  if (settings[SETTING_KEYS.onboardedAt] || cards > 0) redirect("/");

  /*
    The starter deck for every level, measured rather than estimated.

    This used to be the whole course shipped to the browser as a checkbox list,
    with `words * 2` printed under it as the card count. Both halves were wrong:
    the list asked a stranger a question they had no way to answer, and the
    count was out by a factor of five at A1, because two cards a word is only
    true of a unit that drills nothing. So the server builds the cards the
    starter deck would actually contain and counts them, for each level, and the
    screen states a number it can stand behind.

    Five small queries in parallel, against roughly two hundred and fifty words
    in total. The old screen read every lemma in the course to decide what to
    offer, so this is cheaper than what it replaces as well as truer.
  */
  const starters: StarterDeck[] = await Promise.all(
    LEVELS.map(async (level): Promise<StarterDeck> => {
      const units = starterUnitsFor(level);
      const { words, cards: cardCount } = await previewUnits(units.map((u) => u.id));
      return {
        level,
        unitIds: units.map((u) => u.id),
        units: units.map((u) => ({ id: u.id, title: u.title, subtitle: u.subtitle, icon: u.icon })),
        words,
        cards: cardCount,
        remaining: Math.max(0, unitsAtLevel(level).length - units.length),
      };
    }),
  );

  const suggestedName =
    settings[SETTING_KEYS.displayName] ?? (learner.name === "you" ? "" : learner.name);

  /*
    The level check, built here rather than behind a click.

    It is a handful of queries and it is the one screen in the app where the
    learner has nothing else to wait for, so paying for it up front buys an
    instant start on the step that matters most. A learner who estimates
    instead has cost the deployment five reads of the dictionary once, ever.
  */
  const paper = await paperFor(ownerId, Date.now() % 1_000_000);

  return <WelcomeWizard starters={starters} suggestedName={suggestedName} paper={paper} />;
}
